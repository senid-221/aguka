'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  X,
  FlaskConical,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { TestResultItem } from '@/lib/testing/suite';
import { AdminGate } from '@/components/layout/admin-gate';
import { adminFetch, useAdminSession } from '@/lib/client/admin-session';

interface TestSuiteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SuitePayload {
  results?: TestResultItem[];
  total?: number;
  passedCount?: number;
  failedCount?: number;
}

export function TestSuiteModal({ isOpen, onClose }: TestSuiteModalProps) {
  const session = useAdminSession();
  const [results, setResults] = useState<TestResultItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [settled, setSettled] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ total: number; passed: number; failed: number } | null>(null);
  // The first run starts from the effect and later ones from the rerun button, so the
  // spinner is derived rather than started synchronously inside the effect.
  const isRunning = session.authed && (!settled || refreshing);

  const load = useCallback(() => {
    adminFetch<SuitePayload>('/api/tests')
      .then((res) => {
        setRefreshing(false);
        setSettled(true);
        if (!res.ok || !res.data) {
          setNotice(res.error || 'The suite did not run.');
          return;
        }
        setNotice(null);
        setResults(res.data.results || []);
        setSummary({
          total: res.data.total || 0,
          passed: res.data.passedCount || 0,
          failed: res.data.failedCount || 0,
        });
      })
      .catch((err) => {
        setRefreshing(false);
        console.error('Test execution failed:', err);
      });
  }, []);

  const rerun = () => {
    setRefreshing(true);
    load();
  };

  useEffect(() => {
    if (isOpen && session.authed) load();
  }, [isOpen, session.authed, load]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-2xl bg-zinc-950 border border-zinc-800 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <FlaskConical className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Aguka Platform Automated Test Suite</span>
                {summary && (
                  <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                    summary.failed === 0
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}>
                    {summary.failed === 0 ? 'ALL PASSED (100%)' : `${summary.failed} Failed`}
                  </span>
                )}
              </h2>
              <p className="text-xs text-zinc-400">
                Verifying webhook challenge, HMAC-SHA256, deduplication, bilingual routing, and prompt security.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={rerun}
              disabled={isRunning}
              className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
              title="Rerun tests"
            >
              <RefreshCw className={`w-4 h-4 ${isRunning ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Test Items List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {!session.authed ? (
            <AdminGate session={session} scope="The suite is the platform's own verification, so it is opened from an administrator session." />
          ) : notice ? (
            <p className="text-xs text-amber-400">{notice}</p>
          ) : isRunning ? (
            <div className="text-center py-12 space-y-2">
              <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin mx-auto" />
              <p className="text-xs text-zinc-400 font-mono">Running platform test suite assertions...</p>
            </div>
          ) : (
            results.map((r) => (
              <div
                key={r.id}
                className={`p-3.5 rounded-xl border text-xs space-y-2 transition-all ${
                  r.passed
                    ? 'bg-zinc-900/80 border-emerald-500/30 text-zinc-200'
                    : 'bg-red-950/20 border-red-500/40 text-red-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {r.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                    )}
                    <span className="font-bold text-white">{r.name}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 font-mono">
                      {r.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-mono">
                    <Clock className="w-3 h-3 text-zinc-500" />
                    <span>{r.durationMs}ms</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono pt-1 text-zinc-400">
                  <div>
                    <span className="text-zinc-500 text-[10px] block">EXPECTED</span>
                    <span className="text-zinc-300">{r.expected}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px] block">ACTUAL RESULT</span>
                    <span className={r.passed ? 'text-emerald-400' : 'text-red-400'}>
                      {r.actual}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Assertions run in runtime memory against live controllers.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-xs transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
