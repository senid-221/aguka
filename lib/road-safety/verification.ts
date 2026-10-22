import { QuestionDifficulty, RoadSafetyQuestion, RoadSafetySettings, VerifiedFact } from '@/lib/types';
import { FACTS_BY_ID } from '@/lib/road-safety/verified-facts';
import { auditableNumbers, numbersIn, normalizeText, questionFingerprint, similarity } from '@/lib/road-safety/text-analysis';

/**
 * The pre-publication verification gate.
 *
 * A generated question is publishable only if it survives these deterministic checks;
 * anything else becomes a NEEDS_REVIEW row. This is deliberately not prompt wording: the
 * model is never assumed to have obeyed an instruction, so every number in the stem, the
 * correct option and the explanation is compared against the cited rules, a rule that is
 * only general safety advice is refused whenever it is phrased as a legal duty, and a
 * re-worded copy of an existing question is caught before it reaches a learner.
 */

export interface QuestionDraft {
  factIds: string[];
  difficulty?: QuestionDifficulty;
  questionEn: string;
  questionRw: string;
  optionsEn: string[];
  optionsRw: string[];
  correctIndex: number;
  correctIndexes?: number[] | null;
  explanationEn: string;
  explanationRw: string;
}

export interface GateOptions {
  languages: Array<'ENGLISH' | 'KINYARWANDA'>;
  allowMultiAnswer: boolean;
  /** Fingerprints already in the verified bank. */
  existingFingerprints: Set<string>;
  /** Stems this learner already answered, so "new" means new to them. */
  learnerSeenStems?: string[];
  nearDuplicateThreshold?: number;
}

export interface GateOutcome {
  passed: boolean;
  reasons: string[];
  fingerprint: string;
  factIds: string[];
  moduleCode: string | null;
  normalizedEn: string;
}

const CATCH_ALL_OPTION = /^\s*(all of the above|none of the above|none of these|all of them|ibyo byose|nta na kimwe)\b/i;
const DUTY_WORD_EN = /\b(must|shall|is required|are required|legally required|it is illegal|by law|the law (?:requires|mandates|prohibits)|prohibited|forbidden|not allowed)\b/i;
const DUTY_WORD_RW = /(riteganya|isaba|ntibisemewe|itemewe|ategekinijwe|bujijwe|ni itegeko)/i;
const INSTRUMENT_REFERENCE = /(art(?:icle)?s?\.?\s*\d|itegeko|iteka\b|amabwiriza|decree|order n|law n)/i;
const AUTHORITY_REFERENCE = /(rnp|police|igipolisi|irembo|urupapuro|gazette)/i;
const OPTION_CITATION = /\b(art(?:icle)?\.?\s*\d|itegeko|iteka)\b/i;

/**
 * The numbers a cited rule legitimately supports: everything stated in the rule itself,
 * including the article reference and any second limit named for context.
 */
function allowedVocabulary(facts: VerifiedFact[]): Set<number> {
  const allowed = new Set<number>();
  for (const f of facts) {
    for (const n of numbersIn(`${f.statementEn} ${f.statementRw} ${f.article ?? ''}`)) allowed.add(n);
    if (f.value != null) allowed.add(f.value);
  }
  return allowed;
}

