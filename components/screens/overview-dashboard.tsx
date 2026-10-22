'use client';

import React, { useEffect, useState } from 'react';
import {
  Users,
  MessageSquare,
  Bot,
  Briefcase,
  Layers,
  Activity,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  RefreshCw,
  ExternalLink,
  Workflow,
} from 'lucide-react';
import { WhatsAppLogo, RwandaFlagIcon, PostgresLogo, RedisLogo } from '@/components/icons/logos';
import { SystemHealth, JobSource, QueuedJob } from '@/lib/types';
import { AdminGate } from '@/components/layout/admin-gate';
import { adminFetch, useAdminSession } from '@/lib/client/admin-session';

interface OverviewProps {
  onNavigate: (screen: string) => void;
}

export function OverviewDashboard({ onNavigate }: OverviewProps) {
  const session = useAdminSession();
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [sources, setSources] = useState<JobSource[]>([]);
  const [queuedJobs, setQueuedJobs] = useState<QueuedJob[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const reloadData = () => {
    setIsLoading(true);
    Promise.all([
      fetch('/api/health').then((r) => (r.ok ? r.json() : null)),
      adminFetch<{ sources?: JobSource[] }>('/api/jobs'),
      adminFetch<{ queuedJobs?: QueuedJob[] }>('/api/agents'),
    ])
      .then(([healthData, jobsRes, agentsRes]) => {
        if (healthData) setHealth(healthData);
        if (jobsRes.data) setSources(jobsRes.data.sources || []);
        if (agentsRes.data) setQueuedJobs(agentsRes.data.queuedJobs || []);
      })
      .catch((err) => console.error(err))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    if (!session.authed) return;
    let isMounted = true;
    Promise.all([
      fetch('/api/health').then((r) => (r.ok ? r.json() : null)),
      adminFetch<{ sources?: JobSource[] }>('/api/jobs'),
      adminFetch<{ queuedJobs?: QueuedJob[] }>('/api/agents'),
    ])
      .then(([healthData, jobsRes, agentsRes]) => {
        if (!isMounted) return;
        if (healthData) setHealth(healthData);
        if (jobsRes.data) {
          setSources(jobsRes.data.sources || []);
        }
        if (agentsRes.data) {
          setQueuedJobs(agentsRes.data.queuedJobs || []);
        }
      })
      .catch((err) => console.error(err));

    return () => {
      isMounted = false;
    };
  }, [session.authed]);

  const statsCount = health?.stats;

  const stats = [
    {
      label: 'Verified Job Listings',
      value: statsCount ? String(statsCount.verifiedJobListings) : '—',
      subtext: 'Stored in this server’s in-memory store',
      icon: <Briefcase className="w-5 h-5 text-emerald-400" />,
      change: statsCount?.verifiedJobListings ? 'Active' : 'Crawl a board from the Jobs screen',
    },
    {
      label: 'Messages Exchanged',
      value: statsCount ? String(statsCount.messages) : '—',
      subtext: `${statsCount?.conversations ?? 0} conversation(s)`,
      icon: <MessageSquare className="w-5 h-5 text-blue-400" />,
      change: 'Bilingual Kinyarwanda / English',
    },
    {
      label: 'Registered Users',
      value: statsCount ? String(statsCount.totalUsers) : '—',
      subtext: 'Created from real WhatsApp traffic',
      icon: <Users className="w-5 h-5 text-purple-400" />,
      change: health?.whatsappApi.configured ? 'Live number allowed' : 'Simulator only',
    },
    {
      label: 'Agent Runs & Tool Calls',
      value: statsCount ? `${statsCount.agentRuns} / ${statsCount.toolCalls}` : '—',
      subtext: health
        ? health.textChain.order.map((p) => `${p.provider}:${p.model}`).join(' → ') || 'No provider key'
        : 'Model not loaded',
      icon: <Bot className="w-5 h-5 text-amber-400" />,
      change: health
        ? !health.textChain.configured
          ? 'GEMINI_API_KEY missing'
          : health.textChain.rescueConfigured
            ? 'Rescue provider armed'
            : 'Single provider — no rescue'
        : 'Health not loaded',
    },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Hero Welcome & Quick Health Status */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <span>Aguka AI Rwanda Operations Hub</span>
              <RwandaFlagIcon className="w-5 h-3.5 rounded-xs" />
            </h1>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                health?.status === 'OPTIMAL'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
              }`}
            >
              {health ? (health.status === 'OPTIMAL' ? 'All Services Configured' : 'Partially Configured') : 'Checking Config'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-zinc-400">
            Bilingual WhatsApp jobs discovery, career guidance, coding assistance and employment
            matchmaking. {health?.database.status === 'IN_MEMORY' && 'Records live in this process only and clear on restart.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={reloadData}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 border border-zinc-700 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => onNavigate('simulator')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-all cursor-pointer shadow-sm"
          >
            <WhatsAppLogo className="w-4 h-4" />
            <span>Launch WhatsApp Simulator</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s, idx) => (
          <div
            key={idx}
            className="p-4 rounded-xl bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700 transition-all space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">{s.label}</span>
              <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800">
                {s.icon}
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold text-white tracking-tight">{s.value}</p>
              <div className="flex items-center justify-between text-[11px] mt-1">
                <span className="text-zinc-400">{s.subtext}</span>
                <span className="text-emerald-400 font-medium">{s.change}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* How a message is processed on this server */}
      <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Workflow className="w-5 h-5 text-emerald-400" />
              <h2 className="text-base font-bold text-white">
                Platform Architecture & Process Maps (Uko Sisitemu Ikora)
              </h2>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              What actually happens to a message on this server, written from the code paths that run.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-sm">Message Flow</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono text-[10px]">
                    Bilingual Ingress
                  </span>
                </div>
                <div className="space-y-2 text-zinc-300">
                  <p className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">1</span>
                    <span><strong>WhatsApp Ingress:</strong> HMAC check runs only when WHATSAPP_APP_SECRET is set; repeated message ids are ignored.</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-red-500/20 text-red-400 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">2</span>
                    <span><strong>Queue:</strong> BullMQ on Redis whenever REDIS_URL resolves, the same job handlers in-process when it does not.</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">3</span>
                    <span><strong>Bilingual Router:</strong> Keyword intent classification, then the text chain: Gemini first, OpenAI as the rescue.</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-400 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">4</span>
                    <span><strong>Job Boards:</strong> Job in Rwanda cards and We Work Remotely feeds are crawled for real; MIFOTRA publishes no readable feed and reports that instead of inventing listings.</span>
                  </p>
                </div>
                <button
                  onClick={() => onNavigate('simulator')}
                  className="w-full mt-2 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-center block transition-colors"
                >
                  Test Flow in Simulator
                </button>
              </div>

              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-sm">Coding Engine Specs</span>
                  <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 font-mono text-[10px]">
                    Text Assistance Only
                  </span>
                </div>
                <div className="space-y-2 text-zinc-300">
                  <p className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-purple-500/20 text-purple-400 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">1</span>
                    <span><strong>Generated Drafts:</strong> Scaffolds, fixes and explanations come back as text from the same chain — no code is ever executed.</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">2</span>
                    <span><strong>No Execution Engine:</strong> this product never runs submitted code, so no exit codes or timings are reported.</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">3</span>
                    <span><strong>Task Records:</strong> prompts and replies are stored in memory and listed in the coding hub.</span>
                  </p>
                </div>
                <button
                  onClick={() => onNavigate('coding')}
                  className="w-full mt-2 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold text-center block transition-colors"
                >
                  Open Coding Hub
                </button>
              </div>
        </div>
      </div>

      <AdminGate session={session} scope="Board crawl health and the worker queue are read from an administrator session." />

      {/* Architecture & Source Health Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Job Sources Real-Time Health */}
        <div className="lg:col-span-7 p-5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>Job Sources & Crawler Health</span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Boards this platform reads: Job in Rwanda and We Work Remotely are crawled; MIFOTRA reports why it cannot be.
              </p>
            </div>
            <button
              onClick={() => onNavigate('jobs')}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1"
            >
              <span>Manage Sources</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {sources.length === 0 && (
              <p className="text-xs text-zinc-400 p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                No job boards registered on this server yet.
              </p>
            )}
            {sources.map((src) => (
              <div
                key={src.id}
                className="p-3.5 rounded-lg bg-zinc-950 border border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-xs">
                    {src.code.slice(0, 2)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-100">{src.name}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 font-mono">
                        {src.code}
                      </span>
                    </div>
                    <a
                      href={src.baseUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-zinc-400 hover:text-emerald-400 flex items-center gap-1 mt-0.5"
                    >
                      <span>{src.baseUrl}</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                </div>

                <div className="flex items-center gap-3 justify-between sm:justify-end">
                  <div className="text-right">
                    <p className="text-xs font-bold text-white">{src.activeListingsCount} stored listings</p>
                    <p className="text-[10px] text-zinc-400">
                      {src.lastCrawledAt
                        ? `Last crawled ${new Date(src.lastCrawledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                        : 'Never crawled'}
                    </p>
                    {src.lastCrawlNote && (
                      <p className="text-[10px] text-zinc-500 max-w-[260px] truncate" title={src.lastCrawlNote}>
                        {src.lastCrawlNote}
                      </p>
                    )}
                  </div>
                  <span
                    className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded border ${
                      src.healthStatus === 'HEALTHY'
                        ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                        : src.healthStatus === 'WARNING'
                        ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                        : src.healthStatus === 'DOWN'
                        ? 'text-red-400 bg-red-500/10 border-red-500/20'
                        : 'text-zinc-400 bg-zinc-800 border-zinc-700'
                    }`}
                  >
                    {src.healthStatus === 'HEALTHY' ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                    <span>{src.healthStatus === 'UNKNOWN' ? 'Not crawled yet' : src.healthStatus}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Background Worker Queue & Infrastructure */}
        <div className="lg:col-span-5 p-5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-400" />
              <span>Background Job Queue</span>
            </h2>
            <span className="text-xs text-zinc-400 font-mono">
              {health ? `${health.redisQueue.queuedJobs} queued • ${health.redisQueue.activeWorkers} workers` : 'Loading…'}
            </span>
          </div>

          <div className="space-y-2.5">
            {queuedJobs.length === 0 && (
              <p className="text-xs text-zinc-400 p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                Queue is empty — no jobs recorded in the store yet.
              </p>
            )}
            {queuedJobs.slice(0, 4).map((qj) => (
              <div
                key={qj.id}
                className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-between"
              >
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-zinc-200 font-mono">{qj.name}</p>
                  <p className="text-[10px] text-zinc-400">
                    Attempts: {qj.attempts}/{qj.maxAttempts} • Enqueued: {new Date(qj.enqueuedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-semibold border ${
                    qj.status === 'COMPLETED'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : qj.status === 'QUEUED'
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                  }`}
                >
                  {qj.status}
                </span>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
            <div className="flex items-center gap-2">
              <PostgresLogo className="w-4 h-4 text-blue-400" />
              <span>
                {health
                  ? health.productionDatabase.applied
                    ? 'PostgreSQL connected'
                    : `${health.database.provider} — PostgreSQL schema not applied`
                  : 'Reading persistence…'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <RedisLogo className="w-4 h-4 text-red-400" />
              <span>{health ? health.redisQueue.mode : 'Reading queue engine…'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
