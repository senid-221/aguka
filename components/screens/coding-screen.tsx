'use client';

import React, { useState } from 'react';
import {
  Code2,
  Terminal,
  Play,
  Layers,
  FileCode,
  ShieldCheck,
  CheckCircle2,
  Copy,
  Check,
  Server,
  Database,
  ArrowRight,
  GitBranch,
} from 'lucide-react';
import { PostgresLogo, RedisLogo, WhatsAppLogo } from '@/components/icons/logos';

export function CodingScreen() {
  const [selectedLanguage, setSelectedLanguage] = useState<'typescript' | 'python' | 'cpp'>('typescript');
  const [taskType, setTaskType] = useState<'SCAFFOLD' | 'SANDBOX_RUN' | 'DEBUG'>('SCAFFOLD');
  const [prompt, setPrompt] = useState('Scaffold a production WhatsApp webhook receiver with HMAC signature verification and deduplication in TypeScript.');
  const [isExecuting, setIsExecuting] = useState(false);
  const [copied, setCopied] = useState(false);

  const [generatedCode, setGeneratedCode] = useState(`// Production WhatsApp Webhook Handler with HMAC-SHA256 Verification
import crypto from 'node:crypto';

export interface WebhookEventPayload {
  object: 'whatsapp_business_account';
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: 'whatsapp';
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          type: string;
          text?: { body: string };
        }>;
      };
    }>;
  }>;
}

/**
 * Validates Meta x-hub-signature-256 header using timing-safe comparison
 */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string,
  appSecret: string
): boolean {
  if (!signatureHeader.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const actual = signatureHeader.replace('sha256=', '');
  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(actual, 'hex');
  return expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf);
}`);

  const [sandboxLog, setSandboxLog] = useState(`[SANDBOX RUNNER] Container: isolated-cgroup-runner-node20
[SECURITY] CPU Limit: 1.0 Core | Memory Limit: 128MB | Net: NO_OUTBOUND | Disk: EPHEMERAL_TMP
[EXEC] Verifying timing-safe HMAC equality...
[ASSERTION 1] Valid signature matched: true (1.2ms)
[ASSERTION 2] Invalid forged token rejected: true (0.8ms)
[STATUS] Code verification: PASSED (Exit code: 0)`);

  const handleRunOrGenerate = async () => {
    setIsExecuting(true);
    try {
      const res = await fetch('/api/coding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Developer Task',
          taskType,
          language: selectedLanguage,
          inputPrompt: prompt,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.task?.code) setGeneratedCode(data.task.code);
        if (data.task?.outputResult) {
          setSandboxLog(`[SANDBOX RUNNER] Container: isolated-cgroup-${selectedLanguage}\n${data.task.outputResult}`);
        }
      }
    } catch (err) {
      console.error('Coding task failed:', err);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Code2 className="w-5 h-5 text-emerald-400" />
            <span>AI-Assisted Development Hub & System Mapping</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Inspired by real software development flows: generate microservice scaffolds, run isolated sandboxes, and inspect live architectural maps.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-emerald-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Restricted Sandbox: Enforced</span>
          </span>
        </div>
      </div>

      {/* Visual System Architecture Map (Reproducing CODING_SYSTEM_f37205c4.png) */}
      <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-white">Live System Mapping & Microservice Flow</h2>
          </div>
          <span className="text-[10px] text-zinc-400 font-mono">Dynamic Monolith Map</span>
        </div>

        {/* Diagram Nodes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2">
          {/* Node 1: WhatsApp Ingress */}
          <div className="p-3.5 rounded-xl bg-zinc-950 border border-emerald-500/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-emerald-400 font-semibold uppercase">1. Ingress</span>
              <WhatsAppLogo className="w-4 h-4" />
            </div>
            <p className="text-xs font-bold text-white">WhatsApp Cloud API</p>
            <p className="text-[10px] text-zinc-400">Webhook HMAC Verification & Event Deduplication</p>
          </div>

          {/* Node 2: Message Queue */}
          <div className="p-3.5 rounded-xl bg-zinc-950 border border-red-500/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-red-400 font-semibold uppercase">2. Queue</span>
              <RedisLogo className="w-4 h-4 text-red-400" />
            </div>
            <p className="text-xs font-bold text-white">Redis & BullMQ</p>
            <p className="text-[10px] text-zinc-400">Asynchronous task dispatch & exponential backoff</p>
          </div>

          {/* Node 3: AI Orchestrator */}
          <div className="p-3.5 rounded-xl bg-zinc-950 border border-blue-500/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-blue-400 font-semibold uppercase">3. Intelligence</span>
              <Terminal className="w-4 h-4 text-blue-400" />
            </div>
            <p className="text-xs font-bold text-white">Bilingual Router</p>
            <p className="text-[10px] text-zinc-400">Gemini 3.8-Flash + Tool Call Traces & Redaction</p>
          </div>

          {/* Node 4: Database Layer */}
          <div className="p-3.5 rounded-xl bg-zinc-950 border border-cyan-500/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-cyan-400 font-semibold uppercase">4. Persistence</span>
              <PostgresLogo className="w-4 h-4 text-cyan-400" />
            </div>
            <p className="text-xs font-bold text-white">PostgreSQL & Prisma</p>
            <p className="text-[10px] text-zinc-400">Normalized schema: Jobs, Users, Consents, Matches</p>
          </div>

          {/* Node 5: Connectors & Outbound */}
          <div className="p-3.5 rounded-xl bg-zinc-950 border border-amber-500/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-amber-400 font-semibold uppercase">5. Outbound</span>
              <Server className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-xs font-bold text-white">MIFOTRA & E-Recruit</p>
            <p className="text-[10px] text-zinc-400">Verified official feeds & WhatsApp dispatch</p>
          </div>
        </div>
      </div>

      {/* Code Editor & Sandbox Console */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Code Controls & Source */}
        <div className="lg:col-span-7 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
          <div className="p-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
            <div className="flex items-center gap-2">
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value as any)}
                className="bg-zinc-900 text-xs text-zinc-200 rounded px-2.5 py-1 border border-zinc-800 outline-hidden font-mono"
              >
                <option value="typescript">TypeScript</option>
                <option value="python">Python</option>
                <option value="cpp">C++</option>
              </select>

              <select
                value={taskType}
                onChange={(e) => setTaskType(e.target.value as any)}
                className="bg-zinc-900 text-xs text-zinc-200 rounded px-2.5 py-1 border border-zinc-800 outline-hidden font-mono"
              >
                <option value="SCAFFOLD">Scaffold Microservice</option>
                <option value="SANDBOX_RUN">Isolated Sandbox Run</option>
                <option value="DEBUG">Debug Code</option>
              </select>
            </div>

            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          <div className="p-3 bg-zinc-950/40 border-b border-zinc-800">
            <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
              Input Requirements / User Stories
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="flex-1 bg-zinc-900 text-xs text-zinc-200 rounded px-3 py-1.5 border border-zinc-800 outline-hidden focus:border-emerald-500 font-mono"
              />
              <button
                onClick={handleRunOrGenerate}
                disabled={isExecuting}
                className="px-3.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Play className="w-3 h-3 fill-white" />
                <span>{isExecuting ? 'Processing...' : 'Run'}</span>
              </button>
            </div>
          </div>

          {/* Code Viewer */}
          <pre className="p-4 bg-zinc-950 text-emerald-400 font-mono text-xs overflow-x-auto flex-1 min-h-[300px] leading-relaxed">
            <code>{generatedCode}</code>
          </pre>
        </div>

        {/* Right Column: Isolated Sandbox Console */}
        <div className="lg:col-span-5 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
          <div className="p-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
              <Terminal className="w-3.5 h-3.5 text-purple-400" />
              <span>Restricted Sandbox Output</span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-emerald-400 font-mono font-semibold">
              cgroups: OK
            </span>
          </div>

          <pre className="p-4 bg-zinc-950 text-zinc-300 font-mono text-xs overflow-x-auto flex-1 min-h-[300px] whitespace-pre-wrap leading-relaxed">
            {sandboxLog}
          </pre>

          <div className="p-3 bg-zinc-950/80 border-t border-zinc-800 text-[11px] text-zinc-400 space-y-1">
            <p className="flex items-center gap-1.5 text-zinc-300 font-semibold">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              <span>Sandbox Constraints:</span>
            </p>
            <p>• Zero shell execution in production</p>
            <p>• Max memory capped at 128MB per run</p>
            <p>• Network egress blocked to prevent data exfiltration</p>
          </div>
        </div>
      </div>
    </div>
  );
}
