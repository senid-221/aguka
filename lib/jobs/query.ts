import { JobListing } from '@/lib/types';

/**
 * A WhatsApp message asking for work arrives in Kinyarwanda or English, while the
 * boards this platform reads post their titles in English. Handing the model an
 * arbitrary slice of every listing because the person's words matched nothing is
 * what makes a job seeker conclude the search is broken. This module turns the
 * words of the message into terms the stored listings can actually be matched on.
 */

/** The asking itself — never a skill, never a place. */
const INTENT_WORDS = new Set([
  // English
  'i', 'im', 'me', 'my', 'we', 'us', 'you', 'your', 'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in',
  'at', 'for', 'from', 'with', 'is', 'are', 'was', 'do', 'does', 'can', 'could', 'would', 'will',
  'please', 'help', 'show', 'tell', 'find', 'search', 'look', 'looking', 'want', 'wanted', 'need',
  'needs', 'got', 'have', 'has', 'there', 'here', 'any', 'some', 'new', 'good', 'nice', 'job',
  'jobs', 'work', 'works', 'working', 'employment', 'vacancy', 'vacancies', 'hiring', 'hired',
  'apply', 'application', 'career', 'careers', 'opportunity', 'opportunities', 'what', 'which',
  'who', 'where', 'when', 'how', 'why', 'about', 'this', 'that', 'these', 'those', 'them', 'they',
  'it', 'ok', 'yes', 'no', 'not', 'now', 'today', 'still', 'yet', 'also', 'just', 'very',
  // Kinyarwanda
  'akazi', 'imirimo', 'umurimo', 'shaka', 'ndashaka', 'nshaka', 'mpfuze', 'mfite', 'ufite',
  'reba', 'nyereka', 'mbwira', 'nsabye', 'nyine', 'nubwo', 'kandi', 'cyangwa', 'muri', 'mu',
  'za', 'bya', 'ya', 'ku', 'kuri', 'nka', 'nkuko', 'ubu', 'nonaha', 'ejo', 'cyane', 'narwo',
  'murakoze', 'makuru', 'amakuru', 'ese', 'nyoko', 'yego', 'oya', 'sina', 'sange', 'ho', 'ino',
  'iki', 'igikwiye', 'gishoboka', 'byiza', 'mushya', 'ubushobozi', 'ubumenyi', 'igihe',
  // "akazi ko gukora mudasobwa" asks for work doing a thing; the verb is the asking,
  // not a skill the boards list.
  'gukora', 'kora', 'gukorana',
]);

/**
 * Only the words a Rwandan job seeker really uses, and only onto the English
 * wording the boards publish. A term with no confident equivalent is left alone
 * rather than guessed at — a wrong expansion hides the one listing that matched.
 */
