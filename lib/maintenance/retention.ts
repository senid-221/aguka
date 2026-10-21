import { repo } from '@/lib/db/repository';
import { logger } from '@/lib/logging/logger';

/**
 * Enforces the 30-day media retention policy: reports media tasks whose
 * retention window has elapsed so the storage layer can delete the objects.
 */
export interface RetentionReport {
  scanned: number;
  expiredIds: string[];
  runAt: string;
}

export function findExpiredMedia(now: number = Date.now()): RetentionReport {
  const tasks = repo.getMediaTasks();
  const expiredIds = tasks
    .filter((t) => now - new Date(t.createdAt).getTime() > t.retentionDays * 86_400_000)
    .map((t) => t.id);
  return { scanned: tasks.length, expiredIds, runAt: new Date(now).toISOString() };
}

export function runRetentionCleanup(now: number = Date.now()): RetentionReport {
  const report = findExpiredMedia(now);
  logger.info('MEDIA_RETENTION_SWEEP', `Found ${report.expiredIds.length} expired media task(s)`, {
    metadata: { scanned: report.scanned, expiredIds: report.expiredIds },
  });
  return report;
}
