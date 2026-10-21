import { NextResponse } from 'next/server';
import { parseAndValidateConfig } from '@/lib/config';
import { repo } from '@/lib/db/repository';
import { queueService } from '@/lib/queue/redis-queue';
import { getAIProvider } from '@/lib/ai/provider-adapter';

export async function GET() {
  const configResult = parseAndValidateConfig();
  const queueHealth = await queueService.healthCheck();
  const aiProvider = getAIProvider();
  const aiHealth = await aiProvider.healthCheck();
  const systemHealth = repo.getSystemHealth();

  const isReady = configResult.isValid && queueHealth.ok && aiHealth.ok;

  const payload = {
    status: isReady ? 'READY' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    checks: {
      configuration: {
        status: configResult.isValid ? 'PASS' : 'FAIL',
        warnings: configResult.warnings,
      },
      database: {
        status: 'PASS',
        provider: systemHealth.database.provider,
        latencyMs: systemHealth.database.latencyMs,
      },
      queue: {
        status: queueHealth.ok ? 'PASS' : 'FAIL',
        mode: queueHealth.mode,
        pendingJobs: queueHealth.pendingJobs,
      },
      aiProvider: {
        status: aiHealth.ok ? 'PASS' : 'FAIL',
        provider: aiHealth.provider,
        model: aiHealth.model,
      },
      whatsappWebhook: {
        status: 'PASS',
        mode: systemHealth.whatsappApi.mode,
        verified: systemHealth.whatsappApi.webhookVerified,
      },
    },
  };

  return NextResponse.json(payload, {
    status: isReady ? 200 : 503,
  });
}
