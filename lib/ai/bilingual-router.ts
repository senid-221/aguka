import { AgentType, LanguagePreference, Conversation, User } from '@/lib/types';
import { repo } from '@/lib/db/repository';
import { sanitizeUserInput, redactSecrets } from './prompt-security';
import { getAIProvider } from './provider-adapter';
import { logger } from '@/lib/logging/logger';
import {
  consumeUsage,
  evaluateAccess,
  buildAccessReply,
  type ReplyLanguage,
} from '@/lib/services/entitlements';
import { getService } from '@/lib/services/catalog';
import { handleRoadSafetyMessage } from '@/lib/road-safety/whatsapp-flow';
import { publishedLessons, progressFor, formatProgress } from '@/lib/road-safety/academy';

export interface AgentExecutionResult {
  agentType: AgentType;
  intent: string;
  detectedLanguage: LanguagePreference;
  replyText: string;
  buttons?: Array<{ id: string; title: string }>;
  tokensUsed: number;
  latencyMs: number;
  modelUsed: string;
  toolCalls: Array<{
    name: string;
    args: Record<string, unknown>;
    result: Record<string, unknown>;
    latencyMs: number;
  }>;
}

/**
 * Detects whether the user is typing in Kinyarwanda, English, or a mixture
 */
/**
 * Distinctive Kinyarwanda stems, matched as substrings because the language
 * glues prefixes and possessives onto the root (ndashaka, amasomo, kwishyura).
 * Includes the command words the platform itself teaches in the service menu,
 * the academy and the payment prompts, so a learner replying "amasomo" is not
 * answered in English.
 */
const KINYARWANDA_STEMS = [
  'muraho', 'bite', 'amakuru', 'akazi', 'mifotra', 'kwandika', 'ibaruwa', 'ifoto', 'kwiga',
  'sobanurira', 'umurimo', 'umushahara', 'ngufashe', 'gufasha', 'ndifuza', 'shaka',
  'cyangwa', 'hano', 'nyamuneka', 'ryanjye', 'muri', 'kandi',
  'amasomo', 'isomo', 'ikizamini', 'imyitozo', 'ibibazo', 'ikibazo',
  'ibimenyetso', 'ikimenyetso', 'umuhanda', 'ubwitonzi',
  'ishyur', 'igiciro', 'imerere', 'hitamo', 'guhindura',
  'serivisi', 'ubutumwa', 'nkobora', 'wakoze',
];

/** Short roots that only count as whole words, so English text is not misread. */
const KINYARWANDA_WORDS = ['mu', 'ya', 'kuri', 'reba', 'ndi', 'kwa', 'iyo'];

export function detectLanguage(text: string): LanguagePreference {
  const t = text.toLowerCase();
  if (KINYARWANDA_STEMS.some((stem) => t.includes(stem))) return 'KINYARWANDA';
  if (t.split(/[^a-z]+/).some((word) => KINYARWANDA_WORDS.includes(word))) return 'KINYARWANDA';
  return 'ENGLISH';
}

/**
 * Classifies message intent into the right specialized agent
 */
