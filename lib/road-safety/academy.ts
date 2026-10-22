import { createHash, randomInt } from 'node:crypto';
import {
  ExamAnswer,
  ExamAttempt,
  ExamTemplate,
  IssueReport,
  QuestionDifficulty,
  RoadSafetyLesson,
  RoadSafetyProgress,
  RoadSafetyQuestion,
  RoadSafetySettings,
  User,
} from '@/lib/types';
import { repo } from '@/lib/db/repository';
import type { ReplyLanguage } from '@/lib/services/entitlements';
import { similarity } from '@/lib/road-safety/text-analysis';
import { factsForModule, generatableFacts } from '@/lib/road-safety/verified-facts';
import { generateQuestions } from '@/lib/road-safety/generator';

/**
 * The exam engine: what a learner is shown, in which order, for how long, and how it is
 * scored.
 *
 * Three properties are enforced here rather than requested in a prompt. First, only
 * PUBLISHED items can be served, so anything the verification gate held back never reaches
 * a learner. Second, the paper is planned from this learner's own history — the difficulty
 * ladder, the topics and the "have I already answered this" test all read the stored
 * attempts, so a repeated question is a deliberate fallback that is disclosed, not an
 * accident. Third, the clock is the server's: the deadline is written when the attempt is
 * created and an expired attempt is graded from its own autosaved picks, so a client that
 * never sends a submit still cannot buy extra time.
 */

export type AttemptKind = 'PRACTICE' | 'MOCK_EXAM' | 'LEARN';

export interface StartOptions {
  moduleId?: string | null;
  examTemplateId?: string | null;
  lessonId?: string | null;
  count?: number;
  /** Ask for the weakest topics specifically, instead of a balanced paper. */
  focusWeakest?: boolean;
}

export interface StartedAttempt {
  attempt: ExamAttempt;
  questions: RoadSafetyQuestion[];
  /** Honest disclosure shown to the learner when the paper could not be fully fresh or new. */
  note: string | null;
  /** Why the planner chose this difficulty, for the API response and the tutor. */
  plan: SessionPlan;
}

export interface SessionPlan {
  difficulty: QuestionDifficulty;
  targetModuleIds: string[];
  factIds: string[];
  seenStems: string[];
  answeredTotal: number;
  accuracy: number;
  rationale: string;
}

const NO_CONTENT: Record<ReplyLanguage, string> = {
  ENGLISH:
    'The Road Safety Academy has no published questions yet. An administrator must publish lessons and questions before practice or mock exams can run.',
  KINYARWANDA:
    "Ishami ry'amategeko y'umuhanda ntirifibibazo byarasohotse. Umuyobozi agomba gusohora amasomo n'ibibazo mbere y'uko imyitozo cyangwa ibizamini bitangira.",
};

const SIMULATION_LABEL: Record<ReplyLanguage, string> = {
  ENGLISH: 'Practice simulation — this is not an official government examination.',
  KINYARWANDA: "Imyitozo — iki si ikizamini cy'ukuri gitangwa na Leta.",
};

export function publishedQuestions(moduleId?: string | null): RoadSafetyQuestion[] {
  return repo
    .getRoadSafetyQuestions(moduleId ?? undefined)
    .filter((q) => q.status === 'PUBLISHED' && q.optionsEn.length > 1);
}

export function publishedLessons(moduleId?: string | null): RoadSafetyLesson[] {
  return repo.getRoadSafetyLessons(moduleId ?? undefined).filter((l) => l.status === 'PUBLISHED');
}

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Safe option order
// ---------------------------------------------------------------------------

/**
 * A permutation derived from the attempt and the question, not from a random draw: the
 * same attempt always shows the same order, so an answer saved before a restart still
 * means the same option, and the stored correct index never has to change.
 */
