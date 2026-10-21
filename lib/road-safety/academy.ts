import { randomInt } from 'node:crypto';
import {
  ExamAttempt,
  ExamAnswer,
  ExamTemplate,
  RoadSafetyLesson,
  RoadSafetyProgress,
  RoadSafetyQuestion,
  User,
} from '@/lib/types';
import { repo } from '@/lib/db/repository';
import type { ReplyLanguage } from '@/lib/services/entitlements';

export interface StartOptions {
  moduleId?: string | null;
  examTemplateId?: string | null;
  lessonId?: string | null;
  count?: number;
}

const NO_CONTENT: Record<ReplyLanguage, string> = {
  ENGLISH:
    'The Road Safety Academy has no published questions yet. An administrator must publish lessons and questions before practice or mock exams can run.',
  KINYARWANDA:
    "Ishami ry'amategeko y'umuhanda ntirifibibazo byarasohotse. Umuyobozi agomba gusohora amasomo n'ibibazo mbere y'uko imyitozo cyangwa ibizamini bitangira.",
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

export function findPendingAttempt(userId: string): ExamAttempt | undefined {
  return repo.getExamAttempts(userId).find((a) => a.submittedAt === null);
}

/**
 * Creates a real attempt record. Questions are drawn from published content
 * only, so unpublished or admin-rejected material can never reach a learner.
 */
export function startAttempt(
  user: User,
  kind: 'PRACTICE' | 'MOCK_EXAM',
  opts: StartOptions = {}
): { attempt: ExamAttempt; questions: RoadSafetyQuestion[] } | null {
  const template: ExamTemplate | undefined = opts.examTemplateId
    ? repo.getExamTemplateById(opts.examTemplateId) ?? undefined
    : repo.getExamTemplates().find((e) => e.status === 'PUBLISHED' && (!opts.moduleId || e.moduleId === opts.moduleId));

  const requested =
    opts.count ??
    (kind === 'MOCK_EXAM' ? template?.questionCount ?? 10 : 5);

  const pool = publishedQuestions(template?.moduleId ?? opts.moduleId ?? null);
  if (pool.length === 0) return null;

  const questions = shuffled(pool).slice(0, Math.min(requested, pool.length));
  const passPercent = kind === 'MOCK_EXAM' ? template?.passPercent ?? 70 : 0;

  const attempt = repo.recordExamAttempt({
    userId: user.id,
    kind,
    examTemplateId: template?.id ?? null,
    moduleId: template?.moduleId ?? opts.moduleId ?? null,
    language: user.preferredLang === 'ENGLISH' ? 'ENGLISH' : 'KINYARWANDA',
    questionIds: questions.map((q) => q.id),
    answers: [],
    totalQuestions: questions.length,
    correctCount: 0,
    scorePercent: 0,
    passPercent,
    passed: false,
    startedAt: new Date().toISOString(),
    submittedAt: null,
    durationSeconds: null,
  });

  return { attempt, questions };
}

export function formatQuestionSheet(
  questions: RoadSafetyQuestion[],
  attempt: ExamAttempt,
  lang: ReplyLanguage
): string {
  const heading =
    lang === 'KINYARWANDA'
      ? attempt.kind === 'MOCK_EXAM'
        ? `IKIZAMINI cy'igerageza (${questions.length} ibibazo)`
        : `IMYITOZO (${questions.length} ibibazo)`
      : attempt.kind === 'MOCK_EXAM'
        ? `Mock exam (${questions.length} questions)`
        : `Practice (${questions.length} questions)`;

  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  const body = questions
    .map((q, i) => {
      const prompt = lang === 'KINYARWANDA' ? q.questionRw : q.questionEn;
      const options = (lang === 'KINYARWANDA' ? q.optionsRw : q.optionsEn)
        .map((opt, oi) => `   ${letters[oi] ?? oi + 1}. ${opt}`)
        .join('\n');
      return `${i + 1}. ${prompt}\n${options}`;
    })
    .join('\n\n');

  const footer =
    lang === 'KINYARWANDA'
      ? `Subiza ukoresheje imibare utandukanyije n'akabago, urugero: 1,3,2,4 (${questions.length} ibisubizo).`
      : `Answer with comma-separated numbers, e.g. 1,3,2,4 (${questions.length} answers).`;

  return `${heading}\n\n${body}\n\n${footer}`;
}

/** Normalises A/B/C or 1/2/3 into zero-based option indexes. */
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

/**
 * Scores server-side and stores the correction and explanation for every
 * question, so a learner sees why an answer was wrong.
 */
export function gradeAttempt(attempt: ExamAttempt, answers: number[]): ExamAttempt {
  const graded: ExamAnswer[] = [];
  let correct = 0;

  attempt.questionIds.forEach((questionId, index) => {
    const question = repo.getRoadSafetyQuestionById(questionId);
    if (!question) return;
    const chosenIndex = Number.isInteger(answers[index]) ? answers[index] : null;
    const isCorrect = chosenIndex === question.correctIndex;
    if (isCorrect) correct++;

    graded.push({
      questionId,
      selectedIndex: chosenIndex,
      isCorrect,
      givenAnswerEn: chosenIndex != null ? question.optionsEn[chosenIndex] ?? null : null,
      correctAnswerEn: question.optionsEn[question.correctIndex] ?? '—',
      explanationEn: question.explanationEn,
      explanationRw: question.explanationRw,
    });
  });

  const scorePercent = graded.length > 0 ? Math.round((correct / graded.length) * 100) : 0;
  const durationSeconds = Math.max(0, Math.round((Date.now() - Date.parse(attempt.startedAt)) / 1000));

  return repo.recordExamResult(attempt.id, {
    answers: graded,
    correctCount: correct,
    scorePercent,
    passed: attempt.kind === 'MOCK_EXAM' && graded.length > 0 && scorePercent >= attempt.passPercent,
    submittedAt: new Date().toISOString(),
    durationSeconds,
  });
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
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];

  const corrections = attempt.answers
    .map((a, i) => {
      const question = repo.getRoadSafetyQuestionById(a.questionId);
      const rw = lang === 'KINYARWANDA';
      const prompt = question ? (rw ? question.questionRw : question.questionEn) : a.questionId;
      // The attempt row only stores the English option text, so read the option in
      // the learner's language from the question itself and fall back to the stored text.
      const correctText = rw
        ? question?.optionsRw?.[question.correctIndex] ?? a.correctAnswerEn
        : a.correctAnswerEn;
      const chosenLabel =
        a.selectedIndex != null
          ? `${letters[a.selectedIndex] ?? a.selectedIndex + 1}`
          : rw
            ? 'nta gisubizo'
            : 'no answer';
      const status = a.isCorrect ? (rw ? 'NI BYO' : 'CORRECT') : rw ? 'SI BYO' : 'WRONG';
      const explanation = rw ? a.explanationRw : a.explanationEn;
      return `${i + 1}. ${prompt}\n   ${status} — watoranyije: ${chosenLabel}, igisubizo nyacyo: ${correctText}\n   ${explanation}`;
    })
    .join('\n\n');

  const citationNote =
    lang === 'KINYARWANDA'
      ? 'Ibisobanuro bishingiye ku mategeko y\'umuhanda n\'inkomoko zatangajwe mu masomo.'
      : 'Explanations are tied to the cited Rwandan traffic sources listed on each lesson.';

  return `${head}${verdict ? `\n${verdict}` : ''}\n\n${corrections}\n\n${citationNote}${
    wrong.length === 0 ? '' : lang === 'KINYARWANDA' ? '\n\nSoma amasomo ku bibazo wananiye hanyuma wandike "exam" nanone.' : '\n\nReview the lessons for the questions you missed, then send "exam" again.'
  }`;
}