export function classifyIntent(text: string): { agentType: AgentType; intent: string } {
  const t = text.toLowerCase();

  // 0. Road Safety Academy — checked first so "highway code" or "driving
  //    licence exam" is not swallowed by the coding or study tutors.
  if (
    t.includes('road') ||
    t.includes('driving') ||
    t.includes('driver') ||
    t.includes('licence') ||
    t.includes('license') ||
    t.includes('traffic') ||
    t.includes('umuhanda') ||
    t.includes('amategeko') ||
    t.includes('ikizamini cy\'imodoka') ||
    t.includes('moteri') ||
    t.includes('ikimenyetso') ||
    t.includes('ibimenyetso') ||
    t.includes('pedestrian') ||
    t.includes('patrol')
  ) {
    return { agentType: 'ROAD_SAFETY_ACADEMY', intent: 'ROAD_SAFETY_LEARNING' };
  }

  // 1. Coding Agent
  if (
    t.includes('code') ||
    t.includes('coding') ||
    t.includes('porogaramu') ||
    t.includes('typescript') ||
    t.includes('python') ||
    t.includes('javascript') ||
    t.includes('debug') ||
    t.includes('scaffold') ||
    t.includes('api') ||
    t.includes('github') ||
    t.includes('architecture') ||
    t.includes('docker')
  ) {
    return { agentType: 'CODING_AGENT', intent: 'SOFTWARE_DEV_AND_SANDBOX' };
  }

  // 2. Image Studio
  if (
    t.includes('photo') ||
    t.includes('ifoto') ||
    t.includes('passport') ||
    t.includes('pasiporo') ||
    t.includes('background') ||
    t.includes('bg') ||
    t.includes('crop') ||
    t.includes('isura')
  ) {
    return { agentType: 'IMAGE_STUDIO', intent: 'IMAGE_EDITING_PASSPORT' };
  }

  // 3. Study Tutor
  if (
    t.includes('sobanura') ||
    t.includes('sobanurira') ||
    t.includes('tutor') ||
    t.includes('teach') ||
    t.includes('kwiga') ||
    t.includes('isomo') ||
    t.includes('quiz') ||
    t.includes('ikizamini') ||
    t.includes('flashcard') ||
    t.includes('explain')
  ) {
    return { agentType: 'STUDY_TUTOR', intent: 'ACADEMIC_CONCEPT_TUTOR' };
  }

  // 4. Career Assistant (CV, Cover letters, Interview prep)
  if (
    t.includes('cv') ||
    t.includes('resume') ||
    t.includes('ibaruwa') ||
    t.includes('cover letter') ||
    t.includes('interview') ||
    t.includes('ikizamini cy\'akazi') ||
    t.includes('application guidance')
  ) {
    return { agentType: 'CAREER_ASSISTANT', intent: 'CV_AND_CAREER_GUIDANCE' };
  }

  // 5. Employment Marketplace (Hire talent or offer services)
  if (
    t.includes('nshaka umukozi') ||
    t.includes('hire') ||
    t.includes('employer') ||
    t.includes('talent') ||
    t.includes('vacancy') ||
    t.includes('isoko') ||
    t.includes('post job')
  ) {
    return { agentType: 'EMPLOYMENT_MARKETPLACE', intent: 'MARKETPLACE_MATCHING' };
  }

  // 6. Job Finder (Default fallback for job discovery)
  if (
    t.includes('akazi') ||
    t.includes('job') ||
    t.includes('mifotra') ||
    t.includes('remote') ||
    t.includes('kigali') ||
    t.includes('vacancy') ||
    t.includes('imirimo')
  ) {
    return { agentType: 'JOB_FINDER', intent: 'DISCOVER_VERIFIED_JOBS' };
  }

  // Default General Router
  return { agentType: 'JOB_FINDER', intent: 'GENERAL_ASSISTANCE' };
}

const AGENT_SYSTEM_INSTRUCTIONS: Record<AgentType, string> = {
  ROUTER:
    'You are Aguka AI, a bilingual WhatsApp assistant for Rwanda. Answer what the user asked, in the language they used.',
  JOB_FINDER:
    'You help Rwandan job seekers. Present only the listings supplied in the platform data section. Never invent employers, salaries, deadlines or source links. When no listings are supplied, say that none are available yet and offer CV or job-alert help.',
  CAREER_ASSISTANT:
    'You coach Rwandan candidates on CVs, cover letters and interview preparation. Ask for the role and the personal details you still need instead of making them up, and only draft an application after the user confirms consent to share their profile.',
  CODING_AGENT:
    'You are a software engineering assistant. Help scaffold, debug and explain systems in text. No code execution sandbox exists in this product, so never claim code was run, tested or verified.',
  IMAGE_STUDIO:
    'You advise on Rwandan passport photo standards (35x45mm, plain background) and CV portraits. Image editing does not run in this service, so never claim a photo was processed or its background removed.',
  STUDY_TUTOR:
    'You are a patient STEM and language tutor for Rwandan students. Explain the exact concept the user asked about, then end with one practice question. Use Kinyarwanda only when the user wrote in Kinyarwanda.',
  EMPLOYMENT_MARKETPLACE:
    'You connect Rwandan employers with workers. Report only the marketplace figures given in the platform data section and never name or describe a professional who is not listed there.',
  ROAD_SAFETY_ACADEMY:
    'You teach Rwandan road safety and traffic rules. Use ONLY the published lesson material supplied in the platform data section, and state its legal-review status. If a rule is not in that material, say you have not verified it for Rwanda and direct the learner to the official authority instead of guessing. Never present a fine amount, licence category, age limit, speed limit or pass mark that is not in the supplied material.',
};

