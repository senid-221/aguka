import { NextRequest, NextResponse } from 'next/server';
import { repo } from '@/lib/db/repository';
import { ExamAttempt, User } from '@/lib/types';
import {
  AttemptKind,
  attemptForSubmit,
  attemptView,
  extractAnswerIndexes,
  findPendingAttempt,
  formatQuestionSheet,
  formatResult,
  gradeAttempt,
  isExpired,
  latestSubmittedAttempt,
  looksLikeAnswers,
  progressFor,
  reportQuestionIssue,
  saveAnswer,
  startAttempt,
  toStoredAnswers,
} from '@/lib/road-safety/academy';
import { buildSessionReport, formatSessionReport } from '@/lib/road-safety/session-report';
import { getService } from '@/lib/services/catalog';
import { buildAccessReply, consumeUsage, evaluateAccess } from '@/lib/services/entitlements';

export const runtime = 'nodejs';

const ROAD_SAFETY = 'ROAD_SAFETY';
const KINDS: AttemptKind[] = ['PRACTICE', 'MOCK_EXAM', 'LEARN'];

function resolveUser(body: Record<string, unknown>): User | null {
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  if (userId) return repo.getUserById(userId) ?? null;
  const phone = typeof body.phoneNumber === 'string' ? body.phoneNumber.trim() : '';
  if (!phone) return null;
  const clean = phone.startsWith('+') ? phone : `+${phone}`;
  return repo.getOrCreateUserByPhone(clean, typeof body.name === 'string' ? body.name : undefined);
}

function kindOf(value: unknown): AttemptKind {
  return KINDS.includes(value as AttemptKind) ? (value as AttemptKind) : 'PRACTICE';
}

/**
 * Loads an attempt and makes sure it belongs to this learner. An expired paper is reaped
 * by the engine before it is read, so a client that never submits still gets graded from
 * the picks the server holds.
 */
