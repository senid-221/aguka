import { ExamAttempt, LegalBasis, RoadSafetyQuestion } from '@/lib/types';
import { repo } from '@/lib/db/repository';
import { AttemptKind, learnerHistory, planSession, publishedLessons, publishedQuestions } from '@/lib/road-safety/academy';
import { FACTS_BY_ID } from '@/lib/road-safety/verified-facts';
import type { ReplyLanguage } from '@/lib/services/entitlements';

/**
 * The six-part report a learner gets after a session. Everything here is read back from
 * rows the server already holds — the attempt, the question bank, the lesson list and the
 * learner's own history — so the advice is a calculation, not a generated paragraph, and
 * the tutor has something fixed to quote when the learner asks why.
 */

export interface TopicTally {
  moduleId: string;
  titleEn: string;
  titleRw: string;
  correct: number;
  answered: number;
}

export interface SessionExplanation {
  /** Position on the sheet the learner saw, so "question 7" means the same thing to both. */
  number: number;
  questionEn: string;
  questionRw: string;
  givenAnswer: string | null;
  correctAnswer: string;
  explanationEn: string;
  explanationRw: string;
  legalBasis: LegalBasis | null;
  /** True only when a verified instrument is cited and the item passed legal review. */
  isOfficialRequirement: boolean;
  sources: Array<{ title: string; url: string }>;
  secondsSpent: number | null;
}

export interface LessonRecommendation {
  /** The number the learner types after "lesson" — same ordering the chat uses. */
  number: number;
  lessonId: string;
  titleEn: string;
  titleRw: string;
  legalVerifiedAt: string | null;
}

export interface SessionReport {
  attemptId: string;
  userId: string;
  kind: AttemptKind;
  language: 'ENGLISH' | 'KINYARWANDA';
  finishedAt: string | null;
  /** 1. Score */
  scorePercent: number;
  correctCount: number;
  totalQuestions: number;
  passPercent: number;
  passed: boolean;
  durationSeconds: number | null;
  averageAnswerSeconds: number | null;
  slowestNumber: number | null;
  slowestSeconds: number | null;
  /** 2. Topics answered correctly */
  topicsCorrect: TopicTally[];
  /** 3. Topics to improve, plus what this paper never tested */
  topicsToImprove: TopicTally[];
  topicsNotTested: TopicTally[];
  /** 4. Explanations, one per wrong or unanswered item */
  explanations: SessionExplanation[];
  /** 5. Lessons and practice to do next */
  recommendedLessons: LessonRecommendation[];
  recommendedPractice: { moduleId: string | null; count: number; difficulty: string } | null;
  /** 6. The suggested next session, derived from this learner's own record */
  nextSession: { kind: AttemptKind; reasonEn: string; reasonRw: string };
  /** Honest gaps: anything the report could not ground in stored data. */
  notes: string[];
}

function moduleTitles(moduleId: string): { titleEn: string; titleRw: string } {
  const module = repo.getRoadSafetyModules().find((m) => m.id === moduleId);
  return { titleEn: module?.titleEn ?? 'General', titleRw: module?.titleRw ?? 'Rusange' };
}

function basisOf(question: RoadSafetyQuestion): LegalBasis | null {
  for (const factId of question.factIds) {
    const fact = FACTS_BY_ID.get(factId);
    if (fact) return fact.legalBasis;
  }
  return null;
}

function tallyMap(): Map<string, TopicTally> {
  return new Map();
}

function bump(tallies: Map<string, TopicTally>, moduleId: string, correct: boolean, answered: boolean): void {
  const existing = tallies.get(moduleId) ?? { moduleId, ...moduleTitles(moduleId), correct: 0, answered: 0 };
  if (answered) existing.answered += 1;
  if (correct) existing.correct += 1;
  tallies.set(moduleId, existing);
}

/**
 * Builds the report for a graded attempt. The attempt must already be submitted: an open
 * paper has no answers to report, and inventing a score for it would be a lie.
 */
