'use client';

import React, { useState, useEffect } from 'react';
import {
  Code2,
  Terminal,
  Play,
  Layers,
  ShieldCheck,
  Copy,
  Check,
  Server,
  Database,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { PostgresLogo, RedisLogo, WhatsAppLogo } from '@/components/icons/logos';
import { CodingTask } from '@/lib/types';

const TASK_TYPES: Array<{ value: CodingTask['taskType']; label: string }> = [
  { value: 'SCAFFOLD', label: 'Scaffold a service' },
  { value: 'DEBUG', label: 'Debug my code' },
  { value: 'EXPLAIN', label: 'Explain an approach' },
];

export function CodingScreen() {
  const [tasks, setTasks] = useState<CodingTask[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<CodingTask['language']>('typescript');
  const [taskType, setTaskType] = useState<CodingTask['taskType']>('SCAFFOLD');
  const [userId, setUserId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [code, setCode] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [activeTask, setActiveTask] = useState<CodingTask | null>(null);

  const loadTasks = () => {
    fetch('/api/coding')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const list: CodingTask[] = data?.tasks || [];
        setTasks(list);
        setActiveTask((prev) => prev || list[0] || null);
      })
      .catch((err) => console.error('Failed to load coding tasks:', err));
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const handleSubmit = async () => {
    if (!userId.trim() || !prompt.trim()) {
      setError('A user ID and a request are both required.');
      return;
    }
    setError('');
    setIsExecuting(true);
    try {
      const res = await fetch('/api/coding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId.trim(),
          taskType,
          language: selectedLanguage,
          inputPrompt: prompt.trim(),
          code: code.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.task) {
        setTasks((prev) => [data.task, ...prev]);
        setActiveTask(data.task);
      } else {
        setError(data.error || 'The request failed.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network failure.');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCopy = () => {
    if (!activeTask) return;
    navigator.clipboard.writeText(activeTask.outputResult || activeTask.code || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Code2 className="w-5 h-5 text-emerald-400" />
            <span>AI-Assisted Development Hub & System Mapping</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1 max-w-2xl">
            Requests go to Gemini server-side and the answer is stored as a task. Nothing here executes
            code: there is no sandbox, so results are never described as tested or verified.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-amber-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>No code execution</span>
          </span>
          <button
            onClick={loadTasks}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 border border-zinc-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reload</span>
          </button>
        </div>
      </div>

      {/* System Map — what is actually wired */}
      <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-white">System Map</h2>
          </div>
          <span className="text-[10px] text-zinc-400 font-mono">Solid = wired · Dashed = not built yet</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2">
          <div className="p-3.5 rounded-xl bg-zinc-950 border border-emerald-500/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-emerald-400 font-semibold uppercase">1. Ingress</span>
              <WhatsAppLogo className="w-4 h-4" />
            </div>
            <p className="text-xs font-bold text-white">WhatsApp Webhook</p>
            <p className="text-[10px] text-zinc-400">Live parser and dedup. HMAC check needs WHATSAPP_APP_SECRET.</p>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-950 border border-dashed border-red-500/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-red-400 font-semibold uppercase">2. Queue</span>
              <RedisLogo className="w-4 h-4 text-red-400" />
            </div>
            <p className="text-xs font-bold text-white">BullMQ / In-Process Queue</p>
            <p className="text-[10px] text-zinc-400">Jobs run on Redis through BullMQ when REDIS_URL resolves; otherwise the same handlers run in this process. /api/health reports which engine is live.</p>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-950 border border-blue-500/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-blue-400 font-semibold uppercase">3. Intelligence</span>
              <Terminal className="w-4 h-4 text-blue-400" />
            </div>
            <p className="text-xs font-bold text-white">Bilingual Router</p>
            <p className="text-[10px] text-zinc-400">Keyword routing plus one Gemini call, with secret redaction.</p>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-950 border border-dashed border-cyan-500/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-cyan-400 font-semibold uppercase">4. Persistence</span>
              <PostgresLogo className="w-4 h-4 text-cyan-400" />
            </div>
            <p className="text-xs font-bold text-white">In-Memory Store</p>
            <p className="text-[10px] text-zinc-400">Prisma schema exists; no database client is connected.</p>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-950 border border-dashed border-amber-500/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-amber-400 font-semibold uppercase">5. Job Feeds</span>
              <Server className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-xs font-bold text-white">Boards Registered</p>
            <p className="text-[10px] text-zinc-400">MIFOTRA and others are listed; crawlers are not built, so no listings.</p>
          </div>
        </div>
      </div>

      {/* Request form + output */}
      <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="User ID (e.g. usr-...)"
            className="bg-zinc-950 text-zinc-100 placeholder-zinc-500 text-xs rounded-lg px-3 py-2 border border-zinc-800 outline-hidden focus:border-emerald-500/50"
          />
          <select
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value as CodingTask['language'])}
            className="bg-zinc-950 text-zinc-100 text-xs rounded-lg px-3 py-2 border border-zinc-800 outline-hidden font-mono"
          >
            <option value="typescript">TypeScript</option>
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
            <option value="cpp">C++</option>
          </select>
          <select
            value={taskType}
            onChange={(e) => setTaskType(e.target.value as CodingTask['taskType'])}
            className="bg-zinc-950 text-zinc-100 text-xs rounded-lg px-3 py-2 border border-zinc-800 outline-hidden font-mono"
          >
            {TASK_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <button
            onClick={handleSubmit}
            disabled={isExecuting}
            className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Play className="w-3 h-3 fill-white" />
            <span>{isExecuting ? 'Asking Gemini…' : 'Send request'}</span>
          </button>
        </div>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          placeholder="Describe what you need, in Kinyarwanda or English…"
          className="w-full bg-zinc-950 text-zinc-100 placeholder-zinc-500 text-xs rounded-lg px-3 py-2 border border-zinc-800 outline-hidden focus:border-emerald-500/50 font-mono resize-y"
        />

        {taskType === 'DEBUG' && (
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            rows={5}
            placeholder="Paste the code you want reviewed…"
            className="w-full bg-zinc-950 text-zinc-100 placeholder-zinc-500 text-xs rounded-lg px-3 py-2 border border-zinc-800 outline-hidden focus:border-emerald-500/50 font-mono resize-y"
          />
        )}

        {error && (
          <p className="text-[11px] text-red-400 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{error}</span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: task list */}
        <div className="lg:col-span-4 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
          <div className="p-3 border-b border-zinc-800 bg-zinc-950/60 flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-300">Coding Tasks ({tasks.length})</span>
            <Database className="w-3.5 h-3.5 text-zinc-500" />
          </div>
          <div className="divide-y divide-zinc-800/60 overflow-y-auto max-h-[420px]">
            {tasks.length === 0 && (
              <p className="text-xs text-zinc-500 p-5 text-center">
                No coding requests yet — this list fills as users ask the coding agent.
              </p>
            )}
            {tasks.map((t) => {
              const isSelected = activeTask?.id === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTask(t)}
                  className={`w-full p-3.5 text-left transition-all ${
                    isSelected ? 'bg-zinc-800/80 border-l-2 border-emerald-500' : 'hover:bg-zinc-900/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-zinc-200 truncate">{t.title}</p>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-semibold border shrink-0 ${
                        t.status === 'COMPLETED'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : t.status === 'FAILED'
                          ? 'bg-red-500/10 text-red-400 border-red-500/20'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-500 font-mono mt-1">
                    {t.language} • {t.taskType} • {t.userId}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: stored answer */}
        <div className="lg:col-span-8 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
          <div className="p-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
              <Terminal className="w-3.5 h-3.5 text-purple-400" />
              <span>Gemini response (stored with the task)</span>
            </div>
            <button
              onClick={handleCopy}
              disabled={!activeTask}
              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors disabled:opacity-40"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          <pre className="p-4 bg-zinc-950 text-zinc-300 font-mono text-xs overflow-auto flex-1 min-h-[300px] whitespace-pre-wrap leading-relaxed">
            {activeTask
              ? activeTask.outputResult || 'No answer stored for this task yet.'
              : 'Select a task, or send a request above.'}
          </pre>

          <div className="p-3 bg-zinc-950/80 border-t border-zinc-800 text-[11px] text-zinc-400 space-y-1">
            <p className="flex items-center gap-1.5 text-zinc-300 font-semibold">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              <span>What this hub does not do</span>
            </p>
            <p>• No code is compiled, executed or benchmarked — so no exit codes or timings exist.</p>
            <p>• Answers come from a language model and must be reviewed before shipping.</p>
            <p>• Requests and replies stay in this process until a database is connected.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
