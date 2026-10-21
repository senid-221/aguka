import { GoogleGenAI } from '@google/genai';
import { getGeminiClient, GEMINI_MODEL } from '@/lib/gemini';
import { redactSecrets } from '@/lib/ai/prompt-security';
import { logger } from '@/lib/logging/logger';

export interface AIProviderResponse {
  text: string;
  tokensUsed: number;
  latencyMs: number;
  model: string;
  provider: 'gemini' | 'mock';
}

export interface IAIProvider {
  readonly name: string;
  readonly model: string;
  generateResponse(prompt: string, systemInstruction?: string): Promise<AIProviderResponse>;
  healthCheck(): Promise<{ ok: boolean; provider: string; model: string; latencyMs: number }>;
}

/**
 * Production Gemini AI Provider using modern @google/genai TypeScript SDK
 */
export class GeminiAIProvider implements IAIProvider {
  readonly name = 'Google Gemini';
  readonly model = GEMINI_MODEL;

  async generateResponse(prompt: string, systemInstruction?: string): Promise<AIProviderResponse> {
    const startTime = Date.now();
    const client = getGeminiClient();

    if (!client) {
      throw new Error('Gemini API client not initialized. Check GEMINI_API_KEY.');
    }

    const response = await client.models.generateContent({
      model: this.model,
      contents: prompt,
      config: systemInstruction
        ? { systemInstruction }
        : undefined,
    });

    const rawText = response.text || '';
    const cleanText = redactSecrets(rawText);
    const latencyMs = Date.now() - startTime;

    logger.info('AI_GENERATION_SUCCESS', 'Gemini response generated successfully', {
      latencyMs,
      metadata: { model: this.model, promptLength: prompt.length },
    });

    return {
      text: cleanText,
      tokensUsed: 260,
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

/**
 * Resilient Mock AI Provider for offline, testing, and zero-cost local execution
 */
export class MockAIProvider implements IAIProvider {
  readonly name = 'Aguka Mock AI Provider';
  readonly model = 'mock-bilingual-3.8';

  async generateResponse(prompt: string): Promise<AIProviderResponse> {
    const startTime = Date.now();
    const p = prompt.toLowerCase();

    let reply = 'Aguka AI bilingual assistant ready to assist.';
    if (p.includes('akazi') || p.includes('mifotra') || p.includes('job')) {
      reply = 'Nakuboneye imyanya y’akazi yizewe mu Rwanda muri MINICT / RISA, Bank of Kigali, na Remote Tech. Wifuza ko ngufasha gutegura CV?';
    } else if (p.includes('cv') || p.includes('ibaruwa') || p.includes('cover letter')) {
      reply = 'Niteguye kugufasha gukora CV igezweho mu Kinyarwanda cyangwa mu Cyongereza hakurikijwe amabwiriza yo mu Rwanda.';
    } else if (p.includes('sobanura') || p.includes('tutor') || p.includes('binary search')) {
      reply = 'Binary Search ni uburyo bwo gushaka ikintu mu rutonde rutondekanye (sorted array) bufata igihe cya O(log n).';
    } else if (p.includes('scaffold') || p.includes('code') || p.includes('typescript')) {
      reply = 'Generated TypeScript microservice scaffold with HMAC webhook verification and Dockerfile configuration.';
    }

    return {
      text: reply,
      tokensUsed: 140,
      latencyMs: Date.now() - startTime,
      model: this.model,
      provider: 'mock',
    };
  }

  async healthCheck(): Promise<{ ok: boolean; provider: string; model: string; latencyMs: number }> {
    return {
      ok: true,
      provider: this.name,
      model: this.model,
      latencyMs: 1,
    };
  }
}

let activeProvider: IAIProvider | null = null;

export function getAIProvider(): IAIProvider {
  if (activeProvider) return activeProvider;

  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
    activeProvider = new GeminiAIProvider();
  } else {
    activeProvider = new MockAIProvider();
  }

  return activeProvider;
}
