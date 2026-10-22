/**
 * Text providers for every AI reply the platform sends.
 *
 * Gemini answers first because it carries the traffic cheaply; OpenAI is the rescue
 * when Gemini 429s, times out, blocks an answer or hands back an empty candidate.
 * Without this chain a single rate-limit blip was texted to a person on WhatsApp as
 * "Aguka AI could not reach the AI provider", which is what made the service look
 * like it worked only every other message.
 */

import { GoogleGenAI } from '@google/genai';
import { getGeminiClient, GEMINI_MODEL, geminiApiKey } from '@/lib/gemini';
import { redactSecrets } from '@/lib/ai/prompt-security';
import { logger } from '@/lib/logging/logger';

export type TextProviderName = 'gemini' | 'openai';

export interface AIProviderResponse {
  text: string;
  tokensInput: number;
  tokensOutput: number;
  tokensUsed: number;
  latencyMs: number;
  model: string;
  provider: TextProviderName;
}

export interface IAIProvider {
  readonly name: string;
  readonly providerName: TextProviderName;
  readonly model: string;
  generateResponse(
    prompt: string,
    systemInstruction?: string,
    options?: { json?: boolean }
  ): Promise<AIProviderResponse>;
  healthCheck(): Promise<{ ok: boolean; provider: string; model: string; latencyMs: number }>;
}

/**
 * Why a provider attempt failed decides whether it is worth asking the same
 * provider again. A 429 or a dropped connection usually answers on the second try;
 * a wrong model id or a dead key never will, and burning seconds on it only makes
 * the person on WhatsApp wait longer for the same failure.
 */
export type AttemptOutcome = 'transient' | 'permanent' | 'blocked' | 'empty';

export class ProviderAttemptError extends Error {
  readonly outcome: AttemptOutcome;
  readonly status: number | null;

  constructor(message: string, outcome: AttemptOutcome, status: number | null = null) {
    super(message);
    this.name = 'ProviderAttemptError';
    this.outcome = outcome;
    this.status = status;
  }
}

const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504, 529]);
const TRANSIENT_TEXT = [
  'fetch failed',
  'econnreset',
  'econnrefused',
  'etimedout',
  'socket hang up',
  'timed out',
  'timeout',
  'aborted',
  'network',
  'temporarily',
  'overloaded',
  'capacity',
];

export function classifyStatus(status: number | null): AttemptOutcome {
  if (status === null) return 'transient';
  if (TRANSIENT_STATUS.has(status)) return 'transient';
  return 'permanent';
}

/** Classifies anything thrown by a provider SDK or fetch into a retry decision. */
export function classifyThrown(err: unknown): ProviderAttemptError {
  if (err instanceof ProviderAttemptError) return err;
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  const candidate = err as { status?: number; code?: string | number };
  const status =
    typeof candidate.status === 'number'
      ? candidate.status
      : typeof candidate.code === 'number'
        ? candidate.code
        : null;

  if (status !== null) return new ProviderAttemptError(message, classifyStatus(status), status);
  if (TRANSIENT_TEXT.some((needle) => lower.includes(needle))) {
    return new ProviderAttemptError(message, 'transient');
  }
  return new ProviderAttemptError(message, 'permanent');
}

const ATTEMPTS_PER_PROVIDER = 2;
const BACKOFF_BASE_MS = 600;
const BACKOFF_CAP_MS = 4_000;
/** A rescue is worth waiting for, but Meta's webhook does not wait forever. */
const CHAIN_BUDGET_MS = 12_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number, retryAfterMs: number | null): number {
  if (retryAfterMs !== null && retryAfterMs > 0) return Math.min(retryAfterMs, BACKOFF_CAP_MS);
  const base = Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_CAP_MS);
  return Math.round(base * (0.75 + Math.random() * 0.5));
}

function retryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.round(seconds * 1000);
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

function normalizeText(raw: string): AIProviderResponse['text'] {
  const text = redactSecrets(raw || '').trim();
  return text;
}

/**
 * Gemini provider through the official SDK.
 */
export class GeminiAIProvider implements IAIProvider {
  readonly name = 'Google Gemini';
  readonly providerName = 'gemini';
  readonly model = GEMINI_MODEL;

