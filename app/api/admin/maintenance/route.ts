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
    let processed = 0;
    while (queueService.getPendingCount() > 0 && processed < 100) {
      await queueService.processNext();
      processed++;
    }
    return NextResponse.json({ success: true, processed });
  }
  return NextResponse.json({ error: 'Unknown task' }, { status: 400 });
}
