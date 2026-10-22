import { AgentType, LanguagePreference, Conversation, User } from '@/lib/types';
import { repo } from '@/lib/db/repository';
import { sanitizeUserInput, redactSecrets } from './prompt-security';
import { generateText, chainSummary, AllTextProvidersFailed } from './provider-adapter';
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
import { resolveImageCapability } from '@/lib/images/provider';
import { attachmentOf, runImageStudio, type ImageAttachment } from '@/lib/images/studio';

export interface AgentExecutionResult {
  agentType: AgentType;
  intent: string;
  detectedLanguage: LanguagePreference;
  replyText: string;
  buttons?: Array<{ id: string; title: string }>;
  /** Set when the image studio produced a file that still has to be delivered. */
  image?: ImageAttachment;
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
  'cyangwa', 'hano', 'nyamuneka', 'ryanjye', 'yanjye', 'muri', 'kandi',
  'kuraho', 'kureho', 'sanisha', 'sanur',
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
    'You advise on Rwandan passport photo standards (35x45mm, plain background) and CV portraits. Requests to create or retouch an actual file are handled by the image studio elsewhere in this service, so never claim you produced, cropped or edited an image yourself.',
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
    'Aguka AI ntishobora gusubiza ubu kuko nta rumufunguzo wa AI bashyizeho kuri iyi serveri (GEMINI_API_KEY cyangwa OPENAI_API_KEY). Bashyiraho rumwe hanyuma ongera umbaze.',
  ENGLISH:
    'Aguka AI cannot reply right now because no AI provider key is configured on this server (GEMINI_API_KEY, or OPENAI_API_KEY as the rescue). Set one and send your message again.',
};

const AI_UNAVAILABLE: Record<'KINYARWANDA' | 'ENGLISH', string> = {
  KINYARWANDA:
    'Aguka AI ntiyabashije gusubiza ubu kuko ingendo zose z\'ibutabazi zananiranye. Nta kiguzi cyakoreshejwe — ongera mu kanya nk\'ako guhumbya.',
  ENGLISH:
    'Aguka AI could not get an answer from any AI provider just now, and nothing was counted against your usage. Please try again in a moment.',
};

/**
 * Wording that asks for a picture to be made or retouched. Decided in code, not
 * by trusting a system prompt: a text model asked to edit a photo either claims it
 * did or, when the image endpoint is misconfigured, its raw provider error gets
 * texted to a person on WhatsApp.
 */
const IMAGE_PRODUCTION_MARKERS = [
  'kora ifoto', 'kora foto', 'koraimage', 'guhindura ifoto', 'kuraho inyuma', 'isura ryiza',
  'edit photo', 'edit picture', 'make a photo', 'make an image', 'make me a photo',
  'generate image', 'generate a photo', 'create a photo', 'create an image', 'create a picture',
  'remove background', 'change background', 'delete background', 'erase background',
  'resize photo', 'crop photo', 'retouch', 'photoshop',
];

/**
 * A literal "edit photo" does not match "edit my photo" or "remove the background",
 * and those are what people actually type. Each marker becomes a pattern whose
 * word gaps accept articles, possessives and a plural, so the gate cannot be walked
 * past by an article — an unrecognised edit request would otherwise reach the text
 * model, or worse, an uploaded photo with such a caption would be filed as a payment
 * receipt.
 */
const IMAGE_PRODUCTION_PATTERNS = IMAGE_PRODUCTION_MARKERS.map((marker) => {
  const words = marker
    .split(' ')
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + 's?');
  const gap = String.raw`(?:\s+(?:the|a|an|to|my|your|his|her|for|me|it|up)?){0,3}`;
  return new RegExp(words.join(gap), 'i');
});

/**
 * A picture token that means the person is talking about an image at all.
 */
const IMAGE_SUBJECT_TOKENS = ['ifoto', 'amafoto', 'foto', 'igishushanyo', 'photo', 'image', 'background'];

/**
 * Stems for "make / change / strip / repair". Kinyarwanda conjugates the verb into
 * the request — "unkore ifoto", "ukureho background" — so a literal phrase list
 * silently misses polite and object-prefixed forms and the request falls through to
 * the text model. Bare "kora" is deliberately not a stem: "nikora iki ku ifoto"
 * ("what do I do about this photo") is a guidance question. `koresh*` ("use") is
 * removed first because "nkoresha" contains "nkore".
 */
