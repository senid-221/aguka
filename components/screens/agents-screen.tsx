'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Bot, Briefcase, Code2, Image as ImageIcon, GraduationCap, Users2, FileText, Layers, Cpu } from 'lucide-react';
import { AgentRun, AgentType, QueuedJob, ToolCallTrace, WebhookEventRecord } from '@/lib/types';

interface AgentsPayload {
  agentRuns: AgentRun[];
  toolCallTraces: ToolCallTrace[];
  webhookEvents: WebhookEventRecord[];
  queuedJobs: QueuedJob[];
}

interface ReadyPayload {
  status: string;
  checks: {
    aiProvider: { status: string; provider: string; model: string };
    database: { status: string; provider: string };
    whatsappWebhook: { status: string; mode: string };
  };
}

interface AgentDescriptor {
  type: AgentType;
  name: string;
  icon: React.ReactNode;
  routesTo: string;
  does: string;
  limits: string[];
}

const AGENT_CATALOG: AgentDescriptor[] = [
  {
    type: 'JOB_FINDER',
    name: 'Job Finder',
    icon: <Briefcase className="w-5 h-5 text-emerald-400" />,
    routesTo: 'Keywords about searching, applying for or listing jobs. Reads VERIFIED listings through the search_verified_jobs tool call.',
    does: 'Answers only from listings already in the store, and says so when there are none.',
    limits: [
      'No crawler is wired to MIFOTRA, Job in Rwanda or any other board',
      'Cannot invent employers, salaries, deadlines or source links',
    ],
  },
  {
    type: 'CAREER_ASSISTANT',
    name: 'Career & CV Assistant',
    icon: <FileText className="w-5 h-5 text-blue-400" />,
    routesTo: 'Keywords about CVs, cover letters and interview preparation.',
    does: 'Drafts text through the configured AI model and asks for missing personal details instead of making them up.',
    limits: ['No document is stored or exported', 'No application is submitted on a user’s behalf'],
  },
  {
    type: 'CODING_AGENT',
    name: 'Coding Agent',
    icon: <Code2 className="w-5 h-5 text-purple-400" />,
    routesTo: 'Keywords about code, APIs, debugging or architecture. Also served by POST /api/coding.',
    does: 'Generates code as text through the AI model and stores the task with that output attached.',
    limits: [
      'There is no execution sandbox — code is never run, tested or verified here',
      'No container, memory cap or filesystem exists behind this agent',
    ],
  },
  {
    type: 'IMAGE_STUDIO',
    name: 'Passport & Photo Studio',
    icon: <ImageIcon className="w-5 h-5 text-amber-400" />,
    routesTo: 'Keywords about passport or CV photos.',
    does: 'Gives written guidance on the 35x45mm Rwandan passport standard and plain backgrounds.',
    limits: [
      'No image editing runs in this service — nothing is cropped or background-removed',
      'No object storage client is installed, so uploads are not persisted',
    ],
  },
  {
    type: 'STUDY_TUTOR',
    name: 'Bilingual Study Tutor',
    icon: <GraduationCap className="w-5 h-5 text-cyan-400" />,
    routesTo: 'Keywords about learning, explanations or quizzes. Also served by POST /api/study.',
    does: 'Explains the concept asked about and ends with one practice question; /api/study generates notes and quizzes as JSON.',
    limits: ['Fails with a clear error when no AI key is configured — no canned lessons exist'],
  },
  {
    type: 'EMPLOYMENT_MARKETPLACE',
    name: 'Employment Marketplace',
    icon: <Users2 className="w-5 h-5 text-pink-400" />,
    routesTo: 'Keywords about hiring, posting a vacancy or finding workers. Reads live counts through query_talent_marketplace.',
    does: 'Reports only the worker and vacancy records present in the store.',
    limits: [
      'Match scores come from stored skills, location and experience only',
      'No employer or worker is contacted or introduced automatically',
    ],
  },
];

