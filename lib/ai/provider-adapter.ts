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

/** One web page Google Search returned behind an answer. */
export interface GroundedSource {
  title: string;
  url: string;
}

export interface AIProviderResponse {
  text: string;
  tokensInput: number;
  tokensOutput: number;
  tokensUsed: number;
  latencyMs: number;
  model: string;
  provider: TextProviderName;
  /** Populated only for a searched answer: the pages the provider actually read. */
  sources?: GroundedSource[];
  /** The queries the provider ran, so an operator can audit why an answer says what it says. */
  searchQueries?: string[];
}

export interface GenerateOptions {
  json?: boolean;
  /** Ground the answer in a live Google Search instead of only the prompt data. */
  search?: boolean;
  /** Higher for prose the person reads for its own sake, lower for factual listings. */
  temperature?: number;
}

export interface IAIProvider {
  readonly name: string;
  readonly providerName: TextProviderName;
  readonly model: string;
  /** Absent or false means this provider cannot run a web search, so a search turn skips it. */
  readonly supportsSearch?: boolean;
  generateResponse(
    prompt: string,
    systemInstruction?: string,
    options?: GenerateOptions
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
 * Pulls the searched pages and the queries out of whatever a provider returned.
 * Kept as a pure function over an unknown payload because the SDK type for
 * grounding is deep, optional and different from OpenAI's annotation shape, and
 * the suite has to prove the parsing without a paid search.
 */
export function parseGrounding(payload: unknown): { sources: GroundedSource[]; queries: string[] } {
  const meta = (payload as {
    groundingMetadata?: {
      groundingChunks?: Array<{
        web?: { uri?: string; title?: string };
        retrievedContext?: { uri?: string; title?: string };
      }>;
      webSearchQueries?: string[];
    };
  })?.groundingMetadata;

  const seen = new Set<string>();
  const sources: GroundedSource[] = [];
  for (const chunk of meta?.groundingChunks ?? []) {
    const entry = chunk.web ?? chunk.retrievedContext;
    const url = String(entry?.uri || '').trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    let host = url;
    try {
      host = new URL(url).host;
    } catch {
      // Keep the citation even when its URL cannot be parsed — hiding the only
      // source behind a searched answer would be worse than showing a raw one.
    }
    sources.push({ url, title: String(entry?.title || '').trim() || host });
  }

  return {
    sources,
    queries: (meta?.webSearchQueries ?? []).map((q) => String(q).trim()).filter(Boolean),
  };
}

/**
 * OpenAI returns citations as message annotations on a search-capable model, so
 * the same output shape is built from a completely different payload.
 */
export function parseOpenAiAnnotations(payload: unknown): GroundedSource[] {
  const annotations =
    (payload as { choices?: Array<{ message?: { annotations?: unknown[] } }> })?.choices?.[0]?.message
      ?.annotations ?? [];

  const seen = new Set<string>();
  const sources: GroundedSource[] = [];
  for (const raw of annotations) {
    const citation = (raw as { url_citation?: { url?: string; title?: string } }).url_citation;
    const url = String(citation?.url || '').trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    let host = url;
    try {
      host = new URL(url).host;
    } catch {
      // A malformed citation URL still goes to the person as-is; refusing to build
      // the list would silently hide the only source behind the answer.
    }
    sources.push({ url, title: String(citation?.title || '').trim() || host });
  }
  return sources;
}

/**
 * Gemini provider through the official SDK.
 */
export class GeminiAIProvider implements IAIProvider {
  readonly name = 'Google Gemini';
  readonly providerName = 'gemini';
  readonly model = GEMINI_MODEL;
  /** Google Search grounding is a Gemini API feature; OpenAI needs its own model. */
  readonly supportsSearch = true;

  async generateResponse(
    prompt: string,
    systemInstruction?: string,
    options?: GenerateOptions
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
          ...(typeof options?.temperature === 'number' ? { temperature: options.temperature } : {}),
          ...(options?.search ? { tools: [{ googleSearch: {} }] } : {}),
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
    const grounding = parseGrounding((response.candidates ?? [])[0]);

    logger.info('AI_GENERATION_SUCCESS', 'Gemini response generated successfully', {
      latencyMs,
      metadata: {
        model: this.model,
        promptLength: prompt.length,
        tokensUsed,
        ...(options?.search
          ? { searched: true, queries: grounding.queries, sources: grounding.sources.length }
          : {}),
      },
    });

    return {
      text: cleanText,
      tokensInput,
      tokensOutput,
      tokensUsed,
      latencyMs,
      model: this.model,
      provider: 'gemini',
      ...(options?.search ? { sources: grounding.sources, searchQueries: grounding.queries } : {}),
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

/**
 * The model that may browse the web, when the operator names one (e.g.
 * `gpt-4o-search-preview`). Unset means OpenAI never answers a searched turn, so
 * the chain keeps using Gemini for research instead of letting a non-browsing
 * model dress up its own knowledge as a current fact.
 */
export function openAISearchModel(env: NodeJS.ProcessEnv = process.env): string | null {
  const model = (env.OPENAI_SEARCH_MODEL || '').trim();
  if (!model || model.toLowerCase().includes('replace_with')) return null;
  return model;
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
  /**
   * Only true when an operator names a search-capable model. Chat Completions does
   * not browse the web for `gpt-4o`, and claiming it did would put invented
   * "current" facts in front of a job seeker.
   */
  readonly supportsSearch: boolean;

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {
    this.model = openAITextModel(env);
    this.supportsSearch = Boolean(openAISearchModel(env));
  }

  async generateResponse(
    prompt: string,
    systemInstruction?: string,
    options?: GenerateOptions
  ): Promise<AIProviderResponse> {
    const startTime = Date.now();
    const apiKey = usableOpenAiKey(this.env);
    if (!apiKey) {
      throw new ProviderAttemptError('OPENAI_API_KEY is not configured.', 'permanent');
    }

    const searched = options?.search === true;
    const model = searched ? openAISearchModel(this.env) || this.model : this.model;

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
          model,
          messages: [
            ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
            { role: 'user', content: prompt },
          ],
          ...(options?.json ? { response_format: { type: 'json_object' } } : {}),
          ...(typeof options?.temperature === 'number' && !searched
            ? { temperature: options.temperature }
            : {}),
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
    const sources = searched ? parseOpenAiAnnotations(payload) : [];

    logger.info('AI_GENERATION_SUCCESS', 'OpenAI response generated successfully', {
      latencyMs,
      metadata: {
        model,
        promptLength: prompt.length,
        tokensUsed,
        ...(searched ? { searched: true, sources: sources.length } : {}),
      },
    });

    return {
      text: cleanText,
      tokensInput,
      tokensOutput,
      tokensUsed,
      latencyMs,
      model,
      provider: 'openai',
      ...(searched ? { sources, searchQueries: [] as string[] } : {}),
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
    message?: { content?: string; annotations?: unknown[] };
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
  /** True only when a searched answer actually came back with pages behind it. */
  searched: boolean;
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
  options?: GenerateOptions,
  budgetMs = CHAIN_BUDGET_MS
): Promise<TextChainResult> {
  const attempts: string[] = [];
  const deadline = Date.now() + budgetMs;
  const wantsSearch = options?.search === true;

  for (const provider of providers) {
    // A searched turn must not be answered by a provider that cannot browse: it
    // would return yesterday's knowledge and present it as a researched fact.
    if (wantsSearch && provider.supportsSearch !== true) {
      attempts.push(`${provider.providerName}:${provider.model} skipped — no web search capability`);
      continue;
    }
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
          searched: wantsSearch,
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
  options?: GenerateOptions,
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
  /** Whether a turn can be grounded in a live Google Search on this server. */
  webSearchConfigured: boolean;
  webSearchProvider: TextProviderName | null;
} {
  const providers = getTextProviders(env);
  const searchProvider = providers.find((p) => p.supportsSearch === true) ?? null;
  return {
    configured: providers.length > 0,
    order: providers.map((p) => ({ provider: p.providerName, model: p.model })),
    rescueConfigured: providers.length > 1,
    attemptsPerProvider: ATTEMPTS_PER_PROVIDER,
    budgetMs: CHAIN_BUDGET_MS,
    webSearchConfigured: searchProvider !== null && webSearchEnabled(env),
    webSearchProvider: webSearchEnabled(env) ? searchProvider?.providerName ?? null : null,
  };
}

/**
 * Google Search grounding is billed per search, not per token, so an operator can
 * turn it off without losing ordinary replies. On unless AI_WEB_SEARCH says
 * otherwise — silence means "the platform may look things up", which is what the
 * product is for.
 */
export function webSearchEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = String(env.AI_WEB_SEARCH || '').trim().toLowerCase();
  if (!flag) return true;
  return !['false', '0', 'off', 'no'].includes(flag);
}
