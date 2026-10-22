import {
  QuestionDifficulty,
  QuestionGenerationRun,
  RoadSafetyQuestion,
  RoadSafetySettings,
  VerifiedFact,
} from '@/lib/types';
import { AllTextProvidersFailed, generateText } from '@/lib/ai/provider-adapter';
import { FACTS_BY_ID, generatableFacts } from '@/lib/road-safety/verified-facts';
import { GateOutcome, QuestionDraft, setDuplicateUniverse, toQuestionRow, verifyQuestionDraft } from '@/lib/road-safety/verification';
import { repo } from '@/lib/db/repository';
import { logger } from '@/lib/logging/logger';

/**
 * AI question generation for the Road Safety Academy.
 *
 * The model writes a question *from a supplied set of verified rules* and nothing else.
 * Its output is never trusted: every candidate passes the deterministic gate in
 * verification.ts, and anything that fails is stored as NEEDS_REVIEW with the reasons
 * attached so an administrator can read exactly what the model got wrong. If no provider
 * answers, the caller falls back to the verified bank and tells the learner — the academy
 * never quietly invents traffic law to fill a paper.
 */

export type GenerationBlockReason =
  | 'NO_PROVIDER'
  | 'BUDGET_EXHAUSTED'
  | 'LIMIT_REACHED'
  | 'NO_MODULE'
  | 'DISABLED'
  | 'PARSE_FAILED'
  | 'ALL_HELD'
  | null;

export interface GenerationRequest {
  userId: string | null;
  kind: QuestionGenerationRun['kind'];
  count: number;
  /** Fact ids chosen by the adaptive planner. */
  factIds: string[];
  difficulty: QuestionDifficulty;
  settings: RoadSafetySettings;
  /** Stems this learner has already answered, so a "new" question is new to them. */
  learnerSeenStems: string[];
  /** Stems already in the bank for the chosen rules, to force a different scenario. */
  avoidStems: string[];
}

export interface GenerationResult {
  runId: string;
  ok: boolean;
  published: RoadSafetyQuestion[];
  heldForReview: RoadSafetyQuestion[];
  blocked: GenerationBlockReason;
  note: string | null;
  provider: string | null;
  model: string | null;
  tokensUsed: number;
  attempts: string[];
}

const SYSTEM_INSTRUCTION = `You write practice questions for the Rwandan driving-theory curriculum (provisional and definitive licence preparation).

Hard rules you cannot break:
1. Use ONLY the verified rules given in the user message. Do not add, change or estimate a speed limit, distance, fine, penalty, age, deadline, vehicle mass, dimension or sign meaning.
2. Do not present general safe-driving advice as a legal requirement, and do not present an instruction from a service page as an article of law. The basis of each rule is given to you; respect it.
3. Name the instrument or article you were given in the explanation. Do not invent an article number.
4. Exactly one option is correct. The other options are mistakes a real learner makes, never wordplay, never "all of the above".
5. Write the Kinyarwanda as real Kinyarwanda, not a copy of the English sentence.
6. Keep the tested rule identical, but change the scenario: the road, the time of day, the vehicle, the junction.

Reply with JSON only: an array of objects with the keys
factIds (array of ids you were given), difficulty (EASY|MEDIUM|HARD), questionEn, questionRw,
optionsEn (4 strings), optionsRw (4 strings), correctIndex (0-based number), explanationEn, explanationRw.`;

function factBlock(facts: VerifiedFact[]): string {
  return facts
    .map(
      (f) =>
        `- id=${f.id} | basis=${f.legalBasis} | module=${f.moduleCode}\n` +
        `  rule (EN): ${f.statementEn}\n` +
        `  rule (RW): ${f.statementRw}\n` +
        (f.value != null ? `  legal value: ${f.value}${f.unit ? ` ${f.unit}` : ''} — only this value may be the correct answer\n` : '') +
        (f.distractorValues.length ? `  other real values in the book, never correct here: ${f.distractorValues.join(', ')}\n` : '') +
        `  source: ${f.article ? `${f.article} — ` : ''}${f.citation.title} (${f.citation.url})`
    )
    .join('\n');
}