export function verifyQuestionDraft(draft: QuestionDraft, options: GateOptions): GateOutcome {
  const reasons: string[] = [];
  const languages = options.languages.length ? options.languages : (['ENGLISH', 'KINYARWANDA'] as const);
  const threshold = options.nearDuplicateThreshold ?? 0.72;

  if (draft.factIds.length === 0) {
    reasons.push('No verified rule cited: every question must name the rule it tests.');
  }
  const unknownIds = draft.factIds.filter((id) => !FACTS_BY_ID.has(id));
  if (unknownIds.length) reasons.push(`Cites rules that are not in the verified registry: ${unknownIds.join(', ')}`);

  const facts = draft.factIds
    .map((id) => FACTS_BY_ID.get(id))
    .filter((f): f is VerifiedFact => Boolean(f));

  const gaps = facts.filter((f) => !f.generationAllowed || f.reviewStatus !== 'VERIFIED');
  if (gaps.length) {
    reasons.push(`Tests a documented gap that may not be taught as law: ${gaps.map((f) => f.id).join(', ')}`);
  }

  const allowed = allowedVocabulary(facts);

  const stemOutliers = auditableNumbers(`${draft.questionEn} ${draft.questionRw}`).filter((n) => !allowed.has(n));
  if (stemOutliers.length) {
    reasons.push(`Stem states a figure no cited rule gives: ${stemOutliers.join(', ')}`);
  }

  if (!Array.isArray(draft.optionsEn) || draft.optionsEn.length === 0) {
    reasons.push('No answer options supplied.');
  } else {
    if (draft.optionsEn.length !== draft.optionsRw.length) {
      reasons.push('The Kinyarwanda option list does not match the English option list in length.');
    }
    if (!Number.isInteger(draft.correctIndex) || draft.correctIndex < 0 || draft.correctIndex >= draft.optionsEn.length) {
      reasons.push('correctIndex does not point at a supplied option.');
    }
    if (draft.optionsEn.length < 2) reasons.push('Fewer than two options.');
    const blanks = draft.optionsEn.filter((o) => !String(o || '').trim()).length;
    if (blanks) reasons.push(`${blanks} blank option(s).`);

    const firstSeen = new Map<string, number>();
    draft.optionsEn.forEach((o, i) => {
      const key = normalizeText(o);
      if (!key) return;
      const previous = firstSeen.get(key);
      if (previous !== undefined) reasons.push(`Options ${previous + 1} and ${i + 1} say the same thing.`);
      else firstSeen.set(key, i);
      if (CATCH_ALL_OPTION.test(String(o || ''))) reasons.push(`Option ${i + 1} is a catch-all ("${o}").`);
    });

    // An option contained inside another makes two answers defensible at once.
    for (const a of draft.optionsEn) {
      for (const b of draft.optionsEn) {
        if (a === b) continue;
        const na = normalizeText(a);
        const nb = normalizeText(b);
        if (na && nb.length > 6 && na.length < nb.length && nb.includes(na)) {
          reasons.push(`Option "${b}" contains option "${a}", so both are defensible.`);
        }
      }
    }

    const correctText = draft.optionsEn[draft.correctIndex];
    if (correctText !== undefined) {
      const outliers = auditableNumbers(correctText).filter((n) => !allowed.has(n));
      if (outliers.length) {
        reasons.push(`Correct option gives ${outliers.join(', ')} which no cited rule states — the answer cannot be defended.`);
      }
      if (OPTION_CITATION.test(correctText)) {
        reasons.push('Correct option quotes an article; the citation belongs in the explanation, where it can be checked.');
      }
    }
  }

  const explanationOutliers = auditableNumbers(`${draft.explanationEn} ${draft.explanationRw}`).filter((n) => !allowed.has(n));
  if (explanationOutliers.length) {
    reasons.push(`Explanation asserts figures no cited rule gives: ${explanationOutliers.join(', ')}`);
  }

  if (!String(draft.explanationEn || '').trim()) reasons.push('No explanation: the learner cannot be taught from this item.');
  if (draft.questionEn.trim().length < 20) reasons.push('Stem too short to carry a scenario.');
  if (!draft.questionEn.trim().endsWith('?')) reasons.push('Stem is not phrased as a question.');

  const dutyEn = `${draft.questionEn} ${draft.optionsEn.join(' ')} ${draft.explanationEn}`;
  const dutyRw = `${draft.questionRw} ${draft.optionsRw.join(' ')} ${draft.explanationRw}`;

  for (const f of facts) {
    if (f.legalBasis === 'SAFETY_RECOMMENDATION' && (DUTY_WORD_EN.test(dutyEn) || DUTY_WORD_RW.test(dutyRw))) {
      reasons.push(`"${f.id}" is general safe-driving advice, but the item states it as a legal duty.`);
    }
    if (f.legalBasis === 'ADMINISTRATIVE_INSTRUCTION' && !AUTHORITY_REFERENCE.test(`${draft.explanationEn} ${draft.explanationRw}`)) {
      reasons.push(`"${f.id}" is an operating instruction of a service: the explanation must name that service instead of sounding like a statute.`);
    }
    if (f.legalBasis === 'OFFICIAL_REQUIREMENT' && !INSTRUMENT_REFERENCE.test(`${draft.explanationEn} ${draft.explanationRw}`)) {
      reasons.push(`"${f.id}" is a statutory rule: the explanation must name the instrument or article.`);
    }
  }

  if (Array.isArray(draft.correctIndexes) && draft.correctIndexes.length > 1 && !options.allowMultiAnswer) {
    reasons.push('Multiple-answer item, but no exam format enabled here allows it.');
  }

  if (languages.includes('KINYARWANDA')) {
    if (!String(draft.questionRw || '').trim()) reasons.push('Missing Kinyarwanda question text.');
    if (!String(draft.explanationRw || '').trim()) reasons.push('Missing Kinyarwanda explanation.');
    if (
      String(draft.questionRw || '').trim() &&
      /[a-z]{3}/i.test(draft.questionEn) &&
      normalizeText(draft.questionRw) === normalizeText(draft.questionEn)
    ) {
      reasons.push('Kinyarwanda text repeats the English wording instead of carrying the same meaning in Kinyarwanda.');
    }
  }

  const fingerprint = questionFingerprint(draft);
  if (options.existingFingerprints.has(fingerprint)) {
    reasons.push('Exact duplicate of a question already in the verified bank.');
  } else {
    const twin = duplicateUniverse.find((stem) => similarity(stem, draft.questionEn) >= threshold);
    if (twin) {
      reasons.push(`Near-duplicate of an existing question ("${twin.slice(0, 60)}"): re-wording is not a new learning challenge.`);
    }
  }

  const alreadyAnswered = (options.learnerSeenStems ?? []).find((stem) => similarity(stem, draft.questionEn) >= threshold);
  if (alreadyAnswered) {
    reasons.push('This learner already answered an equivalent question; revision must escalate the challenge, not repeat it.');
  }

  const moduleCodes = Array.from(new Set(facts.map((f) => f.moduleCode)));
  return {
    passed: reasons.length === 0,
    reasons,
    fingerprint,
    factIds: draft.factIds,
    moduleCode: moduleCodes[0] ?? null,
    normalizedEn: normalizeText(draft.questionEn),
  };
}

