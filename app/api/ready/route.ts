import { NextResponse } from 'next/server';
import { parseAndValidateConfig, getEnvPresence } from '@/lib/config';
import { repo } from '@/lib/db/repository';
import { queueService } from '@/lib/queue/redis-queue';
import { getAIProvider } from '@/lib/ai/provider-adapter';

export async function GET() {
  const configResult = parseAndValidateConfig();
  const queueHealth = await queueService.healthCheck();
  const aiProvider = getAIProvider();
  const aiHealth = aiProvider
    ? await aiProvider.healthCheck()
    : { ok: false, provider: 'none', model: 'none', latencyMs: 0 };
  const systemHealth = repo.getSystemHealth();

  const isReady = configResult.isValid && queueHealth.ok && aiHealth.ok;

  const payload = {
    status: isReady ? 'READY' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    envPresence: getEnvPresence(),
    checks: {
      configuration: {
        status: configResult.isValid ? 'PASS' : 'FAIL',
        warnings: configResult.warnings,
      },
      database: {
        status: systemHealth.database.status,
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
        status: systemHealth.whatsappApi.configured ? 'PASS' : 'FAIL',
        mode: systemHealth.whatsappApi.mode,
        verified: systemHealth.whatsappApi.webhookVerified,
      },
      payments: {
        status: configResult.config.payments.providerEndpointConfigured ? 'PASS' : 'MANUAL_REVIEW_ONLY',
        ...configResult.config.payments,
      },
      persistence: {
        status: systemHealth.persistence.mode,
        loadedFromDisk: systemHealth.persistence.loadedFromDisk,
        records: systemHealth.persistence.records,
        lastSavedAt: systemHealth.persistence.lastSavedAt,
        lastSaveError: systemHealth.persistence.lastSaveError,
        productionDatabase: systemHealth.productionDatabase,
      },
    },
  };

  return NextResponse.json(payload, {
    status: isReady ? 200 : 503,
  });
}
