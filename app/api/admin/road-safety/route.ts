import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/security/admin-auth';
import { repo } from '@/lib/db/repository';
import {
  CONTENT_PACK_VERSION,
  REVIEW_DATE,
  UNVERIFIED_TOPICS,
  contentPackInventory,
  importContentPack,
} from '@/lib/road-safety/content-pack';
import { PublishStatus, QuestionDifficulty, RoadSignCategory, RoadSafetyLesson, RoadSafetyModule, RoadSafetyQuestion, RoadSign, ExamTemplate, SourceCitation } from '@/lib/types';

export const runtime = 'nodejs';

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0) : [];
}

function asCitations(value: unknown): SourceCitation[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === 'object')
    .map((c) => ({
      title: String(c.title || ''),
      publisher: String(c.publisher || ''),
      url: String(c.url || ''),
      accessedOn: String(c.accessedOn || REVIEW_DATE),
      quote: typeof c.quote === 'string' ? c.quote : undefined,
    }))
    .filter((c) => c.url || c.title);
}

function status(value: unknown): PublishStatus {
  return value === 'DRAFT' || value === 'ARCHIVED' ? value : 'PUBLISHED';
}

/** Admin curriculum manager: modules, lessons, signs, questions and exam papers. */
export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.ok) return unauthorized();

  return NextResponse.json({
    success: true,
    modules: repo.getRoadSafetyModules(),
    lessons: repo.getRoadSafetyLessons(),
    signs: repo.getRoadSigns(),
    questions: repo.getRoadSafetyQuestions(),
    exams: repo.getExamTemplates(),
    attempts: repo.getExamAttempts(),
    inventory: contentPackInventory(),
    unverifiedTopics: UNVERIFIED_TOPICS,
    contentPack: { version: CONTENT_PACK_VERSION, reviewedOn: REVIEW_DATE },
    stats: repo.getRoadSafetyStats(),
  });
}

