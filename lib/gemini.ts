import { GoogleGenAI } from "@google/genai";

/** A hung Gemini call would otherwise hold the WhatsApp webhook open past the
 *  point where the host cuts the request, so the reply never gets delivered. */
const GEMINI_REQUEST_TIMEOUT_MS = 20_000;

let genAIInstance: GoogleGenAI | null = null;
let genAIInstanceKey = '';

/** Same guard the rest of the config uses: a shipped example is not a credential. */
export function geminiApiKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const key = (env.GEMINI_API_KEY || '').trim();
  if (!key || key === 'MY_GEMINI_API_KEY') return null;
  const lower = key.toLowerCase();
  if (lower.includes('replace_with') || lower.includes('your_')) return null;
  return key;
}

export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = geminiApiKey();
  if (!apiKey) return null;
  if (genAIInstance && genAIInstanceKey === apiKey) return genAIInstance;

  genAIInstance = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aguka-ai",
      },
      timeout: GEMINI_REQUEST_TIMEOUT_MS,
      // The SDK retries 429/5xx five times with up to a 60s delay by default. That
      // is longer than a person will wait on WhatsApp and it hides the failure from
      // the chain in provider-adapter.ts, which owns retry and failover instead.
      retryOptions: { attempts: 1 },
    },
  });
  genAIInstanceKey = apiKey;
  return genAIInstance;
}

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
