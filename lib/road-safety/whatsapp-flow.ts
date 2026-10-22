import { User } from '@/lib/types';
import { repo } from '@/lib/db/repository';
import type { ReplyLanguage } from '@/lib/services/entitlements';
import {
  catalogueFor,
  extractAnswerIndexes,
  findPendingAttempt,
  formatProgress,
  formatQuestionSheet,
  formatResult,
  gradeAttempt,
  latestSubmittedAttempt,
  lessonSummary,
  looksLikeAnswers,
  progressFor,
  publishedLessons,
  reapExpiredAttempts,
  reportQuestionIssue,
  startAttempt,
  toStoredAnswers,
} from '@/lib/road-safety/academy';
import { buildSessionReport, nextStepLines } from '@/lib/road-safety/session-report';

export interface AcademyFlowResult {
  replyText: string;
  intent: string;
}

const COMMANDS: Array<{ intent: string; words: string[] }> = [
  { intent: 'LIST_LESSONS', words: ['lessons', 'lesson list', 'catalogue', 'amasomo', 'somo', 'menu academy', 'road safety'] },
  { intent: 'READ_LESSON', words: ['lesson', 'isomo', 'soma'] },
  { intent: 'COMPLETE_LESSON', words: ['complete', 'byarangiye', 'done'] },
  { intent: 'ROAD_SIGNS', words: ['signs', 'sign', 'ibimenyetso', 'ikimenyetso'] },
  { intent: 'PRACTICE', words: ['practice', 'imyitozo', 'quiz', 'ibibazo'] },
  { intent: 'LEARN', words: ['learn', 'kwiga', 'iga'] },
  { intent: 'MOCK_EXAM', words: ['exam', 'ikizamini', 'mock'] },
  { intent: 'PROGRESS', words: ['progress', 'aho ugeze', 'score', 'amanota'] },
  { intent: 'REPORT_ISSUE', words: ['report', 'ndabona ikosa', 'ntibyo', 'si byo'] },
];