const KINYARWANDA_TERMS: Record<string, string[]> = {
  mudasobwa: ['computer', 'software', 'developer', 'programmer', 'it'],
  ikoranabuhanga: ['it', 'technology', 'software', 'developer'],
  itumanaho: ['telecom', 'telecommunication', 'network', 'communication'],
  porogaramu: ['software', 'application', 'developer', 'programming'],
  imibare: ['accountant', 'accounting', 'finance', 'actuarial', 'data'],
  umufundi: ['technician', 'craftsman', 'maintenance'],
  umutekinisiye: ['technician', 'engineer', 'maintenance'],
  ubwubatsi: ['construction', 'civil', 'builder', 'engineer', 'architect'],
  inzu: ['construction', 'housing', 'real estate'],
  umwarimu: ['teacher', 'lecturer', 'trainer', 'tutor'],
  kwigisha: ['teaching', 'teacher', 'trainer', 'education'],
  amashuri: ['school', 'teacher', 'education'],
  ishuri: ['school', 'teacher', 'education'],
  umunyeshuri: ['student', 'pupil', 'trainee', 'graduate'],
  ubuyobozi: ['manager', 'supervisor', 'administrator', 'director'],
  umuyobozi: ['manager', 'supervisor', 'administrator', 'lead'],
  ubuvuzi: ['health', 'nurse', 'clinical', 'medical'],
  muganga: ['doctor', 'physician', 'medical', 'health'],
  umujyanama: ['counsellor', 'advisor', 'consultant'],
  umushoferi: ['driver', 'chauffeur', 'transport'],
  gutwara: ['driver', 'transport', 'logistics'],
  ubucuruzi: ['sales', 'business', 'marketing', 'retail'],
  gucuruza: ['sales', 'marketing', 'business development'],
  abakiriya: ['customer', 'client', 'support', 'service'],
  umutekano: ['security', 'safety', 'guard'],
  ibidukikije: ['environment', 'environmental', 'sustainability'],
  ubuhinzi: ['agriculture', 'agronomy', 'farm', 'agronomist'],
  umunyamategeko: ['lawyer', 'legal', 'advocate', 'law'],
  umunyamakuru: ['journalist', 'media', 'communications'],
  imari: ['finance', 'accounting', 'treasury', 'budget'],
  amafaranga: ['finance', 'accounting', 'cashier', 'treasury'],
  ubushakashatsi: ['research', 'analyst', 'monitoring'],
  abana: ['child', 'pediatric', 'social worker', 'education'],
  siporo: ['sport', 'fitness', 'coach'],
  ubukerarugendo: ['tourism', 'hospitality', 'hotel', 'guide'],
  hotel: ['hospitality', 'hotel', 'reception', 'chef'],
  gukoda: ['rental', 'sales', 'customer'],
  internship: ['intern', 'internship', 'graduate'],
  imyitozo: ['intern', 'trainee', 'attachment'],
};

/** Places a person names, so a district survives the intent-word filter. */
const PLACE_WORDS = new Set([
  'kigali', 'huye', 'musanze', 'gisenyi', 'rubavu', 'nyagatare', 'ruhango', 'kibungo', 'ngoma',
  'karongi', 'rusizi', 'nyamasheke', 'rutsiro', 'nyaruguru', 'kamembe', 'gakonkoro', 'gatsibo',
  'kayonza', 'kirehe', 'nyamagabe', 'nyamata', 'nyaruguru', 'rukiri', 'rusize', 'uwanda',
  'remote', 'rwanda', 'hybrid',
]);

