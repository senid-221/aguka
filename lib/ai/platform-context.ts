import { AgentType, Conversation, User } from '@/lib/types';
import { repo } from '@/lib/db/repository';
import { listMenuServices } from '@/lib/services/catalog';
import { resolveImageCapability } from '@/lib/images/provider';
import { isWhatsAppLiveConfigured } from '@/lib/whatsapp/gateway';
import { findPendingAttempt, progressFor } from '@/lib/road-safety/academy';
import { chainSummary } from './provider-adapter';
import { pickWindow } from './variety';

/**
 * Everything the conversational agent is allowed to say about the platform,
 * read from the live store on every turn. It is deliberately not per-keyword:
 * a tutor asked "what else does Aguka do?" or a job seeker asking about their
 * own photo has to see the real catalogue, the real board health and their own
 * rows, otherwise the honest-sounding answer is "I have nothing" while the
 * backend does hold something. Nothing here is seeded or invented: an empty
 * section says it is empty, and a missing capability says it is not configured.
 *
 * Only this person's own study, coding and photo rows are read. Marketplace and
 * road-safety material is public catalogue data.
 */

export interface PlatformContextInput {
  user: User;
  conversation: Conversation;
  agentType: AgentType;
  replyLang: 'KINYARWANDA' | 'ENGLISH';
  currentText: string;
}

export interface PlatformToolTrace {
  name: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
  latencyMs: number;
}

export interface PlatformContext {
  parts: string[];
  tools: PlatformToolTrace[];
}

interface Block {
  text: string;
  result: Record<string, unknown>;
}

const MAX_LISTINGS = 5;
const MAX_HISTORY_MESSAGES = 6;
const MAX_HISTORY_CHARS = 240;

export const PLATFORM_DATA_RULES =
  'The "Platform data" block was read from this deployment\'s own database and configuration moments ago. ' +
  'Treat it as ground truth: every service, listing, vacancy, lesson, sign, entitlement and record it lists really exists, ' +
  'so never tell the person you have nothing when it lists something. If a section says NONE or NOT CONFIGURED, say that plainly ' +
  'and offer the nearest thing that does exist. Never invent a service, employer, salary, price, lesson or record that is not in it.';

function shortDate(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? iso : new Date(parsed).toISOString().slice(0, 10);
}

