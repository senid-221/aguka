import { jobDiscoveryConfig } from '@/lib/config';
import { logger } from '@/lib/logging/logger';
import { repo } from '@/lib/db/repository';
import { crawlAllSources } from '@/lib/jobs/crawler';

/**
 * The schedule that keeps the job pool full runs in `npm run worker`, which needs an
 * always-on process. A serverless host has no such thing: every cold instance starts
 * with zero listings, so the first job seeker of the day is told nothing is stored
 * even though the boards are public and readable. This reads the boards inside the
 * turn that needs them, once per process, with a wall-clock budget so a board that
 * answers slowly cannot hold a WhatsApp reply hostage — the boards that finished are
 * already stored, and the rest keep reading in the background.
 */

export interface LazyCrawlOutcome {
  ran: boolean;
  /** Plain words, recorded on the agent run and in the log. */
  reason: string;
  activeVerified: number;
  gained: number;
  boardsRead: number;
  budgetHit: boolean;
  latencyMs: number;
}

let inFlight: Promise<LazyCrawlOutcome> | null = null;
let lastAttemptAt = 0;

export function jobStoreFreshness(): { activeVerified: number; lastCrawledAt: number | null } {
  const activeVerified = repo.getJobs({ verificationStatus: 'VERIFIED', activeOnly: true }).length;
  const crawled = repo
    .getSources()
    .map((s) => Date.parse(s.lastCrawledAt || ''))
    .filter((t) => !Number.isNaN(t));
  return { activeVerified, lastCrawledAt: crawled.length ? Math.max(...crawled) : null };
}

/** Only for the hermetic suite: the guards above are process state, not stored state. */
export function resetLazyCrawlState(): void {
  inFlight = null;
  lastAttemptAt = 0;
}

export async function ensureJobListings(
  options: {
    env?: NodeJS.ProcessEnv;
    now?: () => number;
    crawl?: () => Promise<unknown>;
    budgetMs?: number;
    cooldownMs?: number;
    /** Replaced by the suite so a check can decide what the store looks like. */
    read?: () => { activeVerified: number; lastCrawledAt: number | null };
  } = {}
): Promise<LazyCrawlOutcome> {
  const env = options.env ?? process.env;
  const now = (options.now ?? Date.now)();
  const started = Date.now();
  const read = options.read ?? jobStoreFreshness;
  const skip = (reason: string): LazyCrawlOutcome => ({
    ran: false,
    reason,
    activeVerified: read().activeVerified,
    gained: 0,
    boardsRead: 0,
    budgetHit: false,
    latencyMs: Date.now() - started,
  });

  const discovery = jobDiscoveryConfig(env);
  if (!discovery.onDemandCrawl) {
    return skip('on-demand board reading is switched off (JOB_ON_DEMAND_CRAWL=false)');
  }

  const { activeVerified, lastCrawledAt } = read();
  const intervalMs = Math.max(discovery.crawlIntervalMinutes, 1) * 60_000;
  const fresh =
    activeVerified > 0 && lastCrawledAt !== null && now - lastCrawledAt <= intervalMs;
  if (fresh) {
    return skip(`${activeVerified} active verified listing(s) are already stored from a crawl this fresh`);
  }

  const cooldownMs = options.cooldownMs ?? discovery.onDemandCooldownMs;
  if (now - lastAttemptAt < cooldownMs) {
    return skip(`the boards were already attempted ${Math.max(0, Math.round((now - lastAttemptAt) / 1000))}s ago`);
  }

  if (inFlight) {
    const joined = await inFlight;
    return { ...joined, ran: false, reason: 'joined the board reading already running in this process' };
  }

  lastAttemptAt = now;
  const budgetMs = options.budgetMs ?? discovery.onDemandBudgetMs;

  const work = (async (): Promise<LazyCrawlOutcome> => {
    const run = (options.crawl ?? (() => crawlAllSources(repo)))();

    let timer: ReturnType<typeof setTimeout> | undefined;
    const budget = new Promise<'budget'>((resolve) => {
      // Kept alive on purpose: a board read that holds no socket would otherwise let
      // the process exit with the reply still waiting on it. It is cleared the moment
      // either side settles, so it never outlives the turn it guards.
      timer = setTimeout(() => resolve('budget'), budgetMs);
    });

    // Never let a board's failure become the person's problem.
    run.catch((err: unknown) =>
      logger.warn('JOB_ON_DEMAND_CRAWL', err instanceof Error ? err.message : String(err))
    );

    const settled = await Promise.race([run.then(() => 'finished' as const, () => 'finished' as const), budget]);
    clearTimeout(timer);

    const after = read();
    const boardsRead = repo
      .getSources()
      .filter((s) => s.lastCrawlStatus !== null && Date.parse(s.lastCrawledAt || '') >= started).length;

    const outcome: LazyCrawlOutcome = {
      ran: true,
      reason:
        after.activeVerified === 0
          ? `read the boards just now and nothing usable came back — ${
              repo.getSources().find((s) => s.lastCrawlNote)?.lastCrawlNote || 'no board reported a reason'
            }`
          : `read the boards just now: ${after.activeVerified} active verified listing(s) available${
              settled === 'budget' ? ' (the slow boards keep reading in the background)' : ''
            }`,
      activeVerified: after.activeVerified,
      gained: Math.max(0, after.activeVerified - activeVerified),
      boardsRead,
      budgetHit: settled === 'budget',
      latencyMs: Date.now() - started,
    };

    logger.info('JOB_ON_DEMAND_CRAWL', outcome.reason, {
      metadata: { gained: outcome.gained, boardsRead: outcome.boardsRead, budgetHit: outcome.budgetHit },
    });
    return outcome;
  })();

  inFlight = work;
  try {
    return await work;
  } finally {
    if (inFlight === work) inFlight = null;
  }
}
