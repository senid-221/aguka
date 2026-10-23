import { AgentType } from '@/lib/types';
import { chainSummary, generateText, AllTextProvidersFailed, type GroundedSource } from './provider-adapter';
import { redactSecrets } from './prompt-security';

/**
 * Decides, in code, whether a turn needs a live Google Search.
 *
 * This is deliberately not a line in the system prompt. A model that is merely
 * *asked* to look things up either never does, or claims it did. Here the decision
 * is made from the message and from what the store snapshot actually contains, and
 * the search only happens when the gate says so — the same pattern the image studio
 * and the exam verification gate use.
 *
 * The academy is excluded on purpose: Rwandan traffic law, speed limits, fines and
 * sign meanings may only come from the verified rule registry. A random page that
 * states a wrong limit is worse than no answer at all, so a road-safety turn is
 * never answered from web search.
 */

/**
 * A clear request to look something up outside Aguka's own data. Recency words such
 * as "latest" are deliberately absent: "latest jobs" means the newest crawled
 * listings, and answering that from a web page would be a downgrade.
 */
const RESEARCH_MARKERS = [
  // English
  'search', 'google', 'look up', 'find online', 'on the internet', 'on internet', 'online',
  'check the web', 'verify online', 'web search',
  // Kinyarwanda (stems, because the language conjugates around the verb)
  'shakisha', 'kuri interineti', 'ku mutambagiro', 'gera kuri interineti', 'mbe mbibaze kuri',
];

/** Facts that change, so a stored answer is wrong the moment it ages. */
const CURRENT_FACT_MARKERS = [
  'price of', 'prices of', 'the cost of', 'how much is', 'how much does', 'salary of', 'salary for',
  'fuel price', 'pump price', 'exchange rate', 'weather', 'forecast', 'election result',
  'match result', 'ranking', 'population', 'opening date', 'closing date', 'registration deadline',
  'is it open', 'still hiring', 'news about', 'what is the',
  'igiciro cya', 'ibiciro bya', 'umurahara wa', 'angana iki', 'ikirere', 'imvura',
  'uko biri ubu', 'igihe cy\'ubu', 'amakuru y\'ubu', 'amakuru mashya',
];

const PLATFORM_LOCAL_MARKERS = [
  'my cv', 'my photo', 'my passport', 'my account', 'my payment', 'my order', 'my trial', 'my lesson',
  'my exam', 'my paper', 'my score', 'my profile', 'my job alert', 'my application',
  'cv yanjye', 'ifoto yanjye', 'konti yanjye', 'ubwishyu bwanjye', 'ikizamini cyanjye',
  'amasomo yanjye', 'umwanya wanjye',
];

function hasMarker(text: string, markers: string[]): boolean {
  return markers.some((marker) => text.includes(marker));
}

/**
 * Which stored section the question depends on, and whether that section came back
 * empty. A job seeker who is told "no verified listing is stored" is better served
 * by a real search than by an apology, while the same person with five listings on
 * record should get those listings, not a web page.
 */
function dependsOnMissingData(text: string, snapshot: string[]): { missing: boolean; section: string } {
  const joined = snapshot.join('\n');

  const wantsJobs = /akazi|imirimo|job|vacanc|employer|umushahara|umurimo/i.test(text);
  if (wantsJobs && /Verified listings: NONE/i.test(joined)) return { missing: true, section: 'verified jobs' };

  const wantsMarketplace = /hire|umukozi|talent|worker|freelance|service provider|isoko/i.test(text);
  if (wantsMarketplace && /0 worker profile\(s\) on record/i.test(joined)) {
    return { missing: true, section: 'talent marketplace' };
  }

  return { missing: false, section: '' };
}

export interface ResearchDecision {
  research: boolean;
  /** Stated in plain words and recorded on the agent run, so the console explains itself. */
  reason: string;
}

