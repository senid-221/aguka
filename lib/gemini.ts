import { GoogleGenAI } from "@google/genai";

let genAIInstance: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI | null {
  if (genAIInstance) return genAIInstance;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return null;
  }
  genAIInstance = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aguka-ai",
      },
    },
  });
  return genAIInstance;
}

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