function optionPermutation(attemptId: string, questionId: string, length: number): number[] {
  const order = Array.from({ length }, (_, i) => i);
  let seed = createHash('sha256').update(`${attemptId}|${questionId}`).digest().readUInt32BE(0);
  for (let i = order.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** Options in the order this learner sees them: position i of the sheet is option perm[i]. */
export function displayedOptions(
  question: RoadSafetyQuestion,
  attemptId: string,
  lang: ReplyLanguage
): string[] {
  const source = lang === 'KINYARWANDA' && question.optionsRw.length === question.optionsEn.length
    ? question.optionsRw
    : question.optionsEn;
  return optionPermutation(attemptId, question.id, source.length).map((stored) => source[stored] ?? '');
}

/** Converts a number the learner typed into the index the bank stores. */
export function storedIndexFor(
  attemptId: string,
  question: RoadSafetyQuestion,
  displayIndex: number | null | undefined
): number | null {
  if (displayIndex == null || !Number.isInteger(displayIndex) || displayIndex < 0) return null;
  const perm = optionPermutation(attemptId, question.id, question.optionsEn.length);
  return displayIndex < perm.length ? perm[displayIndex] : null;
}

/**
 * The label this learner saw for a stored option. Options are shuffled per attempt, so a
 * tutor answering "why is my answer wrong" has to name the letter the learner actually
 * typed, not the index the bank holds.
 */
export function sheetLabel(attemptId: string, question: RoadSafetyQuestion, storedIndex: number | null): string {
  if (storedIndex == null) return '—';
  const display = optionPermutation(attemptId, question.id, question.optionsEn.length).indexOf(storedIndex);
  return display >= 0 ? LETTERS[display] ?? String(display + 1) : '—';
}

// ---------------------------------------------------------------------------
// What this learner has already done
// ---------------------------------------------------------------------------

interface ModuleTally {
  correct: number;
  answered: number;
  seconds: number;
}

export interface LearnerHistory {
  answeredQuestionIds: Set<string>;
  seenStems: string[];
  seenFingerprints: Set<string>;
  byModule: Map<string, ModuleTally>;
  answeredTotal: number;
  correctTotal: number;
  accuracy: number;
  averageSeconds: number | null;
  attempts: number;
}

export function learnerHistory(userId: string): LearnerHistory {
  const attempts = repo.getExamAttempts(userId);
  const answeredQuestionIds = new Set<string>();
  const seenStems: string[] = [];
  const seenFingerprints = new Set<string>();
  const byModule = new Map<string, ModuleTally>();
  let answeredTotal = 0;
  let correctTotal = 0;
  let seconds = 0;
  let timed = 0;

  for (const attempt of attempts) {
    for (const answer of attempt.answers) {
      if (answer.selectedIndex == null) continue;
      answeredTotal++;
      if (answer.isCorrect) correctTotal++;
      if (answer.timeSpentSeconds != null) {
        seconds += answer.timeSpentSeconds;
        timed++;
      }
      const question = repo.getRoadSafetyQuestionById(answer.questionId);
      if (!question) continue;
      answeredQuestionIds.add(question.id);
      seenFingerprints.add(question.fingerprint);
      const tally = byModule.get(question.moduleId) ?? { correct: 0, answered: 0, seconds: 0 };
      tally.answered++;
      if (answer.isCorrect) tally.correct++;
      byModule.set(question.moduleId, tally);
    }
    for (const id of attempt.questionIds) {
      const question = repo.getRoadSafetyQuestionById(id);
      if (question) seenStems.push(question.questionEn);
    }
  }

  return {
    answeredQuestionIds,
    seenStems,
    seenFingerprints,
    byModule,
    answeredTotal,
    correctTotal,
    accuracy: answeredTotal > 0 ? correctTotal / answeredTotal : 0,
    averageSeconds: timed > 0 ? Math.round(seconds / timed) : null,
    attempts: attempts.length,
  };
}

function rankedModules(history: LearnerHistory, direction: 'weakest' | 'strongest'): string[] {
  const scored = Array.from(history.byModule.entries())
    .filter(([, tally]) => tally.answered >= 2)
    .map(([moduleId, tally]) => ({ moduleId, rate: tally.correct / tally.answered, answered: tally.answered }))
    .sort((a, b) =>
      direction === 'weakest'
        ? a.rate - b.rate || b.answered - a.answered
        : b.rate - a.rate || b.answered - a.answered
    );
  return scored.map((s) => s.moduleId);
}

/**
 * Beginner, intermediate, advanced or targeted revision, decided from the learner's own
 * accuracy and how long they take, not from a fixed level the client claims.
 */
export function planSession(userId: string, kind: AttemptKind, opts: StartOptions = {}): SessionPlan {
  const history = learnerHistory(userId);
  const settings = repo.getRoadSafetySettings();

  const difficulty: QuestionDifficulty =
    history.answeredTotal < 5
      ? 'EASY'
      : history.accuracy >= 0.85 && kind === 'MOCK_EXAM'
        ? 'HARD'
        : history.accuracy >= 0.85
          ? 'MEDIUM'
          : history.accuracy < 0.5
            ? 'EASY'
            : 'MEDIUM';

  const weakest = rankedModules(history, 'weakest');
  const published = repo.getRoadSafetyQuestions().filter((q) => q.status === 'PUBLISHED');
  const moduleIdsWithContent = new Set(published.map((q) => q.moduleId));
  const targetModuleIds = opts.moduleId
    ? [opts.moduleId]
    : weakest.length && (kind === 'PRACTICE' || opts.focusWeakest)
      ? weakest.filter((id) => moduleIdsWithContent.has(id)).slice(0, 2)
      : [];

  const factIds = Array.from(
    new Set(
      (targetModuleIds.length
        ? targetModuleIds.flatMap((id) => factsForModule(moduleCodeOf(id)))
        : generatableFacts()
      )
        .filter((f) => f.generationAllowed && f.reviewStatus === 'VERIFIED')
        .map((f) => f.id)
    )
  ).slice(0, settings.generation.perSessionMax * 2);

  const rationale =
    history.answeredTotal < 5
      ? `Beginner: only ${history.answeredTotal} answered item(s) on record, so the paper starts at EASY.`
      : `${difficulty} set from ${Math.round(history.accuracy * 100)}% accuracy over ${history.answeredTotal} answered item(s)` +
        (targetModuleIds.length ? `, focused on the topics with the lowest scores.` : `. `) +
        (history.averageSeconds != null ? ` Average ${history.averageSeconds}s per item.` : '');

  return {
    difficulty,
    targetModuleIds,
    factIds,
    seenStems: history.seenStems,
    answeredTotal: history.answeredTotal,
    accuracy: history.accuracy,
    rationale,
  };
}

function moduleCodeOf(moduleId: string): string | null {
  return repo.getRoadSafetyModules().find((m) => m.id === moduleId)?.code ?? null;
}

// ---------------------------------------------------------------------------
// Starting a session
// ---------------------------------------------------------------------------

export function findPendingAttempt(userId: string): ExamAttempt | undefined {
  reapExpiredAttempts(userId);
  return repo.getExamAttempts(userId).find((a) => a.submittedAt === null);
}

/** The most recent finished, graded paper — what the report and the tutor read. */
export function latestSubmittedAttempt(userId: string): ExamAttempt | undefined {
  return repo.getExamAttempts(userId).find((a) => a.submittedAt != null && a.answers.length > 0);
}

export function isExpired(attempt: ExamAttempt): boolean {
  return attempt.submittedAt === null && attempt.deadlineAt != null && Date.parse(attempt.deadlineAt) <= Date.now();
}

/**
 * A timed paper that was never submitted is still finished: it is graded from the picks
 * the server holds, so closing the chat cannot leave an open attempt blocking the learner
 * or buying unlimited time.
 */
export function reapExpiredAttempts(userId: string): ExamAttempt[] {
  const closed: ExamAttempt[] = [];
  for (const attempt of repo.getExamAttempts(userId)) {
    if (isExpired(attempt)) closed.push(submitAttempt(attempt));
  }
  return closed;
}

function resolveTemplate(opts: StartOptions, kind: AttemptKind): ExamTemplate | undefined {
  if (opts.examTemplateId) return repo.getExamTemplateById(opts.examTemplateId) ?? undefined;
  if (kind === 'MOCK_EXAM') {
    return repo
      .getExamTemplates()
      .find((e) => e.status === 'PUBLISHED' && (!opts.moduleId || e.moduleId === opts.moduleId));
  }
  return undefined;
}

/**
 * Picks the paper. Items this learner has never answered come first; a repeat only happens
 * when the verified bank has run out for the requested size, and that is disclosed in the
 * returned note instead of being passed off as fresh practice.
 */
function selectQuestions(
  pool: RoadSafetyQuestion[],
  history: LearnerHistory,
  plan: SessionPlan,
  requested: number,
  settings: RoadSafetySettings
): { chosen: RoadSafetyQuestion[]; reused: number } {
  const eligible = pool.filter((q) =>
    settings.generation.allowMultiAnswer ? true : q.correctIndexes == null && q.optionsEn.length >= 2
  );
  if (eligible.length === 0) return { chosen: [], reused: 0 };

  const unseen = eligible.filter((q) => !history.answeredQuestionIds.has(q.id));
  const fresh = unseen.filter((q) => !history.seenStems.some((stem) => similarity(stem, q.questionEn) >= 0.72));
  const seen = eligible.filter((q) => history.answeredQuestionIds.has(q.id));

  const rank = (q: RoadSafetyQuestion): number => {
    let score = 0;
    if (q.difficulty === plan.difficulty) score += 4;
    else if (plan.difficulty === 'HARD' && q.difficulty === 'MEDIUM') score += 2;
    else if (plan.difficulty === 'EASY' && q.difficulty === 'MEDIUM') score += 2;
    if (plan.targetModuleIds.includes(q.moduleId)) score += 3;
    return score;
  };

  const take = (list: RoadSafetyQuestion[], need: number): RoadSafetyQuestion[] =>
    shuffled(list)
      .sort((a, b) => rank(b) - rank(a))
      .slice(0, Math.max(0, need));

  const chosen = take(fresh, requested);
  let reused = 0;
  if (chosen.length < requested) {
    const backfill = take(unseen.filter((q) => !chosen.includes(q)), requested - chosen.length);
    chosen.push(...backfill);
  }
  if (chosen.length < requested) {
    const repeats = take(seen.filter((q) => !chosen.includes(q)), requested - chosen.length);
    reused = repeats.length;
    chosen.push(...repeats);
  }
  return { chosen, reused };
}

export async function startAttempt(
  user: User,
  kind: AttemptKind,
  opts: StartOptions = {}
): Promise<StartedAttempt | null> {
  const settings = repo.getRoadSafetySettings();
  const template = resolveTemplate(opts, kind);
  const requested = Math.max(
    1,
    opts.count ??
      (kind === 'MOCK_EXAM' ? template?.questionCount || settings.exam.mockCount : kind === 'LEARN' ? settings.exam.learnCount : settings.exam.practiceCount)
  );
  const scopeModuleId = template?.moduleId ?? opts.moduleId ?? null;
  const pool = publishedQuestions(scopeModuleId);
  if (pool.length === 0) return null;

  const history = learnerHistory(user.id);
  const plan = planSession(user.id, kind, opts);
  const { chosen, reused } = selectQuestions(pool, history, plan, requested, settings);

  let generationNote: string | null = null;
  if (chosen.length < requested && settings.generation.enabled) {
    const run = await generateQuestions({
      userId: user.id,
      kind,
      count: Math.min(settings.generation.perSessionMax, requested - chosen.length),
      factIds: plan.factIds,
      difficulty: plan.difficulty,
      settings,
      learnerSeenStems: plan.seenStems,
      avoidStems: chosen.map((q) => q.questionEn),
    });
    if (run.published.length) chosen.push(...run.published);
    if (run.blocked) generationNote = run.note;
  }

  const questions = chosen.slice(0, requested);
  if (questions.length === 0) return null;

  const timeLimitSeconds =
    kind === 'MOCK_EXAM'
      ? (template?.timeLimitMinutes ?? settings.exam.mockMinutes) * 60
      : null;
  const now = new Date().toISOString();
  const strict = kind === 'MOCK_EXAM' && (template?.strictMode ?? settings.exam.strictModeByDefault);

  const attempt = repo.recordExamAttempt({
    userId: user.id,
    kind,
    examTemplateId: template?.id ?? null,
    moduleId: scopeModuleId,
    language: user.preferredLang === 'ENGLISH' ? 'ENGLISH' : 'KINYARWANDA',
    questionIds: questions.map((q) => q.id),
    answers: [],
    savedAnswers: questions.map(() => null),
    answerSeconds: questions.map(() => 0),
    totalQuestions: questions.length,
    correctCount: 0,
    scorePercent: 0,
    passPercent: kind === 'MOCK_EXAM' ? template?.passPercent ?? 60 : 0,
    passed: false,
    startedAt: now,
    submittedAt: null,
    durationSeconds: null,
    timeLimitSeconds,
    deadlineAt: timeLimitSeconds ? new Date(Date.now() + timeLimitSeconds * 1000).toISOString() : null,
    strict,
    answersRevealed: !strict,
    lastActivityAt: now,
  });

  const shortBy = requested - questions.length;
  const notes: string[] = [];
  if (reused > 0) {
    notes.push(
      langOf(attempt) === 'KINYARWANDA'
        ? `${reused} muri iki bibazo byasubiwemo kuko ububiko bwemejwe bufite ibibazo ${pool.length} gusa.`
        : `${reused} of these ${questions.length} questions repeat something you have seen: the verified bank holds ${pool.length} items for this scope.`
    );
  }
  if (shortBy > 0) {
    notes.push(
      langOf(attempt) === 'KINYARWANDA'
        ? `Iki kizamini gifite ibibazo ${questions.length} aho ${requested} wifuzaga.`
        : `This paper has ${questions.length} question(s) instead of the ${requested} asked for.`
    );
  }
  if (generationNote) notes.push(generationNote);

  return { attempt, questions, note: notes.length ? notes.join(' ') : null, plan };
}

function langOf(attempt: ExamAttempt): ReplyLanguage {
  return attempt.language === 'ENGLISH' ? 'ENGLISH' : 'KINYARWANDA';
}

// ---------------------------------------------------------------------------
// Autosave, submission and grading
// ---------------------------------------------------------------------------

/**
 * Records one pick without grading it. Elapsed time is measured between server pings, so
 * the seconds a learner spent are the server's, not the phone's.
 */
export function saveAnswer(attempt: ExamAttempt, position: number, displayIndex: number | null): ExamAttempt | null {
  const question = repo.getRoadSafetyQuestionById(attempt.questionIds[position]);
  if (!question) return null;
  const stored = displayIndex == null ? null : storedIndexFor(attempt.id, question, displayIndex);

  const now = Date.now();
  const previousActivity = Date.parse(attempt.lastActivityAt || attempt.startedAt);
  const elapsed = Number.isFinite(previousActivity)
    ? Math.max(0, Math.min(3600, Math.round((now - previousActivity) / 1000)))
    : 0;

  const savedAnswers = [...attempt.savedAnswers];
  while (savedAnswers.length < attempt.questionIds.length) savedAnswers.push(null);
  savedAnswers[position] = stored;

  const answerSeconds = [...attempt.answerSeconds];
  while (answerSeconds.length < attempt.questionIds.length) answerSeconds.push(0);
  answerSeconds[position] = (answerSeconds[position] ?? 0) + elapsed;

  return (
    repo.updateExamAttempt(attempt.id, {
      savedAnswers,
      answerSeconds,
      lastActivityAt: new Date(now).toISOString(),
    }) ?? null
  );
}

export function attemptForSubmit(attempt: ExamAttempt): number[] {
  return attempt.questionIds.map((_, i) => {
    const stored = attempt.savedAnswers[i];
    return typeof stored === 'number' ? stored : -1;
  });
}

export function gradeAttempt(attempt: ExamAttempt, answers: number[]): ExamAttempt {
  const graded: ExamAnswer[] = [];
  let correct = 0;

  attempt.questionIds.forEach((questionId, index) => {
    const question = repo.getRoadSafetyQuestionById(questionId);
    if (!question) return;
    const raw = answers[index];
    const chosenIndex = Number.isInteger(raw) && (raw as number) >= 0 && (raw as number) < question.optionsEn.length
      ? (raw as number)
      : null;

    const isCorrect = question.correctIndexes && question.correctIndexes.length > 1
      ? false // multi-answer items are only scored by a client that submits a set; the single-pick path cannot
      : chosenIndex != null && chosenIndex === question.correctIndex;
    if (isCorrect) correct++;

    graded.push({
      questionId,
      selectedIndex: chosenIndex,
      isCorrect,
      givenAnswerEn: chosenIndex != null ? question.optionsEn[chosenIndex] ?? null : null,
      correctAnswerEn: question.optionsEn[question.correctIndex] ?? '—',
      explanationEn: question.explanationEn,
      explanationRw: question.explanationRw,
      timeSpentSeconds: attempt.answerSeconds[index] ?? null,
    });
  });

  const scorePercent = graded.length > 0 ? Math.round((correct / graded.length) * 100) : 0;
  const durationSeconds = Math.max(0, Math.round((Date.now() - Date.parse(attempt.startedAt)) / 1000));

  return repo.recordExamResult(attempt.id, {
    answers: graded,
    savedAnswers: graded.map((a) => a.selectedIndex),
    correctCount: correct,
    scorePercent,
    passed: attempt.kind === 'MOCK_EXAM' && graded.length > 0 && scorePercent >= attempt.passPercent,
    submittedAt: new Date().toISOString(),
    durationSeconds,
    answersRevealed: true,
  });
}

/** Server-side auto-submit: graded from the autosaved picks the server already holds. */
export function submitAttempt(attempt: ExamAttempt): ExamAttempt {
  if (attempt.submittedAt) return attempt;
  return gradeAttempt(attempt, attemptForSubmit(attempt));
}

/**
 * True when the deadline has passed; the caller then closes the paper instead of serving
 * more of it.
 */
export function remainingSeconds(attempt: ExamAttempt): number | null {
  if (!attempt.deadlineAt) return null;
  return Math.max(0, Math.round((Date.parse(attempt.deadlineAt) - Date.now()) / 1000));
}

// ---------------------------------------------------------------------------
// Learner-facing text
// ---------------------------------------------------------------------------

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export function formatQuestionSheet(questions: RoadSafetyQuestion[], attempt: ExamAttempt, lang: ReplyLanguage): string {
  const heading =
    lang === 'KINYARWANDA'
      ? attempt.kind === 'MOCK_EXAM'
        ? `IKIZAMINI cy'igerageza (${questions.length} ibibazo)`
        : attempt.kind === 'LEARN'
          ? `KWIGA (${questions.length} ibibazo)`
          : `IMYITOZO (${questions.length} ibibazo)`
      : attempt.kind === 'MOCK_EXAM'
        ? `Mock exam (${questions.length} questions)`
        : attempt.kind === 'LEARN'
          ? `Learn (${questions.length} questions)`
          : `Practice (${questions.length} questions)`;

  const body = questions
    .map((q, i) => {
      const prompt = lang === 'KINYARWANDA' ? q.questionRw : q.questionEn;
      const options = displayedOptions(q, attempt.id, lang)
        .map((opt, oi) => `   ${LETTERS[oi] ?? oi + 1}. ${opt}`)
        .join('\n');
      return `${i + 1}. ${prompt}\n${options}`;
    })
    .join('\n\n');

  const timerLine = attempt.deadlineAt
    ? lang === 'KINYARWANDA'
      ? `Igihe: iminota ${Math.round((attempt.timeLimitSeconds ?? 0) / 60)}. Kirangira ${clockOf(attempt.deadlineAt, lang)}. Iyo igihe gishize, ibyo waprosese bisubirwamo wayoboje.`
      : `Time limit: ${Math.round((attempt.timeLimitSeconds ?? 0) / 60)} minutes, ending ${clockOf(attempt.deadlineAt, lang)}. When it expires, the answers you had saved are submitted.`
    : null;

  const basisLine = templateBasisLine(attempt, lang);

  const footer =
    lang === 'KINYARWANDA'
      ? `Subiza ukoresheje imibare utandukanyije n'akabago, urugero: 1,3,2,4 (${questions.length} ibisubizo).`
      : `Answer with comma-separated numbers, e.g. 1,3,2,4 (${questions.length} answers).`;

  return [
    `${heading}\n\n${body}`,
    SIMULATION_LABEL[lang],
    timerLine,
    basisLine,
    footer,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function clockOf(iso: string, lang: ReplyLanguage): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return lang === 'KINYARWANDA' ? `saa ${hh}:${mm}` : `${hh}:${mm}`;
}

/**
 * Never let a simulation look like the official paper: say which numbers are cited law and
 * which ones an administrator simply chose.
 */
export function templateBasisLine(attempt: ExamAttempt, lang: ReplyLanguage): string | null {
  const template = attempt.examTemplateId ? repo.getExamTemplateById(attempt.examTemplateId) : undefined;
  if (!template) return null;
  if (template.officialBasis) {
    return lang === 'KINYARWANDA'
      ? `Inota ryo gutsindira (${template.passPercent}%) rishingiye kuri ${template.officialBasis.publisher}; umubare w'ibibazo n'ibihe ni ayacu yo kwitoza.`
      : `The ${template.passPercent}% pass mark follows ${template.officialBasis.publisher}; the question count and duration are our own practice settings.`;
  }
  return lang === 'KINYARWANDA'
    ? `Ibibazo ${template.questionCount}, inota ${template.passPercent}% n'ibihe: byose ni amahitamo yacu yo kwitoza, si ay'ikizamini cy'Leta.`
    : `${template.questionCount} questions at a ${template.passPercent}% pass mark with our own timing: these are practice settings, not the official paper's.`;
}

/**
 * What the API returns while an attempt is open. In strict mode the answer key stays on the
 * server until submission.
 */
export function attemptView(attempt: ExamAttempt, lang: ReplyLanguage) {
  const revealed = attempt.answersRevealed || attempt.submittedAt != null;
  return {
    attemptId: attempt.id,
    kind: attempt.kind,
    language: attempt.language,
    totalQuestions: attempt.totalQuestions,
    passPercent: attempt.passPercent,
    strict: attempt.strict,
    savedAnswers: attempt.savedAnswers,
    answeredCount: attempt.savedAnswers.filter((v) => v != null).length,
    remainingSeconds: remainingSeconds(attempt),
    deadlineAt: attempt.deadlineAt,
    submittedAt: attempt.submittedAt,
    scorePercent: revealed ? attempt.scorePercent : null,
    correctCount: revealed ? attempt.correctCount : null,
    passed: revealed ? attempt.passed : null,
    answers: revealed ? attempt.answers : [],
    questions: attempt.questionIds
      .map((id) => repo.getRoadSafetyQuestionById(id))
      .filter((q): q is RoadSafetyQuestion => Boolean(q))
      .map((q, i) => ({
        number: i + 1,
        text: lang === 'KINYARWANDA' ? q.questionRw : q.questionEn,
        options: displayedOptions(q, attempt.id, lang),
        difficulty: q.difficulty,
        citations: q.citations.map((c) => c.url),
      })),
  };
}

export function formatResult(attempt: ExamAttempt, lang: ReplyLanguage): string {
  const head =
    lang === 'KINYARWANDA'
      ? `Amanota: ${attempt.scorePercent}% (${attempt.correctCount}/${attempt.totalQuestions})`
      : `Score: ${attempt.scorePercent}% (${attempt.correctCount}/${attempt.totalQuestions})`;

  const verdict =
    attempt.kind === 'MOCK_EXAM'
      ? lang === 'KINYARWANDA'
        ? attempt.passed
          ? `Watsinze! Inota rikenewe ni ${attempt.passPercent}%.`
          : `Ntiwatsinze. Inota rikenewe ni ${attempt.passPercent}%.`
        : attempt.passed
          ? `Passed. The pass mark is ${attempt.passPercent}%.`
          : `Not passed yet. The pass mark is ${attempt.passPercent}%.`
      : '';

  const wrong = attempt.answers.filter((a) => !a.isCorrect);
  const basisLine = templateBasisLine(attempt, lang);

  const corrections = attempt.answers
    .map((a, i) => {
      const question = repo.getRoadSafetyQuestionById(a.questionId);
      const rw = lang === 'KINYARWANDA';
      const prompt = question ? (rw ? question.questionRw : question.questionEn) : a.questionId;
      const correctText = rw
        ? question?.optionsRw?.[question.correctIndex] ?? a.correctAnswerEn
        : a.correctAnswerEn;
      const chosenLabel =
        a.selectedIndex != null
          ? (() => {
              // The learner saw this option at a shuffled position, so name the position
              // they typed rather than the index stored in the bank.
              const perm = question ? optionPermutation(attempt.id, question.id, question.optionsEn.length) : [];
              const display = perm.indexOf(a.selectedIndex);
              return display >= 0 ? LETTERS[display] ?? String(display + 1) : String(a.selectedIndex + 1);
            })()
          : rw
            ? 'nta gisubizo'
            : 'no answer';
      const status = a.isCorrect ? (rw ? 'NI BYO' : 'CORRECT') : rw ? 'SI BYO' : 'WRONG';
      const explanation = rw ? a.explanationRw : a.explanationEn;
      const choseWord = rw ? 'watoranyije' : 'you chose';
      const correctWord = rw ? 'igisubizo nyacyo' : 'correct answer';
      return `${i + 1}. ${prompt}\n   ${status} — ${choseWord}: ${chosenLabel}, ${correctWord}: ${correctText}\n   ${explanation}`;
    })
    .join('\n\n');

  const citationNote =
    lang === 'KINYARWANDA'
      ? "Ibisobanuro bishingiye ku mategeko y'umuhanda n'inkomoko zatangajwe mu masomo."
      : 'Explanations are tied to the cited Rwandan traffic sources listed on each lesson.';

  const nextStep =
    wrong.length === 0
      ? ''
      : lang === 'KINYARWANDA'
        ? '\n\nSoma amasomo ku bibazo wananiye hanyuma wandike "exam" nanone.'
        : '\n\nReview the lessons for the questions you missed, then send "exam" again.';

  return `${head}${verdict ? `\n${verdict}` : ''}\n\n${corrections}\n\n${SIMULATION_LABEL[lang]}${
    basisLine ? `\n${basisLine}` : ''
  }\n${citationNote}${nextStep}`;
}

/** Normalises A/B/C or 1/2/3 into zero-based sheet positions. */
export function extractAnswerIndexes(text: string): number[] {
  const tokens = String(text || '')
    .replace(/\b([a-fA-F])\b/g, (m) => String(m.toUpperCase().charCodeAt(0) - 64))
    .split(/[^0-9]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const indexes: number[] = [];
  for (const token of tokens) {
    const raw = Number.parseInt(token, 10);
    if (!Number.isFinite(raw) || raw < 1) continue;
    indexes.push(raw - 1);
  }
  return indexes;
}

export function looksLikeAnswers(text: string, expected: number): boolean {
  return extractAnswerIndexes(text).length === expected;
}

/** Sheet positions converted to the option indexes the bank stores, per question. */
export function toStoredAnswers(attempt: ExamAttempt, positions: number[]): number[] {
  return attempt.questionIds.map((id, i) => {
    const question = repo.getRoadSafetyQuestionById(id);
    const position = positions[i];
    if (!question || position == null || position < 0) return -1;
    return storedIndexFor(attempt.id, question, position) ?? -1;
  });
}

export function progressFor(userId: string): RoadSafetyProgress {
  const attempts = repo.getExamAttempts(userId);
  const history = learnerHistory(userId);
  const lessonsCompleted = repo.getLessonProgress(userId).length;
  const mockExams = attempts.filter((a) => a.kind === 'MOCK_EXAM' && a.submittedAt);
  const practice = attempts.filter((a) => a.kind === 'PRACTICE' && a.submittedAt);
  const best = mockExams.reduce((max, a) => Math.max(max, a.scorePercent), 0);
  const weakest = rankedModules(history, 'weakest')[0] ?? null;
  const strongest = rankedModules(history, 'strongest')[0] ?? null;

  return {
    userId,
    lessonsCompleted,
    practiceAttempts: practice.length,
    mockExams: mockExams.length,
    examsPassed: mockExams.filter((a) => a.passed).length,
    totalAnswered: history.answeredTotal,
    totalCorrect: history.correctTotal,
    bestExamPercent: best,
    averageAnswerSeconds: history.averageSeconds,
    weakestModuleCode: weakest ? moduleCodeOf(weakest) : null,
    strongestModuleCode: strongest ? moduleCodeOf(strongest) : null,
    lastActivityAt: attempts[0]?.submittedAt ?? attempts[0]?.startedAt ?? null,
  };
}

export function formatProgress(progress: RoadSafetyProgress, lang: ReplyLanguage): string {
  const weakestName = progress.weakestModuleCode ? moduleTitle(progress.weakestModuleCode, lang) : null;
  return lang === 'KINYARWANDA'
    ? `Aho ugeze: amasomo ${progress.lessonsCompleted}, imyitozo ${progress.practiceAttempts}, ibizamini ${progress.mockExams} (watsinze ${progress.examsPassed}), amanota meza ${progress.bestExamPercent}%.` +
      (weakestName ? `\nUgomba gukomeza kwitoza: ${weakestName}.` : '')
    : `Your progress: ${progress.lessonsCompleted} lessons completed, ${progress.practiceAttempts} practice runs, ${progress.mockExams} mock exams (${progress.examsPassed} passed), best score ${progress.bestExamPercent}%.` +
      (weakestName ? `\nWeakest topic right now: ${weakestName}.` : '');
}

function moduleTitle(moduleIdOrCode: string, lang: ReplyLanguage): string | null {
  const module = repo
    .getRoadSafetyModules()
    .find((m) => m.id === moduleIdOrCode || m.code === moduleIdOrCode);
  if (!module) return null;
  return lang === 'KINYARWANDA' ? module.titleRw : module.titleEn;
}

export function lessonSummary(lesson: RoadSafetyLesson, lang: ReplyLanguage): string {
  const title = lang === 'KINYARWANDA' ? lesson.titleRw : lesson.titleEn;
  const body = lang === 'KINYARWANDA' ? lesson.bodyRw : lesson.bodyEn;
  const points = (lang === 'KINYARWANDA' ? lesson.keyPointsRw : lesson.keyPointsEn)
    .map((p) => `• ${p}`)
    .join('\n');
  const sources = lesson.citations.map((c) => `${c.title} (${c.publisher}) — ${c.url}`).join('\n');
  const verified = lesson.legalVerifiedAt
    ? lang === 'KINYARWANDA'
      ? `Byasuzumwe ku mategeko: ${lesson.legalVerifiedAt.slice(0, 10)}`
      : `Legally reviewed: ${lesson.legalVerifiedAt.slice(0, 10)}`
    : lang === 'KINYARWANDA'
      ? "NTIBIRASUZUMWA KU MATEGEKO — ntibikwiye kwiga nk'amategeko"
      : 'NOT LEGALLY REVIEWED — do not study this as law';

  return `${title}\n\n${body}\n\n${points}\n\n${verified}\n${sources ? `\nSources:\n${sources}` : ''}`;
}

export function catalogueFor(lang: ReplyLanguage): string {
  const modules = repo.getRoadSafetyModules().filter((m) => m.status === 'PUBLISHED');
  const lessons = publishedLessons();
  if (modules.length === 0 && lessons.length === 0) {
    return NO_CONTENT[lang];
  }

  const lessonLines = lessons
    .slice(0, 12)
    .map((l, i) => `${i + 1}. ${lang === 'KINYARWANDA' ? l.titleRw : l.titleEn}`)
    .join('\n');

  return lang === 'KINYARWANDA'
    ? `AMASOMO:\n${lessonLines}\n\nAndika "lesson 2" gusoma isomo, "signs" ibimenyetso, "learn" kwiga ikibazo kimwe, "practice" imyitozo, "exam" ikizamini, "progress" aho ugeze.`
    : `LESSONS:\n${lessonLines}\n\nSend "lesson 2" to read one, "signs" for road signs, "learn" for one question at a time, "practice" for practice questions, "exam" for a mock exam, "progress" for your record.`;
}

/**
 * A learner saying "that answer is wrong" is evidence an administrator has to look at, so
 * the item leaves the published pool and lands in the review queue instead of staying live
 * while nobody reads the report. Withdrawing it is the safe direction of error: a wrong
 * rule taught from a bank is worse than a gap in coverage.
 */
export function reportQuestionIssue(params: {
  questionId: string;
  userId: string;
  channel: IssueReport['channel'];
  note: string;
}): { question: RoadSafetyQuestion; withdrawn: boolean } | null {
  const question = repo.getRoadSafetyQuestionById(params.questionId);
  if (!question) return null;
  // The repository hands back the live row, so the pre-update state has to be read before
  // the patch is applied or the learner is told the wrong thing about their own report.
  const wasPublished = question.status === 'PUBLISHED';
  const note = params.note.trim().slice(0, 400);
  const updated = repo.updateRoadSafetyQuestion(question.id, {
    issueReports: [
      ...question.issueReports,
      {
        reportedAt: new Date().toISOString(),
        userId: params.userId,
        channel: params.channel,
        note: note || 'The learner reported this item without giving a reason.',
      },
    ],
    status: wasPublished ? 'NEEDS_REVIEW' : question.status,
  });
  if (!updated) return null;
  return { question: updated, withdrawn: wasPublished };
}

export const EMPTY_CONTENT_NOTICE = NO_CONTENT;
export const SIMULATION_NOTICE = SIMULATION_LABEL;