export function needsWebSearch(
  currentText: string,
  agentType: AgentType,
  snapshot: string[]
): ResearchDecision {
  const capability = chainSummary();

  if (agentType === 'ROAD_SAFETY_ACADEMY') {
    return {
      research: false,
      reason: 'road safety is answered only from the verified rule registry, never from a web page',
    };
  }

  if (!capability.configured) {
    return { research: false, reason: 'no AI text provider is configured on this server' };
  }

  if (!capability.webSearchConfigured) {
    return {
      research: false,
      reason: 'no search-capable provider is available (set GEMINI_API_KEY, or OPENAI_SEARCH_MODEL)',
    };
  }

  const text = currentText.toLowerCase();

  // Something the platform holds is asked about: answer from the store, not the web.
  if (hasMarker(text, PLATFORM_LOCAL_MARKERS)) {
    return { research: false, reason: 'the question is about this person\'s own records, which the store holds' };
  }

  if (hasMarker(text, RESEARCH_MARKERS)) {
    return { research: true, reason: 'the person asked for a live lookup' };
  }

  if (hasMarker(text, CURRENT_FACT_MARKERS)) {
    return { research: true, reason: 'the answer depends on a fact that changes over time' };
  }

  const gap = dependsOnMissingData(text, snapshot);
  if (gap.missing) {
    return { research: true, reason: `nothing about ${gap.section} is stored on this server` };
  }

  return { research: false, reason: 'the platform data already answers it' };
}

/**
 * The rules that keep a searched answer honest. Web results are not Aguka-verified,
 * so they may never be presented as one of the platform's own listings, prices or
 * rules, and the person must be able to tell which part came from the search.
 */
export const RESEARCH_RULES =
  'A live Google Search was run for this question and the pages it read are attached to your answer. ' +
  'Use only what those pages say for anything outside this platform, and give the page it came from. ' +
  'Web results are NOT Aguka-verified jobs, prices or rules: say which part of your answer came from the web ' +
  'and which part comes from Aguka\'s own records. If the search did not answer the question, say so instead of ' +
  'filling the gap from memory. Keep URLs exactly as given, never invent one.';

export interface SearchedAnswer {
  ok: boolean;
  text: string;
  sources: GroundedSource[];
  queries: string[];
  model: string;
  provider: string;
  tokensInput: number;
  tokensOutput: number;
  tokensUsed: number;
  latencyMs: number;
  /** Why a requested search did not happen, when it did not. */
  error?: string;
}

/**
 * Runs one searched turn. The chain already refuses providers that cannot browse,
 * so an answer here either carries real pages or reports why it could not.
 */
export async function searchAndAnswer(
  prompt: string,
  systemInstruction: string,
  temperature?: number
): Promise<SearchedAnswer> {
  const started = Date.now();
  try {
    const generated = await generateText(prompt, systemInstruction, { search: true, temperature });
    return {
      ok: true,
      text: redactSecrets(generated.text),
      sources: generated.sources ?? [],
      queries: generated.searchQueries ?? [],
      model: generated.model,
      provider: generated.fellBack ? `${generated.provider} (rescue)` : generated.provider,
      tokensInput: generated.tokensInput,
      tokensOutput: generated.tokensOutput,
      tokensUsed: generated.tokensUsed,
      latencyMs: Date.now() - started,
    };
  } catch (err: unknown) {
    const attempts =
      err instanceof AllTextProvidersFailed ? err.attempts : [err instanceof Error ? err.message : String(err)];
    return {
      ok: false,
      text: '',
      sources: [],
      queries: [],
      model: 'search-failed',
      provider: 'none',
      tokensInput: 0,
      tokensOutput: 0,
      tokensUsed: 0,
      latencyMs: Date.now() - started,
      error: attempts.join(' | ').slice(0, 400),
    };
  }
}

const MAX_SOURCES = 3;

/**
 * A WhatsApp text message has no footnote support, so the pages are listed after the
 * answer. Nothing is printed when the search ran but returned no readable source —
 * claiming a citation that was never fetched would be worse than admitting it.
 */
export function formatSources(sources: GroundedSource[], replyLang: 'KINYARWANDA' | 'ENGLISH'): string {
  if (sources.length === 0) return '';
  const label = replyLang === 'KINYARWANDA' ? 'Inkomoko' : 'Sources';
  const lines = sources
    .slice(0, MAX_SOURCES)
    .map((s) => `- ${s.title.replace(/\s+/g, ' ').slice(0, 80)}: ${s.url}`)
    .join('\n');
  return `\n\n${label}:\n${lines}`;
}

/**
 * Told plainly when the person asked to look something up and no provider could do
 * it. The turn is still answered from the store, so this line only marks what could
 * not be checked.
 */
export const SEARCH_UNAVAILABLE: Record<'KINYARWANDA' | 'ENGLISH', string> = {
  KINYARWANDA:
    'Ntabwo nabashije gushakisha kuri interineti ubu (serivisi yo gushakisha ntiyakoresheje neza), bityo ibi bikurikira bishingiye ku makuru Aguka ifite gusa.',
  ENGLISH:
    'Live web search did not run for this reply, so what follows comes only from what Aguka holds on file.',
};
