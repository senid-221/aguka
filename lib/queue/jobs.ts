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

export interface JobOutcome {
  processedCount: number;
  detail: string;
}

export type JobHandler = (data: Record<string, unknown>) => JobOutcome | Promise<JobOutcome>;

const handlers: Record<string, JobHandler> = {
  CRAWL_MIFOTRA_VACANCIES: (data) => {
    const sourceCode = String(data.sourceCode || 'MIFOTRA');
    const result = repo.triggerSourceCrawl(sourceCode);
    return {
      processedCount: result.crawledCount,
      detail: `${sourceCode}: ${result.status}, ${result.crawledCount} listing(s) imported`,
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
