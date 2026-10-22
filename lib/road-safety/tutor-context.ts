import { repo } from '@/lib/db/repository';
import {
  findPendingAttempt,
  latestSubmittedAttempt,
  learnerHistory,
  progressFor,
  remainingSeconds,
  sheetLabel,
} from '@/lib/road-safety/academy';
import { buildSessionReport } from '@/lib/road-safety/session-report';

/**
 * What the conversational agent is allowed to say about road safety. Everything here is
 * read back from stored rows — the sign register, the question bank, the learner's own
 * attempts — so "why is my answer wrong?" is answered about the paper that person actually
 * sat, with the letter they actually typed and the source that item cites.
 *
 * The limits are the point of the module: an unbounded dump of the bank would blow the
 * prompt budget, and a tutor with no material has to say it does not know rather than guess.
 */

const MAX_SIGNS = 25;
const MAX_LESSONS = 8;
const MAX_ITEMS = 12;

export function buildRoadSafetyTutorContext(userId: string): string[] {
  const parts: string[] = [];

  const signs = repo.getRoadSigns().filter((s) => s.status === 'PUBLISHED');
  parts.push(
    signs.length === 0
      ? 'Published road-sign register: EMPTY. No sign has been published, so do not describe any sign or its meaning; tell the learner an administrator must publish the register first.'
      : `Published road-sign register (the only signs you may describe):\n${signs
          .slice(0, MAX_SIGNS)
          .map(
            (s) =>
              `- ${s.code} | ${s.nameEn} / ${s.nameRw} | meaning: ${s.meaningEn} (${s.meaningRw}) | shape: ${s.shape || 'not recorded'} | colours: ${
                s.colourConvention || 'not recorded'
              } | legal review: ${s.legalVerifiedAt ? s.legalVerifiedAt.slice(0, 10) : 'NOT REVIEWED'} | image: ${
                s.imageKey ? 'on file' : 'NONE PUBLISHED'
              } | sources: ${s.citations.map((c) => c.url).join(' ') || 'none'}`
          )
          .join('\n')}${signs.length > MAX_SIGNS ? `\n(${signs.length - MAX_SIGNS} further published signs not shown here.)` : ''}`
  );

  const lessons = repo
    .getRoadSafetyLessons()
    .filter((l) => l.status === 'PUBLISHED')
    .slice(0, MAX_LESSONS);
  parts.push(
    lessons.length === 0
      ? 'Published lessons: NONE. Do not invent a lesson title or a rule; tell the learner no verified material is published yet.'
      : `Published lessons (the only teaching material you may quote):\n${lessons
          .map(
            (l) =>
              `- ${l.titleEn} / ${l.titleRw} | legal review: ${l.legalVerifiedAt ? l.legalVerifiedAt.slice(0, 10) : 'NOT REVIEWED'} | sources: ${l.citations
                .map((c) => c.url)
                .join(' ') || 'none'}\n  text: ${l.bodyEn.slice(0, 600)}`
          )
          .join('\n')}`
  );

  const paper = latestSubmittedAttempt(userId);
  if (!paper) {
    parts.push(
      'This learner has no finished paper on record yet. If they ask about their own answers, say there is nothing graded to look at and offer to start practice.'
    );
  } else {
    const items = paper.answers.slice(0, MAX_ITEMS).map((answer, index) => {
      const question = repo.getRoadSafetyQuestionById(answer.questionId);
      if (!question) return `  ${index + 1}. (question row missing)`;
      const chosen = answer.selectedIndex == null ? 'left unanswered' : `${sheetLabel(paper.id, question, answer.selectedIndex)} — ${answer.givenAnswerEn}`;
      return [
        `  ${index + 1}. ${question.questionEn}`,
        `     learner answered: ${chosen}`,
        `     correct answer: ${sheetLabel(paper.id, question, question.correctIndex)} — ${question.optionsEn[question.correctIndex]}`,
        `     result: ${answer.isCorrect ? 'CORRECT' : 'WRONG'} | difficulty: ${question.difficulty} | server-timed: ${answer.timeSpentSeconds ?? 0}s`,
        `     explanation on file: ${question.explanationEn}`,
        `     legal review: ${question.legalVerifiedAt ? `verified ${question.legalVerifiedAt.slice(0, 10)}` : 'NOT VERIFIED'} | sources: ${
          question.citations.map((c) => c.url).join(' ') || 'none'
        }`,
      ].join('\n');
    });
    parts.push(
      `The learner's most recent finished paper (${paper.kind}, ${paper.correctCount}/${paper.totalQuestions} = ${paper.scorePercent}%, submitted ${paper.submittedAt}):\n${items.join(
        '\n'
      )}`
    );

    const report = buildSessionReport(paper);
    if (report) {
      parts.push(
        `The advice already given to this learner after that paper: improve ${
          report.topicsToImprove.map((t) => t.titleEn).join(', ') || 'nothing specific'
        }; read ${report.recommendedLessons.map((l) => `"lesson ${l.number}" ${l.titleEn}`).join(', ') || 'no lesson yet'}; next session ${
          report.nextSession.kind
        }. Honest gaps: ${report.notes.join(' ') || 'none'}`
      );
    }
  }

  const history = learnerHistory(userId);
  const tallies = Array.from(history.byModule.entries())
    .map(([moduleId, tally]) => ({
      title: repo.getRoadSafetyModules().find((m) => m.id === moduleId)?.titleEn ?? 'General',
      correct: tally.correct,
      answered: tally.answered,
    }))
    .filter((t) => t.answered > 0)
    .sort((a, b) => b.answered - b.correct - (a.answered - a.correct));
  parts.push(
    history.answeredTotal === 0
      ? 'Recorded answers for this learner: none.'
      : `Where this learner has gone wrong across all their papers (their own record, nothing else):\n${tallies
          .map((t) => `  - ${t.title}: ${t.correct}/${t.answered} correct`)
          .join('\n')}\nTotals: ${history.answeredTotal} answered, ${history.correctTotal} correct (${Math.round(
          history.accuracy * 100
        )}%), ${history.attempts} paper(s).`
  );

  const progress = progressFor(userId);
  const open = findPendingAttempt(userId);
  parts.push(
    open
      ? `A paper is open right now: ${open.kind}, ${open.savedAnswers.filter((v) => v != null).length}/${open.totalQuestions} answered, ${
          remainingSeconds(open) ?? 'no'
        } seconds of server time left${open.strict ? ', answers hidden until it is submitted' : ''}.`
      : 'No paper is open for this learner at the moment.'
  );
  parts.push(
    `Progress on record: ${progress.lessonsCompleted} lesson(s) completed, ${progress.mockExams} mock exam(s), ${progress.examsPassed} passed, best ${progress.bestExamPercent}%.`
  );

  return parts;
}
