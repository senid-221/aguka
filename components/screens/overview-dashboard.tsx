'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import {
  Users,
  MessageSquare,
  Bot,
  Briefcase,
  Layers,
  Activity,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowUpRight,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Cpu,
  Maximize2,
  FileCode,
  Workflow,
  Sparkles,
} from 'lucide-react';
import { WhatsAppLogo, RwandaFlagIcon, PostgresLogo, RedisLogo, DockerLogo } from '@/components/icons/logos';
import { SystemHealth, JobSource, QueuedJob } from '@/lib/types';

interface OverviewProps {
  onNavigate: (screen: string) => void;
}

export function OverviewDashboard({ onNavigate }: OverviewProps) {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [sources, setSources] = useState<JobSource[]>([]);
  const [jobsCount, setJobsCount] = useState(6);
  const [queuedJobs, setQueuedJobs] = useState<QueuedJob[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDiagram, setSelectedDiagram] = useState<'flow' | 'coding'>('flow');
  const [isZoomModalOpen, setIsZoomModalOpen] = useState(false);

  const reloadData = () => {
    setIsLoading(true);
    Promise.all([
      fetch('/api/health').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/jobs').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/agents').then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([healthData, jobsData, agentsData]) => {
        if (healthData) setHealth(healthData);
        if (jobsData) {
          setSources(jobsData.sources || []);
          setJobsCount(jobsData.totalCount || 6);
        }
        if (agentsData) {
          setQueuedJobs(agentsData.queuedJobs || []);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      fetch('/api/health').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/jobs').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/agents').then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([healthData, jobsData, agentsData]) => {
        if (!isMounted) return;
        if (healthData) setHealth(healthData);
        if (jobsData) {
          setSources(jobsData.sources || []);
          setJobsCount(jobsData.totalCount || 6);
        }
        if (agentsData) {
          setQueuedJobs(agentsData.queuedJobs || []);
        }
      })
      .catch((err) => console.error(err));

    return () => {
      isMounted = false;
    };
  }, []);

  const stats = [
    {
      label: 'Verified Job Listings',
      value: jobsCount.toString(),
      subtext: 'MIFOTRA & Rwanda boards',
      icon: <Briefcase className="w-5 h-5 text-emerald-400" />,
      change: '+18% this week',
    },
    {
      label: 'Processed Messages',
      value: '1,429',
      subtext: 'Bilingual WA exchanges',
      icon: <MessageSquare className="w-5 h-5 text-blue-400" />,
      change: '100% deduplicated',
    },
    {
      label: 'Active WhatsApp Users',
      value: '482',
      subtext: 'Rwanda + International',
      icon: <Users className="w-5 h-5 text-purple-400" />,
      change: '+42 new today',
    },
    {
      label: 'Agent Runs & Tools',
      value: '2,108',
      subtext: 'Gemini 3.8-Flash routed',
      icon: <Bot className="w-5 h-5 text-amber-400" />,
      change: 'Avg 650ms latency',
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
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
              Live Gateway
            </span>
          </div>
          <p className="text-xs sm:text-sm text-zinc-400">
            Orchestrating bilingual WhatsApp jobs discovery, career acceleration, AI coding sandbox, and employment matchmaking.
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

      {/* System Architecture & Blueprint Viewer (Uko Sisitemu Ikora) */}
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
              Visual architectural blueprints: user interaction flow, security barriers, BullMQ queue dispatch, and AI microservices.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex p-1 bg-zinc-950 rounded-xl border border-zinc-800">
              <button
                onClick={() => setSelectedDiagram('flow')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  selectedDiagram === 'flow'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                1. System Workflow (Uko Ikora)
              </button>
              <button
                onClick={() => setSelectedDiagram('coding')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  selectedDiagram === 'coding'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                2. Coding System Architecture
              </button>
            </div>

            <button
              onClick={() => setIsZoomModalOpen(true)}
              className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
              title="Expand blueprint diagram"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Blueprint Display Canvas */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
          {/* Left / Main: The Diagram Image */}
          <div className="lg:col-span-8 bg-zinc-950 border border-zinc-800 rounded-xl p-3 relative group overflow-hidden">
            <div className="relative w-full aspect-16/9 rounded-lg overflow-hidden flex items-center justify-center bg-black/60">
              {selectedDiagram === 'flow' ? (
                <Image
                  src="/assets/aistudio/UKO_SYSTEM_IKORA_d9eb03d8.png"
                  alt="Uko Sisitemu Ikora - WhatsApp Architecture Diagram"
                  fill
                  className="object-contain"
                  referrerPolicy="no-referrer"
                  priority
                />
              ) : (
                <Image
                  src="/assets/aistudio/CODING_SYSTEM_f37205c4.png"
                  alt="Coding System and Sandboxed AI Architecture"
                  fill
                  className="object-contain"
                  referrerPolicy="no-referrer"
                  priority
                />
              )}
            </div>

            <button
              onClick={() => setIsZoomModalOpen(true)}
              className="absolute bottom-5 right-5 px-3 py-1.5 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 text-xs text-white border border-zinc-700 font-semibold flex items-center gap-1.5 transition-all backdrop-blur-sm cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Full Screen View</span>
            </button>
          </div>

          {/* Right: Technical Blueprint Specifications */}
          <div className="lg:col-span-4 space-y-3">
            {selectedDiagram === 'flow' ? (
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-sm">Blueprint Breakdown</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono text-[10px]">
                    Bilingual Ingress
                  </span>
                </div>
                <div className="space-y-2 text-zinc-300">
                  <p className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">1</span>
                    <span><strong>WhatsApp Ingress:</strong> Verified via HMAC-SHA256 signature and deduplicated against replay attacks.</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-red-500/20 text-red-400 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">2</span>
                    <span><strong>Durable Queue (BullMQ):</strong> Asynchronous dispatch with exponential retry backoff.</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">3</span>
                    <span><strong>Bilingual Router:</strong> Kinyarwanda & English intent classification with Gemini 3.8-Flash.</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-400 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">4</span>
                    <span><strong>Official Job Feeds:</strong> Live sync with MIFOTRA e-recruitment & Job in Rwanda.</span>
                  </p>
                </div>
                <button
                  onClick={() => onNavigate('simulator')}
                  className="w-full mt-2 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-center block transition-colors"
                >
                  Test Flow in Simulator
                </button>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-sm">Coding Engine Specs</span>
                  <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 font-mono text-[10px]">
                    Isolated Sandbox
                  </span>
                </div>
                <div className="space-y-2 text-zinc-300">
                  <p className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-purple-500/20 text-purple-400 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">1</span>
                    <span><strong>Microservice Scaffolding:</strong> Generates Fastify, TypeScript, and Prisma schemas directly.</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">2</span>
                    <span><strong>Resource Capping:</strong> 128MB RAM limit, 1.0 CPU limit, and zero production network egress.</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">3</span>
                    <span><strong>Zero Shell Access:</strong> Untrusted code executes solely in ephemeral cgroups containers.</span>
                  </p>
                </div>
                <button
                  onClick={() => onNavigate('coding')}
                  className="w-full mt-2 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold text-center block transition-colors"
                >
                  Open Coding Hub
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

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
                Official connectors: MIFOTRA, Job in Rwanda & Remote boards (no hallucinated jobs).
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
                    <p className="text-xs font-bold text-white">{src.activeListingsCount} active</p>
                    <p className="text-[10px] text-zinc-400">
                      Last crawled {new Date(src.lastCrawledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Healthy</span>
                  </div>
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
              <span>Durable Job Queue (BullMQ)</span>
            </h2>
            <span className="text-xs text-zinc-400 font-mono">4 Workers Active</span>
          </div>

          <div className="space-y-2.5">
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
              <span>PostgreSQL Schema Ready</span>
            </div>
            <div className="flex items-center gap-2">
              <RedisLogo className="w-4 h-4 text-red-400" />
              <span>Redis Deduplication</span>
            </div>
          </div>
        </div>
      </div>

      {/* Zoom Modal for Blueprint Image */}
      {isZoomModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setIsZoomModalOpen(false)}
        >
          <div
            className="w-full max-w-5xl bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Workflow className="w-4 h-4 text-emerald-400" />
                <span>
                  {selectedDiagram === 'flow'
                    ? 'Aguka AI WhatsApp End-to-End Workflow (Uko Sisitemu Ikora)'
                    : 'Aguka AI Coding System Architecture & Sandbox Pipeline'}
                </span>
              </h3>
              <button
                onClick={() => setIsZoomModalOpen(false)}
                className="text-xs px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
              >
                Close (ESC)
              </button>
            </div>

            <div className="relative w-full aspect-16/9 rounded-xl overflow-hidden bg-black/80 flex items-center justify-center">
              <Image
                src={
                  selectedDiagram === 'flow'
                    ? '/assets/aistudio/UKO_SYSTEM_IKORA_d9eb03d8.png'
                    : '/assets/aistudio/CODING_SYSTEM_f37205c4.png'
                }
                alt="System Architecture Diagram Fullscreen"
                fill
                className="object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
