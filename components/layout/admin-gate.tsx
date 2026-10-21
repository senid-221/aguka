'use client';

import React, { useState } from 'react';
import { KeyRound, LogOut, ShieldCheck, Loader2, AlertCircle } from 'lucide-react';
import type { AdminSession } from '@/lib/client/admin-session';

interface AdminGateProps {
  session: AdminSession;
  /** What the unlocked area can change, shown next to the sign-in prompt. */
  scope: string;
}

/**
 * Sign-in card for the administrator-only areas. The token is kept in
 * sessionStorage only and is never written to cookies or localStorage.
 */
export function AdminGate({ session, scope }: AdminGateProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (session.authed) {
    return (
      <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-zinc-900 border border-zinc-800">
        <div className="flex items-center gap-2 text-xs text-zinc-300">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>
            Administrator session active. <span className="text-zinc-500">{scope}</span>
          </span>
        </div>
        <button
          onClick={session.signOut}
          className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[11px] font-semibold text-zinc-200 flex items-center gap-1.5 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>End session</span>
        </button>
      </div>
    );
  }

  return (
    <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 max-w-md">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
          <KeyRound className="w-4.5 h-4.5 text-emerald-400" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-white">Administrator sign-in required</h2>
          <p className="text-[11px] text-zinc-400">{scope}</p>
        </div>
      </div>

      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          await session.signIn(email, password);
          setPassword('');
        }}
      >
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin email"
          autoComplete="username"
          className="w-full bg-zinc-950 text-xs text-zinc-100 px-3 py-2.5 rounded-lg border border-zinc-800 focus:border-emerald-500/40 outline-none"
        />
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="admin password"
          autoComplete="current-password"
          className="w-full bg-zinc-950 text-xs text-zinc-100 px-3 py-2.5 rounded-lg border border-zinc-800 focus:border-emerald-500/40 outline-none"
        />
        {session.error && (
          <p className="text-[11px] text-amber-400 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{session.error}</span>
          </p>
        )}
        <button
          type="submit"
          disabled={session.signingIn}
          className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-xs font-bold text-white flex items-center justify-center gap-2 transition-colors"
        >
          {session.signingIn && <Loader2 className="w-4 h-4 animate-spin" />}
          <span>{session.signingIn ? 'Verifying…' : 'Sign in as administrator'}</span>
        </button>
      </form>

      <p className="text-[11px] text-zinc-500 mt-3 leading-relaxed">
        Sessions are disabled until <span className="font-mono text-zinc-400">ADMIN_JWT_SECRET</span>,{' '}
        <span className="font-mono text-zinc-400">ADMIN_DEFAULT_EMAIL</span> and{' '}
        <span className="font-mono text-zinc-400">ADMIN_DEFAULT_PASSWORD</span> are set on the server. No
        credentials are stored in this browser beyond the current tab session.
      </p>
    </div>
  );
}
