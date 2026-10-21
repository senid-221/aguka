import { getGeminiClient, GEMINI_MODEL } from '@/lib/gemini';
import { redactSecrets } from '@/lib/ai/prompt-security';
import { logger } from '@/lib/logging/logger';

export interface AIProviderResponse {
  text: string;
  tokensInput: number;
  tokensOutput: number;
  tokensUsed: number;
  latencyMs: number;
  model: string;
  provider: 'gemini';
}

export interface IAIProvider {
  readonly name: string;
  readonly model: string;
  generateResponse(
    prompt: string,
    systemInstruction?: string,
    options?: { json?: boolean }
  ): Promise<AIProviderResponse>;
  healthCheck(): Promise<{ ok: boolean; provider: string; model: string; latencyMs: number }>;
}

/**
 * Production Gemini AI Provider using modern @google/genai TypeScript SDK
 */
export class GeminiAIProvider implements IAIProvider {
  readonly name = 'Google Gemini';
  readonly model = GEMINI_MODEL;

  async generateResponse(
    prompt: string,
    systemInstruction?: string,
    options?: { json?: boolean }
  ): Promise<AIProviderResponse> {
    const startTime = Date.now();
    const client = getGeminiClient();

    if (!client) {
      throw new Error('Gemini API client not initialized. Check GEMINI_API_KEY.');
    }

    const response = await client.models.generateContent({
      model: this.model,
      contents: prompt,
      config: {
        ...(systemInstruction ? { systemInstruction } : {}),
        ...(options?.json ? { responseMimeType: 'application/json' } : {}),
      },
    });

    const rawText = response.text || '';
    const cleanText = redactSecrets(rawText);
    const latencyMs = Date.now() - startTime;
    const usage = (response as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } })
      .usageMetadata;
    const tokensInput = usage?.promptTokenCount ?? 0;
    const tokensOutput = usage?.candidatesTokenCount ?? 0;
    const tokensUsed = usage?.totalTokenCount ?? tokensInput + tokensOutput;

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
    try {
      const client = getGeminiClient();
      if (!client) {
        return { ok: false, provider: this.name, model: this.model, latencyMs: 0 };
      }
      return { ok: true, provider: this.name, model: this.model, latencyMs: Date.now() - startTime };
    } catch {
      return { ok: false, provider: this.name, model: this.model, latencyMs: Date.now() - startTime };
    }
  }
}

let activeProvider: IAIProvider | null = null;

/**
 * Returns the configured provider, or null when no AI credentials are present.
 * Callers must surface an honest "not configured" reply instead of inventing one.
 */
export function getAIProvider(): IAIProvider | null {
  if (activeProvider) return activeProvider;

  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
    activeProvider = new GeminiAIProvider();
  }

  return activeProvider;
}
