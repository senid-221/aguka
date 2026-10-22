import { createHash } from 'node:crypto';
import type { RoadSafetyQuestion } from '@/lib/types';

/**
 * Pure text analysis shared by the verification gate, the duplicate detector and the
 * curriculum import. Kept dependency-free so content-pack can use it without creating
 * an import cycle back through verified-facts.
 *
 * The patterns matching non-ASCII marks are built with new RegExp, so the escapes stay
 * readable in the source instead of hiding inside invisible combining characters.
 */

const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');
const THIN_SPACES = new RegExp('[\\u00a0\\u202f\\u2009]', 'g');

export function normalizeText(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Reads every number out of a string, resolving the two separator conventions this
 * curriculum mixes: "100,000 FRW" (thousands comma) and "kg 3.500" (thousands dot, as
 * written in the Kinyarwanda lessons) versus "0.80 g" (decimal).
 */
export function numbersIn(text: string): number[] {
  const found: number[] = [];
  const cleaned = String(text || '').replace(THIN_SPACES, ' ');
  const re = /\d[\d.,]*\d|\d/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(cleaned)) !== null) {
    let token = match[0];
    // A separator followed by exactly three digits is a thousands mark, in either convention.
    token = token.replace(/(\d)[.,](?=\d{3}(\D|$))/g, '$1');
    // Whatever separator is left is the decimal mark.
    token = token.replace(/,/g, '.');
    if (token.split('.').length > 2) token = token.replace(/\.(?=.*\.)/g, '');

    const value = Number.parseFloat(token);
    if (Number.isFinite(value)) found.push(round(value));
  }

  return found;
}

/**
 * An explanation legitimately names articles, order numbers and gazette dates. Those are
 * legal references, not legal *values*, so they are removed before the numeric audit —
 * otherwise the gate would either drown in false positives or have to whitelist every
 * article in the book.
 */
const DEGREE = '\\u00b0';
const MASCULE_ORDINAL = '\\u00ba';
const LEGAL_REFERENCE_NOISE = new RegExp(
  [
    // "Article 30bis", "Order N° 066/01 of 19/07/2024", "Itegeko N° 014/2026", "law N° 25/01"
    `(?:articles?|arts?|n${DEGREE}|n${MASCULE_ORDINAL}|order|decree|law|iteka|itegeko|amabwiriza)\\s*(?:n${DEGREE}|n${MASCULE_ORDINAL})?\\s*[\\d/.]+(?:\\s*[\\u2013-]\\s*[\\d/]+)?`,
    // "of 06/03/2026", "Gazette of 10/03/2026", "of 2026/2027"
    'of\\s+\\d{4}(?:/\\d{4})?',
    '\\d{1,2}/\\d{1,2}/\\d{4}',
    '\\b\\d{4}\\b',
  ].join('|'),
  'gi'
);

export function auditableNumbers(text: string): number[] {
  return numbersIn(String(text || '').replace(LEGAL_REFERENCE_NOISE, ' '));
}

function wordTokens(text: string): Set<string> {
  return new Set(normalizeText(text).split(' ').filter((t) => t.length > 2));
}

/** Token-set similarity, so re-wording the same test cannot pass as a new challenge. */
export function similarity(a: string, b: string): number {
  const left = wordTokens(a);
  const right = wordTokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const t of left) if (right.has(t)) shared++;
  return shared / new Set([...left, ...right]).size;
}

/**
 * Identity of a question: its stem, its option set and which option is correct. Two items
 * with the same fingerprint teach the same thing, whatever the wording looks like.
 */
export function questionFingerprint(
  input: Pick<RoadSafetyQuestion, 'questionEn' | 'optionsEn' | 'correctIndex'>
): string {
  const correct = normalizeText(input.optionsEn[input.correctIndex] ?? '');
  return createHash('sha256')
    .update(
      [
        normalizeText(input.questionEn),
        [...input.optionsEn].map(normalizeText).sort().join('|'),
        correct,
      ].join('||')
    )
    .digest('hex')
    .slice(0, 24);
}