const IMAGE_PRODUCTION_STEMS = [
  'nkore', 'gukora', 'guhindura', 'hindura', 'hinduye', 'hindurira',
  'kuraho', 'kureho', 'kurana', 'sanisha', 'sanur', 'isura',
];

export function requestsImageProduction(text: string): boolean {
  const t = text.toLowerCase();
  if (IMAGE_PRODUCTION_PATTERNS.some((pattern) => pattern.test(t))) return true;
  const cleaned = t.replace(/koresh\w*/g, ' ');
  if (!IMAGE_SUBJECT_TOKENS.some((token) => cleaned.includes(token))) return false;
  return IMAGE_PRODUCTION_STEMS.some((stem) => cleaned.includes(stem));
}

export const IMAGE_STUDIO_OFF: Record<'KINYARWANDA' | 'ENGLISH', string> = {
  KINYARWANDA:
    "Studio y'ifoto ntiremewe kuri iyi serveri, bityo ntabwo nakora ifoto cyangwa ngahindura iyari isanzwe ubu. Nshobora kuguha amategeko y'ifoto ya pasiporo (35x45mm, inyuma y'umweru utagira ikindi) n'inama y'ifoto ya CV. Nyamuneka koresha porogaramu y'isanisha ifoto ku dosiye yawe.",
  ENGLISH:
    'The photo studio is not enabled on this server, so I cannot create a photo, remove its background or edit one right now. What I can give you: the Rwanda passport photo standards (35x45mm, plain light background) and CV portrait guidance. For the file itself, use a photo editor on your phone or computer.',
};

export const IMAGE_STUDIO_FAILED: Record<'KINYARWANDA' | 'ENGLISH', string> = {
  KINYARWANDA:
    "Ntabwo nabashije gukora iyo foto ubu, kandi nta kiguzi cyakoreshejwe. Nyamuneka ongera mu kanya nk'ako guhumbya cyangwa uvuge neza uko wifuzaga ifoto.",
  ENGLISH:
    'The photo studio could not produce that image, and nothing was counted against your usage. Please try again in a moment, or describe the photo you wanted more specifically.',
};