export function AgentsScreen() {
  const [data, setData] = useState<AgentsPayload | null>(null);
  const [ready, setReady] = useState<ReadyPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      fetch('/api/agents')
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
      fetch('/api/ready')
        .then((res) => res.json())
        .catch(() => null),
    ])
      .then(([agentsPayload, readyPayload]) => {
        if (!isMounted) return;
        if (!agentsPayload || !readyPayload?.checks) {
          setError('Agent telemetry endpoints did not respond.');
          return;
        }
        setData(agentsPayload);
        setReady(readyPayload);
      })
      .catch((err) => {
        if (isMounted) setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const runsByAgent = useMemo(() => {
    const map = new Map<AgentType, AgentRun[]>();
    (data?.agentRuns || []).forEach((run) => {
      const bucket = map.get(run.agentType) || [];
      bucket.push(run);
      map.set(run.agentType, bucket);
    });
    return map;
  }, [data]);

  const tracesByRun = useMemo(() => {
    const map = new Map<string, number>();
    (data?.toolCallTraces || []).forEach((trace) => {
      map.set(trace.agentRunId, (map.get(trace.agentRunId) || 0) + 1);
    });
    return map;
  }, [data]);

  const observedTools = useMemo(
    () => Array.from(new Set((data?.toolCallTraces || []).map((trace) => trace.toolName))),
    [data]
  );

  const aiConfigured = ready?.checks.aiProvider.status === 'PASS';
  const providerLabel = ready
    ? `${ready.checks.aiProvider.provider} · ${ready.checks.aiProvider.model}`
    : 'Checking…';

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Bot className="w-5 h-5 text-emerald-400" />
            <span>Agent Routing &amp; Execution Log</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Intents are classified in <span className="font-mono">lib/ai/bilingual-router.ts</span>. Every figure below comes from recorded
            agent runs — routing keywords live in code and nothing here is toggleable.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 flex items-center gap-2">
            <Cpu className={`w-3.5 h-3.5 ${aiConfigured ? 'text-blue-400' : 'text-zinc-500'}`} />
            <span>{aiConfigured ? providerLabel : 'No AI provider configured'}</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300">
          Could not load agent telemetry: {error}
        </div>
      )}

      {!error && !aiConfigured && (
        <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs space-y-1">
          <p className="font-semibold text-zinc-200">
            No AI key is set, so every agent currently replies with the “AI provider not configured” notice.
          </p>
          <p className="text-zinc-400">
            Set <span className="font-mono">GEMINI_API_KEY</span> on the server to make routing produce real replies.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {AGENT_CATALOG.map((agent) => {
          const runs = runsByAgent.get(agent.type) || [];
          const completed = runs.filter((r) => r.status === 'COMPLETED').length;
          const failed = runs.filter((r) => r.status === 'FAILED').length;
          const models = Array.from(new Set(runs.map((r) => r.modelUsed)));
          const avgLatency = runs.length
            ? Math.round(runs.reduce((sum, r) => sum + r.latencyMs, 0) / runs.length)
            : null;
          const tokens = runs.reduce((sum, r) => sum + r.tokensInput + r.tokensOutput, 0);
          const toolCalls = runs.reduce((sum, r) => sum + (tracesByRun.get(r.id) ?? r.toolCallsCount), 0);
          const lastActivity = runs.length
            ? new Date(runs[0].createdAt).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : null;

          const pill =
            runs.length === 0
              ? { label: 'NOT EXERCISED', cls: 'bg-zinc-800 text-zinc-400 border-zinc-700' }
              : failed === 0
                ? {
                    label: `${completed} RUN${completed === 1 ? '' : 'S'}`,
                    cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                  }
                : {
                    label: `${completed} OK / ${failed} FAILED`,
                    cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                  };

          return (
            <div
              key={agent.type}
              className="p-5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-all flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800">{agent.icon}</div>
                    <div>
                      <h3 className="text-sm font-bold text-white">{agent.name}</h3>
                      <span className="text-[10px] text-zinc-500 font-mono">{agent.type}</span>
                    </div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border shrink-0 ${pill.cls}`}>
                    {pill.label}
                  </span>
                </div>

                <p className="text-xs text-zinc-400 leading-relaxed">{agent.routesTo}</p>
                <p className="text-xs text-zinc-500 leading-relaxed">{agent.does}</p>

                <ul className="space-y-1 pt-2 border-t border-zinc-800/80">
                  {agent.limits.map((limit) => (
                    <li key={limit} className="text-[11px] text-amber-400/80 leading-relaxed flex gap-1.5">
                      <span className="text-amber-500">•</span>
                      <span>{limit}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-3 border-t border-zinc-800/80 grid grid-cols-3 gap-2 text-center">
                <div className="p-1.5 rounded bg-zinc-950 border border-zinc-800/60">
                  <span className="text-[9px] text-zinc-500 block">Completed</span>
                  <span className="text-xs font-mono font-bold text-zinc-200">
                    {runs.length === 0 ? '—' : `${completed}/${runs.length}`}
                  </span>
                </div>
                <div className="p-1.5 rounded bg-zinc-950 border border-zinc-800/60">
                  <span className="text-[9px] text-zinc-500 block">Avg latency</span>
                  <span className="text-xs font-mono font-bold text-zinc-200">
                    {avgLatency === null ? '—' : `${avgLatency}ms`}
                  </span>
                </div>
                <div className="p-1.5 rounded bg-zinc-950 border border-zinc-800/60">
                  <span className="text-[9px] text-zinc-500 block">Tokens</span>
                  <span className="text-xs font-mono font-bold text-zinc-200">{tokens === 0 ? '—' : tokens}</span>
                </div>
              </div>

              <div className="text-[10px] text-zinc-500 space-y-0.5">
                <p>
                  Model used: <span className="font-mono text-zinc-300">{models.length ? models.join(', ') : 'none yet'}</span>
                </p>
                <p>
                  Tool calls: <span className="font-mono text-zinc-300">{toolCalls}</span> · Last activity:{' '}
                  <span className="font-mono text-zinc-300">{lastActivity || 'none'}</span>
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="p-5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
          <p className="text-[11px] font-semibold text-zinc-300 flex items-center gap-1.5">
            <Layers className="w-3 h-3 text-emerald-400" />
            <span>Tool calls observed in recorded runs</span>
          </p>
          {observedTools.length === 0 ? (
            <p className="text-xs text-zinc-500 leading-relaxed">
              Nothing traced yet. The only two real tool calls are{' '}
              <span className="font-mono text-zinc-400">search_verified_jobs</span> and{' '}
              <span className="font-mono text-zinc-400">query_talent_marketplace</span>; they appear once a message routes to the job finder or
              marketplace agent.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {observedTools.map((tool) => (
                <span
                  key={tool}
                  className="text-[10px] px-2 py-0.5 rounded bg-zinc-950 text-zinc-300 border border-zinc-800 font-mono"
                >
                  {tool}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="p-5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
          <p className="text-[11px] font-semibold text-zinc-300">Recorded in this process</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded bg-zinc-950 border border-zinc-800/60">
              <span className="text-[9px] text-zinc-500 block">Agent runs</span>
              <span className="font-mono font-bold text-zinc-200">{data?.agentRuns.length ?? '—'}</span>
            </div>
            <div className="p-2 rounded bg-zinc-950 border border-zinc-800/60">
              <span className="text-[9px] text-zinc-500 block">Tool call traces</span>
              <span className="font-mono font-bold text-zinc-200">{data?.toolCallTraces.length ?? '—'}</span>
            </div>
            <div className="p-2 rounded bg-zinc-950 border border-zinc-800/60">
              <span className="text-[9px] text-zinc-500 block">Webhook events</span>
              <span className="font-mono font-bold text-zinc-200">{data?.webhookEvents.length ?? '—'}</span>
            </div>
            <div className="p-2 rounded bg-zinc-950 border border-zinc-800/60">
              <span className="text-[9px] text-zinc-500 block">Queued jobs</span>
              <span className="font-mono font-bold text-zinc-200">{data?.queuedJobs.length ?? '—'}</span>
            </div>
          </div>
          <p className="text-[10px] text-zinc-500 leading-relaxed">
            The store is in-memory, so these counts reset when the server restarts. Rate limits, max tokens and temperature are not enforced
            anywhere in this codebase, so they are not listed.
          </p>
        </div>
      </div>
    </div>
  );
}
