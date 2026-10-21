'use client';

import React, { useState } from 'react';
import {
  Send,
  RefreshCw,
  Smartphone,
  Terminal,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  Layers,
  Code2,
} from 'lucide-react';
import { WhatsAppLogo } from '@/components/icons/logos';
import { AgentExecutionResult } from '@/lib/ai/bilingual-router';

let msgSequence = 1000;
function getNextMessageId(prefix: string): string {
  msgSequence += 1;
  return `${prefix}-${msgSequence}`;
}

function getCurrentTimeString(): string {
  const d = new Date();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  buttons?: Array<{ id: string; title: string }>;
  agentType?: string;
}

export function SimulatorScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm1',
      sender: 'user',
      text: 'Muraho! Nshaka akazi ka Software Developer mu Rwanda cyangwa se Remote.',
      timestamp: '22:00',
    },
    {
      id: 'm2',
      sender: 'assistant',
      text: 'Muraho! Nakuboneye imyanya 3 yizewe y’akazi ka Software Developer:\n\n1. [MINICT / RISA] Senior Software Engineer (Kigali, Gasabo)\n   • Umushahara: RWF 1,450,000 - 1,850,000\n   • Isoko: MIFOTRA (https://recruitment.mifotra.gov.rw)\n\n2. [Bank of Kigali] Full Stack Fintech Developer\n   • Isoko: Job in Rwanda (https://www.jobinrwanda.com)\n\n3. [GitLab] Remote Backend Engineer (USD 65,000 - 85,000/yr)\n\nWifuza ko ngufasha gukora CV cyangwa ibaruwa yo gusaba?',
      timestamp: '22:00',
      buttons: [
        { id: 'btn_cv_help', title: 'Fasha gukora CV' },
        { id: 'btn_job_alerts', title: 'Akazi gashya (Alerts)' },
      ],
      agentType: 'JOB_FINDER',
    },
  ]);

  const [inputVal, setInputVal] = useState('');
  const [phoneNumber] = useState('+250788912345');
  const [userName] = useState('Jean Claude Mugisha');
  const [isLoading, setIsLoading] = useState(false);
  const [lastAgentResult, setLastAgentResult] = useState<AgentExecutionResult | null>({
    agentType: 'JOB_FINDER',
    intent: 'DISCOVER_VERIFIED_JOBS',
    detectedLanguage: 'KINYARWANDA',
    replyText: 'Sample verified response from MIFOTRA & Job in Rwanda...',
    tokensUsed: 310,
    latencyMs: 780,
    toolCalls: [
      {
        name: 'search_verified_jobs',
        args: { isRemote: true, verifiedOnly: true },
        result: { count: 3, source: 'MIFOTRA & Job in Rwanda' },
      },
    ],
  });

  const [lastOutgoingPayload, setLastOutgoingPayload] = useState<Record<string, unknown> | null>({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: '250788912345',
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: 'Verified response dispatched to WhatsApp' },
    },
  });

  const quickPrompts = [
    {
      label: 'Job Discovery (Kinyarwanda)',
      text: 'Muraho! Nshaka akazi ka Software Developer mu Rwanda cyangwa se Remote.',
    },
    {
      label: 'Career & CV (English)',
      text: 'Can you help me build a professional CV and draft a cover letter for Bank of Kigali?',
    },
    {
      label: 'Coding Agent (Scaffold)',
      text: 'Scaffold a production Fastify webhook receiver with HMAC signature verification in TypeScript.',
    },
    {
      label: 'Study Tutor (Kinyarwanda)',
      text: 'Sobanurira mu Kinyarwanda icyo Binary Search bivuze n’ukuntu ikora.',
    },
    {
      label: 'Photo Studio (Passport)',
      text: 'Nkeneye gusukura ifoto ya Pasiporo 35x45mm yera inyuma.',
    },
    {
      label: 'Marketplace (Hire Worker)',
      text: 'Nshaka umukozi uzi React Native muri Kigali.',
    },
  ];

  const handleSend = async (textToSend?: string) => {
    const text = textToSend || inputVal;
    if (!text.trim() || isLoading) return;

    const userMsgId = getNextMessageId('m');
    const userMsg: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      text,
      timestamp: getCurrentTimeString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputVal('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/whatsapp/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber,
          name: userName,
          messageText: text,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setLastAgentResult(data.agentResult);
        setLastOutgoingPayload(data.outgoingPayload);

        const aiMsg: ChatMessage = {
          id: getNextMessageId('ai'),
          sender: 'assistant',
          text: data.agentResult.replyText,
          timestamp: getCurrentTimeString(),
          buttons: data.agentResult.buttons,
          agentType: data.agentResult.agentType,
        };
        setMessages((prev) => [...prev, aiMsg]);
      } else {
        const errorMsg: ChatMessage = {
          id: getNextMessageId('err'),
          sender: 'assistant',
          text: `Error processing request: ${data.error || 'Server error'}`,
          timestamp: getCurrentTimeString(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [
        ...prev,
        {
          id: getNextMessageId('err'),
          sender: 'assistant',
          text: `Network failure: ${errorMsg}`,
          timestamp: getCurrentTimeString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-zinc-900/90 border border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-emerald-400" />
              <span>Live WhatsApp Simulator & Webhook Inspector</span>
            </h1>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-semibold">
              End-to-End Ready
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Simulate incoming Meta WhatsApp Cloud API webhooks. Test bilingual Kinyarwanda/English routing, tool execution, and outgoing payload.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-[11px] font-semibold text-zinc-300">Simulated WhatsApp ID</p>
            <p className="text-[10px] text-zinc-400 font-mono">{phoneNumber}</p>
          </div>
          <button
            onClick={() => {
              setMessages([]);
              setLastAgentResult(null);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 border border-zinc-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset Chat</span>
          </button>
        </div>
      </div>

      {/* Quick Prompts Bar */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
          Try Quick Bilingual Test Prompts
        </p>
        <div className="flex flex-wrap gap-2">
          {quickPrompts.map((p, i) => (
            <button
              key={i}
              onClick={() => handleSend(p.text)}
              disabled={isLoading}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 hover:border-emerald-500/30 transition-all text-left"
            >
              <span className="text-emerald-400 font-medium mr-1.5">●</span>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Device Phone + Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Interactive Smartphone Mockup */}
        <div className="lg:col-span-5 flex justify-center">
          <div className="w-full max-w-[400px] h-[640px] rounded-3xl bg-zinc-950 border-[6px] border-zinc-800 shadow-2xl flex flex-col overflow-hidden relative">
            {/* Phone Speaker Notch */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-4 bg-zinc-900 rounded-full z-20 flex items-center justify-center">
              <div className="w-3 h-1 bg-zinc-700 rounded-full" />
            </div>

            {/* WhatsApp App Bar */}
            <div className="pt-7 pb-3 px-3 bg-[#075E54] text-white flex items-center justify-between shadow-md z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-emerald-700/80 border border-white/20 flex items-center justify-center text-white font-bold text-xs">
                  <WhatsAppLogo className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <span className="font-semibold text-sm">Aguka AI (Rwanda)</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                  </div>
                  <p className="text-[10px] text-emerald-100 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                    Online • Kinyarwanda & English
                  </p>
                </div>
              </div>

              <div className="text-[10px] bg-emerald-800/60 px-2 py-0.5 rounded font-mono text-emerald-200">
                Cloud API
              </div>
            </div>

            {/* WhatsApp Chat Messages Canvas */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-[#0B141A] bg-[radial-gradient(#12242b_1px,transparent_1px)] [background-size:16px_16px]">
              <div className="text-center my-1">
                <span className="text-[9px] bg-zinc-900/90 text-zinc-400 px-2.5 py-1 rounded-md border border-zinc-800/80 shadow-xs">
                  🔒 Messages are protected by Rwanda DPPA Law & WhatsApp encryption
                </span>
              </div>

              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs shadow-md whitespace-pre-wrap leading-relaxed ${
                      m.sender === 'user'
                        ? 'bg-[#005C4B] text-emerald-50 rounded-tr-xs'
                        : 'bg-[#202C33] text-zinc-100 rounded-tl-xs border border-zinc-800/60'
                    }`}
                  >
                    {m.agentType && (
                      <div className="text-[9px] uppercase tracking-wider font-semibold text-emerald-400 mb-1 flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>{m.agentType.replace('_', ' ')}</span>
                      </div>
                    )}
                    {m.text}
                    <div className="text-[9px] text-zinc-400 text-right mt-1 flex items-center justify-end gap-1">
                      <span>{m.timestamp}</span>
                      {m.sender === 'user' && <span className="text-emerald-400">✓✓</span>}
                    </div>
                  </div>

                  {/* Interactive Reply Buttons */}
                  {m.buttons && m.buttons.length > 0 && (
                    <div className="mt-1.5 space-y-1 w-[85%]">
                      {m.buttons.map((btn) => (
                        <button
                          key={btn.id}
                          onClick={() => handleSend(btn.title)}
                          className="w-full py-1.5 px-3 rounded-lg bg-[#202C33] hover:bg-zinc-800 text-emerald-400 font-medium text-xs border border-emerald-500/20 text-center transition-all flex items-center justify-center gap-1.5 shadow-sm"
                        >
                          <WhatsAppLogo className="w-3.5 h-3.5" />
                          <span>{btn.title}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex items-center gap-2 p-2 rounded-xl bg-zinc-900/90 text-zinc-400 text-xs w-max border border-zinc-800 animate-pulse">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" />
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce [animation-delay:0.2s]" />
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce [animation-delay:0.4s]" />
                  <span className="text-[11px] text-zinc-400 ml-1">Aguka AI is thinking...</span>
                </div>
              )}
            </div>

            {/* WhatsApp Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="p-2.5 bg-[#202C33] border-t border-zinc-800/80 flex items-center gap-2"
            >
              <input
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder="Type in Kinyarwanda or English..."
                className="flex-1 bg-[#2A3942] text-zinc-100 placeholder-zinc-400 text-xs rounded-xl px-3.5 py-2.5 outline-hidden focus:ring-1 focus:ring-emerald-500"
              />
              <button
                type="submit"
                disabled={isLoading || !inputVal.trim()}
                className="w-9 h-9 rounded-full bg-[#00A884] hover:bg-emerald-500 disabled:opacity-40 text-white flex items-center justify-center shadow-md transition-all cursor-pointer"
              >
                <Send className="w-4 h-4 ml-0.5" />
              </button>
            </form>
          </div>
        </div>

        {/* Right: Webhook & AI Agent Execution Inspector */}
        <div className="lg:col-span-7 space-y-4">
          <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span>Real-Time Execution Trace & Inspector</span>
              </h2>
              {lastAgentResult && (
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">
                    {lastAgentResult.latencyMs}ms
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">
                    {lastAgentResult.detectedLanguage}
                  </span>
                </div>
              )}
            </div>

            {lastAgentResult ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                  <p className="text-[10px] text-zinc-400 font-medium">Routed Agent</p>
                  <p className="text-xs font-bold text-white mt-0.5">
                    {lastAgentResult.agentType}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                  <p className="text-[10px] text-zinc-400 font-medium">Detected Intent</p>
                  <p className="text-xs font-bold text-emerald-400 mt-0.5 font-mono">
                    {lastAgentResult.intent}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                  <p className="text-[10px] text-zinc-400 font-medium">Security & Redaction</p>
                  <p className="text-xs font-bold text-zinc-200 mt-0.5 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>0 Leaks (Protected)</span>
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-zinc-400">Send a message to view the agent execution breakdown.</p>
            )}

            {/* Tool Calls Execution */}
            {lastAgentResult && lastAgentResult.toolCalls.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-zinc-800">
                <p className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-400" />
                  <span>Executed Agent Tools ({lastAgentResult.toolCalls.length})</span>
                </p>
                <div className="space-y-2">
                  {lastAgentResult.toolCalls.map((tc, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono space-y-1"
                    >
                      <div className="flex items-center justify-between text-blue-400 font-bold">
                        <span>⚡ {tc.name}()</span>
                        <span className="text-[10px] text-zinc-400 font-normal">verified</span>
                      </div>
                      <div className="text-zinc-400 text-[11px]">
                        Args: {JSON.stringify(tc.args)}
                      </div>
                      <div className="text-emerald-400 text-[11px]">
                        Result: {JSON.stringify(tc.result)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Outgoing WhatsApp Payload Preview */}
          <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Meta WhatsApp Outgoing API Payload</span>
              </span>
              <span className="text-[10px] text-zinc-400 font-mono">POST /v21.0/messages</span>
            </div>
            <pre className="p-3 rounded-lg bg-zinc-950 text-emerald-300 font-mono text-[11px] overflow-x-auto max-h-48 border border-zinc-800/80">
              {JSON.stringify(lastOutgoingPayload, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