export function buildStudioReply(
  lang: 'KINYARWANDA' | 'ENGLISH',
  width: number,
  height: number,
  taskId: string,
  expiresAt: string
): string {
  const date = new Date(expiresAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  return lang === 'ENGLISH'
    ? `Here is your photo, cropped to ${width}x${height} pixels in the 35x45mm passport ratio (task ${taskId}). The file is kept privately on this server until ${date}, then deleted. Not right? Send this photo back and say what to change.`
    : `Ifoto yawe iranoze, ingano ya ${width}x${height} mu gipimo cya 35x45mm cya pasiporo (nimero ${taskId}). Ijyubatswe mu nganda z'ibanga kugeza ${date}, hanyuma igasibwa. Ntiyagenze neza? Unonishe iyo foto uvuge icyo uhindura.`;
}

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

  // 2. Entitlement gate. Charging and trial expiry are enforced here, on the
  //    server, before any model call — never by asking the model to behave. It
  //    comes before the image studio so a locked account cannot spend a render.
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

  // 3. Image production. Only the studio can make a file, so the request is
  //    handled here in code instead of being handed to the text model, which would
  //    describe a photo it never rendered. Usage is consumed only when pixels
  //    actually came back, and the provider's own error text stays in the log.
  if (requestsImageProduction(sanitization.cleanText)) {
    const capability = resolveImageCapability();
    const studioButtons = AGENT_BUTTONS.IMAGE_STUDIO.map((b) => ({
      id: b.id,
      title: replyLang === 'KINYARWANDA' ? b.rw : b.en,
    }));

    if (!capability.configured) {
      const latencyMs = Date.now() - startTime;
      repo.recordAgentRun(
        {
          conversationId: conversation.id,
          agentType,
          intentDetected: 'IMAGE_STUDIO_NOT_CONFIGURED',
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
        intent: 'IMAGE_STUDIO_NOT_CONFIGURED',
        detectedLanguage: lang,
        replyText: IMAGE_STUDIO_OFF[replyLang],
        buttons: studioButtons,
        tokensUsed: 0,
        latencyMs,
        modelUsed: 'capability-gate',
        toolCalls: [],
      };
    }

    const renderStart = Date.now();
    const studio = await runImageStudio({
      userId: user.id,
      userName: user.fullName || 'User',
      request: sanitization.cleanText,
    });
    const latencyMs = Date.now() - startTime;

    if (!studio.ok) {
      logger.error('IMAGE_STUDIO_FAILED', new Error(studio.error), {
        metadata: { provider: studio.provider, model: studio.model, userId: user.id, conversationId: conversation.id },
      });
      repo.recordAgentRun(
        {
          conversationId: conversation.id,
          agentType: 'IMAGE_STUDIO',
          intentDetected: 'IMAGE_STUDIO_FAILED',
          modelUsed: studio.model || capability.model,
          tokensInput: 0,
          tokensOutput: 0,
          latencyMs,
          status: 'FAILED',
          toolCallsCount: 1,
        },
        [
          {
            toolName: 'image_studio_render',
            arguments: { provider: studio.provider, request: redactSecrets(sanitization.cleanText) },
            result: { error: studio.error },
            latencyMs: Date.now() - renderStart,
            redacted: true,
          },
        ]
      );

      return {
        agentType: 'IMAGE_STUDIO',
        intent: 'IMAGE_STUDIO_FAILED',
        detectedLanguage: lang,
        replyText: IMAGE_STUDIO_FAILED[replyLang],
        buttons: studioButtons,
        tokensUsed: 0,
        latencyMs,
        modelUsed: studio.model || capability.model,
        toolCalls: [],
      };
    }

    if (service) consumeUsage(user, service.code);
    repo.recordAgentRun(
      {
        conversationId: conversation.id,
        agentType: 'IMAGE_STUDIO',
        intentDetected: 'IMAGE_STUDIO_PRODUCED',
        modelUsed: studio.model,
        tokensInput: 0,
        tokensOutput: 0,
        latencyMs,
        status: 'COMPLETED',
        toolCallsCount: 1,
      },
      [
        {
          toolName: 'image_studio_render',
          arguments: { provider: studio.provider, request: redactSecrets(sanitization.cleanText) },
          result: {
            taskId: studio.taskId,
            width: studio.width,
            height: studio.height,
            sizeBytes: studio.sizeBytes,
            expiresAt: studio.expiresAt,
          },
          latencyMs: Date.now() - renderStart,
          redacted: true,
        },
      ]
    );

    return {
      agentType: 'IMAGE_STUDIO',
      intent: 'IMAGE_STUDIO_PRODUCED',
      detectedLanguage: lang,
      replyText: buildStudioReply(replyLang, studio.width, studio.height, studio.taskId, studio.expiresAt),
      image: attachmentOf(studio),
      tokensUsed: 0,
      latencyMs,
      modelUsed: studio.model,
      toolCalls: [],
    };
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

  // 6. Ask the provider chain; never answer from a scripted reply
  const chain = chainSummary();
  let replyText = '';
  let modelUsed = 'not-configured';
  let tokensInput = 0;
  let tokensOutput = 0;
  let tokensUsed = 0;
  let status: 'COMPLETED' | 'FAILED' = 'FAILED';

  if (!chain.configured) {
    replyText = AI_NOT_CONFIGURED[replyLang];
  } else {
    const platformData = contextParts.length
      ? `\n\nPlatform data (the only facts you may cite):\n${contextParts.join('\n')}`
      : '';
    const prompt =
      `User name: ${user.fullName || 'User'}\n` +
      `Reply language: ${replyLang === 'KINYARWANDA' ? 'Kinyarwanda' : 'English'}\n` +
      `User message: "${sanitization.cleanText}"${platformData}`;

    try {
      const generated = await generateText(prompt, AGENT_SYSTEM_INSTRUCTIONS[agentType]);
      modelUsed = generated.fellBack ? `${generated.model} (rescue)` : generated.model;
      tokensInput = generated.tokensInput;
      tokensOutput = generated.tokensOutput;
      tokensUsed = generated.tokensUsed;
      replyText = generated.text;
      status = 'COMPLETED';
    } catch (err: unknown) {
      // A 404 for a wrong model id, a quota message or a TLS failure is an operator
      // detail. Keep it in the log and the agent run, not in the reply sent to a
      // person on WhatsApp. The chain already tried the rescue provider by now, so
      // reaching this branch means nothing answered.
      const attempts =
        err instanceof AllTextProvidersFailed ? err.attempts : [(err instanceof Error ? err.message : String(err))];
      logger.error('AI_GENERATION_FAILED', err instanceof Error ? err : new Error(attempts.join(' | ')), {
        metadata: {
          order: chain.order.map((p) => `${p.provider}:${p.model}`).join(' → '),
          attempts,
          agentType,
          conversationId: conversation.id,
        },
      });
      modelUsed = `chain-failed:${chain.order.map((p) => p.model).join(',')}`;
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
