import { NextRequest, NextResponse } from 'next/server';
import { repo } from '@/lib/db/repository';
import { User } from '@/lib/types';
import {
  extractAnswerIndexes,
  findPendingAttempt,
  formatQuestionSheet,
  formatResult,
  gradeAttempt,
  looksLikeAnswers,
  progressFor,
  startAttempt,
} from '@/lib/road-safety/academy';
import { getService } from '@/lib/services/catalog';
import { buildAccessReply, consumeUsage, evaluateAccess } from '@/lib/services/entitlements';

export const runtime = 'nodejs';

const ROAD_SAFETY = 'ROAD_SAFETY';

function resolveUser(body: Record<string, unknown>): User | null {
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  if (userId) return repo.getUserById(userId) ?? null;
  const phone = typeof body.phoneNumber === 'string' ? body.phoneNumber.trim() : '';
  if (!phone) return null;
  const clean = phone.startsWith('+') ? phone : `+${phone}`;
  return repo.getOrCreateUserByPhone(clean, typeof body.name === 'string' ? body.name : undefined);
}

/**
 * Road Safety Academy engine: practice sets, mock exams, server-side scoring and
 * progress. Access to the service is enforced here, not only in the WhatsApp path.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action || '');

  const user = resolveUser(body);
  if (!user) {
    return NextResponse.json({ error: 'Provide userId or phoneNumber to identify the learner.' }, { status: 400 });
  }

  const lang = user.preferredLang === 'ENGLISH' ? 'ENGLISH' : 'KINYARWANDA';

  if (action === 'PROGRESS') {
    return NextResponse.json({ success: true, progress: progressFor(user.id) });
  }

  const service = getService(ROAD_SAFETY);
  if (!service) {
    return NextResponse.json(
      { error: 'The Road Safety Academy service is not configured, so it cannot be opened.' },
      { status: 503 }
    );
  }

  const decision = evaluateAccess(user, service);
  if (!decision.allowed) {
    return NextResponse.json(
      {
        success: false,
        allowed: false,
        access: decision,
        reply: buildAccessReply(service, decision, lang),
      },
      { status: 402 }
    );
  }

  if (action === 'START') {
    const kind = body.kind === 'MOCK_EXAM' ? 'MOCK_EXAM' : 'PRACTICE';
    const pending = findPendingAttempt(user.id);
    if (pending && pending.kind === kind) {
      const questions = pending.questionIds
        .map((id) => repo.getRoadSafetyQuestionById(id))
        .filter((q): q is NonNullable<typeof q> => Boolean(q));
      return NextResponse.json({
        success: true,
        reused: true,
        attemptId: pending.id,
        sheet: formatQuestionSheet(questions, pending, lang),
        questions: questions.map((q, i) => ({
          number: i + 1,
          text: lang === 'KINYARWANDA' ? q.questionRw : q.questionEn,
          options: lang === 'KINYARWANDA' ? q.optionsRw : q.optionsEn,
        })),
        totalQuestions: pending.totalQuestions,
      });
    }

    const started = startAttempt(user, kind, {
      moduleId: typeof body.moduleId === 'string' ? body.moduleId : null,
      examTemplateId: typeof body.examTemplateId === 'string' ? body.examTemplateId : null,
      count: typeof body.count === 'number' ? body.count : undefined,
    });
    if (!started) {
      return NextResponse.json(
        {
          success: false,
          error:
            'No published questions exist yet. Import the content pack or publish lessons and questions from the admin dashboard.',
        },
        { status: 503 }
      );
    }
    consumeUsage(user, service.code);
    return NextResponse.json({
      success: true,
      reused: false,
      attemptId: started.attempt.id,
      kind,
      sheet: formatQuestionSheet(started.questions, started.attempt, lang),
      questions: started.questions.map((q, i) => ({
        number: i + 1,
        text: lang === 'KINYARWANDA' ? q.questionRw : q.questionEn,
        options: lang === 'KINYARWANDA' ? q.optionsRw : q.optionsEn,
      })),
      totalQuestions: started.attempt.totalQuestions,
      passPercent: started.attempt.passPercent,
    });
  }

  if (action === 'SUBMIT') {
    const attemptId = String(body.attemptId || '');
    const attempt = attemptId ? repo.getExamAttemptById(attemptId) : findPendingAttempt(user.id);
    if (!attempt) return NextResponse.json({ error: 'No attempt found to submit.' }, { status: 404 });
    if (attempt.userId !== user.id) {
      return NextResponse.json({ error: 'This attempt belongs to another learner.' }, { status: 403 });
    }
    if (attempt.submittedAt) {
      return NextResponse.json({ success: true, alreadySubmitted: true, attempt, resultText: formatResult(attempt, lang) });
    }

    const raw = body.answersText !== undefined ? String(body.answersText) : Array.isArray(body.answers) ? body.answers.join(',') : '';
    const indexes = extractAnswerIndexes(raw);
    if (!looksLikeAnswers(raw, attempt.totalQuestions)) {
      return NextResponse.json(
        {
          error: `Expected exactly ${attempt.totalQuestions} answers for this attempt but received ${indexes.length}.`,
          received: indexes,
        },
        { status: 400 }
      );
    }

    const graded = gradeAttempt(attempt, indexes);
    return NextResponse.json({
      success: true,
      attempt: graded,
      resultText: formatResult(graded, lang),
      scorePercent: graded.scorePercent,
      passed: graded.passed,
      corrections: graded.answers.map((a, i) => ({
        number: i + 1,
        givenAnswer: a.givenAnswerEn,
        correctAnswer: a.correctAnswerEn,
        isCorrect: a.isCorrect,
        explanationEn: a.explanationEn,
        explanationRw: a.explanationRw,
      })),
    });
  }

  if (action === 'COMPLETE_LESSON') {
    const lessonId = String(body.lessonId || '');
    const lesson = repo.getRoadSafetyLessonById(lessonId);
    if (!lesson || lesson.status !== 'PUBLISHED') {
      return NextResponse.json({ error: 'Unknown or unpublished lesson.' }, { status: 404 });
    }
    const progress = repo.markLessonCompleted(user.id, lessonId);
    return NextResponse.json({ success: true, progress, totals: progressFor(user.id) });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
