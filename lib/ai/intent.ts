import { AgentType } from '@/lib/types';
import {
  AllTextProvidersFailed,
  generateText,
  type GenerateOptions,
} from './provider-adapter';
import { redactSecrets } from './prompt-security';

/**
 * Which agent should answer this turn.
 *
 * `classifyIntent()` in the router matches words, and words lie: "nkunda code" is a
 * career conversation, "API" appears in a CV question, and a person who picked Find
 * Jobs can still ask about fractions. The keyword result stays the deterministic
 * floor — the model only gets asked when the keywords are silent or point two ways,
 * and its answer is accepted only if it names one of the eight agents this build
 * actually has. A model that returns a category that does not exist, or that times
 * out, cannot misroute anybody: the keyword result answers.
 */

export const KNOWN_AGENT_TYPES: AgentType[] = [
  'ROUTER',
  'JOB_FINDER',
  'CAREER_ASSISTANT',
  'IMAGE_STUDIO',
  'CODING_AGENT',
  'STUDY_TUTOR',
  'EMPLOYMENT_MARKETPLACE',
  'ROAD_SAFETY_ACADEMY',
];

const AGENT_DESCRIPTIONS: Record<AgentType, string> = {
  ROUTER: 'anything else, or a general question about Aguka itself',
  JOB_FINDER: 'finding job listings and vacancies that exist in Rwanda or remote',
  CAREER_ASSISTANT: 'CVs, cover letters, interview preparation, career advice',
  IMAGE_STUDIO: 'passport or CV photographs and image editing',
  CODING_AGENT: 'writing, explaining or debugging software',
  STUDY_TUTOR: 'teaching a school or university subject, quizzes, explanations',
  EMPLOYMENT_MARKETPLACE: 'an employer hiring workers, or a worker offering a service',
  ROAD_SAFETY_ACADEMY: 'Rwandan traffic rules, road signs, driving licence practice and exams',
};

/** Pure, so the suite can prove a malformed model answer is refused. */
export function parseAgentChoice(raw: unknown): AgentType | null {
  const value =
    typeof raw === 'string'
      ? raw
      : String((raw as { agent?: unknown; agentType?: unknown })?.agentType ?? (raw as { agent?: unknown })?.agent ?? '');
  // A model that writes "study tutor" or "Image-Studio" means the same agent, so the
  // separator is folded into the underscore the enum actually uses. Anything else
  // still has to match a category this build has.
  const normalised = value.trim().toUpperCase().replace(/[\s-]+/g, '_').replace(/[^A-Z_]/g, '');
  return (KNOWN_AGENT_TYPES as string[]).includes(normalised) ? (normalised as AgentType) : null;
}

function parseModelJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // Some models wrap the object in a sentence or a code fence even when told not
    // to. Take the first brace pair rather than losing a valid classification.
    const match = /\{[\s\S]*\}/.exec(raw);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

export interface AgentChoiceInput {
  currentText: string;
  /** The service picked from the WhatsApp menu, when there is one. */
  serviceAgentType: AgentType | null;
  /** How many distinct categories the keyword matcher claimed. */
  keywordMatches: number;
  /** The agent the deterministic routing settled on before any model was asked. */
  currentAgentType: AgentType;
  replyLang: 'KINYARWANDA' | 'ENGLISH';
}

/**
 * Asking the model costs money and seconds, so it happens only where the keywords
 * genuinely do not decide: a free-text message with no menu pick whose words either
 * matched nothing or pointed two ways.
 *
 * A menu pick is not overridden — that choice is the person naming their own category
 * and the service they were just charged for. The academy is never asked about either,
 * because an open exam paper is stateful and being re-routed away from it would lose
 * the learner their attempt mid-paper.
 */
export function needsAgentClassification(input: AgentChoiceInput): boolean {
  const text = input.currentText.trim();
  if (text.length < 8) return false;
  if (input.serviceAgentType !== null) return false;
  if (input.currentAgentType === 'ROAD_SAFETY_ACADEMY') return false;
  return input.keywordMatches !== 1;
}

const CLASSIFY_SYSTEM =
  'You classify one WhatsApp message into exactly one support category. Reply with a JSON object ' +
  'containing only {"agent": "<CATEGORY>"}. No explanation, no other keys.';

export function buildClassifyPrompt(currentText: string, serviceAgentType: AgentType | null): string {
  const lines = KNOWN_AGENT_TYPES.filter((a) => a !== 'ROUTER').map((a) => `- ${a}: ${AGENT_DESCRIPTIONS[a]}`);
  return [
    'Categories:',
    ...lines,
    `- ROUTER: ${AGENT_DESCRIPTIONS.ROUTER}`,
    serviceAgentType
      ? `This person's selected service is served by ${serviceAgentType}. Choose it again only if the message really is about that.`
      : 'This person has no selected service.',
    `Message: "${redactSecrets(currentText).slice(0, 500)}"`,
  ].join('\n');
}

export interface AgentClassification {
  agentType: AgentType | null;
  /** Why the answer is what it is, for the console and the test output. */
  note: string;
}

const CLASSIFY_OPTIONS: GenerateOptions = { json: true, temperature: 0 };

/**
 * Never throws and never blocks a reply: whatever happens, the caller keeps the
 * keyword routing. Classification is an improvement, not a dependency.
 */
export async function classifyAgentWithModel(
  currentText: string,
  serviceAgentType: AgentType | null
): Promise<AgentClassification> {
  try {
    const result = await generateText(
      buildClassifyPrompt(currentText, serviceAgentType),
      CLASSIFY_SYSTEM,
      CLASSIFY_OPTIONS
    );
    const chosen = parseAgentChoice(parseModelJson(result.text));
    if (!chosen) {
      return { agentType: null, note: `model named no known category (${result.text.slice(0, 60)})` };
    }
    return { agentType: chosen, note: `model chose ${chosen}` };
  } catch (err: unknown) {
    const reason =
      err instanceof AllTextProvidersFailed ? err.attempts[0] : err instanceof Error ? err.message : String(err);
    return { agentType: null, note: `model classification unavailable: ${redactSecrets(reason).slice(0, 120)}` };
  }
}