/**
 * The one rule for what may reach a learner, used both when the generator writes a row and
 * when an administrator approves one. Without a shared rule, the manual path could publish
 * an item the automated path would have held back.
 */
export function publicationBlockers(
  item: Pick<RoadSafetyQuestion, 'citations' | 'legalVerifiedAt' | 'factIds' | 'correctIndexes'>,
  settings: RoadSafetySettings,
  extraReasons: string[] = []
): string[] {
  const blockers: string[] = [];
  if (item.citations.length === 0) blockers.push('It cites no source, so nothing in it can be checked against the law.');
  if (!item.legalVerifiedAt) blockers.push('No legal review date is recorded for it.');
  if (settings.verificationRequiredToPublish && item.factIds.length === 0) {
    blockers.push('It is not linked to any rule in the verified registry.');
  }
  if (item.correctIndexes && item.correctIndexes.length > 1 && !settings.generation.allowMultiAnswer) {
    blockers.push('It expects more than one answer, which the current paper formats and the WhatsApp reply protocol cannot grade.');
  }
  blockers.push(...extraReasons);
  return blockers;
}

/**
 * Whether a published item is overdue for a human re-check against the sources. The law
 * changes underneath the bank, so the refresh interval is only honest if something reads
 * it; this is that check.
 */
export function isReviewOverdue(
  legalVerifiedAt: string | null,
  refreshDays: number,
  now: number = Date.now()
): boolean {
  if (!legalVerifiedAt) return true;
  const stamped = Date.parse(legalVerifiedAt);
  if (!Number.isFinite(stamped)) return true;
  return now - stamped > refreshDays * 86_400_000;
}

/**
 * Stems the duplicate detector compares against. The generator refreshes this from the
 * bank before each run; tests set a fixture.
 */
let duplicateUniverse: string[] = [];

export function setDuplicateUniverse(stems: string[]) {
  duplicateUniverse = stems;
}

export type VerifiedQuestionRow = Pick<
  RoadSafetyQuestion,
  | 'moduleId'
  | 'lessonId'
  | 'questionEn'
  | 'questionRw'
  | 'optionsEn'
  | 'optionsRw'
  | 'correctIndex'
  | 'correctIndexes'
  | 'explanationEn'
  | 'explanationRw'
  | 'difficulty'
  | 'citations'
  | 'legalVerifiedAt'
  | 'status'
  | 'factIds'
  | 'source'
  | 'generation'
  | 'reviewReasons'
  | 'issueReports'
  | 'fingerprint'
>;

/** Turns a draft plus its gate outcome into the row that gets stored. */
export function toQuestionRow(
  draft: QuestionDraft,
  outcome: GateOutcome,
  base: Pick<RoadSafetyQuestion, 'moduleId' | 'lessonId'>,
  legalVerifiedAt: string
): VerifiedQuestionRow {
  const citations = outcome.factIds
    .map((id) => FACTS_BY_ID.get(id))
    .filter((f): f is VerifiedFact => Boolean(f))
    .map((f) => f.citation);

  return {
    moduleId: base.moduleId,
    lessonId: base.lessonId,
    questionEn: draft.questionEn.trim(),
    questionRw: draft.questionRw.trim(),
    optionsEn: draft.optionsEn.map((o) => String(o).trim()),
    optionsRw: draft.optionsRw.map((o) => String(o).trim()),
    correctIndex: draft.correctIndex,
    correctIndexes:
      Array.isArray(draft.correctIndexes) && draft.correctIndexes.length > 1 ? draft.correctIndexes : null,
    explanationEn: draft.explanationEn.trim(),
    explanationRw: draft.explanationRw.trim(),
    difficulty: draft.difficulty ?? 'MEDIUM',
    citations,
    legalVerifiedAt,
    status: outcome.passed ? 'PUBLISHED' : 'NEEDS_REVIEW',
    factIds: outcome.factIds,
    source: 'AI_GENERATED',
    generation: null,
    reviewReasons: outcome.reasons,
    issueReports: [],
    fingerprint: outcome.fingerprint,
  };
}
