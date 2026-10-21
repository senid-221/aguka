import { NextResponse } from 'next/server';
import { repo } from '@/lib/db/repository';
import { queueService } from '@/lib/queue/redis-queue';

export async function GET() {
  const queueHealth = await queueService.healthCheck();
  const health = repo.getSystemHealth();
  return NextResponse.json(
    {
      ...health,
      redisQueue: {
        ...health.redisQueue,
        status: queueHealth.ok
          ? health.redisQueue.status
          : health.redisQueue.mode.startsWith('Redis')
            ? 'UNREACHABLE'
            : health.redisQueue.status,
        mode: queueHealth.mode,
        queuedJobs: queueHealth.pendingJobs,
        lastError: queueHealth.error ?? '',
      },
    },
    { status: 200 }
  );
}
