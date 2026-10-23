import { AgentType } from '@/lib/types';

/**
 * Answers that repeat themselves are the other half of "the agent is not working".
 * Nothing here asks the model to be creative — it changes the sampling, rotates
 * which stored listings are put in front of it, and compares what came back with
 * what this person was already told. If the reply is the same text again, the turn
 * is re-asked once with that said out loud, which is a gate, not a wish.
 */

/**
 * Factual turns must not improvise employers or prices; coaching and tutoring turns
 * read badly at low temperature, and a person who asks the same CV question twice
 * needs a different explanation, not the same one.
 */
export const SAMPLING_BY_AGENT: Record<AgentType, number> = {
  ROUTER: 0.7,
  JOB_FINDER: 0.4,
  CAREER_ASSISTANT: 0.85,
  CODING_AGENT: 0.5,
  IMAGE_STUDIO: 0.6,
  STUDY_TUTOR: 0.8,
  EMPLOYMENT_MARKETPLACE: 0.4,
  ROAD_SAFETY_ACADEMY: 0.3,
};

/** Told to the model when its first answer was the one it already gave. */
export const REWRITE_INSTRUCTION =
  'Your previous answer to this person used almost these same words. Answer again with a different ' +
  'opening, a different order, and a different example or next step. Do not repeat the earlier wording. ' +
  'The facts and the figures must stay exactly as they were — only the answer changes.';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'are', 'was', 'you', 'your',
  'ni', 'na', 'ko', 'muri', 'kandi', 'nti', 'cyane', 'mwenewani',
]);

function tokenSet(text: string): Set<string> {
  return new Set(
    String(text || '')
      .toLowerCase()
      .split(/[^a-z0-9']+/)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
  );
}

/**
 * Jaccard similarity over word sets. Word order does not matter because a repeated
 * answer is usually the same sentences reshuffled, which a string comparison would
 * score as new.
 */
export function similarity(a: string, b: string): number {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / (left.size + right.size - shared);
}

export const REPEAT_THRESHOLD = 0.72;

export function isRepeatOf(text: string, previous: string[], threshold = REPEAT_THRESHOLD): boolean {
  return previous.some((earlier) => similarity(text, earlier) >= threshold);
}

/** The two replies this person last saw, oldest first — the memory a repeat is judged against. */
export function recentAssistantReplies(messages: Array<{ role: string; content: string }>): string[] {
  return messages
    .filter((m) => m.role === 'ASSISTANT' && String(m.content || '').trim().length > 40)
    .slice(-2)
    .map((m) => m.content);
}

/**
 * Which slice of the stored listings the person is shown. Without this, "shaka
 * akazi" for the fourth time prints the same five rows while forty more sit in the
 * store, and it looks like the platform only knows five jobs. The offset comes from
 * how many answers this conversation has already had, so it advances by itself and
 * survives a restart — no extra state, no randomness an operator cannot reproduce.
 */
export function pickWindow<T>(items: T[], size: number, offset: number): T[] {
  if (items.length === 0 || size <= 0) return [];
  if (items.length <= size) return items;
  const start = ((offset % items.length) + items.length) % items.length;
  const window: T[] = [];
  for (let i = 0; i < size && window.length < items.length; i++) {
    window.push(items[(start + i) % items.length]);
  }
  return window;
}
