import { AgentType, LanguagePreference, Conversation, User } from '@/lib/types';
import { repo } from '@/lib/db/repository';
import { sanitizeUserInput, redactSecrets } from './prompt-security';
import { getAIProvider } from './provider-adapter';

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
export function detectLanguage(text: string): LanguagePreference {
  const t = text.toLowerCase();
  const kinyarwandaKeywords = [
    'muraho', 'bite', 'amakuru', 'akazi', 'mifotra', 'kwandika', 'ibaruwa',
    'ifoto', 'kwiga', 'sobanurira', 'umurimo', 'umushahara', 'ngufashe',
    'ndifuza', 'kuri', 'mu', 'ya', 'ryanjye', 'cyangwa', 'hano', 'nyamuneka'
  ];

  let kinyCount = 0;
  for (const kw of kinyarwandaKeywords) {
    if (t.includes(kw)) kinyCount++;
  }

  if (kinyCount >= 1) {
    return 'KINYARWANDA';
  }
  return 'ENGLISH';
}

/**
 * Classifies message intent into the right specialized agent
 */
export function classifyIntent(text: string): { agentType: AgentType; intent: string } {
  const t = text.toLowerCase();

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
 * Orchestrates the AI Agent execution
 */
export async function executeAgent(
  user: User,
  conversation: Conversation,
  userMessageText: string
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
  const replyLang: 'KINYARWANDA' | 'ENGLISH' = lang === 'KINYARWANDA' ? 'KINYARWANDA' : 'ENGLISH';
  const { agentType, intent } = classifyIntent(sanitization.cleanText);

  // Update conversation active agent
  repo.setConversationAgent(conversation.id, agentType);

  // 2. Collect facts that the model is allowed to repeat
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

  // 3. Ask the configured provider; never answer from a scripted reply
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
      `Reply language: ${lang === 'KINYARWANDA' ? 'Kinyarwanda' : 'English'}\n` +
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
      replyText = `${AI_UNAVAILABLE[replyLang]} (${errorMsg})`;
    }
  }

  const buttonDefinitions = AGENT_BUTTONS[agentType];
  const buttons =
    buttonDefinitions.length > 0
      ? buttonDefinitions.map((b) => ({ id: b.id, title: lang === 'KINYARWANDA' ? b.rw : b.en }))
      : undefined;

  const latencyMs = Date.now() - startTime;

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