const AGENT_BUTTONS: Record<AgentType, Array<{ id: string; en: string; rw: string }>> = {
  ROUTER: [],
  JOB_FINDER: [
    { id: 'btn_cv_help', en: 'Build / Tailor CV', rw: 'Fasha gukora CV' },
    { id: 'btn_remote_jobs', en: 'More Remote Jobs', rw: 'Akazi ko kure' },
  ],
  CAREER_ASSISTANT: [
    { id: 'btn_cover_letter', en: 'Write Cover Letter', rw: 'Andika ibaruwa' },
    { id: 'btn_interview_prep', en: 'Interview Prep', rw: 'Kwitegura ikizamini' },
  ],
  CODING_AGENT: [
    { id: 'btn_code_scaffold', en: 'Scaffold API', rw: 'Tangira API' },
    { id: 'btn_code_debug', en: 'Debug Snippet', rw: 'Kosora code' },
  ],
  IMAGE_STUDIO: [
    { id: 'btn_passport_specs', en: 'Passport Standards', rw: 'Amategeko ya pasiporo' },
    { id: 'btn_cv_photo', en: 'CV Photo Guide', rw: 'Ifoto ya CV' },
  ],
  STUDY_TUTOR: [
    { id: 'btn_new_topic', en: 'New Topic', rw: 'Isomo rishya' },
    { id: 'btn_quiz_me', en: 'Quiz Me', rw: 'Baza ikibazo' },
  ],
  EMPLOYMENT_MARKETPLACE: [
    { id: 'btn_post_vacancy', en: 'Post a Vacancy', rw: 'Tanga umwanya' },
    { id: 'btn_browse_talent', en: 'Browse Talent', rw: 'Reba abakozi' },
  ],
  ROAD_SAFETY_ACADEMY: [
    { id: 'btn_rs_lessons', en: 'Lessons', rw: 'Amasomo' },
    { id: 'btn_rs_practice', en: 'Practice', rw: 'Imyitozo' },
    { id: 'btn_rs_exam', en: 'Mock exam', rw: 'Ikizamini' },
  ],
};

const AI_NOT_CONFIGURED: Record<'KINYARWANDA' | 'ENGLISH', string> = {
  KINYARWANDA:
    'Aguka AI ntishobora gusubiza ubu kuko GEMINI_API_KEY itarashyirwaho kuri iyi serveri. Shyiraho urufunguzo rwa Gemini hanyuma ongera umbaze.',
  ENGLISH:
    'Aguka AI cannot reply right now because GEMINI_API_KEY is not configured on this server. Set a valid Gemini API key and send your message again.',
};

const AI_UNAVAILABLE: Record<'KINYARWANDA' | 'ENGLISH', string> = {
  KINYARWANDA: 'Aguka AI ntiyabashije gusubiza ubu. Nyamuneka ongera mu kanya nk’ako guhumbya.',
  ENGLISH: 'Aguka AI could not reach the AI provider. Please try again in a moment.',
};

/**
 * Image Studio advises on photo standards; it never renders or retouches a file.
 * Checked in code instead of trusting the system prompt, because a model asked to
 * edit a photo either pretends it did or, when the image endpoint is misconfigured,
 * the raw provider error gets texted back to a person on WhatsApp.
 */
const IMAGE_PRODUCTION_MARKERS = [
  'kora ifoto', 'kora foto', 'koraimage', 'guhindura ifoto', 'kuraho inyuma', 'isura ryiza',
  'edit photo', 'edit my photo', 'make a photo', 'make an image', 'make me a photo',
  'generate image', 'generate an image', 'create a photo', 'create an image',
  'remove background', 'change background', 'resize photo', 'crop photo', 'retouch', 'photoshop',
];

export function requestsImageProduction(text: string): boolean {
  const t = text.toLowerCase();
  return IMAGE_PRODUCTION_MARKERS.some((marker) => t.includes(marker));
}

const IMAGE_PRODUCTION_REFUSAL: Record<'KINYARWANDA' | 'ENGLISH', string> = {
  KINYARWANDA:
    'Gukora ifoto no guhindura iyari isanzwe ntibikorerwa kuri iyi serivisi — ntipfusha ubushobozi bwo gukura inyuma ku ifoto cyangwa kuyihindura. Nshobora kuguha amategeko y’ifoto ya pasiporo (35x45mm, inyuma y’umweru utagira ikindi) n’inama y’ifoto ya CV. Nyamuneka koresha porogaramu y’isanisha ifoto ku dosiye yawe.',
  ENGLISH:
    'This service does not generate or retouch image files, so I cannot create a photo, remove its background or edit it. What I can give you: the Rwanda passport photo standards (35x45mm, plain light background) and CV portrait guidance. For the file itself, use a photo editor on your phone or computer.',
};