function buildPrompt(request: GenerationRequest, facts: VerifiedFact[]): string {
  const { settings } = request;
  const lines = [
    `Write ${request.count} fresh practice question(s) for one learner.`,
    `Difficulty: ${request.difficulty}.`,
    request.difficulty === 'HARD'
      ? 'Each question must require two of the given rules to be applied together in one scenario.'
      : request.difficulty === 'EASY'
        ? 'Each question applies one rule directly, with an everyday scenario.'
        : 'Each question applies one rule in a scenario with a small complication.',
    `Languages: ${settings.languages.join(', ')} — every item needs both.`,
    settings.generation.allowMultiAnswer ? '' : 'Every item must have exactly one correct option.',
    '',
    'Verified rules you may use, and nothing else:',
    factBlock(facts),
    '',
    request.avoidStems.length
      ? `Questions already in the bank for these rules — write a different situation, do not restate them:\n${request.avoidStems.slice(0, 8).map((s) => `- ${s}`).join('\n')}`
      : 'No existing questions for these rules yet.',
    '',
    'Return a JSON array only.',
  ];
  return lines.filter((l) => l !== undefined).join('\n');
}

function trimToJson(body: string): string | null {
  const cut = Math.max(body.lastIndexOf(']'), body.lastIndexOf('}'));
  if (cut <= 0) return null;
  return body.slice(0, cut + 1);
}

function extractJson(text: string): unknown {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const body = (fenced ? fenced[1] : raw).trim();
  const start = body.search(/[[{]/);
  if (start === -1) return null;
  const candidate = body.slice(start);
  try {
    return JSON.parse(candidate);
  } catch {
    const trimmed = trimToJson(candidate);
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
}

function toDrafts(payload: unknown): QuestionDraft[] {
  const list = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { questions?: unknown[] }).questions)
      ? (payload as { questions: unknown[] }).questions
      : [];

  return list
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => {
      const optionsEn = Array.isArray(item.optionsEn) ? item.optionsEn.map(String) : [];
      const optionsRw = Array.isArray(item.optionsRw) ? item.optionsRw.map(String) : [];
      const factIds = Array.isArray(item.factIds) ? item.factIds.map(String) : [];
      const rawIndexes = Array.isArray(item.correctIndexes) ? item.correctIndexes.map(Number) : null;
      return {
        factIds,
        difficulty: (['EASY', 'MEDIUM', 'HARD'].includes(String(item.difficulty))
          ? item.difficulty
          : 'MEDIUM') as QuestionDifficulty,
        questionEn: String(item.questionEn ?? '').trim(),
        questionRw: String(item.questionRw ?? '').trim(),
        optionsEn,
        optionsRw: optionsRw.length ? optionsRw : optionsEn,
        correctIndex: Number.isInteger(Number(item.correctIndex)) ? Number(item.correctIndex) : -1,
        correctIndexes: rawIndexes && rawIndexes.every((n) => Number.isInteger(n)) ? rawIndexes : null,
        explanationEn: String(item.explanationEn ?? '').trim(),
        explanationRw: String(item.explanationRw ?? '').trim(),
      };
    });
}

function moduleIdForCode(moduleCode: string | null): string | null {
  if (!moduleCode) return null;
  return repo.getRoadSafetyModules().find((m) => m.code === moduleCode)?.id ?? null;
}

function tokensToday(): number {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  return repo
    .getQuestionGenerationRuns(500)
    .filter((run) => Date.parse(run.startedAt) >= since.getTime())
    .reduce((sum, run) => sum + run.tokensUsed, 0);
}

function runsForUserToday(userId: string | null): number {
  if (!userId) return 0;
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  return repo
    .getQuestionGenerationRuns(500)
    .filter((run) => run.userId === userId && Date.parse(run.startedAt) >= since.getTime()).length;
}

