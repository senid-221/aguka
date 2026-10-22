'use client';

import React, { useState, useEffect } from 'react';
import {
  Settings,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Server,
  Key,
} from 'lucide-react';
import { WhatsAppLogo } from '@/components/icons/logos';

interface ReadinessPayload {
  status: 'READY' | 'DEGRADED';
  envPresence: Record<string, boolean>;
  checks: {
    configuration: { status: string; warnings: string[] };
    database: { status: string; provider: string; latencyMs: number | null };
    queue: { status: string; mode: string; pendingJobs: number; activeWorkers: number; error?: string };
    aiProvider: {
      status: string;
      provider: string;
      model: string;
      order: Array<{ provider: 'gemini' | 'openai'; model: string }>;
      rescueConfigured: boolean;
      attemptsPerProvider: number;
      budgetMs: number;
    };
    whatsappWebhook: { status: string; mode: string; verified: boolean };
    imageStudio: {
      status: string;
      provider: 'openai' | 'gemini' | 'none';
      model: string | null;
      output: string;
      retentionDays: number;
    };
    jobDiscovery: {
      status: string;
      crawlIntervalMinutes: number;
      crawlTimeoutMs: number;
      maxListingsPerSource: number;
      feedOverrides: Record<string, string>;
      boards: Array<{
        code: string;
        name: string;
        healthStatus: string;
        lastCrawledAt: string | null;
        activeListingsCount: number;
        lastCrawlStatus: string | null;
        lastCrawlNote: string;
      }>;
    };
    payments: {
      status: string;
      payeeName: string;
      momoCode: string;
      providerEndpointConfigured: boolean;
      webhookSecretConfigured: boolean;
      autoVerifyEnabled: boolean;
      ocrConfigured: boolean;
    };
    persistence: {
      status: string;
      loadedFromDisk: boolean;
      records: number;
      lastSavedAt: string | null;
      lastSaveError: string | null;
      productionDatabase: {
        prismaInstalled: boolean;
        schemaFilePresent: boolean;
        migrationsPresent: number;
        applied: boolean;
        note: string;
      };
    };
  };
}

const ENV_LABELS: Array<{ name: string; note: string }> = [
  { name: 'GEMINI_API_KEY', note: 'Primary text provider — answers almost every agent reply' },
  { name: 'OPENAI_TEXT_MODEL', note: 'Rescue text model when Gemini is rate-limited or down (defaults to gpt-4o)' },
  { name: 'OPENAI_API_KEY', note: 'Adds the OpenAI text rescue, reads text out of MoMo receipt screenshots (vision OCR) and renders studio photos' },
  { name: 'OPENAI_IMAGE_MODEL', note: 'Optional studio model when using OpenAI (defaults to gpt-image-1)' },
  { name: 'GEMINI_IMAGE_MODEL', note: 'Optional studio model when only a Google key is set (defaults to gemini-2.5-flash-image)' },
  { name: 'PASSPORT_PHOTO_WIDTH', note: 'Pixel width of every studio output; height follows the 35x45mm ratio (default 700)' },
  { name: 'IMAGE_RETENTION_DAYS', note: 'Days a generated photo is kept before the retention sweep deletes the file (default 30)' },
  { name: 'WHATSAPP_PHONE_NUMBER_ID', note: 'Meta number that sends replies' },
  { name: 'WHATSAPP_ACCESS_TOKEN', note: 'Cloud API bearer token' },
  { name: 'WHATSAPP_VERIFY_TOKEN', note: 'Must match Meta webhook setup' },
  { name: 'WHATSAPP_APP_SECRET', note: 'Enforces HMAC-SHA256 signature checks' },
  { name: 'MOMO_PAYEE_NAME', note: 'Recipient name shown in payment instructions (falls back to "Vincent")' },
  { name: 'MOMO_PAYEE_CODE', note: 'MoMo Pay code users pay to (falls back to "935237")' },
  { name: 'MOMO_VERIFY_API_URL', note: 'Official transaction-lookup endpoint; without it payments need manual confirmation' },
  { name: 'MOMO_VERIFY_API_TOKEN', note: 'Bearer token for that lookup endpoint' },
  { name: 'PAYMENT_WEBHOOK_SECRET', note: 'HMAC key for POST /api/payments/webhook — unset means every callback is rejected' },
  { name: 'PAYMENT_AUTO_VERIFY', note: 'Set to "true" so a provider confirmation unlocks the service without an admin click' },
  { name: 'AGUKA_DATA_DIR', note: 'Where the durable store and receipt binaries live (defaults to ./.aguka-data)' },
  { name: 'JOB_CRAWL_INTERVAL_MINUTES', note: 'How often the queue worker re-reads the job boards (default 60; 0 means only the Jobs screen crawls)' },
  { name: 'JOB_CRAWL_MAX_LISTINGS', note: 'Listings stored per board per crawl (default 60)' },
  { name: 'JOB_CRAWL_TIMEOUT_MS', note: 'Milliseconds one board may take to answer before the crawl gives up on it (default 15000)' },
  { name: 'DATABASE_URL', note: 'PostgreSQL target for the Prisma schema' },
  { name: 'REDIS_URL', note: 'BullMQ queue backend — redis:// locally, rediss:// for a hosted TLS endpoint such as Upstash TCP' },
  { name: 'UPSTASH_REDIS_TCP_HOST', note: 'Alternative to REDIS_URL: Upstash TCP proxy host (its REST endpoint cannot run BullMQ)' },
  { name: 'UPSTASH_REDIS_TOKEN', note: 'Token for the Upstash TCP proxy when the URL cannot carry it' },
  { name: 'QUEUE_NAME', note: 'BullMQ queue name (defaults to aguka-jobs)' },
  { name: 'QUEUE_CONCURRENCY', note: 'Jobs one worker executes at a time' },
  { name: 'QUEUE_INLINE_WORKER', note: '"false" on serverless so only `npm run worker` executes jobs' },
  { name: 'QUEUE_SKIP_VERSION_CHECK', note: '"true" when the provider forbids the INFO command BullMQ probes with' },
  { name: 'ADMIN_JWT_SECRET', note: 'Signs admin dashboard sessions' },
  { name: 'ADMIN_DEFAULT_EMAIL', note: 'Admin login identity' },
  { name: 'ADMIN_DEFAULT_PASSWORD', note: 'Admin login secret' },
];