export function buildSessionReport(attempt: ExamAttempt): SessionReport | null {
  if (!attempt.submittedAt || attempt.answers.length === 0) return null;

  const tallies = tallyMap();
  const explanations: SessionExplanation[] = [];
  let slowestNumber: number | null = null;
  let slowestSeconds = 0;

  attempt.answers.forEach((answer, index) => {
    const question = repo.getRoadSafetyQuestionById(answer.questionId);
    const moduleId = question?.moduleId ?? '';
    if (moduleId) bump(tallies, moduleId, answer.isCorrect, true);

    const seconds = answer.timeSpentSeconds ?? 0;
    if (seconds > slowestSeconds) {
      slowestSeconds = seconds;
      slowestNumber = index + 1;
    }

    if (answer.isCorrect || !question) return;
    const basis = basisOf(question);
    explanations.push({
      number: index + 1,
      questionEn: question.questionEn,
      questionRw: question.questionRw,
      givenAnswer: answer.givenAnswerEn,
      correctAnswer: answer.correctAnswerEn,
      explanationEn: question.explanationEn,
      explanationRw: question.explanationRw,
      legalBasis: basis,
      isOfficialRequirement:
        question.legalVerifiedAt != null && (basis === 'OFFICIAL_REQUIREMENT' || basis === 'ADMINISTRATIVE_INSTRUCTION'),
      sources: question.citations.map((c) => ({ title: c.title, url: c.url })),
      secondsSpent: answer.timeSpentSeconds ?? null,
    });
  });

  const history = learnerHistory(attempt.userId);
  const answeredModules = new Set<string>();
  for (const attemptRow of repo.getExamAttempts(attempt.userId)) {
    if (!attemptRow.submittedAt) continue;
    for (const id of attemptRow.questionIds) {
      const q = repo.getRoadSafetyQuestionById(id);
      if (q) answeredModules.add(q.moduleId);
    }
  }
  const topicsNotTested = Array.from(
    repo
      .getRoadSafetyQuestions()
      .filter((q) => q.status === 'PUBLISHED' && !answeredModules.has(q.moduleId))
      .reduce((acc, q) => {
        bump(acc, q.moduleId, false, false);
        return acc;
      }, tallyMap()).values()
  );

  const all = Array.from(tallies.values());
  const topicsToImprove = all
    .filter((t) => t.answered - t.correct > 0)
    .sort((a, b) => b.answered - b.correct - (a.answered - a.correct) || a.titleEn.localeCompare(b.titleEn));
  const topicsCorrect = all.filter((t) => t.correct > 0);

  const lessonList = publishedLessons();
  const recommendedLessons: LessonRecommendation[] = [];
  const notes: string[] = [];
  for (const topic of topicsToImprove) {
    const match = lessonList.find((l) => l.moduleId === topic.moduleId);
    if (!match) {
      notes.push(`No published lesson covers "${topic.titleEn}" yet, so it cannot be recommended as reading.`);
      continue;
    }
    if (recommendedLessons.some((r) => r.lessonId === match.id)) continue;
    recommendedLessons.push({
      number: lessonList.indexOf(match) + 1,
      lessonId: match.id,
      titleEn: match.titleEn,
      titleRw: match.titleRw,
      legalVerifiedAt: match.legalVerifiedAt,
    });
    if (recommendedLessons.length === 3) break;
  }

  const weakest = topicsToImprove[0]?.moduleId ?? null;
  const nextKind: AttemptKind =
    attempt.scorePercent < 50 ? 'LEARN' : attempt.kind === 'MOCK_EXAM' ? 'PRACTICE' : 'MOCK_EXAM';
  const nextPlan = planSession(attempt.userId, nextKind, { moduleId: weakest });
  const availableForWeakest = publishedQuestions(weakest).length;
  const practiceCount = Math.min(5, Math.max(1, availableForWeakest));

  const answeredWithTiming = attempt.answers.filter((a) => (a.timeSpentSeconds ?? 0) > 0);
  const averageAnswerSeconds = answeredWithTiming.length
    ? Math.round(answeredWithTiming.reduce((sum, a) => sum + (a.timeSpentSeconds ?? 0), 0) / answeredWithTiming.length)
    : history.averageSeconds != null && history.averageSeconds > 0
      ? Math.round(history.averageSeconds)
      : null;

  if (averageAnswerSeconds === null) {
    notes.push('Response times were not recorded for this paper, so pacing advice is not available.');
  }

  return {
    attemptId: attempt.id,
    userId: attempt.userId,
    kind: attempt.kind,
    language: attempt.language,
    finishedAt: attempt.submittedAt,
    scorePercent: attempt.scorePercent,
    correctCount: attempt.correctCount,
    totalQuestions: attempt.totalQuestions,
    passPercent: attempt.passPercent,
    passed: attempt.passed,
    durationSeconds: attempt.durationSeconds,
    averageAnswerSeconds,
    slowestNumber: slowestNumber && slowestSeconds > 0 ? slowestNumber : null,
    slowestSeconds: slowestSeconds > 0 ? slowestSeconds : null,
    topicsCorrect,
    topicsToImprove,
    topicsNotTested,
    explanations,
    recommendedLessons,
    recommendedPractice: topicsToImprove.length
      ? { moduleId: weakest, count: practiceCount, difficulty: nextPlan.difficulty }
      : null,
    nextSession: {
      kind: nextKind,
      reasonEn: nextPlan.rationale,
      reasonRw: nextPlan.rationale,
    },
    notes,
  };
}