export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.ok) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action || '').toUpperCase();
  const actor = auth.email || 'admin';

  if (action === 'IMPORT_PACK') {
    const report = importContentPack();
    repo.appendAudit({
      actor,
      actorRole: 'ADMIN',
      action: 'ROAD_SAFETY_PACK_IMPORTED',
      targetType: 'ContentPack',
      targetId: CONTENT_PACK_VERSION,
      summary: `Imported v${CONTENT_PACK_VERSION}: ${report.created.length} created, ${report.skipped.length} already present`,
      before: null,
      after: report,
    });
    return NextResponse.json({ success: true, report, inventory: contentPackInventory() });
  }

  if (action === 'SAVE_MODULE') {
    const id = typeof body.id === 'string' ? body.id : '';
    const payload = {
      code: String(body.code || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
      titleEn: String(body.titleEn || '').trim(),
      titleRw: String(body.titleRw || body.titleEn || '').trim(),
      summaryEn: String(body.summaryEn || ''),
      summaryRw: String(body.summaryRw || body.summaryEn || ''),
      sortOrder: Number(body.sortOrder) || 0,
      status: status(body.status),
    };
    if (!payload.code || !payload.titleEn) {
      return NextResponse.json({ error: 'code and titleEn are required' }, { status: 400 });
    }
    if (id) {
      const updated = repo.updateRoadSafetyModule(id, payload);
      if (!updated) return NextResponse.json({ error: 'Unknown module' }, { status: 404 });
      auditContent(actor, 'MODULE', updated.id, `Updated module ${updated.code}`, updated);
      return NextResponse.json({ success: true, module: updated });
    }
    if (repo.getRoadSafetyModules().some((m) => m.code === payload.code)) {
      return NextResponse.json({ error: `Module ${payload.code} already exists` }, { status: 409 });
    }
    const created = repo.createRoadSafetyModule(payload);
    auditContent(actor, 'MODULE', created.id, `Created module ${created.code}`, created);
    return NextResponse.json({ success: true, module: created }, { status: 201 });
  }

  if (action === 'SAVE_LESSON') {
    const id = typeof body.id === 'string' ? body.id : '';
    const moduleId = String(body.moduleId || '');
    if (!moduleId) return NextResponse.json({ error: 'moduleId is required' }, { status: 400 });
    if (!repo.getRoadSafetyModules().some((m) => m.id === moduleId)) {
      return NextResponse.json({ error: 'Unknown module' }, { status: 400 });
    }
    const payload: Omit<RoadSafetyLesson, 'id' | 'createdAt' | 'updatedAt'> = {
      moduleId,
      titleEn: String(body.titleEn || '').trim(),
      titleRw: String(body.titleRw || body.titleEn || '').trim(),
      bodyEn: String(body.bodyEn || ''),
      bodyRw: String(body.bodyRw || ''),
      keyPointsEn: asStringArray(body.keyPointsEn),
      keyPointsRw: asStringArray(body.keyPointsRw),
      citations: asCitations(body.citations),
      legalVerifiedAt: body.legalVerifiedAt === null ? null : String(body.legalVerifiedAt || '') || null,
      lastReviewedBy: String(body.lastReviewedBy || '') || null,
      status: status(body.status),
      sortOrder: Number(body.sortOrder) || 0,
    };
    if (!payload.titleEn) return NextResponse.json({ error: 'titleEn is required' }, { status: 400 });
    if (payload.status === 'PUBLISHED' && payload.citations.length === 0) {
      return NextResponse.json(
        { error: 'A published lesson must cite at least one source, or be saved as DRAFT.' },
        { status: 400 }
      );
    }
    if (id) {
      const updated = repo.updateRoadSafetyLesson(id, payload);
      if (!updated) return NextResponse.json({ error: 'Unknown lesson' }, { status: 404 });
      auditContent(actor, 'LESSON', updated.id, `Updated lesson "${updated.titleEn}"`, updated);
      return NextResponse.json({ success: true, lesson: updated });
    }
    const created = repo.createRoadSafetyLesson(payload);
    auditContent(actor, 'LESSON', created.id, `Created lesson "${created.titleEn}"`, created);
    return NextResponse.json({ success: true, lesson: created }, { status: 201 });
  }

  if (action === 'SAVE_QUESTION') {
    const id = typeof body.id === 'string' ? body.id : '';
    const moduleId = String(body.moduleId || '');
    const optionsEn = asStringArray(body.optionsEn);
    const optionsRw = asStringArray(body.optionsRw);
    const correctIndex = Number(body.correctIndex);
    if (!moduleId) return NextResponse.json({ error: 'moduleId is required' }, { status: 400 });
    if (optionsEn.length < 2) return NextResponse.json({ error: 'At least 2 options are required' }, { status: 400 });
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= optionsEn.length) {
      return NextResponse.json({ error: 'correctIndex must point at one of the supplied options' }, { status: 400 });
    }
    const payload: Omit<RoadSafetyQuestion, 'id' | 'createdAt' | 'updatedAt'> = {
      moduleId,
      lessonId: body.lessonId ? String(body.lessonId) : null,
      questionEn: String(body.questionEn || '').trim(),
      questionRw: String(body.questionRw || body.questionEn || '').trim(),
      optionsEn,
      optionsRw: optionsRw.length === optionsEn.length ? optionsRw : [...optionsEn],
      correctIndex,
      explanationEn: String(body.explanationEn || ''),
      explanationRw: String(body.explanationRw || body.explanationEn || ''),
      difficulty: (['EASY', 'MEDIUM', 'HARD'].includes(String(body.difficulty)) ? body.difficulty : 'MEDIUM') as QuestionDifficulty,
      citations: asCitations(body.citations),
      legalVerifiedAt: body.legalVerifiedAt === null ? null : String(body.legalVerifiedAt || '') || null,
      status: status(body.status),
    };
    if (!payload.questionEn) return NextResponse.json({ error: 'questionEn is required' }, { status: 400 });
    if (id) {
      const updated = repo.updateRoadSafetyQuestion(id, payload);
      if (!updated) return NextResponse.json({ error: 'Unknown question' }, { status: 404 });
      auditContent(actor, 'QUESTION', updated.id, `Updated question in module ${moduleId}`, updated);
      return NextResponse.json({ success: true, question: updated });
    }
    const created = repo.createRoadSafetyQuestion(payload);
    auditContent(actor, 'QUESTION', created.id, `Created question in module ${moduleId}`, created);
    return NextResponse.json({ success: true, question: created }, { status: 201 });
  }

  if (action === 'SAVE_SIGN') {
    const id = typeof body.id === 'string' ? body.id : '';
    const payload: Omit<RoadSign, 'id' | 'createdAt' | 'updatedAt'> = {
      code: String(body.code || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
      category: (['WARNING', 'PROHIBITORY', 'MANDATORY', 'DANGER', 'INFORMATION', 'SERVICE'].includes(String(body.category))
        ? body.category
        : 'WARNING') as RoadSignCategory,
      nameEn: String(body.nameEn || '').trim(),
      nameRw: String(body.nameRw || body.nameEn || '').trim(),
      meaningEn: String(body.meaningEn || ''),
      meaningRw: String(body.meaningRw || body.meaningEn || ''),
      shape: String(body.shape || ''),
      colourConvention: String(body.colourConvention || ''),
      citations: asCitations(body.citations),
      legalVerifiedAt: body.legalVerifiedAt === null ? null : String(body.legalVerifiedAt || '') || null,
      status: status(body.status),
    };
    if (!payload.code || !payload.nameEn) return NextResponse.json({ error: 'code and nameEn are required' }, { status: 400 });
    if (id) {
      const updated = repo.updateRoadSign(id, payload);
      if (!updated) return NextResponse.json({ error: 'Unknown sign' }, { status: 404 });
      auditContent(actor, 'SIGN', updated.id, `Updated sign ${updated.code}`, updated);
      return NextResponse.json({ success: true, sign: updated });
    }
    if (repo.getRoadSigns().some((s) => s.code === payload.code)) {
      return NextResponse.json({ error: `Sign ${payload.code} already exists` }, { status: 409 });
    }
    const created = repo.createRoadSign(payload);
    auditContent(actor, 'SIGN', created.id, `Created sign ${created.code}`, created);
    return NextResponse.json({ success: true, sign: created }, { status: 201 });
  }

  if (action === 'SAVE_EXAM') {
    const id = typeof body.id === 'string' ? body.id : '';
    const payload: Omit<ExamTemplate, 'id' | 'createdAt' | 'updatedAt'> = {
      nameEn: String(body.nameEn || '').trim(),
      nameRw: String(body.nameRw || body.nameEn || '').trim(),
      moduleId: body.moduleId ? String(body.moduleId) : null,
      questionCount: Math.max(1, Number(body.questionCount) || 10),
      passPercent: Math.min(100, Math.max(1, Number(body.passPercent) || 70)),
      timeLimitMinutes: body.timeLimitMinutes ? Number(body.timeLimitMinutes) : null,
      status: status(body.status),
    };
    if (!payload.nameEn) return NextResponse.json({ error: 'nameEn is required' }, { status: 400 });
    const available = repo
      .getRoadSafetyQuestions(payload.moduleId ?? undefined)
      .filter((q) => q.status === 'PUBLISHED').length;
    if (payload.status === 'PUBLISHED' && available === 0) {
      return NextResponse.json({ error: 'No published questions exist for this paper yet.' }, { status: 400 });
    }
    if (id) {
      const updated = repo.updateExamTemplate(id, payload);
      if (!updated) return NextResponse.json({ error: 'Unknown exam' }, { status: 404 });
      auditContent(actor, 'EXAM', updated.id, `Updated exam "${updated.nameEn}"`, updated);
      return NextResponse.json({ success: true, exam: updated });
    }
    const created = repo.createExamTemplate(payload);
    auditContent(actor, 'EXAM', created.id, `Created exam "${created.nameEn}"`, created);
    return NextResponse.json({ success: true, exam: created }, { status: 201 });
  }

  if (action === 'SET_STATUS') {
    const type = String(body.type || '').toUpperCase();
    const targetId = String(body.id || '');
    const next = status(body.status);
    const patch = { status: next };
    let result: unknown = null;
    if (type === 'LESSON') result = repo.updateRoadSafetyLesson(targetId, patch as Partial<RoadSafetyLesson>);
    if (type === 'MODULE') result = repo.updateRoadSafetyModule(targetId, patch as Partial<RoadSafetyModule>);
    if (type === 'QUESTION') result = repo.updateRoadSafetyQuestion(targetId, patch as Partial<RoadSafetyQuestion>);
    if (type === 'SIGN') result = repo.updateRoadSign(targetId, patch as Partial<RoadSign>);
    if (type === 'EXAM') result = repo.updateExamTemplate(targetId, patch as Partial<ExamTemplate>);
    if (!result) return NextResponse.json({ error: 'Unknown item' }, { status: 404 });
    if (type === 'LESSON' && next === 'PUBLISHED') {
      const lesson = result as RoadSafetyLesson;
      if (lesson.citations.length === 0) {
        return NextResponse.json({ error: 'This lesson cites no source, so it cannot be published. Keep it as a draft.' }, { status: 400 });
      }
    }
    auditContent(actor, type, targetId, `Set ${type} ${targetId} to ${next}`, result);
    return NextResponse.json({ success: true, item: result });
  }

  if (action === 'DELETE') {
    const type = String(body.type || '').toUpperCase();
    const targetId = String(body.id || '');
    if (type === 'LESSON') {
      const lesson = repo.getRoadSafetyLessonById(targetId);
      if (!lesson) return NextResponse.json({ error: 'Unknown lesson' }, { status: 404 });
      const linked = repo.getRoadSafetyQuestions().filter((q) => q.lessonId === targetId).length;
      if (linked > 0) {
        return NextResponse.json(
          { error: `Archive this lesson instead: ${linked} question(s) still point at it.` },
          { status: 409 }
        );
      }
      repo.deleteRoadSafetyLesson(targetId);
      auditContent(actor, type, targetId, `Deleted lesson "${lesson.titleEn}"`, lesson);
      return NextResponse.json({ success: true });
    }
    if (type === 'QUESTION') {
      const question = repo.getRoadSafetyQuestionById(targetId);
      if (!question) return NextResponse.json({ error: 'Unknown question' }, { status: 404 });
      const usedInAttempt = repo.getExamAttempts().some((a) => a.questionIds.includes(targetId));
      if (usedInAttempt) {
        return NextResponse.json({ error: 'An attempt references this question. Archive it instead of deleting.' }, { status: 409 });
      }
      repo.deleteRoadSafetyQuestion(targetId);
      auditContent(actor, type, targetId, 'Deleted question', question);
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: 'Deletion supports LESSON and QUESTION only' }, { status: 400 });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

function auditContent(actor: string, type: string, id: string, summary: string, after: unknown) {
  repo.appendAudit({
    actor,
    actorRole: 'ADMIN',
    action: `ROAD_SAFETY_${type}_CHANGED`,
    targetType: `RoadSafety${type}`,
    targetId: id,
    summary,
    before: null,
    after,
  });
}
