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
  lessonSummary,
  looksLikeAnswers,
  progressFor,
  publishedLessons,
  startAttempt,
} from '@/lib/road-safety/academy';

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
  { intent: 'MOCK_EXAM', words: ['exam', 'ikizamini', 'mock'] },
  { intent: 'PROGRESS', words: ['progress', 'aho ugeze', 'score', 'amanota'] },
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
export function handleRoadSafetyMessage(
  user: User,
  text: string,
  lang: ReplyLanguage
): AcademyFlowResult | null {
  const pending = findPendingAttempt(user.id);
  if (pending && looksLikeAnswers(text, pending.questionIds.length)) {
    const graded = gradeAttempt(pending, extractAnswerIndexes(text));
    return { replyText: formatResult(graded, lang), intent: 'GRADE_ATTEMPT' };
  }

  const command = detectCommand(text);
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

  if (command === 'PRACTICE' || command === 'MOCK_EXAM') {
    const kind = command === 'PRACTICE' ? 'PRACTICE' : 'MOCK_EXAM';
    const started = startAttempt(user, kind);
    if (!started) {
      return {
        replyText:
          lang === 'KINYARWANDA'
            ? "Nta bibazo byarasohorwa. Umuyobozi agomba gusohora ibibazo mbere y'uko ikizamini gitangira."
            : 'No published questions are available yet, so the exam cannot start. An administrator must publish questions first.',
        intent: 'NO_PUBLISHED_QUESTIONS',
      };
    }
    return {
      replyText: formatQuestionSheet(started.questions, started.attempt, lang),
      intent: kind === 'PRACTICE' ? 'START_PRACTICE' : 'START_MOCK_EXAM',
    };
  }

  if (command === 'PROGRESS') {
    return { replyText: formatProgress(progressFor(user.id), lang), intent: 'SHOW_PROGRESS' };
  }

  return null;
}