export function SettingsScreen() {
  const [readiness, setReadiness] = useState<ReadinessPayload | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  useEffect(() => {
    fetch('/api/ready')
      .then((res) => res.json())
      .then((data) => setReadiness(data))
      .catch((err) => console.error(err));
  }, []);

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/whatsapp/webhook`
    : '';

  const handleCopy = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const waReady = readiness?.checks.whatsappWebhook;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-emerald-400" />
            <span>Platform Settings & Meta Cloud API Connectivity</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Webhook URL, live environment-variable presence and readiness checks. Values are never
            shown here — only whether each variable is set on the server.
          </p>
        </div>
      </div>

      {/* WhatsApp Webhook Configuration Box */}
      <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <WhatsAppLogo className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Meta WhatsApp Cloud API Configuration</h2>
              <p className="text-xs text-zinc-400">Paste this callback URL in the Meta for Developers dashboard</p>
            </div>
          </div>
          <span
            className={`text-[10px] px-2.5 py-1 rounded-md font-semibold flex items-center gap-1 border ${
              waReady?.status === 'PASS'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            }`}
          >
            {waReady?.status === 'PASS' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
            <span>{waReady?.status === 'PASS' ? 'Credentials detected' : 'WhatsApp not configured'}</span>
          </span>
        </div>

        <div className="space-y-3 pt-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-300">
              Meta Webhook Callback URL (GET &amp; POST)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={webhookUrl}
                placeholder="Loading this deployment&apos;s URL…"
                className="flex-1 bg-zinc-950 font-mono text-xs text-emerald-400 px-3.5 py-2 rounded-lg border border-zinc-800 outline-hidden"
              />
              <button
                onClick={handleCopy}
                disabled={!webhookUrl}
                className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedUrl ? 'Copied' : 'Copy URL'}</span>
              </button>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-400 space-y-1">
            <p className="font-semibold text-zinc-300">Verify token and app secret</p>
            <p>
              Set <span className="font-mono text-emerald-400">WHATSAPP_VERIFY_TOKEN</span> in the server
              environment and type the same value into Meta. The dashboard cannot read it — secrets are
              server-only by design.
            </p>
            <p>
              {!readiness?.envPresence?.WHATSAPP_APP_SECRET
                ? 'WHATSAPP_APP_SECRET is not set, so incoming webhook signatures are not verified. Anyone who knows this URL can post events.'
                : 'WHATSAPP_APP_SECRET is set, so x-hub-signature-256 is enforced on every webhook POST.'}
            </p>
          </div>
        </div>
      </div>

      {/* Environment Presence Audit */}
      <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-white">Environment Variables On This Server</h2>
          </div>
          <span className="text-xs text-zinc-400">Presence only — no values are transmitted to the browser</span>
        </div>

        <div className="divide-y divide-zinc-800/80 bg-zinc-950 rounded-xl border border-zinc-800 overflow-hidden text-xs">
          {ENV_LABELS.map((ev) => {
            const isSet = Boolean(readiness?.envPresence?.[ev.name]);
            return (
              <div key={ev.name} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="font-mono font-bold text-zinc-200">{ev.name}</span>
                  <p className="text-[11px] text-zinc-400 mt-0.5">{ev.note}</p>
                </div>
                <span
                  className={`font-mono px-2 py-1 rounded border text-[11px] ${
                    isSet
                      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                      : 'text-zinc-400 bg-zinc-900 border-zinc-800'
                  }`}
                >
                  {readiness ? (isSet ? 'SET' : 'NOT SET') : 'CHECKING…'}
                </span>
              </div>
            );
          })}
        </div>

        {readiness && readiness.checks.configuration.warnings.length > 0 && (
          <div className="space-y-1.5">
            {readiness.checks.configuration.warnings.map((w, i) => (
              <p key={i} className="text-[11px] text-amber-400 flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{w}</span>
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Current Runtime Backends */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Storage</p>
          <p className="text-xs font-bold text-white mt-1">{readiness?.checks.database.provider ?? 'Loading…'}</p>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            {readiness?.checks.database.latencyMs == null
              ? 'No database connection measured'
              : `${readiness.checks.database.latencyMs}ms round trip`}
          </p>
        </div>
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Queue</p>
          <p className="text-xs font-bold text-white mt-1">{readiness?.checks.queue.mode ?? 'Loading…'}</p>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            {readiness
              ? `${readiness.checks.queue.pendingJobs} pending job(s) • ${readiness.checks.queue.activeWorkers} worker(s) in this process${readiness.checks.queue.error ? ` • ${readiness.checks.queue.error}` : ''}`
              : 'Reading queue state'}
          </p>
        </div>
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">AI Provider</p>
          <p className="text-xs font-bold text-white mt-1">{readiness?.checks.aiProvider.model ?? 'Loading…'}</p>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            {readiness?.checks.aiProvider.status === 'PASS' ? 'Responding' : 'Not configured or unreachable'}
          </p>
        </div>
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">MoMo Destination</p>
          <p className="text-xs font-bold text-white mt-1 font-mono">
            {readiness ? readiness.checks.payments.momoCode : 'Loading…'}
          </p>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            {readiness ? `Recipient: ${readiness.checks.payments.payeeName}` : 'Reading payment config'}
          </p>
        </div>
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Payment Verification</p>
          <p className="text-xs font-bold text-white mt-1">
            {readiness?.checks.payments.providerEndpointConfigured
              ? 'Provider lookup configured'
              : 'Manual confirmation only'}
          </p>
          <p className="text-[11px] text-zinc-400 mt-0.5 space-y-0.5">
            {readiness && (
              <>
                Webhook HMAC {readiness.checks.payments.webhookSecretConfigured ? 'enforced' : 'not configured'} ·
                receipt OCR {readiness.checks.payments.ocrConfigured ? 'on' : 'off'} · auto-unlock{' '}
                {readiness.checks.payments.autoVerifyEnabled ? 'on' : 'off'}
              </>
            )}
            {!readiness?.checks.payments.providerEndpointConfigured && (
              <span className="block text-amber-400 mt-1">
                No payment is ever unlocked by a screenshot. Until an official lookup exists, an
                administrator must confirm each one.
              </span>
            )}
          </p>
        </div>
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Durable Store</p>
          <p className="text-xs font-bold text-white mt-1">
            {readiness?.checks.persistence.status ?? 'Loading…'}
          </p>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            {readiness
              ? `${readiness.checks.persistence.records} record(s)${
                  readiness.checks.persistence.lastSavedAt
                    ? ` · saved ${new Date(readiness.checks.persistence.lastSavedAt).toLocaleTimeString('en-GB')}`
                    : ' · not yet flushed'
                }`
              : 'Reading store status'}
          </p>
          {readiness?.checks.persistence.lastSaveError && (
            <p className="text-[11px] text-red-400 mt-1">Last write failed: {readiness.checks.persistence.lastSaveError}</p>
          )}
        </div>
      </div>

      {/* Production Database Path */}
      <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2">
        <h2 className="text-sm font-bold text-white">Production Database Path</h2>
        <p className="text-xs text-zinc-400 leading-relaxed">
          {readiness?.checks.persistence.productionDatabase.note ??
            'Reading schema/migration presence from the server…'}
        </p>
        <div className="flex flex-wrap gap-2 text-[10px] font-mono">
          <span className="px-2 py-1 rounded border bg-zinc-950 border-zinc-800 text-zinc-300">
            schema.prisma: {readiness ? (readiness.checks.persistence.productionDatabase.schemaFilePresent ? 'present' : 'missing') : '…'}
          </span>
          <span className="px-2 py-1 rounded border bg-zinc-950 border-zinc-800 text-zinc-300">
            migrations: {readiness ? readiness.checks.persistence.productionDatabase.migrationsPresent : '…'}
          </span>
          <span className="px-2 py-1 rounded border bg-zinc-950 border-zinc-800 text-zinc-300">
            @prisma/client: {readiness ? (readiness.checks.persistence.productionDatabase.prismaInstalled ? 'installed' : 'not installed') : '…'}
          </span>
          <span
            className={`px-2 py-1 rounded border font-semibold ${
              readiness?.checks.persistence.productionDatabase.applied
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            }`}
          >
            {readiness?.checks.persistence.productionDatabase.applied ? 'PostgreSQL live' : 'file store is authoritative'}
          </span>
        </div>
      </div>

      {/* Text provider chain */}
      <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2">
        <h2 className="text-sm font-bold text-white">Text Providers</h2>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Gemini answers first. A rate limit, a timeout, a blocked or empty answer is retried{' '}
          {readiness?.checks.aiProvider.attemptsPerProvider ?? 2} time(s) and then handed to the rescue
          provider, so one outage does not become ‘Aguka AI could not reply’ for the person on
          WhatsApp. Without a rescue key, the second provider does not exist and every Gemini blip
          still fails.
        </p>
        <div className="flex flex-wrap gap-2 text-[10px] font-mono">
          {(readiness?.checks.aiProvider.order.length
            ? readiness.checks.aiProvider.order
            : [{ provider: 'none', model: 'no key configured' }]
          ).map((p, i) => (
            <span
              key={`${p.provider}-${p.model}`}
              className="px-2 py-1 rounded border bg-zinc-950 border-zinc-800 text-zinc-300"
            >
              {i === 0 ? 'answers' : 'rescue'}: {p.provider}:{p.model}
            </span>
          ))}
          <span className="px-2 py-1 rounded border bg-zinc-950 border-zinc-800 text-zinc-300">
            budget: {readiness?.checks.aiProvider.budgetMs ?? 12000}ms
          </span>
          <span
            className={`px-2 py-1 rounded border font-semibold ${
              readiness?.checks.aiProvider.rescueConfigured
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            }`}
          >
            {readiness?.checks.aiProvider.rescueConfigured ? 'Rescue armed' : 'No rescue provider'}
          </span>
        </div>
      </div>

      {/* Image Studio capability */}
      <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2">
        <h2 className="text-sm font-bold text-white">Image Studio</h2>
        <p className="text-xs text-zinc-400 leading-relaxed">
          A request to make or retouch a photo is rendered by a real image provider and cropped in
          code to {readiness?.checks.imageStudio.output ?? 'the passport ratio'}. With no key set, the
          WhatsApp reply says the studio is unavailable instead of pretending a file was made.
          Generated files live in the private data directory and are deleted after{' '}
          {readiness?.checks.imageStudio.retentionDays ?? 30} days by the retention sweep.
        </p>
        <div className="flex flex-wrap gap-2 text-[10px] font-mono">
          <span className="px-2 py-1 rounded border bg-zinc-950 border-zinc-800 text-zinc-300">
            provider: {readiness ? readiness.checks.imageStudio.provider : '…'}
          </span>
          <span className="px-2 py-1 rounded border bg-zinc-950 border-zinc-800 text-zinc-300">
            model: {readiness?.checks.imageStudio.model ?? 'not selected'}
          </span>
          <span
            className={`px-2 py-1 rounded border font-semibold ${
              readiness?.checks.imageStudio.status === 'PASS'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            }`}
          >
            {readiness?.checks.imageStudio.status === 'PASS' ? 'Studio renders photos' : 'Studio not configured'}
          </span>
        </div>
      </div>

      {/* Job board discovery */}
      <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-white">Job Board Discovery</h2>
          <span
            className={`px-2 py-1 rounded border font-semibold text-[11px] ${
              readiness?.checks.jobDiscovery.status === 'SCHEDULED'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            }`}
          >
            {readiness?.checks.jobDiscovery.status === 'SCHEDULED'
              ? `Scheduled every ${readiness?.checks.jobDiscovery.crawlIntervalMinutes ?? 60} min`
              : 'Manual crawl only'}
          </span>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">
          A crawl opens a board and stores what that board printed: title, employer, location, the dates on the
          card, a short excerpt and the link back. Full advertisements are never copied into this store, and a board
          that cannot be read keeps its own reason instead of a made-up listing. The schedule runs inside{' '}
          <span className="font-mono text-zinc-300">npm run worker</span>; the Jobs screen button crawls on demand.
        </p>
        <div className="flex flex-wrap gap-2 text-[10px] font-mono">
          <span className="px-2 py-1 rounded border bg-zinc-950 border-zinc-800 text-zinc-300">
            cap: {readiness?.checks.jobDiscovery.maxListingsPerSource ?? 60} per board
          </span>
          <span className="px-2 py-1 rounded border bg-zinc-950 border-zinc-800 text-zinc-300">
            timeout: {readiness?.checks.jobDiscovery.crawlTimeoutMs ?? 15000}ms
          </span>
          {Object.entries(readiness?.checks.jobDiscovery.feedOverrides || {}).map(([code, url]) => (
            <span key={code} className="px-2 py-1 rounded border bg-zinc-950 border-zinc-800 text-emerald-400">
              JOB_FEED_URL_{code} set
              <span className="text-zinc-400"> · {url}</span>
            </span>
          ))}
        </div>
        <div className="divide-y divide-zinc-800/80 bg-zinc-950 rounded-xl border border-zinc-800 overflow-hidden">
          {(readiness?.checks.jobDiscovery.boards || []).map((board) => (
            <div key={board.code} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[11px] font-semibold text-zinc-200">{board.name}</span>
                <p className="text-[10px] text-zinc-500 truncate max-w-[420px]" title={board.lastCrawlNote}>
                  {board.lastCrawlNote || 'No crawl has run on this server yet.'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-mono text-zinc-400">{board.activeListingsCount} stored</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded border font-semibold ${
                    board.lastCrawlStatus === 'OK'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : board.lastCrawlStatus === 'FAILED'
                      ? 'bg-red-500/10 text-red-400 border-red-500/20'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  }`}
                >
                  {board.lastCrawlStatus === 'OK'
                    ? 'Read fine'
                    : board.lastCrawlStatus === 'NO_PUBLIC_FEED'
                    ? 'No public feed'
                    : board.lastCrawlStatus === 'FAILED'
                    ? 'Crawl failed'
                    : 'Not crawled yet'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Deployment Guide */}
      <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <Server className="w-4 h-4 text-purple-400" />
          <span>Production Deployment Quick Guide (Render, AWS, or Docker)</span>
        </h2>
        <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 font-mono text-xs text-zinc-300 space-y-2">
          <p className="text-zinc-500"># 1. Install the Prisma client and point DATABASE_URL at PostgreSQL:</p>
          <p className="text-emerald-400">npm install prisma @prisma/client && npx prisma migrate deploy</p>
          <p className="text-zinc-500 mt-2"># 2. Build the production Next.js application:</p>
          <p className="text-emerald-400">npm run build</p>
          <p className="text-zinc-500 mt-2"># 3. Start the server:</p>
          <p className="text-emerald-400">npm run start</p>
        </div>
        <p className="text-[11px] text-zinc-500 leading-relaxed">
          Until step 1 is run, live reads and writes go through the atomic JSON snapshot plus the
          private receipts directory in AGUKA_DATA_DIR (default <span className="font-mono">./.aguka-data</span>),
          which is git-ignored. The Prisma schema and both migrations describe the same tables, so the
          data written here is production-shaped but not yet in PostgreSQL — back it up like a real
          database and never commit that folder.
        </p>
      </div>
    </div>
  );
}