  async generateResponse(
    prompt: string,
    systemInstruction?: string,
    options?: { json?: boolean }
  ): Promise<AIProviderResponse> {
    const startTime = Date.now();
    const client = getGeminiClient();

    if (!client) {
      throw new ProviderAttemptError('GEMINI_API_KEY is not configured.', 'permanent');
    }

    let response: Awaited<ReturnType<typeof client.models.generateContent>>;
    try {
      response = await client.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          ...(systemInstruction ? { systemInstruction } : {}),
          ...(options?.json ? { responseMimeType: 'application/json' } : {}),
        },
      });
    } catch (err) {
      throw classifyThrown(err);
    }

    const blocked = (response as { promptFeedback?: { blockReason?: string } }).promptFeedback
      ?.blockReason;
    const cleanText = normalizeText(response.text || '');

    if (!cleanText) {
      throw new ProviderAttemptError(
        blocked ? `Gemini blocked the response (${blocked}).` : 'Gemini returned an empty candidate.',
        blocked ? 'blocked' : 'empty'
      );
    }

    const usage = (
      response as {
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          totalTokenCount?: number;
        };
      }
    ).usageMetadata;
    const tokensInput = usage?.promptTokenCount ?? 0;
    const tokensOutput = usage?.candidatesTokenCount ?? 0;
    const tokensUsed = usage?.totalTokenCount ?? tokensInput + tokensOutput;
    const latencyMs = Date.now() - startTime;

    logger.info('AI_GENERATION_SUCCESS', 'Gemini response generated successfully', {
      latencyMs,
      metadata: { model: this.model, promptLength: prompt.length, tokensUsed },
    });

    return {
      text: cleanText,
      tokensInput,
      tokensOutput,
      tokensUsed,
      latencyMs,
      model: this.model,
      provider: 'gemini',
    };
  }

  async healthCheck(): Promise<{ ok: boolean; provider: string; model: string; latencyMs: number }> {
    const startTime = Date.now();
    const ok = getGeminiClient() !== null;
    return { ok, provider: this.name, model: this.model, latencyMs: Date.now() - startTime };
  }
}

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_REQUEST_TIMEOUT_MS = 20_000;

/** Model id used for text. The vision and image models stay separate on purpose. */
export function openAITextModel(env: NodeJS.ProcessEnv = process.env): string {
  return (env.OPENAI_TEXT_MODEL || 'gpt-4o').trim() || 'gpt-4o';
}

function usableOpenAiKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const key = (env.OPENAI_API_KEY || '').trim();
  if (!key) return null;
  const lower = key.toLowerCase();
  if (lower.includes('replace_with') || lower.includes('your_') || lower === 'your_api_key_here') {
    return null;
  }
  return key;
}

/**
 * OpenAI chat completions, used as the rescue provider. The key is the one already
 * set for receipt text reading, so a server can gain a rescue without a new
 * credential — but it only joins the chain once that key exists.
 */
export class OpenAITextProvider implements IAIProvider {
  readonly name = 'OpenAI';
  readonly providerName = 'openai';
  readonly model: string;

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {
    this.model = openAITextModel(env);
  }

  async generateResponse(
    prompt: string,
    systemInstruction?: string,
    options?: { json?: boolean }
  ): Promise<AIProviderResponse> {
    const startTime = Date.now();
    const apiKey = usableOpenAiKey(this.env);
    if (!apiKey) {
      throw new ProviderAttemptError('OPENAI_API_KEY is not configured.', 'permanent');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OPENAI_REQUEST_TIMEOUT_MS);
    let res: Response;
    let payload: OpenAiChatPayload;
    try {
      res = await fetch(OPENAI_CHAT_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          messages: [
            ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
            { role: 'user', content: prompt },
          ],
          ...(options?.json ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        const message =
          (detail as { error?: { message?: string } }).error?.message ||
          `OpenAI responded ${res.status}.`;
        throw new ProviderAttemptError(
          message.slice(0, 300),
          classifyStatus(res.status),
          res.status
        );
      }
      payload = (await res.json()) as OpenAiChatPayload;
    } catch (err) {
      if (err instanceof ProviderAttemptError) throw err;
      if (controller.signal.aborted) {
        throw new ProviderAttemptError('OpenAI request timed out.', 'transient', 408);
      }
      throw classifyThrown(err);
    } finally {
      clearTimeout(timer);
    }

    const choice = payload.choices?.[0];
    const cleanText = normalizeText(choice?.message?.content || '');
    if (!cleanText) {
      const filtered = choice?.finish_reason === 'content_filter';
      throw new ProviderAttemptError(
        filtered ? 'OpenAI filtered the response.' : 'OpenAI returned an empty response.',
        filtered ? 'blocked' : 'empty'
      );
    }

    const latencyMs = Date.now() - startTime;
    const tokensInput = payload.usage?.prompt_tokens ?? 0;
    const tokensOutput = payload.usage?.completion_tokens ?? 0;
    const tokensUsed = payload.usage?.total_tokens ?? tokensInput + tokensOutput;

    logger.info('AI_GENERATION_SUCCESS', 'OpenAI response generated successfully', {
      latencyMs,
      metadata: { model: this.model, promptLength: prompt.length, tokensUsed },
    });

    return {
      text: cleanText,
      tokensInput,
      tokensOutput,
      tokensUsed,
      latencyMs,
      model: this.model,
      provider: 'openai',
    };
  }

  async healthCheck(): Promise<{ ok: boolean; provider: string; model: string; latencyMs: number }> {
    const startTime = Date.now();
    return {
      ok: usableOpenAiKey(this.env) !== null,
      provider: this.name,
      model: this.model,
      latencyMs: Date.now() - startTime,
    };
  }
}

interface OpenAiChatPayload {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

/**
 * The chain in answer order: Gemini first, OpenAI as rescue, and only the providers
 * whose key is actually configured. Rebuilt per call because a memoized list would
 * keep serving an old key after an operator fixes the environment.
 */
export function getTextProviders(env: NodeJS.ProcessEnv = process.env): IAIProvider[] {
  const providers: IAIProvider[] = [];
  if (geminiApiKey(env)) providers.push(new GeminiAIProvider());
  if (usableOpenAiKey(env)) providers.push(new OpenAITextProvider(env));
  return providers;
}

/** Primary provider, kept for health checks and the existing single-provider callers. */
export function getAIProvider(): IAIProvider | null {
  return getTextProviders()[0] ?? null;
}

export interface TextChainResult extends AIProviderResponse {
  /** One line per attempt, for the operator log and the recorded agent run. */
  attempts: string[];
  /** True when the rescue provider answered instead of the primary. */
  fellBack: boolean;
}

/**
 * Thrown when every configured provider failed. The message is an operator summary;
 * it is never sent to a person on WhatsApp.
 */
export class AllTextProvidersFailed extends Error {
  readonly attempts: string[];

