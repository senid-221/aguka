import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/security/admin-auth';
import { runRetentionCleanup } from '@/lib/maintenance/retention';
import { queueService } from '@/lib/queue/redis-queue';

/** Admin-only: POST {"task":"retention"|"drain-queue"} */
export async function POST(request: NextRequest) {
  if (!requireAdmin(request).ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { task } = await request.json().catch(() => ({ task: '' }));

  if (task === 'retention') return NextResponse.json({ success: true, report: runRetentionCleanup() });

  if (task === 'drain-queue') {
    const health = await queueService.healthCheck();

    // BullMQ hands jobs to a worker process; draining from the web server would
    // claim work this process never did.
    if (health.activeWorkers === 0 && health.mode.startsWith('Redis')) {
      return NextResponse.json(
        {
          success: false,
          engine: health.mode,
          pendingJobs: health.pendingJobs,
          error:
            'Jobs on a Redis queue are executed by the worker process (npm run worker). No worker is attached to this server, so nothing was drained here.',
        },
        { status: 503 }
      );
    }

    let processed = 0;
    while (queueService.getPendingCount() > 0 && processed < 100) {
      const settled = await queueService.processNext();
      if (!settled) break;
      processed++;
    }
    return NextResponse.json({ success: true, processed, engine: health.mode, pendingJobs: queueService.getPendingCount() });
  }
  return NextResponse.json({ error: 'Unknown task' }, { status: 400 });
}