function ownedAttempt(user: User, attemptId: string): { ok: true; attempt: ExamAttempt } | { ok: false; response: NextResponse } {
  const attempt = attemptId ? repo.getExamAttemptById(attemptId) : findPendingAttempt(user.id);
  if (!attempt || attempt.submittedAt) {
    return { ok: false, response: NextResponse.json({ error: 'No open attempt found for this learner.' }, { status: 404 }) };
  }
  if (attempt.userId !== user.id) {
    return { ok: false, response: NextResponse.json({ error: 'This attempt belongs to another learner.' }, { status: 403 }) };
  }
  return { ok: true, attempt };
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

  if (action === 'RESUME') {
    const pending = findPendingAttempt(user.id);
    if (!pending) return NextResponse.json({ success: true, resumed: false });
    return NextResponse.json({ success: true, resumed: true, attempt: attemptView(pending, lang) });
  }

  if (action === 'START') {
    const kind = kindOf(body.kind);
    const pending = findPendingAttempt(user.id);
    if (pending && pending.kind === kind) {
      const questions = pending.questionIds
        .map((id) => repo.getRoadSafetyQuestionById(id))
        .filter((q): q is NonNullable<typeof q> => Boolean(q));
      return NextResponse.json({
        success: true,
        reused: true,
        note:
          lang === 'KINYARWANDA'
            ? 'Iki kizamini watangiriye kera nikio gikomeje. Ibisubizo byawe bibikwa kuri seriveri.'
            : 'This continues the paper you already started. Your picks are held on the server.',
        sheet: formatQuestionSheet(questions, pending, lang),
        attempt: attemptView(pending, lang),
      });
    }

    const started = await startAttempt(user, kind, {
      moduleId: typeof body.moduleId === 'string' ? body.moduleId : null,
      examTemplateId: typeof body.examTemplateId === 'string' ? body.examTemplateId : null,
      lessonId: typeof body.lessonId === 'string' ? body.lessonId : null,
      count: typeof body.count === 'number' ? body.count : undefined,
      focusWeakest: body.focusWeakest === true,
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
      kind,
      note: started.note,
      plan: started.plan.rationale,
      sheet: formatQuestionSheet(started.questions, started.attempt, lang),
      attempt: attemptView(started.attempt, lang),
      totalQuestions: started.attempt.totalQuestions,
      passPercent: started.attempt.passPercent,
    });
  }

  if (action === 'ANSWER') {
    const located = ownedAttempt(user, String(body.attemptId || ''));
    if (!located.ok) return located.response;
    const { attempt } = located;

    const number = Number(body.questionNumber ?? body.position);
    if (!Number.isInteger(number) || number < 1 || number > attempt.questionIds.length) {
      return NextResponse.json(
        { error: `questionNumber must be between 1 and ${attempt.questionIds.length}.` },
        { status: 400 }
      );
    }
    const option = body.option === null ? null : Number(body.option);
    if (option !== null && (!Number.isInteger(option) || option < 0)) {
      return NextResponse.json({ error: 'option must be the zero-based position shown on the sheet, or null to clear.' }, { status: 400 });
    }

    const saved = saveAnswer(attempt, number - 1, option === null ? null : option);
    if (!saved) return NextResponse.json({ error: 'That question is no longer available.' }, { status: 409 });

    if (isExpired(saved)) {
      const graded = gradeAttempt(saved, attemptForSubmit(saved));
      const report = buildSessionReport(graded);
      return NextResponse.json({
        success: true,
        expired: true,
        autoSubmitted: true,
        resultText: formatResult(graded, lang),
        attempt: attemptView(graded, lang),
        report,
        reportText: report ? formatSessionReport(report, lang) : null,
      });
    }

    return NextResponse.json({
      success: true,
      answeredCount: saved.savedAnswers.filter((v) => v != null).length,
      remainingSeconds: attemptView(saved, lang).remainingSeconds,
    });
  }

  if (action === 'SUBMIT') {
    const attemptId = String(body.attemptId || '');
    const known = attemptId ? repo.getExamAttemptById(attemptId) : undefined;
    if (known && known.userId === user.id && known.submittedAt) {
      return NextResponse.json({
        success: true,
        alreadySubmitted: true,
        resultText: formatResult(known, lang),
        attempt: attemptView(known, lang),
      });
    }

    const located = ownedAttempt(user, attemptId);
    if (!located.ok) return located.response;
    const attempt = located.attempt;

    const raw =
      body.answersText !== undefined ? String(body.answersText) : Array.isArray(body.answers) ? body.answers.join(',') : '';

    let stored: number[];
    if (raw.trim().length > 0) {
      const positions = extractAnswerIndexes(raw);
      if (!looksLikeAnswers(raw, attempt.totalQuestions)) {
        return NextResponse.json(
          {
            error: `Expected exactly ${attempt.totalQuestions} answers for this attempt but received ${positions.length}.`,
            received: positions.map((p) => p + 1),
          },
          { status: 400 }
        );
      }
      stored = toStoredAnswers(attempt, positions);
    } else {
      stored = attemptForSubmit(attempt);
    }

    const graded = gradeAttempt(attempt, stored);
    const report = buildSessionReport(graded);
    return NextResponse.json({
      success: true,
      fromAutosave: raw.trim().length === 0,
      resultText: formatResult(graded, lang),
      scorePercent: graded.scorePercent,
      passed: graded.passed,
      attempt: attemptView(graded, lang),
      report,
      reportText: report ? formatSessionReport(report, lang) : null,
    });
  }

  if (action === 'REVIEW') {
    const located = ownedAttempt(user, String(body.attemptId || ''));
    if (!located.ok) return located.response;
    return NextResponse.json({ success: true, attempt: attemptView(located.attempt, lang) });
  }

  if (action === 'REPORT') {
    const attemptId = String(body.attemptId || '');
    const attempt = attemptId ? repo.getExamAttemptById(attemptId) : latestSubmittedAttempt(user.id);
    if (!attempt || attempt.userId !== user.id) {
      return NextResponse.json({ error: 'No finished paper found for this learner.' }, { status: 404 });
    }
    const report = buildSessionReport(attempt);
    if (!report) {
      return NextResponse.json(
        { success: true, ready: false, reason: 'That paper has not been graded yet, so there is nothing to report.' },
        { status: 200 }
      );
    }
    return NextResponse.json({ success: true, report, reportText: formatSessionReport(report, lang) });
  }

  if (action === 'REPORT_ISSUE') {
    const attemptId = String(body.attemptId || '');
    const attempt = attemptId ? repo.getExamAttemptById(attemptId) : latestSubmittedAttempt(user.id);
    if (!attempt || attempt.userId !== user.id) {
      return NextResponse.json({ error: 'Name the paper you are reporting about.' }, { status: 404 });
    }
    const number = Number(body.questionNumber);
    // Only a question this learner actually sat is reportable, so the attempt is the
    // permission boundary rather than a caller-supplied id.
    const questionId = Number.isInteger(number) && number >= 1 ? attempt.questionIds[number - 1] : undefined;
    if (!questionId) {
      return NextResponse.json({ error: `questionNumber must be between 1 and ${attempt.questionIds.length}.` }, { status: 400 });
    }
    const recorded = reportQuestionIssue({
      questionId,
      userId: user.id,
      channel: 'API',
      note: typeof body.note === 'string' ? body.note : '',
    });
    if (!recorded) return NextResponse.json({ error: 'Unknown question.' }, { status: 404 });
    return NextResponse.json({
      success: true,
      withdrawn: recorded.withdrawn,
      reply: recorded.withdrawn
        ? lang === 'KINYARWANDA'
          ? 'Ikibazo cyakuwe mu bitangwa kugeza umuyobozi abisuzumye. Urakoze kumenyesha.'
          : 'That question has been taken out of the papers until an administrator reviews it. Thank you for reporting it.'
        : lang === 'KINYARWANDA'
          ? 'Ikibazo cyanditswe mu rukurikirane rw’isuzuma.'
          : 'The report was added to the review queue.',
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