/**
 * Orchestrates the AI Agent execution
 */
export interface ExecuteAgentOptions {
  /** Service the user picked from the WhatsApp menu; overrides keyword routing. */
  serviceCode?: string | null;
  /**
   * Reply language already resolved by the inbound flow, which knows the language
   * the user last wrote in. Pass it so a bare "6" or an exam answer does not send
   * a Kinyarwanda speaker back to English mid-conversation.
   */
  replyLang?: ReplyLanguage;
}

export async function executeAgent(
  user: User,
  conversation: Conversation,
  userMessageText: string,
  opts: ExecuteAgentOptions = {}
): Promise<AgentExecutionResult> {
  const startTime = Date.now();

  // 1. Prompt Injection & Security Check
  const sanitization = sanitizeUserInput(userMessageText);
  if (!sanitization.isSafe) {
    return {
      agentType: 'ROUTER',
      intent: 'SECURITY_ALERT',
      detectedLanguage: 'ENGLISH',
      replyText: `[Security Warning / Umuburo]: Your request could not be processed due to safety policy: ${sanitization.flaggedReason}`,
      tokensUsed: 0,
      latencyMs: Date.now() - startTime,
      modelUsed: 'not-configured',
      toolCalls: [],
    };
  }

  const lang = detectLanguage(sanitization.cleanText);
  const replyLang: ReplyLanguage = opts.replyLang ?? (lang === 'KINYARWANDA' ? 'KINYARWANDA' : 'ENGLISH');

  // Routing preference: an admin-selected service beats keyword guessing, and
  // the choice is remembered on both the user and the conversation.
  const serviceCode = opts.serviceCode ?? conversation.activeServiceCode ?? user.selectedServiceCode ?? null;
  const service = serviceCode ? getService(serviceCode) : undefined;
  const classified = classifyIntent(sanitization.cleanText);
  const agentType: AgentType = service?.agentType ?? classified.agentType;
  const intent = service ? `SERVICE:${service.code}` : classified.intent;

  // Update conversation active agent
  repo.setConversationAgent(conversation.id, agentType);

  // 2. Image production is refused here, before entitlements and before any model
  //    call: a refusal must not spend a trial use, must not depend on what the
  //    model decides to claim, and does not care which service was selected —
  //    no agent in this build can produce an image file.
  if (requestsImageProduction(sanitization.cleanText)) {
    const latencyMs = Date.now() - startTime;
    repo.recordAgentRun(
      {
        conversationId: conversation.id,
        agentType,
        intentDetected: 'IMAGE_PRODUCTION_UNAVAILABLE',
        modelUsed: 'capability-gate',
        tokensInput: 0,
        tokensOutput: 0,
        latencyMs,
        status: 'COMPLETED',
        toolCallsCount: 0,
      },
      []
    );

    return {
      agentType,
      intent: 'IMAGE_PRODUCTION_UNAVAILABLE',
      detectedLanguage: lang,
      replyText: IMAGE_PRODUCTION_REFUSAL[replyLang],
      buttons: AGENT_BUTTONS.IMAGE_STUDIO.map((b) => ({
        id: b.id,
        title: replyLang === 'KINYARWANDA' ? b.rw : b.en,
      })),
      tokensUsed: 0,
      latencyMs,
      modelUsed: 'capability-gate',
      toolCalls: [],
    };
  }

  // 3. Entitlement gate. Charging and trial expiry are enforced here, on the
  //    server, before any model call — never by asking the model to behave.
  if (service) {
    const decision = evaluateAccess(user, service);
    if (!decision.allowed) {
      const denialIntent = `ACCESS_${decision.denialReason ?? 'DENIED'}`;
      if (decision.denialReason === 'SERVICE_DISABLED') {
        return {
          agentType,
          intent: denialIntent,
          detectedLanguage: lang,
          replyText: buildAccessReply(service, decision, replyLang),
          buttons: [{ id: 'btn_menu', title: replyLang === 'KINYARWANDA' ? 'Menya izindi' : 'Other services' }],
          tokensUsed: 0,
          latencyMs: Date.now() - startTime,
          modelUsed: 'access-control',
          toolCalls: [],
        };
      }

      consumeUsage(user, service.code);
      repo.recordAgentRun(
        {
          conversationId: conversation.id,
          agentType,
          intentDetected: denialIntent,
          modelUsed: 'access-control',
          tokensInput: 0,
          tokensOutput: 0,
          latencyMs: Date.now() - startTime,
          status: 'COMPLETED',
          toolCallsCount: 0,
        },
        []
      );

      return {
        agentType,
        intent: denialIntent,
        detectedLanguage: lang,
        replyText: buildAccessReply(service, decision, replyLang),
        buttons: [
          { id: 'btn_pay', title: replyLang === 'KINYARWANDA' ? 'Ohereza reresita' : 'Pay with MoMo' },
          { id: 'btn_menu', title: replyLang === 'KINYARWANDA' ? 'Izindi serivisi' : 'Other services' },
        ],
        tokensUsed: 0,
        latencyMs: Date.now() - startTime,
        modelUsed: 'access-control',
        toolCalls: [],
      };
    }
  }

  // 4. Road Safety runs its lessons, exams and scoring deterministically in the
  //    backend, so it works with or without an AI provider.
  if (agentType === 'ROAD_SAFETY_ACADEMY') {
    const flow = handleRoadSafetyMessage(user, sanitization.cleanText, replyLang);
    if (flow) {
      if (service) consumeUsage(user, service.code);
      const latencyMs = Date.now() - startTime;
      repo.recordAgentRun(
        {
          conversationId: conversation.id,
          agentType,
          intentDetected: flow.intent,
          modelUsed: 'road-safety-engine',
          tokensInput: 0,
          tokensOutput: 0,
          latencyMs,
          status: 'COMPLETED',
          toolCallsCount: 1,
        },
        [
          {
            toolName: 'road_safety_flow',
            arguments: { intent: flow.intent, userId: user.id },
            result: { replyLength: flow.replyText.length },
            latencyMs,
            redacted: false,
          },
        ]
      );

      return {
        agentType,
        intent: flow.intent,
        detectedLanguage: lang,
        replyText: flow.replyText,
        buttons: flow.intent === 'GRADE_ATTEMPT' || flow.intent === 'COMPLETE_LESSON'
          ? [{ id: 'btn_rs_exam', title: replyLang === 'KINYARWANDA' ? 'Ikizamini' : 'Mock exam' }]
          : AGENT_BUTTONS.ROAD_SAFETY_ACADEMY.map((b) => ({
              id: b.id,
              title: replyLang === 'KINYARWANDA' ? b.rw : b.en,
            })),
        tokensUsed: 0,
        latencyMs,
        modelUsed: 'road-safety-engine',
        toolCalls: [],
      };
    }
  }

  // 5. Collect facts that the model is allowed to repeat
  const toolCalls: AgentExecutionResult['toolCalls'] = [];
  const contextParts: string[] = [];

  if (agentType === 'JOB_FINDER') {
    const toolStart = Date.now();
    const isRemote = sanitization.cleanText.toLowerCase().includes('remote');
    const listings = repo.getJobs({
      isRemote: isRemote ? true : undefined,
      verificationStatus: 'VERIFIED',
    });

    toolCalls.push({
      name: 'search_verified_jobs',
      args: { isRemote, verifiedOnly: true },
      result: { count: listings.length },
      latencyMs: Date.now() - toolStart,
    });

    contextParts.push(
      listings.length === 0
        ? 'Verified job listings available: none.'
        : `Verified job listings available:\n${listings
            .slice(0, 5)
            .map((j) => `- ${j.title} | ${j.employer} | ${j.location} | ${j.salaryRange || 'Salary not stated'} | ${j.sourceName} | ${j.sourceUrl}`)
            .join('\n')}`
    );
  }

  if (agentType === 'EMPLOYMENT_MARKETPLACE') {
    const toolStart = Date.now();
    const workers = repo.getWorkerProfiles();
    const vacancies = repo.getVacancies();

    toolCalls.push({
      name: 'query_talent_marketplace',
      args: {},
      result: { availableWorkers: workers.length, openVacancies: vacancies.length },
      latencyMs: Date.now() - toolStart,
    });

    contextParts.push(
      `Marketplace figures: ${workers.length} registered worker profile(s), ${vacancies.length} open vacancy record(s).`
    );
  }

  if (agentType === 'ROAD_SAFETY_ACADEMY') {
    const toolStart = Date.now();
    const lessons = publishedLessons();
    const progress = progressFor(user.id);
    toolCalls.push({
      name: 'read_road_safety_library',
      args: {},
      result: { publishedLessons: lessons.length, lessonsCompleted: progress.lessonsCompleted },
      latencyMs: Date.now() - toolStart,
    });

    contextParts.push(
      lessons.length === 0
        ? 'Published Road Safety Academy lessons: none. Tell the learner that no verified material is published yet.'
        : `Published Road Safety Academy lessons (the only material you may teach from):\n${lessons
            .slice(0, 8)
            .map(
              (l) =>
                `- ${l.titleEn} | ${l.bodyEn.slice(0, 600)} | legal review: ${l.legalVerifiedAt ? l.legalVerifiedAt.slice(0, 10) : 'NOT REVIEWED'} | sources: ${l.citations.map((c) => c.url).join(' ') || 'none'}`
            )
            .join('\n')}\n\nLearner progress: ${progress.lessonsCompleted} lessons completed, ${progress.mockExams} mock exams, best score ${progress.bestExamPercent}%.`
    );
  }

  // 6. Ask the configured provider; never answer from a scripted reply
  const provider = getAIProvider();
  let replyText = '';
  let modelUsed = 'not-configured';
  let tokensInput = 0;
  let tokensOutput = 0;
  let tokensUsed = 0;
  let status: 'COMPLETED' | 'FAILED' = 'FAILED';

  if (!provider) {
    replyText = AI_NOT_CONFIGURED[replyLang];
  } else {
    modelUsed = provider.model;
    const platformData = contextParts.length
      ? `\n\nPlatform data (the only facts you may cite):\n${contextParts.join('\n')}`
      : '';
    const prompt =
      `User name: ${user.fullName || 'User'}\n` +
      `Reply language: ${replyLang === 'KINYARWANDA' ? 'Kinyarwanda' : 'English'}\n` +
      `User message: "${sanitization.cleanText}"${platformData}`;

    try {
      const generated = await provider.generateResponse(prompt, AGENT_SYSTEM_INSTRUCTIONS[agentType]);
      tokensInput = generated.tokensInput;
      tokensOutput = generated.tokensOutput;
      tokensUsed = generated.tokensUsed;

      if (generated.text.trim().length > 0) {
        replyText = generated.text;
        status = 'COMPLETED';
      } else {
        replyText = AI_UNAVAILABLE[replyLang];
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      // A 404 for a wrong GEMINI_MODEL, a quota message or a TLS failure is an
      // operator detail. Keep it in the log and the agent run, not in the reply
      // sent to a person on WhatsApp.
      logger.error('AI_GENERATION_FAILED', err instanceof Error ? err : new Error(errorMsg), {
        metadata: { model: provider.model, agentType, conversationId: conversation.id },
      });
      replyText = AI_UNAVAILABLE[replyLang];
    }
  }

  const buttonDefinitions = AGENT_BUTTONS[agentType];
  const buttons =
    buttonDefinitions.length > 0
      ? buttonDefinitions.map((b) => ({ id: b.id, title: replyLang === 'KINYARWANDA' ? b.rw : b.en }))
      : undefined;

  const latencyMs = Date.now() - startTime;

  // Only a completed answer costs a use, so a provider outage cannot burn a
  // limited trial.
  if (service && status === 'COMPLETED') consumeUsage(user, service.code);

  // Record Agent Run & Tool Call Traces for transparency & audit logs
  repo.recordAgentRun(
    {
      conversationId: conversation.id,
      agentType,
      intentDetected: intent,
      modelUsed,
      tokensInput,
      tokensOutput,
      latencyMs,
      status,
      toolCallsCount: toolCalls.length,
    },
    toolCalls.map((tc) => ({
      toolName: tc.name,
      arguments: tc.args,
      result: tc.result,
      latencyMs: tc.latencyMs,
      redacted: false,
    }))
  );

  return {
    agentType,
    intent,
    detectedLanguage: lang,
    replyText: redactSecrets(replyText),
    buttons,
    tokensUsed,
    latencyMs,
    modelUsed,
    toolCalls,
  };
}