function indexOf(text: string, lang: ReplyLanguage): number | null {
  const m = text.match(/(\d{1,3})/);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

function detectCommand(text: string): string | null {
  const t = text.toLowerCase().trim();
  for (const cmd of COMMANDS) {
    if (cmd.words.some((w) => t === w || t.startsWith(`${w} `) || t.includes(` ${w} `))) return cmd.intent;
  }
  return null;
}

/**
 * Runs the deterministic parts of the academy (reading lessons, practising,
 * grading, progress) without an AI provider, so exams still work when Gemini is
 * not configured. Anything else falls through to the model.
 */
export async function handleRoadSafetyMessage(
  user: User,
  text: string,
  lang: ReplyLanguage
): Promise<AcademyFlowResult | null> {
  const command = detectCommand(text);

  // A report of a wrong answer must win over the answer detector: on a one-question
  // learn card, "report 1: that fine is wrong" otherwise looks exactly like a pick.
  if (command === 'REPORT_ISSUE') {
    const paper = findPendingAttempt(user.id) ?? latestSubmittedAttempt(user.id);
    if (!paper) {
      return {
        replyText:
          lang === 'KINYARWANDA'
            ? 'Ntabwo nanjye nakwemeza ikibazo ushaka kumenyesha kuko utaragira ikizamini ukora. Andika "practice" ubanza.'
            : 'I cannot tell which question you mean because you have no paper yet. Send "practice" first, then "report 3: what is wrong".',
        intent: 'REPORT_ISSUE_NO_PAPER',
      };
    }
    const numberMatch = text.match(/(\d{1,3})/);
    const number = numberMatch ? Number.parseInt(numberMatch[1], 10) : NaN;
    if (!Number.isInteger(number) || number < 1 || number > paper.questionIds.length) {
      return {
        replyText:
          lang === 'KINYARWANDA'
            ? `Andika "report N" aho N ari numero y'ikibazo (1 kugeza ${paper.questionIds.length}), uvuge n'ikosa.`
            : `Send "report N" where N is the question number (1 to ${paper.questionIds.length}), and say what is wrong.`,
        intent: 'REPORT_ISSUE_NO_NUMBER',
      };
    }
    const questionId = paper.questionIds[number - 1];
    const note = text
      .slice(text.toLowerCase().indexOf('report') + 6)
      .replace(String(number), '')
      .replace(/^[:\s,-]+/, '')
      .trim();
    const recorded = reportQuestionIssue({ questionId, userId: user.id, channel: 'WHATSAPP', note });
    if (!recorded) {
      return {
        replyText:
          lang === 'KINYARWANDA'
            ? 'Ntibyashobotse: icyo kibazo ntikiboneka mu bubiko.'
            : 'That could not be recorded: the question is no longer in the bank.',
        intent: 'REPORT_ISSUE_FAILED',
      };
    }
    return {
      replyText: recorded.withdrawn
        ? lang === 'KINYARWANDA'
          ? `Murakoze. Ikibazo ${number} cyakuwe mu bisubizwa kugeza umuyobozi abisuzumye. Nta sandugu ihabwa abanyeshuri ivugurura ritaremewe.`
          : `Thank you. Question ${number} has been taken out of the papers until an administrator reviews it, so no learner is taught an unverified correction.`
        : lang === 'KINYARWANDA'
          ? `Murakoze. Ikibazo ${number} cyongewe mu rukurikirane rw'isuzuma.`
          : `Thank you. Question ${number} was added to the review queue.`,
      intent: 'REPORT_ISSUE',
    };
  }

  const pending = findPendingAttempt(user.id);
  if (pending && looksLikeAnswers(text, pending.questionIds.length)) {
    const positions = extractAnswerIndexes(text);
    const graded = gradeAttempt(pending, toStoredAnswers(pending, positions));
    const report = buildSessionReport(graded);
    return {
      replyText: report ? `${formatResult(graded, lang)}\n\n${nextStepLines(report, lang)}` : formatResult(graded, lang),
      intent: 'GRADE_ATTEMPT',
    };
  }
  const timedOut = reapExpiredAttempts(user.id);
  if (timedOut.length > 0) {
    const last = timedOut[timedOut.length - 1];
    const report = buildSessionReport(last);
    return {
      replyText: report ? `${formatResult(last, lang)}\n\n${nextStepLines(report, lang)}` : formatResult(last, lang),
      intent: 'AUTO_SUBMIT_EXPIRED',
    };
  }
  if (!command) return null;
  const t = text.toLowerCase();

  if (command === 'LIST_LESSONS') {
    return { replyText: catalogueFor(lang), intent: 'LIST_LESSONS' };
  }

  if (command === 'READ_LESSON') {
    const lessons = publishedLessons();
    if (lessons.length === 0) {
      return {
        replyText:
          lang === 'KINYARWANDA'
            ? "Nta masomo arahabwa muri iri shami. Umuyobozi agomba kuyasohora."
            : 'No Road Safety lessons have been published yet. An administrator must publish them first.',
        intent: 'NO_PUBLISHED_LESSONS',
      };
    }
    const n = indexOf(text, lang);
    const lesson = n ? lessons[n - 1] : lessons[0];
    if (!lesson) {
      return {
        replyText:
          lang === 'KINYARWANDA'
            ? `Numero ntiyabonetse. Amasomo ariho ni ${lessons.length}. Andika "lesson 1" kugeza "lesson ${lessons.length}".`
            : `That number is not available. There are ${lessons.length} published lessons. Send "lesson 1" to "lesson ${lessons.length}".`,
        intent: 'LESSON_OUT_OF_RANGE',
      };
    }
    return {
      replyText:
        `${lessonSummary(lesson, lang)}\n\n` +
        (lang === 'KINYARWANDA'
          ? `Andika "complete ${lessons.indexOf(lesson) + 1}" iyo ugaririje, "practice" cyangwa "exam" kugira ngo witoze.`
          : `Send "complete ${lessons.indexOf(lesson) + 1}" when you finish, or "practice" / "exam" to test yourself.`),
      intent: 'READ_LESSON',
    };
  }

  if (command === 'COMPLETE_LESSON') {
    const lessons = publishedLessons();
    const n = indexOf(text, lang) ?? 1;
    const lesson = lessons[n - 1];
    if (!lesson) {
      return {
        replyText:
          lang === 'KINYARWANDA'
            ? `Nta somo riri kuri numero ${n}.`
            : `There is no published lesson number ${n}.`,
        intent: 'LESSON_OUT_OF_RANGE',
      };
    }
    repo.markLessonCompleted(user.id, lesson.id);
    const progress = progressFor(user.id);
    return {
      replyText:
        (lang === 'KINYARWANDA'
          ? `Wasoje isomo: ${lesson.titleRw}.\n`
          : `Lesson completed: ${lesson.titleEn}.\n`) + formatProgress(progress, lang),
      intent: 'COMPLETE_LESSON',
    };
  }

  if (command === 'ROAD_SIGNS') {
    const signs = repo.getRoadSigns().filter((s) => s.status === 'PUBLISHED');
    if (signs.length === 0) {
      return {
        replyText:
          lang === 'KINYARWANDA'
            ? "Nta bimenyetso by'umuhanda birasohorwa. Umuyobozi agomba kubanza kubishyiraho."
            : 'No road signs have been published yet. An administrator must add them first.',
        intent: 'NO_PUBLISHED_SIGNS',
      };
    }

    const wanted = signs.find((s) => t.includes(s.code.toLowerCase()));
    if (wanted) {
      return {
        replyText:
          `${lang === 'KINYARWANDA' ? wanted.nameRw : wanted.nameEn}\n` +
          `Intego: ${lang === 'KINYARWANDA' ? wanted.meaningRw : wanted.meaningEn}\n` +
          `Shape: ${wanted.shape}. Colours: ${wanted.colourConvention}.\n` +
          (wanted.legalVerifiedAt
            ? `Verified: ${wanted.legalVerifiedAt.slice(0, 10)} — ${wanted.citations.map((c) => c.url).join(', ')}`
            : lang === 'KINYARWANDA'
              ? 'NTIBYASUZUMWE KU MATEGEKO.'
              : 'NOT LEGALLY REVIEWED.'),
        intent: 'SIGN_DETAIL',
      };
    }

    const byCategory = new Map<string, string[]>();
    for (const s of signs) {
      const list = byCategory.get(s.category) ?? [];
      list.push(`${s.code} — ${lang === 'KINYARWANDA' ? s.nameRw : s.nameEn}`);
      byCategory.set(s.category, list);
    }
    const lines = Array.from(byCategory.entries())
      .map(([cat, items]) => `${cat}:\n${items.map((i) => `  ${i}`).join('\n')}`)
      .join('\n\n');

    return {
      replyText:
        `${lang === 'KINYARWANDA' ? "IBIMENYETSO BY'UMUHANDA" : 'ROAD SIGNS'}\n\n${lines}\n\n` +
        (lang === 'KINYARWANDA' ? 'Andika kode y\'ikimenyetso kugira ngo ubone ibisobanuro.' : 'Send a sign code, e.g. W001, for its full meaning.'),
      intent: 'LIST_SIGNS',
    };
  }

  if (command === 'PRACTICE' || command === 'MOCK_EXAM' || command === 'LEARN') {
    const kind = command === 'PRACTICE' ? 'PRACTICE' : command === 'LEARN' ? 'LEARN' : 'MOCK_EXAM';
    const started = await startAttempt(user, kind, kind === 'LEARN' ? { count: 1 } : {});
    if (!started) {
      return {
        replyText:
          lang === 'KINYARWANDA'
            ? "Nta bibazo byarasohorwa. Umuyobozi agomba gusohora ibibazo mbere y'uko ikizamini gitangira."
            : 'No published questions are available yet, so the exam cannot start. An administrator must publish questions first.',
        intent: 'NO_PUBLISHED_QUESTIONS',
      };
    }
    const sheet = formatQuestionSheet(started.questions, started.attempt, lang);
    return {
      replyText: started.note ? `${started.note}\n\n${sheet}` : sheet,
      intent: kind === 'PRACTICE' ? 'START_PRACTICE' : kind === 'LEARN' ? 'START_LEARN' : 'START_MOCK_EXAM',
    };
  }

  if (command === 'PROGRESS') {
    return { replyText: formatProgress(progressFor(user.id), lang), intent: 'SHOW_PROGRESS' };
  }

  return null;
}
