import { NextResponse } from 'next/server';
import { repo } from '@/lib/db/repository';
import { UNVERIFIED_TOPICS, REVIEW_DATE, CONTENT_PACK_VERSION } from '@/lib/road-safety/content-pack';

export const runtime = 'nodejs';

/**
 * Public, read-only curriculum. Only PUBLISHED material is returned and no
 * answer keys are included — scoring happens on the server.
 */
export async function GET() {
  const modules = repo.getRoadSafetyModules().filter((m) => m.status === 'PUBLISHED');
  const moduleIds = new Set(modules.map((m) => m.id));

  const lessons = repo
    .getRoadSafetyLessons()
    .filter((l) => l.status === 'PUBLISHED' && moduleIds.has(l.moduleId))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((l) => ({
      id: l.id,
      moduleId: l.moduleId,
      titleEn: l.titleEn,
      titleRw: l.titleRw,
      bodyEn: l.bodyEn,
      bodyRw: l.bodyRw,
      keyPointsEn: l.keyPointsEn,
      keyPointsRw: l.keyPointsRw,
      citations: l.citations,
      legalVerifiedAt: l.legalVerifiedAt,
      lastReviewedBy: l.lastReviewedBy,
    }));

  const questions = repo
    .getRoadSafetyQuestions()
    .filter((q) => q.status === 'PUBLISHED' && moduleIds.has(q.moduleId));

  const signs = repo
    .getRoadSigns()
    .filter((s) => s.status === 'PUBLISHED')
    .map((s) => ({
      id: s.id,
      code: s.code,
      category: s.category,
      nameEn: s.nameEn,
      nameRw: s.nameRw,
      meaningEn: s.meaningEn,
      meaningRw: s.meaningRw,
      shape: s.shape,
      colourConvention: s.colourConvention,
      citations: s.citations,
      legalVerifiedAt: s.legalVerifiedAt,
    }));

  const exams = repo
    .getExamTemplates()
    .filter((e) => e.status === 'PUBLISHED')
    .map((e) => ({
      id: e.id,
      nameEn: e.nameEn,
      nameRw: e.nameRw,
      moduleId: e.moduleId,
      questionCount: e.questionCount,
      passPercent: e.passPercent,
      timeLimitMinutes: e.timeLimitMinutes,
      availableQuestions: questions.filter((q) => !e.moduleId || q.moduleId === e.moduleId).length,
    }));

  return NextResponse.json({
    success: true,
    contentPack: { version: CONTENT_PACK_VERSION, reviewedOn: REVIEW_DATE },
    disclaimer:
      'This academy teaches the instruments it cites. Amounts, ages or penalties that could not be confirmed in a published source are listed below and are not presented as law.',
    unverifiedTopics: UNVERIFIED_TOPICS,
    modules: modules.map((m) => ({
      id: m.id,
      code: m.code,
      titleEn: m.titleEn,
      titleRw: m.titleRw,
      summaryEn: m.summaryEn,
      summaryRw: m.summaryRw,
      lessonCount: lessons.filter((l) => l.moduleId === m.id).length,
      questionCount: questions.filter((q) => q.moduleId === m.id).length,
    })),
    lessons,
    signs,
    exams,
    practiceQuestionCount: questions.length,
    stats: repo.getRoadSafetyStats(),
  });
}