export function progressFor(userId: string): RoadSafetyProgress {
  const attempts = repo.getExamAttempts(userId);
  const lessonsCompleted = repo.getLessonProgress(userId).length;
  const mockExams = attempts.filter((a) => a.kind === 'MOCK_EXAM' && a.submittedAt);
  const practice = attempts.filter((a) => a.kind === 'PRACTICE' && a.submittedAt);
  const answered = attempts.reduce((n, a) => n + a.answers.filter((x) => x.selectedIndex != null).length, 0);
  const correct = attempts.reduce((n, a) => n + a.correctCount, 0);
  const best = mockExams.reduce((max, a) => Math.max(max, a.scorePercent), 0);

  return {
    userId,
    lessonsCompleted,
    practiceAttempts: practice.length,
    mockExams: mockExams.length,
    examsPassed: mockExams.filter((a) => a.passed).length,
    totalAnswered: answered,
    totalCorrect: correct,
    bestExamPercent: best,
    lastActivityAt: attempts[0]?.submittedAt ?? attempts[0]?.startedAt ?? null,
  };
}

export function formatProgress(progress: RoadSafetyProgress, lang: ReplyLanguage): string {
  return lang === 'KINYARWANDA'
    ? `Aho ugeze: amasomo ${progress.lessonsCompleted}, imyitozo ${progress.practiceAttempts}, ibizamini ${progress.mockExams} (watsinze ${progress.examsPassed}), amanota meza ${progress.bestExamPercent}%.`
    : `Your progress: ${progress.lessonsCompleted} lessons completed, ${progress.practiceAttempts} practice runs, ${progress.mockExams} mock exams (${progress.examsPassed} passed), best score ${progress.bestExamPercent}%.`;
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
      ? 'NTIBIRASUZUMWA KU MATEGEKO — ntibikwiye kwiga nk\'amategeko'
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
    .map((l, i) => `${i + 1}. ${lang === 'KINYARWANDA' ? l.titleRw : l.titleEn}${l.status !== 'PUBLISHED' ? ' (draft)' : ''}`)
    .join('\n');

  return lang === 'KINYARWANDA'
    ? `AMASOMO:\n${lessonLines}\n\nAndika "lesson 2" gusoma isomo, "signs" ibimenyetso, "practice" imyitozo, "exam" ikizamini, "progress" aho ugeze.`
    : `LESSONS:\n${lessonLines}\n\nSend "lesson 2" to read one, "signs" for road signs, "practice" for practice questions, "exam" for a mock exam, "progress" for your record.`;
}

export const EMPTY_CONTENT_NOTICE = NO_CONTENT;