  constructor(attempts: string[]) {
    super(
      attempts.length
        ? `No text provider answered: ${attempts.join(' | ')}`
        : 'No text provider is configured. Set GEMINI_API_KEY or OPENAI_API_KEY.'
    );
    this.name = 'AllTextProvidersFailed';
    this.attempts = attempts;
  }
}

/**
 * Asks each provider in order, retrying the transient failures once before moving
 * on. Never call this with no providers and swallow the error — the caller owes the
 * person an honest "not configured" reply instead of a canned answer.
 */
export async function runTextChain(
  providers: IAIProvider[],
  prompt: string,
  systemInstruction?: string,
  options?: { json?: boolean },
  budgetMs = CHAIN_BUDGET_MS
): Promise<TextChainResult> {
  const attempts: string[] = [];
  const deadline = Date.now() + budgetMs;

  for (const provider of providers) {
    for (let attempt = 1; attempt <= ATTEMPTS_PER_PROVIDER; attempt++) {
      const label = `${provider.providerName}:${provider.model}`;
      try {
        const result = await provider.generateResponse(prompt, systemInstruction, options);
        return {
          ...result,
          attempts,
          // A retry that lands on the primary is not a fallback: the rescue only
          // gets the label when a second provider actually had to answer.
          fellBack: provider.providerName !== providers[0].providerName,
        };
      } catch (err) {
        const classified = classifyThrown(err);
        attempts.push(`${label} #${attempt} ${classified.outcome}${
          classified.status ? ` (${classified.status})` : ''
        }: ${classified.message.slice(0, 160)}`);

        // A blocked or empty answer is a property of this provider's judgement of
        // this prompt, not a blip, so it goes to the rescue immediately.
        if (classified.outcome !== 'transient') break;
        if (attempt >= ATTEMPTS_PER_PROVIDER) break;
        if (Date.now() + BACKOFF_BASE_MS > deadline) {
          attempts.push(`${label}: chain budget ${budgetMs}ms exhausted, moving to the next provider`);
          break;
        }
        await sleep(backoffMs(attempt, retryAfterFromMessage(classified.message)));
      }
    }
  }

  throw new AllTextProvidersFailed(attempts);
}

/**
 * The SDK does not surface the Retry-After header, so honour it only when a
 * provider puts the wait in its own message ("Please retry in 4.9s").
 */
function retryAfterFromMessage(message: string): number | null {
  const match = /retry in (\d+(?:\.\d+)?)s/i.exec(message);
  return match ? Math.round(Number(match[1]) * 1000) : null;
}

/** Convenience wrapper used by every text-generating caller. */
export async function generateText(
  prompt: string,
  systemInstruction?: string,
  options?: { json?: boolean },
  env: NodeJS.ProcessEnv = process.env
): Promise<TextChainResult> {
  const providers = getTextProviders(env);
  if (!providers.length) throw new AllTextProvidersFailed([]);

  try {
    const result = await runTextChain(providers, prompt, systemInstruction, options);
    if (result.fellBack) {
      logger.warn('AI_PROVIDER_FELLED_BACK', `Rescue provider answered: ${result.model}`, {
        metadata: {
          answeredBy: result.provider,
          model: result.model,
          attempts: result.attempts,
          latencyMs: result.latencyMs,
        },
      });
    }
    return result;
  } catch (err) {
    if (err instanceof AllTextProvidersFailed) throw err;
    throw classifyThrown(err);
  }
}

export function chainSummary(env: NodeJS.ProcessEnv = process.env): {
  configured: boolean;
  order: Array<{ provider: TextProviderName; model: string }>;
  rescueConfigured: boolean;
  attemptsPerProvider: number;
  budgetMs: number;
} {
  const providers = getTextProviders(env);
  return {
    configured: providers.length > 0,
    order: providers.map((p) => ({ provider: p.providerName, model: p.model })),
    rescueConfigured: providers.length > 1,
    attemptsPerProvider: ATTEMPTS_PER_PROVIDER,
    budgetMs: CHAIN_BUDGET_MS,
  };
}
