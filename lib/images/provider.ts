/**
 * Real image generation and editing.
 *
 * Two providers are supported and both are optional: OpenAI is preferred because
 * the platform already uses it for receipt text, Gemini is the fallback for a
 * server that only carries a Google key. Nothing here invents pixels — with no
 * usable key the caller gets an explicit failure naming the variable to set, and
 * the person on WhatsApp is told the studio is not configured.
 */

import { getGeminiClient } from '@/lib/gemini';
import { logger } from '@/lib/logging/logger';

export type ImageProviderName = 'openai' | 'gemini' | 'none';

export interface ImageCapability {
  configured: boolean;
  provider: ImageProviderName;
  model: string;
  error: string | null;
}

export interface GeneratedImage {
  buffer: Buffer;
  mimeType: string;
  provider: Exclude<ImageProviderName, 'none'>;
  model: string;
}

export type ImageResult =
  | { ok: true; image: GeneratedImage }
  | { ok: false; error: string; provider: ImageProviderName; model: string };

/** Same guard the rest of the config uses: a shipped example is not a credential. */
function usableKey(value: string | undefined): string | null {
  const key = (value || '').trim();
  if (!key) return null;
  const lower = key.toLowerCase();
  if (
    lower.includes('replace_with') ||
    lower.includes('your_') ||
    key === 'MY_GEMINI_API_KEY' ||
    key === 'your_api_key_here'
  ) {
    return null;
  }
  return key;
}

export function resolveImageCapability(
  env: Record<string, string | undefined> = process.env
): ImageCapability {
  const openAiKey = usableKey(env.OPENAI_API_KEY);
  if (openAiKey) {
    return {
      configured: true,
      provider: 'openai',
      model: (env.OPENAI_IMAGE_MODEL || 'gpt-image-1').trim() || 'gpt-image-1',
      error: null,
    };
  }

  const geminiKey = usableKey(env.GEMINI_API_KEY);
  if (geminiKey) {
    return {
      configured: true,
      provider: 'gemini',
      model: (env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image').trim() || 'gemini-2.5-flash-image',
      error: null,
    };
  }

  return {
    configured: false,
    provider: 'none',
    model: '',
    error:
      'No image provider is configured. Set OPENAI_API_KEY (image model gpt-image-1) or GEMINI_API_KEY (image model gemini-2.5-flash-image).',
  };
}

const GENERATION_TIMEOUT_MS = 75_000;
const MAX_REFERENCE_BYTES = 8 * 1024 * 1024;

function timeoutSignal(): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

function failure(error: string, provider: ImageProviderName, model: string): ImageResult {
  logger.warn('IMAGE_GENERATION_FAILED', error, { metadata: { provider, model } });
  return { ok: false, error, provider, model };
}

/**
 * OpenAI images. `size` is the nearest supported portrait preset to the 35x45
 * ratio; the studio crops to the exact ratio afterwards in code.
 */
async function openAiImage(
  apiKey: string,
  model: string,
  prompt: string,
  reference: Buffer | null,
  referenceMime: string
): Promise<ImageResult> {
  const { signal, done } = timeoutSignal();
  try {
    if (reference) {
      const form = new FormData();
      form.append('model', model);
      form.append('prompt', prompt);
      form.append('size', '1024x1536');
      form.append('n', '1');
      form.append(
        'image',
        new Blob([new Uint8Array(reference)], { type: referenceMime || 'image/jpeg' }),
        'reference.jpg'
      );
      const res = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal,
      });
      if (!res.ok) {
        const body = await res.text();
        return failure(
          `OpenAI image edit failed (${res.status}): ${body.slice(0, 200)}`,
          'openai',
          model
        );
      }
      const payload = (await res.json()) as { data?: Array<{ b64_json?: string }> };
      const b64 = payload.data?.[0]?.b64_json;
      if (!b64) return failure('OpenAI returned no image data.', 'openai', model);
      return {
        ok: true,
        image: {
          buffer: Buffer.from(b64, 'base64'),
          mimeType: 'image/png',
          provider: 'openai',
          model,
        },
      };
    }

    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, prompt, n: 1, size: '1024x1536' }),
      signal,
    });
    if (!res.ok) {
      const body = await res.text();
      return failure(`OpenAI image generation failed (${res.status}): ${body.slice(0, 200)}`, 'openai', model);
    }
    const payload = (await res.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = payload.data?.[0]?.b64_json;
    if (!b64) return failure('OpenAI returned no image data.', 'openai', model);
    return {
      ok: true,
      image: { buffer: Buffer.from(b64, 'base64'), mimeType: 'image/png', provider: 'openai', model },
    };
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    return failure(`OpenAI image request failed: ${reason}`, 'openai', model);
  } finally {
    done();
  }
}

/** Gemini answers with inline image parts when IMAGE is a requested modality. */
async function geminiImage(
  model: string,
  prompt: string,
  reference: Buffer | null,
  referenceMime: string
): Promise<ImageResult> {
  const client = getGeminiClient();
  if (!client) return failure('Gemini client is not initialised.', 'gemini', model);

  try {
    const parts: Array<Record<string, unknown>> = [{ text: prompt }];
    if (reference) {
      parts.push({ inlineData: { mimeType: referenceMime || 'image/jpeg', data: reference.toString('base64') } });
    }

    const response = await client.models.generateContent({
      model,
      contents: [{ role: 'user', parts }] as never,
      config: { responseModalities: ['TEXT', 'IMAGE'] } as never,
    });

    const candidates = (response as { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }> })
      .candidates;
    for (const candidate of candidates ?? []) {
      for (const part of candidate.content?.parts ?? []) {
        const inline = part.inlineData;
        if (inline?.data) {
          return {
            ok: true,
            image: {
              buffer: Buffer.from(inline.data, 'base64'),
              mimeType: inline.mimeType || 'image/png',
              provider: 'gemini',
              model,
            },
          };
        }
      }
    }
    return failure('The Gemini image model returned no image part.', 'gemini', model);
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    return failure(`Gemini image request failed: ${reason}`, 'gemini', model);
  }
}

/**
 * Produces or retouches one image. `reference` is the person's own uploaded
 * photo when they asked for an edit, and null when they described one.
 */
export async function requestImage(options: {
  prompt: string;
  reference?: { buffer: Buffer; mimeType: string } | null;
  env?: Record<string, string | undefined>;
}): Promise<ImageResult> {
  const env = options.env ?? process.env;
  const capability = resolveImageCapability(env);
  if (!capability.configured) {
    return failure(capability.error ?? 'No image provider is configured.', 'none', '');
  }

  if (options.reference && options.reference.buffer.length > MAX_REFERENCE_BYTES) {
    return failure(
      `The uploaded photo is larger than the ${MAX_REFERENCE_BYTES / 1024 / 1024} MB studio limit.`,
      capability.provider,
      capability.model
    );
  }

  const reference = options.reference?.buffer ?? null;
  const referenceMime = options.reference?.mimeType ?? '';

  if (capability.provider === 'openai') {
    return openAiImage(usableKey(env.OPENAI_API_KEY)!, capability.model, options.prompt, reference, referenceMime);
  }
  return geminiImage(capability.model, options.prompt, reference, referenceMime);
}