function openRun(request: GenerationRequest, factIds: string[]): QuestionGenerationRun {
  return repo.recordGenerationRun({
    startedAt: new Date().toISOString(),
    userId: request.userId,
    kind: request.kind,
    requested: request.count,
    factIds,
    provider: null,
    model: null,
    candidates: 0,
    published: 0,
    heldForReview: 0,
    tokensUsed: 0,
    latencyMs: 0,
    attempts: [],
    error: null,
  });
}

/**
 * Generates a fresh set for one learner. Never throws: a provider outage comes back as
 * blocked='NO_PROVIDER' with the operator trace attached.
 */
export async function generateQuestions(request: GenerationRequest): Promise<GenerationResult> {
  const started = Date.now();
  const { settings } = request;
  const usableFacts = generatableFacts();
  const facts = request.factIds
    .map((id) => FACTS_BY_ID.get(id))
    .filter((f): f is VerifiedFact => f !== undefined && f.generationAllowed && f.reviewStatus === 'VERIFIED');

  const result: GenerationResult = {
    runId: '',
    ok: false,
    published: [],
    heldForReview: [],
    blocked: null,
    note: null,
    provider: null,
    model: null,
    tokensUsed: 0,
    attempts: [],
  };

  const stop = (blocked: Exclude<GenerationBlockReason, null>, note: string, attempts: string[] = []): GenerationResult => {
    const run = openRun(request, facts.map((f) => f.id));
    repo.updateGenerationRun(run.id, { error: `${blocked}: ${note}`, attempts, latencyMs: Date.now() - started });
    return { ...result, runId: run.id, blocked, note, attempts };
  };

  if (!settings.generation.enabled) {
    return stop('DISABLED', 'AI question generation is switched off in the academy settings.');
  }
  if (runsForUserToday(request.userId) >= settings.generation.perUserPerDay) {
    return stop(
      'LIMIT_REACHED',
      `This learner already used the ${settings.generation.perUserPerDay} generated session(s) allowed per day.`
    );
  }
  if (settings.generation.dailyTokenBudget > 0 && tokensToday() >= settings.generation.dailyTokenBudget) {
    return stop('BUDGET_EXHAUSTED', `The daily provider token budget of ${settings.generation.dailyTokenBudget} is already spent.`);
  }
  if (facts.length === 0) {
    return stop('NO_MODULE', 'No verified rule was selected for this paper, so there was nothing to generate from.');
  }

  const homeless = facts.find((f) => !moduleIdForCode(f.moduleCode));
  if (homeless) {
    return stop(
      'NO_MODULE',
      `Curriculum module "${homeless.moduleCode}" is not published, so generated questions have nowhere to be stored. Import the content pack first.`
    );
  }

  const run = openRun(request, facts.map((f) => f.id));
  result.runId = run.id;

  setDuplicateUniverse(repo.getRoadSafetyQuestions().map((q) => q.questionEn));
  const existingFingerprints = new Set(repo.getRoadSafetyQuestions().map((q) => q.fingerprint));

  let answer;
  try {
    answer = await generateText(buildPrompt(request, facts), SYSTEM_INSTRUCTION, { json: true });
  } catch (err: unknown) {
    const attempts =
      err instanceof AllTextProvidersFailed ? err.attempts : [err instanceof Error ? err.message : String(err)];
    logger.warn('ROAD_SAFETY_GENERATION_UNAVAILABLE', attempts.join(' | '), { metadata: { userId: request.userId ?? 'admin' } });
    const note = attempts.length
      ? `No text provider answered, so no new questions were created: ${attempts.join(' | ')}`
      : 'No text provider is configured (GEMINI_API_KEY or OPENAI_API_KEY), so no new questions were created.';
    repo.updateGenerationRun(run.id, { error: `NO_PROVIDER: ${note}`, attempts, latencyMs: Date.now() - started });
    return { ...result, blocked: 'NO_PROVIDER', note, attempts };
  }

  const drafts = toDrafts(extractJson(answer.text));

  if (drafts.length === 0) {
    repo.updateGenerationRun(run.id, {
      provider: answer.provider,
      model: answer.model,
      tokensUsed: answer.tokensUsed,
      attempts: answer.attempts,
      latencyMs: Date.now() - started,
      error: 'PARSE_FAILED: the provider answer was not readable as a question set.',
    });
    return {
      ...result,
      blocked: 'PARSE_FAILED',
      note: 'The provider answered but returned nothing readable as a question set.',
      provider: answer.provider,
      model: answer.model,
      tokensUsed: answer.tokensUsed,
      attempts: answer.attempts,
    };
  }

  const published: RoadSafetyQuestion[] = [];
  const held: RoadSafetyQuestion[] = [];

  for (const draft of drafts) {
    // A draft that names rules outside the supplied set is refused on top of the gate
    // result, because the gate would otherwise check it against facts the prompt never offered.
    const inventedRefs = draft.factIds.filter((id) => !request.factIds.includes(id));
    const grounded = { ...draft, factIds: draft.factIds.filter((id) => usableFacts.some((f) => f.id === id)) };

    const outcome: GateOutcome = verifyQuestionDraft(grounded, {
      languages: settings.languages,
      allowMultiAnswer: settings.generation.allowMultiAnswer,
      existingFingerprints,
      learnerSeenStems: request.learnerSeenStems,
    });

    const row = toQuestionRow(draft, outcome, {
      moduleId: moduleIdForCode(outcome.moduleCode ?? facts[0].moduleCode) ?? '',
      lessonId: null,
    }, new Date().toISOString());
    row.generation = {
      provider: answer.provider,
      model: answer.model,
      runId: run.id,
      generatedAt: new Date().toISOString(),
      factIds: draft.factIds,
      tokensUsed: answer.tokensUsed,
    };

    if (inventedRefs.length) {
      row.status = 'NEEDS_REVIEW';
      row.reviewReasons = [...row.reviewReasons, `Cites rules that were not supplied to it: ${inventedRefs.join(', ')}`];
    }
    if (!row.moduleId) {
      row.status = 'NEEDS_REVIEW';
      row.reviewReasons = [...row.reviewReasons, 'No published module matched the rules it cites.'];
    }
    if (row.status === 'PUBLISHED' && !settings.generation.autoPublishVerified) {
      row.status = 'NEEDS_REVIEW';
      row.reviewReasons = [...row.reviewReasons, 'Passed the verification gate; held for administrator review because auto-publish is off.'];
    }

    const stored = repo.createRoadSafetyQuestion(row);
    existingFingerprints.add(stored.fingerprint);
    if (stored.status === 'PUBLISHED') published.push(stored);
    else held.push(stored);
  }

  repo.updateGenerationRun(run.id, {
    provider: answer.provider,
    model: answer.model,
    tokensUsed: answer.tokensUsed,
    attempts: answer.attempts,
    latencyMs: Date.now() - started,
    candidates: drafts.length,
    published: published.length,
    heldForReview: held.length,
    error: published.length === 0 ? 'ALL_HELD: every generated item failed the verification gate.' : null,
  });

  return {
    runId: run.id,
    ok: published.length > 0,
    published,
    heldForReview: held,
    blocked: published.length === 0 ? 'ALL_HELD' : null,
    note:
      published.length === 0
        ? `All ${held.length} generated item(s) failed verification and are waiting in the review queue.`
        : null,
    provider: answer.provider,
    model: answer.model,
    tokensUsed: answer.tokensUsed,
    attempts: answer.attempts,
  };
}

export function generationHealth(settings: RoadSafetySettings) {
  return {
    enabled: settings.generation.enabled,
    verifiedRules: usableFactCount(),
    documentedGaps: [...FACTS_BY_ID.values()].filter((f) => !f.generationAllowed).length,
    tokensToday: tokensToday(),
    dailyTokenBudget: settings.generation.dailyTokenBudget,
    autoPublishVerified: settings.generation.autoPublishVerified,
    reviewQueue: repo.getRoadSafetyQuestions().filter((q) => q.status === 'NEEDS_REVIEW').length,
  };
}

function usableFactCount(): number {
  return generatableFacts().length;
}
