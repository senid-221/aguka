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
        "User-Agent": "aistudio-build",
      },
    },
  });
  return genAIInstance;
}

export const GEMINI_MODEL = "gemini-3.8-flash";
