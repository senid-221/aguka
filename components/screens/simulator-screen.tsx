'use client';

import React, { useRef, useState } from 'react';
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
  Paperclip,
  List,
  ImageIcon,
} from 'lucide-react';
import { WhatsAppLogo } from '@/components/icons/logos';
import { AdminGate } from '@/components/layout/admin-gate';
import { adminFetch, useAdminSession } from '@/lib/client/admin-session';

interface SimulateResponse {
  outcome?: SimOutcome;
  outgoingPayload?: Record<string, unknown>;
  serviceCode?: string | null;
  delivery?: { dispatched: boolean; reason: string };
  error?: string;
  [key: string]: unknown;
}

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

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

interface MenuRow {
  id: string;
  title: string;
  description: string;
}

interface SimOutcome {
  replyText: string;
  buttons?: Array<{ id: string; title: string }>;
  listMenu?: {
    bodyText: string;
    interactive: {
      action: { button: string; sections: Array<{ title: string; rows: MenuRow[] }> };
    };
  };
  agentType: string;
  intent: string;
  tokensUsed: number;
  modelUsed: string;
  detectedLanguage?: string;
  latencyMs?: number;
  toolCalls?: Array<{
    name: string;
    args: Record<string, unknown>;
    result: Record<string, unknown>;
    latencyMs: number;
  }>;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  buttons?: Array<{ id: string; title: string }>;
  rows?: MenuRow[];
  agentType?: string;
  attachment?: string;
  receipt?: string;
}

