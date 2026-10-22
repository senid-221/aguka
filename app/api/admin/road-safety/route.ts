import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/security/admin-auth';
import { repo } from '@/lib/db/repository';
import {
  CONTENT_PACK_VERSION,
  UNVERIFIED_TOPICS,
  contentPackInventory,
  importContentPack,
} from '@/lib/road-safety/content-pack';
import { REVIEW_DATE } from '@/lib/road-safety/sources';
import { questionFingerprint } from '@/lib/road-safety/text-analysis';
import { isReviewOverdue, publicationBlockers } from '@/lib/road-safety/verification';
import { generateQuestions, generationHealth } from '@/lib/road-safety/generator';
import { factsForModule, generatableFacts } from '@/lib/road-safety/verified-facts';
import { ApprovedSource, IssueReport, RoadSafetySettings, RoadSafetySettingsPatch } from '@/lib/types';
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

/**
 * Fail-closed: an unrecognized, missing or misspelled status never becomes a published
 * item. NEEDS_REVIEW is the state the verification gate uses for anything it could not
 * defend, and it must survive an admin edit.
 */
function status(value: unknown): PublishStatus {
  return value === 'PUBLISHED' || value === 'NEEDS_REVIEW' || value === 'ARCHIVED' ? value : 'DRAFT';
}

/**
 * The approved-source ledger is what the generator is allowed to be grounded on, so a
 * stored row is rebuilt field by field instead of being trusted as submitted.
 */
function asApprovedSources(value: unknown): ApprovedSource[] | null {
  if (!Array.isArray(value)) return null;
  const rows: ApprovedSource[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const s = raw as Record<string, unknown>;
    const id = String(s.id || '').trim();
    const url = String(s.url || '').trim();
    if (!id || !url) continue;
    rows.push({
      id,
      name: String(s.name || id).trim(),
      url,
      publisher: String(s.publisher || ''),
      permission: (['OFFICIAL_INSTRUMENT', 'GOVERNMENT_SERVICE_PAGE', 'DISCOVERY_REFERENCE_ONLY', 'LICENCE_REQUIRED'].includes(String(s.permission))
        ? s.permission
        : 'DISCOVERY_REFERENCE_ONLY') as ApprovedSource['permission'],
      robots: (['ALLOWED', 'DISALLOWED', 'ABSENT', 'NOT_INSPECTED'].includes(String(s.robots))
        ? s.robots
        : 'NOT_INSPECTED') as ApprovedSource['robots'],
      automatedAccess: (['PERMITTED', 'NOT_PERMITTED', 'UNSTATED'].includes(String(s.automatedAccess))
        ? s.automatedAccess
        : 'UNSTATED') as ApprovedSource['automatedAccess'],
      contentReuse: (['COPY_PERMITTED', 'STRUCTURE_ONLY', 'NO_ACCESS'].includes(String(s.contentReuse))
        ? s.contentReuse
        : 'STRUCTURE_ONLY') as ApprovedSource['contentReuse'],
      lastInspectedAt: String(s.lastInspectedAt || REVIEW_DATE),
      notes: String(s.notes || ''),
    });
  }
  return rows.length ? rows : null;
}

/** Why this specific item cannot go in front of a learner, beyond the shared rule. */
function itemBlockers(question: RoadSafetyQuestion, settings: RoadSafetySettings): string[] {
  const extra: string[] = [];
  if (question.signId) {
    const sign = repo.getRoadSigns().find((s) => s.id === question.signId);
    if (!sign) extra.push('It points at a sign that is not in the register.');
    else if (!sign.imageKey)
      extra.push(
        `It asks the learner to identify sign ${sign.code}, which has no real picture on file. An AI-drawn approximation of an official sign would teach the wrong meaning, so upload the photographed sign first.`
      );
  }
  return publicationBlockers(question, settings, extra);
}

function resolveReports(reports: IssueReport[], actor: string, resolution: string): IssueReport[] {
  const now = new Date().toISOString();
  return reports.map((r) => (r.resolvedAt ? r : { ...r, resolvedAt: now, resolvedBy: actor, resolution }));
}

