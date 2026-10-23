import { AllTextProvidersFailed, generateText } from './provider-adapter';
import { redactSecrets } from './prompt-security';

/**
 * What Aguka remembers about a person after this conversation.
 *
 * The platform already keeps the last few messages, which is why a follow-up question
 * makes sense — but a person who says "ndi i Musanze" or "nkora plumbing" in week one
 * should not have to repeat it in week four. This extracts those durable facts into
 * the conversation's memory map, which is read back into every later prompt and is
 * stored per person, so one learner's notes can never appear in another's prompt.
 *
 * It is a small JSON call, and it is allowed to fail: a memory that was not written
 * costs an explanation next week, while a memory written wrong follows that person
 * forever. So the shape is validated in code, secret-looking values are refused, the
 * number of facts per turn and per person is capped, and nothing is invented.
 */

const MAX_FACTS_PER_TURN = 4;
const MAX_FACTS_TOTAL = 16;
const MAX_VALUE_CHARS = 120;

/** Anything that looks like a credential, an identity number or a payment detail. */
const SECRET_KEY_PATTERN = /(token|password|secret|api|key|pin|cvv|card|password)/i;
const SECRET_VALUE_PATTERN =
  /sk-[a-z0-9]{8,}|ghp_[a-z0-9]{8,}|ya29\.[a-z0-9_-]{8,}| BEGIN (RSA|OPENAI|PRIVATE) KEY|eyj[a-z0-9_-]{12,}/i;
/** Digits long enough to be a phone number, an ID or a card number. */
const LONG_DIGITS = /\d{7,}/;

const EXAMPLE_KEYS =
  'district, city, field_of_study, subject, job_field, trade, target_role, employer, cv_status, ' +
  'exam_goal, licence_category, business, languages, schedule, deadline';

export function isSecretish(key: string, value: string): boolean {
  return SECRET_KEY_PATTERN.test(key) || SECRET_VALUE_PATTERN.test(value) || LONG_DIGITS.test(value);
}

function normaliseKey(raw: string): string | null {
  const key = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (key.length < 3 || key.length > 24) return null;
  return key;
}

/**
 * Reads the model's JSON into a clean fact map. Invalid shapes, unknown-looking keys,
 * secret-looking values and duplicates are dropped here rather than stored and
 * explained wrongly forever.
 */
export function parseFacts(raw: unknown, existing: Record<string, string> = {}): Record<string, string> {
  const source = (raw as { facts?: unknown })?.facts ?? raw;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};

  const out: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(source as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_FACTS_PER_TURN) break;
    const key = normaliseKey(rawKey);
    if (!key) continue;
    const value = String(rawValue ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_VALUE_CHARS);
    if (value.length < 2) continue;
    if (isSecretish(key, value)) continue;
    if (existing[key] === value) continue;
    out[key] = value;
  }
  return out;
}

/** Cap per person, oldest-first, so a long-running account cannot grow without bound. */
export function mergeMemories(
  existing: Record<string, string>,
  fresh: Record<string, string>
): Record<string, string> {
  const merged = { ...existing, ...fresh };
  const keys = Object.keys(merged);
  if (keys.length <= MAX_FACTS_TOTAL) return merged;
  const kept = keys.slice(keys.length - MAX_FACTS_TOTAL);
  return Object.fromEntries(kept.map((k) => [k, merged[k]]));
}

/**
 * Operator switch for the whole feature, read the same way by the health report, so
 * the Settings screen can say whether Aguka is remembering people at all.
 */
export function memoryExtractionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = String(env.AI_MEMORY_EXTRACT || '').trim().toLowerCase();
  return !['false', '0', 'off', 'no'].includes(flag);
}

/**
 * A bare "4", a typed "A" on an exam question or a one-word menu pick carries no
 * durable fact, and asking the model about them spends a call for nothing.
 */
export function shouldExtractMemories(userText: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!memoryExtractionEnabled(env)) return false;
  const words = userText.trim().split(/\s+/);
  return words.length >= 3 && userText.trim().length >= 16;
}

const MEMORY_SYSTEM =
  'You extract durable facts about one WhatsApp user so an assistant can remember them later. ' +
  `Reply only with JSON of the form {"facts":{"key":"value"}} using short snake_case keys such as ${EXAMPLE_KEYS}. ` +
  'Record only what the user stated about themselves in this message. No guesses, no politeness, no restating ' +
  'the question, nothing that looks like a password, token, card number, phone number or ID number. ' +
  'If there is nothing durable, reply {"facts":{}}.';

export function buildMemoryPrompt(userText: string, existing: Record<string, string>): string {
  const known = Object.entries(existing)
    .slice(0, 10)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
  return `Already remembered: ${known || 'nothing'}\n\nNew message from the user:\n"${redactSecrets(userText).slice(0, 600)}"`;
}

export interface MemoryExtraction {
  facts: Record<string, string>;
  /** What happened, for the agent-run trace and the console. */
  note: string;
}

/**
 * Never throws: an outage in the memory call must not lose the answer that was
 * already produced for the person.
 */
export async function extractMemories(
  userText: string,
  existing: Record<string, string>
): Promise<MemoryExtraction> {
  try {
    const result = await generateText(buildMemoryPrompt(userText, existing), MEMORY_SYSTEM, {
      json: true,
      temperature: 0,
    });
    const facts = parseFacts(safeJson(result.text), existing);
    return {
      facts,
      note: Object.keys(facts).length ? `remembered ${Object.keys(facts).join(', ')}` : 'nothing durable in that message',
    };
  } catch (err: unknown) {
    const reason =
      err instanceof AllTextProvidersFailed ? err.attempts[0] : err instanceof Error ? err.message : String(err);
    return { facts: {}, note: `memory not written: ${redactSecrets(reason).slice(0, 120)}` };
  }
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const match = /\{[\s\S]*\}/.exec(raw);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

export const MEMORY_LIMITS = { MAX_FACTS_PER_TURN, MAX_FACTS_TOTAL, MAX_VALUE_CHARS };