const WORD_SPLIT = /[^a-z0-9+#]+/;

/** Each word the person typed, lowercased, so a phrase can match piece by piece. */
export function splitSearchTerms(keyword?: string): string[] {
  return String(keyword || '')
    .toLowerCase()
    .replace(/['’]/g, ' ')
    .split(WORD_SPLIT)
    .filter((term) => term.length > 1);
}

const WORD_CHAR = /[a-z0-9]/;

/**
 * A short word is a word, not a fragment: a person who asked for `it` or `ux` must
 * not be answered with every listing whose text contains "site" or "situation".
 * Longer terms stay substring-matched, because "developer" should answer "developers".
 */
function containsTerm(text: string, term: string): boolean {
  if (term.length > 3) return text.includes(term);
  for (let at = text.indexOf(term); at !== -1; at = text.indexOf(term, at + 1)) {
    const before = at === 0 ? '' : text[at - 1];
    const after = text[at + term.length] || '';
    if (!WORD_CHAR.test(before) && !WORD_CHAR.test(after)) return true;
  }
  return false;
}

/**
 * One asked word and every English wording that answers it. The boards post in
 * English while the question arrives in Kinyarwanda, so a synonym set belongs to
 * the word it came from: a listing must answer each word, but any one synonym of
 * that word is enough.
 */
export interface TermGroup {
  from: string;
  words: string[];
}

export function termGroups(terms: string[]): TermGroup[] {
  const groups = new Map<string, TermGroup>();
  for (const term of terms) {
    if (groups.has(term)) continue;
    const synonyms = KINYARWANDA_TERMS[term];
    groups.set(term, { from: term, words: synonyms && synonyms.length ? synonyms : [term] });
  }
  return [...groups.values()];
}

// Where a word was found decides the order: a person typing "developer kigali"
// wants the Kigali developer posts, not a row that mentions a developer in its
// third paragraph.
const FIELD_WEIGHTS: Array<{ weight: number; read: (job: JobListing) => string }> = [
  { weight: 6, read: (j) => j.title },
  { weight: 4, read: (j) => j.employer },
  { weight: 3, read: (j) => j.tags.join(' ') },
  { weight: 2, read: (j) => `${j.location} ${j.requirements || ''}` },
  { weight: 1, read: (j) => j.description },
];

function groupScore(job: JobListing, group: TermGroup): number {
  let best = 0;
  for (const field of FIELD_WEIGHTS) {
    const text = field.read(job).toLowerCase();
    if (group.words.some((word) => containsTerm(text, word))) best = Math.max(best, field.weight);
  }
  return best;
}

/** Null means one of the words asked is answered nowhere in the listing: not a match. */
export function scoreListing(job: JobListing, terms: string[]): number | null {
  let total = 0;
  for (const group of termGroups(terms)) {
    const score = groupScore(job, group);
    if (score === 0) return null;
    total += score;
  }
  return total;
}

/** How many of the words asked the listing answers, for the part-match fallback. */
function answeredGroups(job: JobListing, groups: TermGroup[]): number {
  return groups.reduce((count, group) => (groupScore(job, group) > 0 ? count + 1 : count), 0);
}

export type JobMatchMode = 'no-words' | 'every-word' | 'one-word' | 'nothing-matched';

/**
 * Every word is tried first because that is what was asked; part matches are
 * accepted only when nothing answers all of them, and "nothing matched" is reported
 * instead of quietly falling back, so the agent can say it has no match rather than
 * presenting an unrelated vacancy as if it were one.
 */
export function selectListingsForQuery(
  stored: JobListing[],
  terms: string[]
): { matched: JobListing[]; mode: JobMatchMode } {
  if (terms.length === 0) return { matched: stored, mode: 'no-words' };
  const groups = termGroups(terms);

  const strict = stored
    .map((job) => ({ job, score: scoreListing(job, terms) }))
    .filter((entry): entry is { job: JobListing; score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.job);
  if (strict.length > 0) return { matched: strict, mode: 'every-word' };

  const part = stored
    .map((job) => ({ job, answered: answeredGroups(job, groups) }))
    .filter((entry) => entry.answered > 0)
    .sort((a, b) => b.answered - a.answered)
    .map((entry) => entry.job);
  if (part.length > 0) return { matched: part, mode: 'one-word' };
  return { matched: [], mode: 'nothing-matched' };
}

/**
 * Union of the per-term hits, best first. A listing that answers two of the three
 * words asked beats one that answers a single generic word.
 */
export function rankListings(listings: JobListing[], terms: string[]): JobListing[] {
  if (terms.length <= 1) return listings;
  const groups = termGroups(terms);
  const hits = new Map<string, number>();
  for (const job of listings) hits.set(job.id, answeredGroups(job, groups));
  return [...listings].sort((a, b) => (hits.get(b.id) ?? 0) - (hits.get(a.id) ?? 0));
}

/** A message that is about work, whichever language it was typed in. */
export function wantsWork(text: string): boolean {
  return /akazi|imirimo|umurimo|job|vacanc|employ|umushahara/i.test(String(text || ''));
}

/**
 * The words of one message worth searching for. Each stays a single word: its
 * English equivalents are attached by `termGroups()`, so a Kinyarwanda question is
 * never turned into a demand that five English synonyms all appear. Unknown words
 * are passed through rather than dropped — a person who types "react" or "Huye"
 * means exactly that, and the stored listings carry those words.
 */
export function jobQueryTerms(text: string): string[] {
  const terms = new Set<string>();
  for (const word of splitSearchTerms(text)) {
    if (word.length <= 2 || INTENT_WORDS.has(word)) continue;
    if (word.length > 3 || PLACE_WORDS.has(word)) terms.add(word);
  }
  return [...terms];
}
