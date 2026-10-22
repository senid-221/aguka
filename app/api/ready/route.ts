import { NextResponse } from 'next/server';
import { parseAndValidateConfig, getEnvPresence } from '@/lib/config';
import { repo } from '@/lib/db/repository';
import { queueService } from '@/lib/queue/redis-queue';
import { getAIProvider, chainSummary } from '@/lib/ai/provider-adapter';

export async function GET() {
  const configResult = parseAndValidateConfig();
  const queueHealth = await queueService.healthCheck();
  const chain = chainSummary();
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
        activeWorkers: queueHealth.activeWorkers,
        error: queueHealth.error ?? '',
      },
      aiProvider: {
        status: aiHealth.ok ? 'PASS' : 'FAIL',
        provider: aiHealth.provider,
        model: aiHealth.model,
        // Reported next to the gate so an operator can see whether a provider outage
        // ends the reply or only costs a few seconds.
        order: chain.order,
        rescueConfigured: chain.rescueConfigured,
        attemptsPerProvider: chain.attemptsPerProvider,
        budgetMs: chain.budgetMs,
      },
      whatsappWebhook: {
        status: systemHealth.whatsappApi.configured ? 'PASS' : 'FAIL',
        mode: systemHealth.whatsappApi.mode,
        verified: systemHealth.whatsappApi.webhookVerified,
      },
      // The studio is optional: an unconfigured image provider must not turn a
      // working WhatsApp deployment into a 503, so this is reported, not gated.
      imageStudio: {
        status: systemHealth.imageStudio.configured ? 'PASS' : 'NOT_CONFIGURED',
        provider: systemHealth.imageStudio.provider,
        model: systemHealth.imageStudio.model,
        output: systemHealth.imageStudio.output,
        retentionDays: systemHealth.imageStudio.retentionDays,
      },
      jobDiscovery: {
        status: configResult.config.jobs.crawlIntervalMinutes > 0 ? 'SCHEDULED' : 'MANUAL_ONLY',
        ...configResult.config.jobs,
        // What each board last actually returned: the interval is a setting, this is the proof.
        boards: repo.getSources().map((source) => ({
          code: source.code,
          name: source.name,
          healthStatus: source.healthStatus,
          lastCrawledAt: source.lastCrawledAt,
          activeListingsCount: source.activeListingsCount,
          lastCrawlStatus: source.lastCrawlStatus ?? null,
          lastCrawlNote: source.lastCrawlNote ?? '',
        })),
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
