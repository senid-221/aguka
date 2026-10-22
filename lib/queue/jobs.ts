/**
 * The single place background jobs actually do their work.
 *
 * Both queue engines — the in-process fallback and the BullMQ worker — run a job
 * through `runJob`, so a job cannot behave differently depending on how it was
 * delivered. Handlers report real counters only; a job that could not do anything
 * says why instead of returning a plausible number.
 */

import { repo } from '@/lib/db/repository';
import { logger } from '@/lib/logging/logger';
import { runRetentionCleanup } from '@/lib/maintenance/retention';
import { crawlAllSources, crawlOneSource, type SourceCrawlResult } from '@/lib/jobs/crawler';

export interface JobOutcome {
  processedCount: number;
  detail: string;
}

export type JobHandler = (data: Record<string, unknown>) => JobOutcome | Promise<JobOutcome>;

function describeCrawl(result: SourceCrawlResult): string {
  if (result.status === 'OK') {
    return `${result.sourceCode}: read ${result.read}, stored ${result.stored} new / ${result.refreshed} refreshed${result.skipped ? `, skipped ${result.skipped}` : ''}`;
  }
  return `${result.sourceCode}: ${result.status} — ${result.note}`;
}

const handlers: Record<string, JobHandler> = {
  CRAWL_JOB_SOURCES: async () => {
    const run = await crawlAllSources(repo);
    const detail = run.results.map(describeCrawl).join(' | ');
    logger.info('JOB_CRAWL_SUMMARY', detail, {
      metadata: { stored: run.stored, refreshed: run.refreshed },
    });
    return { processedCount: run.stored + run.refreshed, detail };
  },

  // Kept as the per-board name it was first scheduled under; crawls one board.
  CRAWL_MIFOTRA_VACANCIES: async (data) => {
    const sourceCode = String(data.sourceCode || 'MIFOTRA');
    const result = await crawlOneSource(sourceCode, repo);
    return {
      processedCount: result.stored + result.refreshed,
      detail: describeCrawl(result),
    };
  },

  CLEANUP_EXPIRED_MEDIA_RETENTION: () => {
    const report = runRetentionCleanup();
    return {
      processedCount: report.expiredIds.length,
      detail: `scanned ${report.scanned} media task(s), ${report.expiredIds.length} past retention`,
    };
  },

  DISPATCH_BILINGUAL_JOB_ALERTS: () => ({
    processedCount: 0,
    detail:
      'NOT_DISPATCHED: job alerts need per-user JOB_ALERTS opt-in records, which this build does not store. Wire the consent store before scheduling this job.',
  }),
  // The automated suite enqueues this to prove the delivery path. It needs a real
  // handler, otherwise a passing test dead-letters a job on a production queue.
  TEST_BACKGROUND_JOB: () => ({
    processedCount: 0,
    detail: 'queue delivery probe — no work to do',
  }),
};

export async function runJob(
  name: string,
  data: Record<string, unknown>,
  ref = ''
): Promise<JobOutcome> {
  const handler = handlers[name];
  if (!handler) {
    const detail = `NO_HANDLER: "${name}" is not a scheduled job in this build, so nothing ran.`;
    logger.warn('JOB_NO_HANDLER', detail, { metadata: { jobRef: ref, name } });
    return { processedCount: 0, detail };
  }

  const outcome = await handler(data || {});
  logger.info('JOB_EXECUTED', `${name} → ${outcome.detail}`, {
    metadata: { jobRef: ref, processedCount: outcome.processedCount },
  });
  return outcome;
}
