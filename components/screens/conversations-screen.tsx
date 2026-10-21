'use client';

import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Search,
  User,
  ShieldCheck,
  Clock,
  Sparkles,
  Bot,
  Lock,
  Phone,
  Calendar,
} from 'lucide-react';
import { Conversation, User as UserType } from '@/lib/types';
import { WhatsAppLogo } from '@/components/icons/logos';

export function ConversationsScreen() {
  const [conversations, setConversations] = useState<Array<Conversation & { user?: UserType }>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    fetch('/api/conversations')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return;
        setConversations(data.conversations || []);
        if (data.conversations?.length > 0) {
          setSelectedId((prev) => prev || data.conversations[0].id);
        }
      })
      .catch((err) => console.error('Error fetching conversations:', err));

    return () => {
      isMounted = false;
    };
  }, []);

  const filtered = conversations.filter((c) => {
    const name = c.user?.fullName?.toLowerCase() || '';
    const phone = c.user?.phoneNumber?.toLowerCase() || '';
    const q = searchQuery.toLowerCase();
    return name.includes(q) || phone.includes(q);
  });

  const selectedConv = conversations.find((c) => c.id === selectedId);

  return (
    <div className="p-4 sm:p-6 space-y-4 h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-emerald-400" />
            <span>WhatsApp Conversations & Agent Traces</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Real-time bilingual message stream, user context, memory variables, and redacted tool call execution history.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 overflow-hidden">
        {/* Left Column: Conversation List */}
        <div className="lg:col-span-4 bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col overflow-hidden">
          <div className="p-3 border-b border-zinc-800">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search phone or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-zinc-950 text-xs text-zinc-200 placeholder-zinc-500 rounded-lg border border-zinc-800 outline-hidden focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/60">
            {filtered.map((c) => {
              const isSelected = c.id === selectedId;
              const lastMsg = c.messages[c.messages.length - 1];
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full p-3.5 text-left transition-all flex items-start gap-3 ${
                    isSelected ? 'bg-zinc-800/90 border-l-2 border-emerald-500' : 'hover:bg-zinc-900/60'
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0 font-bold text-xs">
                    <WhatsAppLogo className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-zinc-100 truncate">
                        {c.user?.fullName || c.user?.phoneNumber || 'User'}
                      </p>
                      <span className="text-[10px] text-zinc-500">
                        {new Date(c.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 font-mono mt-0.5">{c.user?.phoneNumber}</p>
                    <p className="text-xs text-zinc-400 truncate mt-1">
                      {lastMsg ? lastMsg.content : 'No messages yet'}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-950 text-emerald-400 font-medium border border-zinc-800">
                        {c.lastAgent}
                      </span>
                      <span className="text-[9px] text-zinc-500">
                        {c.messages.length} messages
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Middle Column: Message Timeline */}
        <div className="lg:col-span-5 bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col overflow-hidden">
          {selectedConv ? (
            <>
              {/* Timeline Header */}
              <div className="p-3.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-300">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">
                      {selectedConv.user?.fullName || 'WhatsApp User'}
                    </p>
                    <p className="text-[10px] text-zinc-400 font-mono">
                      {selectedConv.user?.phoneNumber}
                    </p>
                  </div>
                </div>
                <div className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                  {selectedConv.user?.preferredLang || 'KINYARWANDA'}
                </div>
              </div>

              {/* Messages Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-zinc-950/40">
                {selectedConv.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex flex-col ${m.role === 'USER' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs whitespace-pre-wrap leading-relaxed ${
                        m.role === 'USER'
                          ? 'bg-[#005C4B] text-emerald-50 rounded-tr-xs'
                          : 'bg-zinc-800 text-zinc-100 rounded-tl-xs border border-zinc-700/60'
                      }`}
                    >
                      {m.role === 'ASSISTANT' && (
                        <div className="text-[9px] uppercase font-semibold text-emerald-400 mb-1 flex items-center gap-1">
                          <Bot className="w-3 h-3" />
                          <span>Aguka AI Engine</span>
                        </div>
                      )}
                      {m.content}
                      <div className="text-[9px] text-zinc-400 text-right mt-1.5 flex items-center justify-end gap-1">
                        <span>{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {m.tokensUsed ? <span>• {m.tokensUsed} tokens</span> : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-zinc-500">
              Select a conversation to view timeline
            </div>
          )}
        </div>

        {/* Right Column: User Context, Consent & Memory */}
        <div className="lg:col-span-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col space-y-4 overflow-y-auto">
          {selectedConv?.user ? (
            <>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  User Profile Context
                </h3>
                <div className="mt-3 p-3 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2 text-xs">
                  <div>
                    <span className="text-zinc-500 text-[10px]">Full Name</span>
                    <p className="text-zinc-200 font-medium">{selectedConv.user.fullName || 'Not provided'}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px]">Phone Number</span>
                    <p className="text-zinc-200 font-mono">{selectedConv.user.phoneNumber}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px]">Platform Role</span>
                    <p className="text-zinc-200 font-semibold text-emerald-400">{selectedConv.user.role}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px]">Preferred Language</span>
                    <p className="text-zinc-200">{selectedConv.user.preferredLang}</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Conversation Memory (Opt-In)
                </h3>
                <div className="mt-2 space-y-1.5">
                  {Object.entries(selectedConv.memories || {}).length > 0 ? (
                    Object.entries(selectedConv.memories).map(([k, v]) => (
                      <div
                        key={k}
                        className="p-2 rounded bg-zinc-950 border border-zinc-800 text-xs font-mono flex items-center justify-between"
                      >
                        <span className="text-zinc-400 text-[11px]">{k}</span>
                        <span className="text-emerald-400 font-semibold">{v}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-[11px] text-zinc-500 italic">No persistent slots stored</p>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Privacy & DPPA Compliance
                </h3>
                <div className="mt-2 p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 space-y-1 text-xs">
                  <div className="flex items-center gap-1.5 text-emerald-400 text-[11px]">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Consent: Terms & Privacy Accepted</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-zinc-400 text-[11px]">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Retention: 30-day auto-purge</span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-zinc-500">No user metadata selected</p>
          )}
        </div>
      </div>
    </div>
  );
}