export function SimulatorScreen() {
  const session = useAdminSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [inputVal, setInputVal] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastOutcome, setLastOutcome] = useState<SimOutcome | null>(null);
  const [lastOutgoingPayload, setLastOutgoingPayload] = useState<Record<string, unknown> | null>(null);
  const [serviceCode, setServiceCode] = useState<string | null>(null);
  const [deliveryNote, setDeliveryNote] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<{ base64: string; mimeType: string; name: string; dataUrl: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const quickPrompts = [
    { label: 'Service Menu (Kinyarwanda)', text: 'muraho' },
    { label: 'Service Menu (English)', text: 'menu' },
    {
      label: 'Job Discovery (Kinyarwanda)',
      text: 'Nshaka akazi ka Software Developer mu Rwanda cyangwa se Remote.',
    },
    {
      label: 'Career & CV (English)',
      text: 'Can you help me build a professional CV and draft a cover letter?',
    },
    { label: 'Road Safety (Kinyarwanda)', text: 'Nshaka kwiga amategeko y\'umuhanda' },
    {
      label: 'Coding Agent (Scaffold)',
      text: 'Scaffold a production Fastify webhook receiver with HMAC signature verification in TypeScript.',
    },
    {
      label: 'Study Tutor (Kinyarwanda)',
      text: 'Sobanurira mu Kinyarwanda icyo Binary Search bivuze n’ukuntu ikora.',
    },
    { label: 'Payment Instructions', text: 'pay' },
    { label: 'Order Status', text: 'status' },
  ];

  const pushLocal = (msg: Omit<ChatMessage, 'id' | 'timestamp'>) =>
    setMessages((prev) => [...prev, { ...msg, id: getNextMessageId('err'), timestamp: getCurrentTimeString() }]);

  const requirePhone = (): string | null => {
    const trimmed = phoneNumber.trim();
    if (!trimmed) {
      pushLocal({
        sender: 'assistant',
        text: 'Enter a simulated WhatsApp number before sending.',
      });
      return null;
    }
    return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
  };

  async function postSimulate(body: Record<string, unknown>): Promise<SimulateResponse> {
    const res = await adminFetch<SimulateResponse>('/api/whatsapp/simulate', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!res.ok) return { error: res.error ?? 'The simulator request was refused.' };
    return res.data ?? { error: 'The simulator returned no payload.' };
  }

  const handleSend = async (textToSend?: string) => {
    if (pendingImage) return handleSendImage();
    const text = textToSend || inputVal;
    if (!text.trim() || isLoading) return;

    const cleanPhone = requirePhone();
    if (!cleanPhone) return;

    setMessages((prev) => [
      ...prev,
      { id: getNextMessageId('m'), sender: 'user', text, timestamp: getCurrentTimeString() },
    ]);
    setInputVal('');
    setIsLoading(true);

    try {
      const data = await postSimulate({ phoneNumber: cleanPhone, messageText: text });
      if (data.error) {
        pushLocal({ sender: 'assistant', text: `Error processing request: ${data.error}` });
        return;
      }
      applyResult(data);
    } catch (err: unknown) {
      pushLocal({
        sender: 'assistant',
        text: `Network failure: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendImage = async () => {
    if (!pendingImage || isLoading) return;
    const cleanPhone = requirePhone();
    if (!cleanPhone) return;

    const caption = inputVal.trim();
    const image = pendingImage;
    setPendingImage(null);
    setInputVal('');
    setMessages((prev) => [
      ...prev,
      {
        id: getNextMessageId('m'),
        sender: 'user',
        text: caption || '(image)',
        timestamp: getCurrentTimeString(),
        attachment: image.name,
        receipt: image.dataUrl,
      },
    ]);
    setIsLoading(true);

    try {
      const data = await postSimulate({
        phoneNumber: cleanPhone,
        messageText: caption || undefined,
        imageBase64: image.base64,
        imageMimeType: image.mimeType,
      });
      if (data.error) {
        pushLocal({ sender: 'assistant', text: `Error processing request: ${data.error}` });
        return;
      }
      applyResult(data);
    } catch (err: unknown) {
      pushLocal({
        sender: 'assistant',
        text: `Network failure: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const applyResult = (data: {
    outcome?: SimOutcome;
    outgoingPayload?: Record<string, unknown>;
    serviceCode?: string | null;
    delivery?: { dispatched: boolean; reason: string };
  }) => {
    const outcome = data.outcome;
    if (!outcome) {
      pushLocal({ sender: 'assistant', text: 'The simulator returned no inbound outcome.' });
      return;
    }
    setLastOutcome(outcome);
    setLastOutgoingPayload(data.outgoingPayload ?? null);
    setServiceCode(data.serviceCode ?? null);
    setDeliveryNote(data.delivery?.reason ?? null);

    const rows = outcome.listMenu?.interactive.action.sections.flatMap((s) => s.rows) ?? [];
    setMessages((prev) => [
      ...prev,
      {
        id: getNextMessageId('ai'),
        sender: 'assistant',
        text: outcome.replyText,
        timestamp: getCurrentTimeString(),
        buttons: outcome.buttons,
        rows: rows.length > 0 ? rows : undefined,
        agentType: outcome.agentType,
      },
    ]);
  };

  const handlePickFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      pushLocal({ sender: 'assistant', text: 'Select a receipt screenshot (PNG or JPG).' });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      pushLocal({ sender: 'assistant', text: `That file is ${(file.size / 1048576).toFixed(1)}MB — keep it under 4MB.` });
      return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('unreadable'));
        reader.readAsDataURL(file);
      });
      setPendingImage({
        base64: dataUrl.split(',')[1] ?? '',
        mimeType: file.type,
        name: file.name,
        dataUrl,
      });
    } catch {
      pushLocal({ sender: 'assistant', text: 'Could not read that image file.' });
    }
  };

  const resetChat = () => {
    setMessages([]);
    setLastOutcome(null);
    setLastOutgoingPayload(null);
    setServiceCode(null);
    setDeliveryNote(null);
    setPendingImage(null);
    setInputVal('');
  };

  const menuRows = lastOutcome?.listMenu?.interactive.action.sections.flatMap((s) => s.rows) ?? [];

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-zinc-900/90 border border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-emerald-400" />
              <span>WhatsApp Simulator &amp; Webhook Inspector</span>
            </h1>
            <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700 text-[10px] font-semibold">
              Local Payload Preview
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Runs the real inbound pipeline: service menu, selection memory, trial gating, payment
            orders, receipt forensics and bilingual routing. Nothing is delivered to Meta.
          </p>
        </div>

        <div className="flex items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400">
              Simulated WhatsApp Number
            </span>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+250..."
              className="w-40 bg-zinc-950 text-zinc-100 placeholder-zinc-500 text-xs font-mono rounded-lg px-2.5 py-1.5 border border-zinc-800 outline-hidden focus:border-emerald-500/50"
            />
          </label>
          <button
            onClick={resetChat}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 border border-zinc-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset Chat</span>
          </button>
        </div>
      </div>

      <AdminGate session={session} scope="A simulated number registers a real user record and conversation in this store, so the simulator is administrator-only." />

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
        <p className="text-[10px] text-zinc-500">
          A number that has never picked a service always receives the service menu first — that is
          the same rule the live webhook applies. Use a distinct number per persona to test trials.
        </p>
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
                    {serviceCode ? (
                      <span className="font-mono">{serviceCode}</span>
                    ) : (
                      <span>No service selected yet</span>
                    )}
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
                  Local simulator — nothing is delivered to Meta or to a real WhatsApp number
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
                    {m.attachment && (
                      <div className="mb-1.5">
                        {m.receipt ? (
                          <img
                            src={m.receipt}
                            alt={m.attachment}
                            className="max-h-32 rounded-lg border border-white/10 mb-1"
                          />
                        ) : null}
                        <div className="flex items-center gap-1 text-[10px] text-emerald-200/80">
                          <ImageIcon className="w-3 h-3" />
                          <span className="truncate">{m.attachment}</span>
                        </div>
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
                          disabled={isLoading}
                          className="w-full py-1.5 px-3 rounded-lg bg-[#202C33] hover:bg-zinc-800 text-emerald-400 font-medium text-xs border border-emerald-500/20 text-center transition-all flex items-center justify-center gap-1.5 shadow-sm"
                        >
                          <WhatsAppLogo className="w-3.5 h-3.5" />
                          <span>{btn.title}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Interactive List Menu Rows */}
                  {m.rows && m.rows.length > 0 && (
                    <div className="mt-1.5 w-[85%] rounded-lg overflow-hidden border border-emerald-500/20 shadow-md">
                      <div className="px-2.5 py-1 bg-[#202C33] text-[9px] uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                        <List className="w-3 h-3" />
                        <span>Choose service — tap a row (sends its row id)</span>
                      </div>
                      {m.rows.map((row) => (
                        <button
                          key={row.id}
                          onClick={() => handleSend(row.id)}
                          disabled={isLoading}
                          className="w-full px-2.5 py-1.5 bg-[#202C33] hover:bg-zinc-800 text-left border-t border-zinc-800/70 transition-colors"
                        >
                          <span className="block text-xs font-semibold text-emerald-400">{row.title}</span>
                          <span className="block text-[10px] text-zinc-400 leading-snug">{row.description}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {messages.length === 0 && !isLoading && (
                <div className="flex flex-col items-center justify-center text-center gap-2 px-6 py-16">
                  <WhatsAppLogo className="w-7 h-7 text-emerald-400/60" />
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    No messages yet. Enter a simulated number above and send a Kinyarwanda or English
                    message — the service menu comes back first.
                  </p>
                </div>
              )}

              {isLoading && (
                <div className="flex items-center gap-2 p-2 rounded-xl bg-zinc-900/90 text-zinc-400 text-xs w-max border border-zinc-800 animate-pulse">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" />
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce [animation-delay:0.2s]" />
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce [animation-delay:0.4s]" />
                  <span className="text-[11px] text-zinc-400 ml-1">Aguka AI is thinking...</span>
                </div>
              )}
            </div>

            {/* Pending receipt strip */}
            {pendingImage && (
              <div className="px-2.5 py-2 bg-[#111B21] border-t border-zinc-800/80 flex items-center gap-2">
                <img
                  src={pendingImage.dataUrl}
                  alt={pendingImage.name}
                  className="w-10 h-10 object-cover rounded-md border border-zinc-700"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-zinc-200 truncate">{pendingImage.name}</p>
                  <p className="text-[10px] text-zinc-500">
                    Attached as a receipt screenshot — press send to file it
                  </p>
                </div>
                <button
                  onClick={() => setPendingImage(null)}
                  className="text-[10px] px-2 py-1 rounded-md bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700"
                >
                  Remove
                </button>
              </div>
            )}

            {/* WhatsApp Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="p-2.5 bg-[#202C33] border-t border-zinc-800/80 flex items-center gap-2"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handlePickFile(file);
                  e.target.value = '';
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                title="Attach a MoMo payment receipt screenshot"
                className="w-9 h-9 shrink-0 rounded-full bg-[#2A3942] hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 flex items-center justify-center transition-colors"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <input
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder={pendingImage ? 'Optional caption for the receipt...' : 'Type in Kinyarwanda or English...'}
                className="flex-1 bg-[#2A3942] text-zinc-100 placeholder-zinc-400 text-xs rounded-xl px-3.5 py-2.5 outline-hidden focus:ring-1 focus:ring-emerald-500"
              />
              <button
                type="submit"
                disabled={isLoading || (!inputVal.trim() && !pendingImage)}
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
                <span>Real-Time Execution Trace &amp; Inspector</span>
              </h2>
              {lastOutcome && (
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">
                    {lastOutcome.latencyMs != null ? `${lastOutcome.latencyMs}ms` : 'rule-based'}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">
                    {lastOutcome.detectedLanguage ?? 'NO MODEL CALL'}
                  </span>
                </div>
              )}
            </div>

            {lastOutcome ? (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                  <p className="text-[10px] text-zinc-400 font-medium">Routed Agent</p>
                  <p className="text-xs font-bold text-white mt-0.5">{lastOutcome.agentType}</p>
                </div>
                <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                  <p className="text-[10px] text-zinc-400 font-medium">Detected Intent</p>
                  <p className="text-xs font-bold text-emerald-400 mt-0.5 font-mono break-all">
                    {lastOutcome.intent}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                  <p className="text-[10px] text-zinc-400 font-medium">Answering Model</p>
                  <p className="text-xs font-bold text-zinc-200 mt-0.5 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                    <span className="truncate">{lastOutcome.modelUsed}</span>
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                  <p className="text-[10px] text-zinc-400 font-medium">Active Service / Tokens</p>
                  <p className="text-xs font-bold text-zinc-200 mt-0.5 font-mono">
                    {serviceCode ?? 'none'}
                  </p>
                  <p className="text-[10px] text-zinc-500 font-mono mt-0.5">{lastOutcome.tokensUsed} tokens</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-zinc-400">Send a message to view the agent execution breakdown.</p>
            )}

            {menuRows.length > 0 && (
              <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 flex flex-wrap gap-1.5">
                <span className="text-[10px] text-zinc-400 font-medium w-full">
                  Menu rows offered by the selection engine (row id sent on tap):
                </span>
                {menuRows.map((r) => (
                  <span
                    key={r.id}
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-emerald-300 border border-zinc-700"
                  >
                    {r.id}
                  </span>
                ))}
              </div>
            )}

            {/* Tool Calls Execution */}
            {lastOutcome && lastOutcome.toolCalls && lastOutcome.toolCalls.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-zinc-800">
                <p className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-400" />
                  <span>Executed Agent Tools ({lastOutcome.toolCalls.length})</span>
                </p>
                <div className="space-y-2">
                  {lastOutcome.toolCalls.map((tc, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono space-y-1"
                    >
                      <div className="flex items-center justify-between text-blue-400 font-bold">
                        <span>⚡ {tc.name}()</span>
                        <span className="text-[10px] text-zinc-400 font-normal">{tc.latencyMs}ms</span>
                      </div>
                      <div className="text-zinc-400 text-[11px]">Args: {JSON.stringify(tc.args)}</div>
                      <div className="text-emerald-400 text-[11px]">Result: {JSON.stringify(tc.result)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {lastOutcome && (!lastOutcome.toolCalls || lastOutcome.toolCalls.length === 0) && (
              <p className="text-[10px] text-zinc-500 pt-1 border-t border-zinc-800">
                No tool calls on this turn — menu, selection, payment and gating replies are answered
                by deterministic rules before any model is consulted.
              </p>
            )}
          </div>

          {/* Outgoing WhatsApp Payload Preview */}
          <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Meta WhatsApp Outgoing Payload</span>
              </span>
              <span className="text-[10px] text-zinc-400 font-mono">POST /v21.0/messages</span>
            </div>
            {lastOutgoingPayload ? (
              <>
                <pre className="p-3 rounded-lg bg-zinc-950 text-emerald-300 font-mono text-[11px] overflow-x-auto max-h-48 border border-zinc-800/80">
                  {JSON.stringify(lastOutgoingPayload, null, 2)}
                </pre>
                <p className="text-[10px] text-zinc-500">
                  {deliveryNote ??
                    'Preview only. The simulator never sends this payload; real delivery happens in POST /api/whatsapp/webhook with Meta credentials configured.'}
                </p>
              </>
            ) : (
              <p className="text-xs text-zinc-400">
                Nothing yet — send a message to build the outgoing payload shape.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
