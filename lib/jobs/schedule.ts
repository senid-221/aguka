import { jobDiscoveryConfig } from '@/lib/config';
import type { CrawlRunResult, SourceCrawlResult } from '@/lib/jobs/crawler';

export interface JobScheduleOptions {
  env?: NodeJS.ProcessEnv;
  /** Injectable sweep so the schedule can be tested without a board or a repository. */
  crawl?: (onResult: (result: SourceCrawlResult) => void) => Promise<CrawlRunResult>;
}

/**
 * The worker's job-board schedule: crawl on start, then on the configured interval.
 * A slow board can never overlap itself — a tick while a crawl runs is skipped, not queued.
 *
 * @returns a stop function that clears the timer.
 */
export async function startJobSourceSchedule(
  log: (line: string) => void,
  options: JobScheduleOptions = {}
): Promise<() => void> {
  const { crawlIntervalMinutes: minutes } = jobDiscoveryConfig(options.env);
  if (minutes === 0) {
    log('Job board crawl schedule disabled (JOB_CRAWL_INTERVAL_MINUTES=0). Use the Jobs screen button.');
    return () => {};
  }

  const crawl =
    options.crawl ??
    (async (onResult: (result: SourceCrawlResult) => void) => {
      const { crawlAllSources } = await import('@/lib/jobs/crawler');
      const { repo } = await import('@/lib/db/repository');
      return crawlAllSources(repo, {}, onResult);
    });

  let running = false;
  const runOnce = async (trigger: string) => {
    if (running) return;
    running = true;
    try {
      // Each board is logged as it finishes: one slow site must not hide the results
      // already collected from the others.
      const run = await crawl((result) =>
        log(
          `crawl(${trigger}) ${result.sourceCode}: ${result.status} — ${result.note}` +
            (result.stored || result.refreshed ? `, ${result.stored} new / ${result.refreshed} refreshed` : '')
        )
      );
      log(`crawl(${trigger}) done: ${run.stored} new, ${run.refreshed} refreshed across ${run.results.length} board(s).`);
    } catch (err: unknown) {
      log(`crawl(${trigger}) failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      running = false;
    }
  };

  log(`Job board crawl scheduled every ${minutes} minute(s), starting now.`);
  void runOnce('startup');
  const timer = setInterval(() => void runOnce('timer'), minutes * 60_000);

  return () => clearInterval(timer);
}