const HEADINGS: Record<'ENGLISH' | 'KINYARWANDA', string[]> = {
  ENGLISH: [
    '1. SCORE',
    '2. TOPICS YOU ANSWERED CORRECTLY',
    '3. TOPICS TO IMPROVE',
    '4. WHY THE MISSED ONES ARE WRONG',
    '5. LESSONS AND PRACTICE FOR YOU',
    '6. SUGGESTED NEXT SESSION',
  ],
  KINYARWANDA: [
    '1. AMANOTA',
    '2. INGINGO WASUBIJE NEZA',
    '3. INGINGO ZIKWIYE GUTEZA IMBERE',
    '4. IMPAMVU Y\'IBISUBIZO UTARI NEZA',
    '5. AMASOMO N\'IMYITOZO BYAKUGIRIRA AKAMARO',
    '6. IKIKORWA GIKURIKIRAHO',
  ],
};

function pct(correct: number, answered: number): string {
  return answered > 0 ? `${Math.round((correct / answered) * 100)}%` : '—';
}

export function formatSessionReport(report: SessionReport, lang: ReplyLanguage): string {
  const rw = lang === 'KINYARWANDA';
  const h = HEADINGS[lang];
  const sections: string[] = [];

  const scoreLine = rw
    ? `${report.correctCount}/${report.totalQuestions} (${report.scorePercent}%)` +
      (report.kind === 'MOCK_EXAM'
        ? ` — ${report.passed ? `watsinze, inota rikenewe ni ${report.passPercent}%` : `ntiwatsinze, inota rikenewe ni ${report.passPercent}%`}`
        : '') +
      (report.durationSeconds != null ? ` | igihe: ${report.durationSeconds}s.` : '')
    : `${report.correctCount}/${report.totalQuestions} (${report.scorePercent}%)` +
      (report.kind === 'MOCK_EXAM'
        ? ` — ${report.passed ? `passed, the mark needed is ${report.passPercent}%` : `not passed, the mark needed is ${report.passPercent}%`}`
        : '') +
      (report.durationSeconds != null ? ` | time: ${report.durationSeconds}s.` : '');
  const paceLine =
    report.averageAnswerSeconds != null
      ? rw
        ? ` | Impuzandengo: ${report.averageAnswerSeconds}s ku kibazo.`
        : ` | Average ${report.averageAnswerSeconds}s per question.`
      : '';
  sections.push(`${h[0]}\n${scoreLine}${paceLine}`);

  const correctLines = report.topicsCorrect.map((t) =>
    rw ? `  - ${t.titleRw}: ${t.correct}/${t.answered} (${pct(t.correct, t.answered)})` : `  - ${t.titleEn}: ${t.correct}/${t.answered} (${pct(t.correct, t.answered)})`
  );
  sections.push(`${h[1]}\n${correctLines.length ? correctLines.join('\n') : rw ? '  - Nta n\'kimwe.' : '  - None in this paper.'}`);

  const improveLines = report.topicsToImprove.map((t) =>
    rw ? `  - ${t.titleRw}: ${t.answered - t.correct} muri ${t.answered} si byo` : `  - ${t.titleEn}: ${t.answered - t.correct} of ${t.answered} missed`
  );
  const untested = report.topicsNotTested.map((t) => (rw ? t.titleRw : t.titleEn));
  sections.push(
    `${h[2]}\n${improveLines.length ? improveLines.join('\n') : rw ? '  - Nta makosa muri iyi papye.' : '  - Nothing missed in this paper.'}` +
      (untested.length
        ? `\n${rw ? '  Bitazamzwemo muri iyi papye:' : '  Not covered by this paper:'} ${untested.slice(0, 6).join(', ')}`
        : '')
  );

  const explanationLines = report.explanations.map((e) => {
    const basisTag = e.isOfficialRequirement
      ? rw
        ? 'ITEGEKO RYASUZUMWE'
        : 'VERIFIED LEGAL REQUIREMENT'
      : rw
        ? 'NTIBYEMEWE NK\'ITEGEKO'
        : 'NOT CONFIRMED AS LAW';
    const chosen = e.givenAnswer
      ? rw
        ? `Watoranyije: ${e.givenAnswer}`
        : `You chose: ${e.givenAnswer}`
      : rw
        ? 'Ntiwigeze witaba.'
        : 'Left unanswered.';
    const sources = e.sources.length ? ` (${e.sources.map((s) => s.url).join(', ')})` : '';
    return `  ${e.number}. ${rw ? e.questionRw : e.questionEn}\n     ${chosen} | ${rw ? 'Igisubizo' : 'Answer'}: ${e.correctAnswer}\n     ${basisTag}: ${rw ? e.explanationRw : e.explanationEn}${sources}`;
  });
  sections.push(
    `${h[3]}\n${explanationLines.length ? explanationLines.join('\n\n') : rw ? '  - Nta gisubizo cyo gusobanura.' : '  - Nothing to explain.'}`
  );

  const lessonLines = report.recommendedLessons.map((l) =>
    rw
      ? `  - Andika "lesson ${l.number}" kugira ngo usome: ${l.titleRw}${l.legalVerifiedAt ? '' : ' (NTIBYASUZUMWE KU MATEGEKO)'}`
      : `  - Send "lesson ${l.number}" to read: ${l.titleEn}${l.legalVerifiedAt ? '' : ' (NOT LEGALLY REVIEWED)'}`
  );
  const practice = report.recommendedPractice
    ? rw
      ? `  - Andika "${report.kind === 'MOCK_EXAM' ? 'practice' : 'exam'}" kugira ngo ukore imyitozo ${report.recommendedPractice.count} ku ${
          moduleTitles(report.recommendedPractice.moduleId ?? '').titleRw
        } (urwego: ${report.recommendedPractice.difficulty}).`
      : `  - Send "${report.kind === 'MOCK_EXAM' ? 'practice' : 'exam'}" for ${report.recommendedPractice.count} questions on ${
          moduleTitles(report.recommendedPractice.moduleId ?? '').titleEn
        } (level: ${report.recommendedPractice.difficulty}).`
    : '';
  sections.push(
    `${h[4]}\n${[...lessonLines, practice].filter(Boolean).join('\n') || (rw ? '  - Nta gusomeka.' : '  - Nothing to recommend.')}` +
      (report.recommendedLessons.length === 0 && report.topicsToImprove.length
        ? `\n  ${rw ? 'Nta masomo asohotwe kuri izo ngingo.' : 'No published lesson covers those topics yet.'}`
        : '')
  );

  const nextLabel =
    report.nextSession.kind === 'LEARN'
      ? rw
        ? 'iga ikibazo kimwe kimwe ("learn")'
        : 'one question at a time ("learn")'
      : report.nextSession.kind === 'MOCK_EXAM'
        ? rw
          ? 'gerageza ikizamini ("exam")'
          : 'sit a timed mock ("exam")'
        : rw
          ? 'kora imyitozo ("practice")'
          : 'run a practice set ("practice")';
  sections.push(
    `${h[5]}\n  ${rw ? `Iki nikurikira: ${nextLabel}.` : `Next: ${nextLabel}.`}\n  ${rw ? report.nextSession.reasonRw : report.nextSession.reasonEn}`
  );

  if (report.notes.length) {
    sections.push(`${rw ? 'CYITONDWA' : 'PLEASE NOTE'}\n${report.notes.map((n) => `  - ${n}`).join('\n')}`);
  }

  return sections.join('\n\n');
}

/**
 * The compact tail a WhatsApp learner gets after the corrections: what to read and what to
 * do next. Full six-part report stays on the API for the app screens.
 */
export function nextStepLines(report: SessionReport, lang: ReplyLanguage): string {
  const rw = lang === 'KINYARWANDA';
  const lines: string[] = [];
  if (report.recommendedLessons.length) {
    lines.push(
      rw
        ? `Soma: ${report.recommendedLessons.map((l) => `"lesson ${l.number}" (${l.titleRw})`).join(', ')}.`
        : `Read: ${report.recommendedLessons.map((l) => `"lesson ${l.number}" (${l.titleEn})`).join(', ')}.`
    );
  }
  lines.push(
    rw
      ? `Bikurikiraho: andika "${report.nextSession.kind === 'MOCK_EXAM' ? 'exam' : report.nextSession.kind === 'LEARN' ? 'learn' : 'practice'}".`
      : `Next: send "${report.nextSession.kind === 'MOCK_EXAM' ? 'exam' : report.nextSession.kind === 'LEARN' ? 'learn' : 'practice'}".`
  );
  return lines.join('\n');
}
