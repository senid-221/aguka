import { repo } from '@/lib/db/repository';
import { durableStore } from '@/lib/db/store';
import { logger } from '@/lib/logging/logger';

/**
 * Enforces the media retention policy: finds tasks whose window has elapsed and
 * deletes the private files they point at, so a generated portrait does not
 * outlive the reason it was made.
 */
export interface RetentionReport {
  scanned: number;
  expiredIds: string[];
  runAt: string;
}

export interface RetentionCleanupReport extends RetentionReport {
  /** Expired tasks that held a stored file. */
  withFiles: number;
  /** Files actually removed from the data directory. */
  deletedFiles: number;
}

export function findExpiredMedia(now: number = Date.now()): RetentionReport {
  const tasks = repo.getMediaTasks();
  const expiredIds = tasks
    .filter((t) => now - new Date(t.createdAt).getTime() > t.retentionDays * 86_400_000)
    .map((t) => t.id);
  return { scanned: tasks.length, expiredIds, runAt: new Date(now).toISOString() };
}

export function runRetentionCleanup(now: number = Date.now()): RetentionCleanupReport {
  const report = findExpiredMedia(now);
  const tasks = repo.getMediaTasks();

  let withFiles = 0;
  let deletedFiles = 0;
  for (const id of report.expiredIds) {
    const stored = tasks.find((t) => t.id === id)?.processedUrl;
    const key = stored && stored.startsWith('stored:') ? stored.slice('stored:'.length) : null;
    if (!key) continue;
    withFiles += 1;
    // The task record stays as history; only the bytes are removed.
    if (durableStore.deleteBinary(key)) {
      repo.updateMediaTask(id, { processedUrl: `purged:${key}` });
      deletedFiles += 1;
    }
  }

  logger.info(
    'MEDIA_RETENTION_SWEEP',
    `Deleted ${deletedFiles} of ${withFiles} expired file(s) across ${report.expiredIds.length} task(s)`,
    { metadata: { scanned: report.scanned, expiredIds: report.expiredIds, withFiles, deletedFiles } }
  );
  return { ...report, withFiles, deletedFiles };
}