/** Admin curriculum manager: modules, lessons, signs, questions and exam papers. */
export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.ok) return unauthorized();

  const settings = repo.getRoadSafetySettings();
  const overdue = <T extends { status: PublishStatus; legalVerifiedAt: string | null }>(rows: T[]) =>
    rows.filter((r) => r.status === 'PUBLISHED' && isReviewOverdue(r.legalVerifiedAt, settings.contentRefreshDays)).length;

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
    settings,
    reviewQueue: repo.getReviewQueue(),
    // The linkable subset of the registry: an administrator can only tie an item to a rule
    // that a source already defends, so the picker offers nothing else.
    verifiedFacts: generatableFacts().map((f) => ({
      id: f.id,
      moduleCode: f.moduleCode,
      statementEn: f.statementEn,
      statementRw: f.statementRw,
      legalBasis: f.legalBasis,
      article: f.article,
      citation: f.citation,
    })),
    generationRuns: repo.getQuestionGenerationRuns(30),
    generation: generationHealth(settings),
    reviewOverdue: {
      thresholdDays: settings.contentRefreshDays,
      questions: overdue(repo.getRoadSafetyQuestions()),
      lessons: overdue(repo.getRoadSafetyLessons()),
      signs: overdue(repo.getRoadSigns()),
    },
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
    const correctIndexes = Array.isArray(body.correctIndexes)
      ? body.correctIndexes.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < optionsEn.length)
      : [];
    const payload = {
      moduleId,
      lessonId: body.lessonId ? String(body.lessonId) : null,
      questionEn: String(body.questionEn || '').trim(),
      questionRw: String(body.questionRw || body.questionEn || '').trim(),
      optionsEn,
      optionsRw: optionsRw.length === optionsEn.length ? optionsRw : [...optionsEn],
      correctIndex,
      correctIndexes: correctIndexes.length > 1 ? correctIndexes : null,
      explanationEn: String(body.explanationEn || ''),
      explanationRw: String(body.explanationRw || body.explanationEn || ''),
      difficulty: (['EASY', 'MEDIUM', 'HARD'].includes(String(body.difficulty)) ? body.difficulty : 'MEDIUM') as QuestionDifficulty,
      citations: asCitations(body.citations),
      legalVerifiedAt: body.legalVerifiedAt === null ? null : String(body.legalVerifiedAt || '') || null,
      status: status(body.status),
      factIds: asStringArray(body.factIds),
      // Editing the wording changes the identity of the item, so the duplicate detector is
      // told about the new version rather than keeping the hash of the old one.
      fingerprint: questionFingerprint({ questionEn: String(body.questionEn || '').trim(), optionsEn, correctIndex }),
    };
    if (!payload.questionEn) return NextResponse.json({ error: 'questionEn is required' }, { status: 400 });
    if (payload.status === 'PUBLISHED') {
      const blockers = publicationBlockers(payload, repo.getRoadSafetySettings());
      if (blockers.length) {
        return NextResponse.json(
          { error: `This item cannot go in front of a learner yet: ${blockers.join(' ')} Save it as NEEDS_REVIEW and settle the rule first.` },
          { status: 400 }
        );
      }
    }
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
    const basis = body.officialBasis && typeof body.officialBasis === 'object' ? body.officialBasis as Record<string, unknown> : null;
    const payload: Omit<ExamTemplate, 'id' | 'createdAt' | 'updatedAt'> = {
      nameEn: String(body.nameEn || '').trim(),
      nameRw: String(body.nameRw || body.nameEn || '').trim(),
      moduleId: body.moduleId ? String(body.moduleId) : null,
      questionCount: Math.max(1, Number(body.questionCount) || 10),
      passPercent: Math.min(100, Math.max(1, Number(body.passPercent) || 70)),
      timeLimitMinutes: body.timeLimitMinutes ? Number(body.timeLimitMinutes) : null,
      strictMode: body.strictMode === true,
      officialBasis: basis ? asCitations([basis])[0] ?? null : null,
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

    // Checked before the write: a refusal that ran afterwards would have left the row
    // published while telling the administrator it was blocked.
    if (next === 'PUBLISHED' && type === 'QUESTION') {
      const question = repo.getRoadSafetyQuestionById(targetId);
      if (!question) return NextResponse.json({ error: 'Unknown item' }, { status: 404 });
      const blockers = itemBlockers(question, repo.getRoadSafetySettings());
      if (blockers.length) {
        return NextResponse.json({ error: `This question cannot be published: ${blockers.join(' ')}`, blockers }, { status: 400 });
      }
    }
    if (next === 'PUBLISHED' && type === 'LESSON') {
      const lesson = repo.getRoadSafetyLessonById(targetId);
      if (!lesson) return NextResponse.json({ error: 'Unknown item' }, { status: 404 });
      if (lesson.citations.length === 0) {
        return NextResponse.json({ error: 'This lesson cites no source, so it cannot be published. Keep it as a draft.' }, { status: 400 });
      }
    }

    const patch = { status: next };
    let result: unknown = null;
    if (type === 'LESSON') result = repo.updateRoadSafetyLesson(targetId, patch as Partial<RoadSafetyLesson>);
    if (type === 'MODULE') result = repo.updateRoadSafetyModule(targetId, patch as Partial<RoadSafetyModule>);
    if (type === 'QUESTION') result = repo.updateRoadSafetyQuestion(targetId, patch as Partial<RoadSafetyQuestion>);
    if (type === 'SIGN') result = repo.updateRoadSign(targetId, patch as Partial<RoadSign>);
    if (type === 'EXAM') result = repo.updateExamTemplate(targetId, patch as Partial<ExamTemplate>);
    if (!result) return NextResponse.json({ error: 'Unknown item' }, { status: 404 });
    auditContent(actor, type, targetId, `Set ${type} ${targetId} to ${next}`, result);
    return NextResponse.json({ success: true, item: result });
  }

  if (action === 'SAVE_SETTINGS') {
    const before = repo.getRoadSafetySettings();
    const patch: RoadSafetySettingsPatch = {};
    if (body.contentRefreshDays !== undefined) patch.contentRefreshDays = Number(body.contentRefreshDays);
    if (typeof body.verificationRequiredToPublish === 'boolean') {
      patch.verificationRequiredToPublish = body.verificationRequiredToPublish;
    }
    if (Array.isArray(body.languages)) {
      patch.languages = body.languages.filter((l) => l === 'ENGLISH' || l === 'KINYARWANDA') as RoadSafetySettings['languages'];
    }
    if (body.generation && typeof body.generation === 'object') {
      patch.generation = body.generation as RoadSafetySettingsPatch['generation'];
    }
    if (body.exam && typeof body.exam === 'object') patch.exam = body.exam as RoadSafetySettingsPatch['exam'];
    if (body.approvedSources !== undefined) {
      const sources = asApprovedSources(body.approvedSources);
      if (!sources) {
        return NextResponse.json(
          { error: 'approvedSources needs at least one entry with an id and a url. Nothing was changed.' },
          { status: 400 }
        );
      }
      patch.approvedSources = sources;
    }

    const settings = repo.updateRoadSafetySettings(patch, actor);
    repo.appendAudit({
      actor,
      actorRole: 'ADMIN',
      action: 'ROAD_SAFETY_SETTINGS_CHANGED',
      targetType: 'RoadSafetySettings',
      targetId: 'ROAD_SAFETY',
      summary: describeSettingsChange(before, settings),
      before,
      after: settings,
    });
    return NextResponse.json({ success: true, settings, generation: generationHealth(settings) });
  }

  if (action === 'REVIEW_APPROVE' || action === 'REVIEW_REJECT') {
    const targetId = String(body.id || '');
    const question = repo.getRoadSafetyQuestionById(targetId);
    if (!question) return NextResponse.json({ error: 'Unknown question' }, { status: 404 });
    const settings = repo.getRoadSafetySettings();
    const note = String(body.note || '').trim().slice(0, 400);

    if (action === 'REVIEW_APPROVE') {
      const blockers = itemBlockers(question, settings);
      if (blockers.length) {
        return NextResponse.json(
          { error: `Still not publishable: ${blockers.join(' ')} Correct the item first, or reject it.`, blockers },
          { status: 400 }
        );
      }
      const updated = repo.updateRoadSafetyQuestion(targetId, {
        status: 'PUBLISHED',
        reviewReasons: [],
        issueReports: resolveReports(question.issueReports, actor, note || 'Reviewed and published by an administrator.'),
      });
      if (!updated) return NextResponse.json({ error: 'Unknown question' }, { status: 404 });
      repo.appendAudit({
        actor,
        actorRole: 'ADMIN',
        action: 'ROAD_SAFETY_QUESTION_APPROVED',
        targetType: 'RoadSafetyQuestion',
        targetId,
        summary: `Published "${updated.questionEn.slice(0, 80)}" after review. ${note}`,
        before: question,
        after: updated,
      });
      return NextResponse.json({ success: true, question: updated, reviewQueue: repo.getReviewQueue() });
    }

    if (!note) return NextResponse.json({ error: 'A written reason is required to reject an item.' }, { status: 400 });
    const updated = repo.updateRoadSafetyQuestion(targetId, {
      status: 'ARCHIVED',
      reviewReasons: [...question.reviewReasons, `Rejected by ${actor}: ${note}`],
      issueReports: resolveReports(question.issueReports, actor, `Rejected: ${note}`),
    });
    if (!updated) return NextResponse.json({ error: 'Unknown question' }, { status: 404 });
    repo.appendAudit({
      actor,
      actorRole: 'ADMIN',
      action: 'ROAD_SAFETY_QUESTION_REJECTED',
      targetType: 'RoadSafetyQuestion',
      targetId,
      summary: `Archived "${updated.questionEn.slice(0, 80)}": ${note}`,
      before: question,
      after: updated,
    });
    return NextResponse.json({ success: true, question: updated, reviewQueue: repo.getReviewQueue() });
  }

  if (action === 'GENERATE_BATCH') {
    const settings = repo.getRoadSafetySettings();
    const count = Math.min(Math.max(Number(body.count) || 1, 1), 10);
    const topic = body.moduleId ? repo.getRoadSafetyModules().find((m) => m.id === String(body.moduleId)) : undefined;
    if (body.moduleId && !topic) return NextResponse.json({ error: 'Unknown module' }, { status: 400 });
    const facts = (topic ? factsForModule(topic.code) : generatableFacts()).filter(
      (f) => f.generationAllowed && f.reviewStatus === 'VERIFIED'
    );
    if (facts.length === 0) {
      return NextResponse.json({
        error: `No verified rule is available for ${topic ? `module ${topic.code}` : 'the curriculum'}, so nothing was generated. Add and verify a source first.`,
      }, { status: 400 });
    }
    const difficulty: QuestionDifficulty = ['EASY', 'MEDIUM', 'HARD'].includes(String(body.difficulty))
      ? (body.difficulty as QuestionDifficulty)
      : 'MEDIUM';

    const run = await generateQuestions({
      userId: null,
      kind: 'ADMIN_BATCH',
      count,
      factIds: facts.map((f) => f.id).slice(0, count * 2),
      difficulty,
      settings,
      learnerSeenStems: [],
      avoidStems: repo.getRoadSafetyQuestions().map((q) => q.questionEn),
    });

    repo.appendAudit({
      actor,
      actorRole: 'ADMIN',
      action: 'ROAD_SAFETY_GENERATION_BATCH',
      targetType: 'QuestionGenerationRun',
      targetId: run.runId,
      summary: `${count} ${difficulty} item(s) requested${topic ? ` for ${topic.code}` : ''}: ${run.published.length} published, ${run.heldForReview.length} held${run.blocked ? `, blocked ${run.blocked}` : ''}.`,
      before: null,
      after: { blocked: run.blocked, note: run.note, provider: run.provider, model: run.model, tokensUsed: run.tokensUsed, attempts: run.attempts },
    });

    return NextResponse.json({
      success: run.published.length > 0,
      runId: run.runId,
      blocked: run.blocked,
      note: run.note,
      provider: run.provider,
      model: run.model,
      tokensUsed: run.tokensUsed,
      attempts: run.attempts,
      published: run.published.length,
      heldForReview: run.heldForReview.length,
      reviewQueue: repo.getReviewQueue().length,
    });
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

/** A settings audit line a person can read: what moved, from what, to what. */
function describeSettingsChange(before: RoadSafetySettings, after: RoadSafetySettings): string {
  const flat = (s: RoadSafetySettings) => ({
    contentRefreshDays: s.contentRefreshDays,
    verificationRequiredToPublish: s.verificationRequiredToPublish,
    languages: s.languages.join('/'),
    'generation.enabled': s.generation.enabled,
    'generation.perSessionMax': s.generation.perSessionMax,
    'generation.perUserPerDay': s.generation.perUserPerDay,
    'generation.autoPublishVerified': s.generation.autoPublishVerified,
    'generation.dailyTokenBudget': s.generation.dailyTokenBudget,
    'generation.allowMultiAnswer': s.generation.allowMultiAnswer,
    'exam.practiceCount': s.exam.practiceCount,
    'exam.learnCount': s.exam.learnCount,
    'exam.mockCount': s.exam.mockCount,
    'exam.mockMinutes': s.exam.mockMinutes,
    'exam.strictModeByDefault': s.exam.strictModeByDefault,
    approvedSources: s.approvedSources.length,
  });
  const a = flat(before);
  const b = flat(after);
  const changed = (Object.keys(b) as Array<keyof typeof b>).filter((k) => String(a[k]) !== String(b[k]));
  if (!changed.length) return 'Academy settings saved with no field change.';
  return `Academy settings changed: ${changed.map((k) => `${k} ${String(a[k])} -> ${String(b[k])}`).join('; ')}`;
}

function auditContent(actor: string, type: string, id: string, summary: string, after: unknown) {  repo.appendAudit({
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