function clip(text: string, max: number): string {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function capabilityBlock(): Block {
  const services = listMenuServices();
  const chain = chainSummary();
  const images = resolveImageCapability();
  const whatsappConfigured = isWhatsAppLiveConfigured();

  const serviceLines =
    services.length === 0
      ? '- No service is enabled in the WhatsApp menu.'
      : services
          .map((s) => {
            const price =
              s.chargeEnabled && !s.isFree
                ? `${s.price} ${s.currency} ${s.billingPeriod.toLowerCase()}`
                : 'free right now';
            return `- ${s.nameEn} / ${s.nameRw} (code ${s.code}, agent ${s.agentType}) — ${price} — ${s.descriptionEn} / ${s.descriptionRw}`;
          })
          .join('\n');

  const text = [
    'What this deployment can actually do right now (live catalogue and configuration):',
    serviceLines,
    `- AI text providers: ${
      chain.configured
        ? `${chain.order.map((p) => `${p.provider}:${p.model}`).join(' → ')}${
            chain.rescueConfigured ? ' with a rescue provider' : ' with no rescue provider'
          }`
        : 'NOT CONFIGURED — no AI answer can be generated on this server'
    }.`,
    `- WhatsApp Cloud API: ${whatsappConfigured ? 'configured' : 'NOT CONFIGURED on this server'}.`,
    `- Live web research: ${
      chain.webSearchConfigured
        ? `available through ${chain.webSearchProvider} when the answer is not in the data below or changes over time; anything found this way is a web page, not an Aguka-verified record`
        : 'NOT AVAILABLE on this server (no search-capable provider, or AI_WEB_SEARCH is off) — say so instead of pretending to have looked something up'
    }.`,
    `- Photo studio (making or retouching an image file): ${
      images.configured
        ? `enabled via ${images.provider}${images.model ? ` ${images.model}` : ''}`
        : 'NOT ENABLED — no image provider key is set'
    }.`,
    '- Payments: mobile money receipts are confirmed by a human administrator; never tell a person a payment has already been received.',
  ].join('\n');

  return {
    text,
    result: {
      services: services.length,
      aiConfigured: chain.configured,
      webSearchConfigured: chain.webSearchConfigured,
      whatsappConfigured,
      imagesConfigured: images.configured,
    },
  };
}

function accountBlock(user: User): Block {
  const entitlements = repo.getEntitlementsForUser(user.id);
  const orders = repo.getPaymentOrdersForUser(user.id);
  const latest = orders[0];
  const selectedName = user.selectedServiceCode
    ? repo.getServiceByCode(user.selectedServiceCode)?.nameEn ?? user.selectedServiceCode
    : 'none yet';

  const entitlementLines =
    entitlements.length === 0
      ? '  none — no trial or paid access is recorded for this person.'
      : entitlements
          .map((e) => {
            const until = e.paidUntil ? ` paid until ${shortDate(e.paidUntil)}` : '';
            const trial = e.trialExpiresAt ? ` trial ends ${shortDate(e.trialExpiresAt)}` : '';
            const usage = `${e.usageCount}${e.usageLimit == null ? '' : `/${e.usageLimit}`} uses`;
            return `  - ${e.serviceCode}: ${e.status}${until}${trial}, ${usage}`;
          })
          .join('\n');

  const text = [
    'This person\'s own account (their records only):',
    `- Name: ${user.fullName || 'not given'} | reply language: ${user.preferredLang} | service selected: ${selectedName}.`,
    '- Access on record:',
    entitlementLines,
    latest
      ? `- Latest payment order: ${latest.reference} for ${latest.serviceCode}, ${latest.amount} ${latest.currency}, status ${latest.status} (created ${shortDate(latest.createdAt)}).`
      : '- Latest payment order: none on record.',
  ].join('\n');

  return {
    text,
    result: { entitlements: entitlements.length, orders: orders.length, latestOrder: latest?.status ?? null },
  };
}

function jobsBlock(currentText: string, offset: number): Block {
  const wantsRemote = /remote/i.test(currentText);
  const listings = repo.getJobs({
    ...(wantsRemote ? { isRemote: true } : {}),
    verificationStatus: 'VERIFIED',
  });
  const sources = repo.getSources();

  const boardLines =
    sources.length === 0
      ? '- No job board is registered, so no crawl has ever run.'
      : sources
          .map(
            (s) =>
              `- ${s.code}: ${s.healthStatus}, ${s.activeListingsCount} active listing(s), last crawl ${shortDate(
                s.lastCrawledAt
              )}${s.lastCrawlNote ? ` — ${clip(s.lastCrawlNote, 160)}` : ''}`
          )
          .join('\n');

  // The same five rows printed at every request is what makes a person conclude the
  // platform knows five jobs. The slice advances with the conversation, so a fourth
  // "shaka akazi" shows the next ones instead of the first ones again.
  const shown = pickWindow(listings, MAX_LISTINGS, offset);
  const listingLines =
    listings.length === 0
      ? 'Verified listings: NONE stored. Do not invent one; say no verified listing has been stored yet and offer CV or job-alert help.'
      : `Verified listings${wantsRemote ? ' (remote only)' : ''} — these are the only jobs you may present:\n${shown
          .map(
            (j) =>
              `- ${j.title} | ${j.employer} | ${j.location} | ${j.salaryRange || 'salary not stated'} | ${j.jobType} | ${j.sourceName} | ${j.sourceUrl}`
          )
          .join('\n')}${
          listings.length > shown.length
            ? `\n(${listings.length} verified listing(s) are stored in total; ${shown.length} are shown here and another slice comes up as this conversation continues, so never say these are the only ones.)`
            : ''
        }`;

  return {
    text: `Job discovery (read from stored crawls, never guessed):\n${listingLines}\nBoard status:\n${boardLines}`,
    result: { verifiedListings: listings.length, shown: shown.length, boards: sources.length, remoteOnly: wantsRemote },
  };
}

function marketplaceBlock(): Block {
  const workers = repo.getWorkerProfiles();
  const available = workers.filter((w) => w.isAvailable);
  const vacancies = repo.getVacancies();

  const text = [
    'Talent marketplace (public profiles and vacancy records):',
    `- ${workers.length} worker profile(s) on record, ${available.length} currently available.`,
    available.length === 0
      ? '  No available worker profile is stored, so do not describe one.'
      : available
          .slice(0, 3)
          .map((w) => `  - ${w.title} in ${w.district}, ${w.experienceYrs} year(s), skills: ${w.skills.slice(0, 5).join(', ') || 'none listed'}${w.hourlyRateRwf ? `, ${w.hourlyRateRwf} RWF/hour` : ''}`)
          .join('\n'),
    `- ${vacancies.length} vacancy record(s) stored.`,
    vacancies.length === 0
      ? '  No vacancy is stored, so do not describe one.'
      : vacancies
          .slice(0, 3)
          .map((v) => `  - ${v.title} at ${v.employerName} in ${v.location} (${v.status})${v.budgetRwf ? `, budget ${v.budgetRwf} RWF` : ''}`)
          .join('\n'),
  ].join('\n');

  return {
    text,
    result: { workers: workers.length, availableWorkers: available.length, vacancies: vacancies.length },
  };
}

function personalRecordsBlock(userId: string): Block {
  const study = repo.getStudySessions().filter((s) => s.userId === userId);
  const coding = repo.getCodingTasks().filter((t) => t.userId === userId);
  const media = repo.getMediaTasks().filter((t) => t.userId === userId);

  const text = [
    'This person\'s own work history (only their rows are read):',
    study.length === 0
      ? '- Tutoring sessions: none on record.'
      : `- Tutoring sessions (${study.length}): ${study.slice(0, 3).map((s) => `${s.subject} — ${s.topic} (${shortDate(s.createdAt)})`).join('; ')}`,
    coding.length === 0
      ? '- Coding projects: none on record.'
      : `- Coding projects (${coding.length}): ${coding.slice(0, 3).map((t) => `${t.title} [${t.taskType}, ${t.status}]`).join('; ')}`,
    media.length === 0
      ? '- Photo tasks: none on record.'
      : `- Photo tasks (${media.length}): ${media.slice(0, 2).map((t) => `${t.operation} [${t.status}]`).join('; ')}. Stored files are deleted after the retention window; the task row stays as history.`,
  ].join('\n');

  return {
    text,
    result: { studySessions: study.length, codingTasks: coding.length, photoTasks: media.length },
  };
}

function roadSafetyBlock(userId: string): Block {
  const modules = repo.getRoadSafetyModules().filter((m) => m.status === 'PUBLISHED');
  const lessons = repo.getRoadSafetyLessons().filter((l) => l.status === 'PUBLISHED');
  const signs = repo.getRoadSigns().filter((s) => s.status === 'PUBLISHED');
  const questions = repo.getRoadSafetyQuestions().filter((q) => q.status === 'PUBLISHED');
  const progress = progressFor(userId);
  const open = findPendingAttempt(userId);

  const text = [
    'Road Safety Academy (public curriculum plus this learner\'s own record):',
    `- Published modules: ${modules.length}; published lessons: ${lessons.length}; published signs: ${signs.length}; published questions: ${questions.length}.`,
    `- This learner: ${progress.lessonsCompleted} lesson(s) completed, ${progress.practiceAttempts} practice paper(s), ${progress.mockExams} mock exam(s), ${progress.examsPassed} passed, best ${progress.bestExamPercent}%, ${progress.totalAnswered} question(s) answered.`,
    open
      ? `- A paper is open right now: ${open.kind}, ${open.savedAnswers.filter((v) => v != null).length}/${open.totalQuestions} answered.`
      : '- No paper is open for this learner.',
    'All papers are practice simulations, not an official government examination.',
  ].join('\n');

  return {
    text,
    result: {
      modules: modules.length,
      lessons: lessons.length,
      signs: signs.length,
      questions: questions.length,
      openPaper: Boolean(open),
    },
  };
}

function historyBlock(input: PlatformContextInput): Block {
  const recent = input.conversation.messages.filter((m) => m.role !== 'SYSTEM').slice(-(MAX_HISTORY_MESSAGES + 1));

  // The current message is already appended to the conversation and is also the
  // "User message" line, so it is dropped here instead of being sent twice.
  const last = recent[recent.length - 1];
  if (last && last.role === 'USER' && clip(last.content, MAX_HISTORY_CHARS) === clip(input.currentText, MAX_HISTORY_CHARS)) {
    recent.pop();
  }
  const shown = recent.slice(-MAX_HISTORY_MESSAGES);

  const memories = Object.entries(input.conversation.memories || {}).slice(0, 8);
  const lines = [
    'Recent messages in this same conversation (oldest first; context only — do not repeat them back verbatim):',
    shown.length === 0
      ? '- No earlier message is stored in this conversation.'
      : shown
          .map((m) => `- ${m.role === 'USER' ? 'them' : 'Aguka'}: ${clip(m.content, MAX_HISTORY_CHARS)}`)
          .join('\n'),
  ];
  if (memories.length > 0) {
    lines.push(`Remembered notes about this person: ${memories.map(([k, v]) => `${k}=${clip(v, 120)}`).join('; ')}`);
  }

  return { text: lines.join('\n'), result: { messages: shown.length, memories: memories.length } };
}

export function buildPlatformContext(input: PlatformContextInput): PlatformContext {
  const parts: string[] = [];
  const tools: PlatformToolTrace[] = [];

  // Derived from the stored transcript, so the rotation needs no extra state and
  // survives a restart instead of living in a process-local counter.
  const replyOffset = input.conversation.messages.filter((m) => m.role === 'ASSISTANT').length;

  const add = (name: string, args: Record<string, unknown>, build: () => Block) => {
    const started = Date.now();
    const block = build();
    parts.push(block.text);
    tools.push({ name, args, result: block.result, latencyMs: Date.now() - started });
  };

  add('read_service_catalog', {}, () => capabilityBlock());
  add('read_person_account', { userId: input.user.id }, () => accountBlock(input.user));
  add(
    'search_verified_jobs',
    { remoteOnly: /remote/i.test(input.currentText), verifiedOnly: true, slice: replyOffset },
    () => jobsBlock(input.currentText, replyOffset)
  );
  add('query_talent_marketplace', {}, () => marketplaceBlock());
  add('read_learner_records', { userId: input.user.id }, () => personalRecordsBlock(input.user.id));
  add('read_road_safety_summary', { userId: input.user.id }, () => roadSafetyBlock(input.user.id));
  add('read_conversation_history', { conversationId: input.conversation.id }, () => historyBlock(input));

  return { parts, tools };
}
