'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  ScrollText,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Unlock,
  Lock,
} from 'lucide-react';
import { AdminGate } from '@/components/layout/admin-gate';
import { adminFetch, useAdminSession } from '@/lib/client/admin-session';

interface EntitlementRow {
  id: string;
  userId: string;
  serviceCode: string;
  serviceName: string;
  phone: string;
  userName: string | null;
  status: 'NONE' | 'TRIAL' | 'ACTIVE' | 'EXPIRED';
  trialStartsAt: string | null;
  trialExpiresAt: string | null;
  paidUntil: string | null;
  usageCount: number;
  usageLimit: number | null;
  lastUsedAt: string | null;
}

interface TrialGrantRow {
  id: string;
  userId: string;
  serviceCode: string;
  identityKey: string;
  phone: string;
  grantedAt: string;
  expiresAt: string;
}

interface AuditRow {
  id: string;
  actor: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  createdAt: string;
}

interface AccessPayload {
  entitlements: EntitlementRow[];
  trialGrants: TrialGrantRow[];
}

interface AuditPayload {
  entries: AuditRow[];
}

export function AccessAuditScreen() {
  const session = useAdminSession();
  const [access, setAccess] = useState<AccessPayload | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [settled, setSettled] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [grant, setGrant] = useState({ userId: '', serviceCode: '', reason: '' });
  // First load happens from the effect, later ones from the Reload button, so the
  // spinner covers both without writing state before the effect body finishes.
  const loading = session.authed && (!settled || refreshing);

  const load = useCallback(() => {
    void Promise.all([
      adminFetch<AccessPayload>('/api/admin/entitlements'),
      adminFetch<AuditPayload>('/api/admin/audit?limit=400'),
    ]).then(([a, b]) => {
      setRefreshing(false);
      setSettled(true);
      if (a.ok && a.data) setAccess(a.data);
      if (b.ok && b.data) setAudit(b.data.entries);
      const err = a.error || b.error;
      if (err) setMessage({ kind: 'error', text: err });
    });
  }, []);

  useEffect(() => {
    if (session.authed) load();
  }, [session.authed, load]);

  const revoke = useCallback(
    async (id: string) => {
      setBusy(`revoke:${id}`);
      const res = await adminFetch('/api/admin/entitlements', {
        method: 'POST',
        body: JSON.stringify({ action: 'REVOKE', entitlementId: id }),
      });
      setBusy(null);
      setMessage(
        res.ok
          ? { kind: 'ok', text: 'Entitlement revoked. The trial grant record remains, so no new free trial is issued.' }
          : { kind: 'error', text: res.error || 'Revocation failed.' }
      );
      if (res.ok) load();
    },
    [load]
  );

  const manualGrant = useCallback(async () => {
    setBusy('grant');
    const res = await adminFetch('/api/admin/entitlements', {
      method: 'POST',
      body: JSON.stringify({ action: 'GRANT', ...grant }),
    });
    setBusy(null);
    if (res.ok) {
      setMessage({ kind: 'ok', text: 'Access granted manually and written to the audit trail.' });
      setGrant({ userId: '', serviceCode: '', reason: '' });
      load();
    } else {
      setMessage({ kind: 'error', text: res.error || 'Grant refused.' });
    }
  }, [grant, load]);

  const shown = audit.filter(
    (e) =>
      !filter.trim() ||
      `${e.action} ${e.summary} ${e.actor} ${e.targetType}`.toLowerCase().includes(filter.trim().toLowerCase())
  );

  if (!session.authed) {
    return (
      <div className="p-4 sm:p-6 space-y-5">
        <Header />
        <AdminGate session={session} scope="Entitlements and the audit trail are visible only to administrators." />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <Header />

      {message && (
        <div
          className={`p-3 rounded-xl border flex items-start gap-2 text-xs ${
            message.kind === 'ok'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
          }`}
        >
          {message.kind === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-zinc-500">
          Revoking access never deletes the trial record, so the same person cannot start a second free trial.
        </p>
        <button
          onClick={() => {
            setRefreshing(true);
            load();
          }}
          disabled={loading}
          className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[11px] font-semibold text-zinc-200 flex items-center gap-1.5"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          <span>Reload</span>
        </button>
      </div>

      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800">
          <h2 className="text-sm font-bold text-white">
            Entitlements ({access?.entitlements.length ?? 0})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
                <th className="px-4 py-2.5 font-semibold">Customer</th>
                <th className="px-2 py-2.5 font-semibold">Service</th>
                <th className="px-2 py-2.5 font-semibold">Status</th>
                <th className="px-2 py-2.5 font-semibold">Trial ends</th>
                <th className="px-2 py-2.5 font-semibold">Paid until</th>
                <th className="px-2 py-2.5 font-semibold">Usage</th>
                <th className="px-2 py-2.5 font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {(access?.entitlements ?? []).map((e) => (
                <tr key={e.id} className="hover:bg-zinc-950/40">
                  <td className="px-4 py-2.5">
                    <p className="text-zinc-200">{e.phone}</p>
                    {e.userName && <p className="text-[10px] text-zinc-500">{e.userName}</p>}
                  </td>
                  <td className="px-2 py-2.5 text-zinc-300">{e.serviceName}</td>
                  <td className="px-2 py-2.5">
                    <StatusPill status={e.status} />
                  </td>
                  <td className="px-2 py-2.5 text-[10px] text-zinc-400">
                    {e.trialExpiresAt ? new Date(e.trialExpiresAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-2 py-2.5 text-[10px] text-zinc-400">
                    {e.paidUntil ? new Date(e.paidUntil).toLocaleString() : '—'}
                  </td>
                  <td className="px-2 py-2.5 text-[10px] text-zinc-400">
                    {e.usageCount}
                    {e.usageLimit != null ? ` / ${e.usageLimit}` : ' / unlimited'}
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <button
                      onClick={() => void revoke(e.id)}
                      disabled={busy !== null || e.status === 'NONE'}
                      className="px-2 py-1 rounded-md bg-zinc-800 hover:bg-red-500/20 border border-zinc-700 disabled:opacity-40 text-[10px] font-semibold text-zinc-300 hover:text-red-300 flex items-center gap-1.5 ml-auto"
                    >
                      <Lock className="w-3 h-3" />
                      <span>Revoke</span>
                    </button>
                  </td>
                </tr>
              ))}
              {(access?.entitlements ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-[11px] text-zinc-500">
                    Nobody has selected a service yet, so no entitlements exist.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800">
          <h2 className="text-sm font-bold text-white">
            Trial grants ({access?.trialGrants.length ?? 0}) — append-only, blocks repeat trials
          </h2>
        </div>
        <div className="overflow-x-auto max-h-72">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
                <th className="px-4 py-2.5 font-semibold">Phone</th>
                <th className="px-2 py-2.5 font-semibold">Identity key</th>
                <th className="px-2 py-2.5 font-semibold">Service</th>
                <th className="px-2 py-2.5 font-semibold">Granted</th>
                <th className="px-2 py-2.5 font-semibold">Expired</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {(access?.trialGrants ?? []).map((g) => (
                <tr key={g.id}>
                  <td className="px-4 py-2.5 text-zinc-200">{g.phone}</td>
                  <td className="px-2 py-2.5 font-mono text-[10px] text-zinc-500">{g.identityKey}</td>
                  <td className="px-2 py-2.5 text-zinc-300">{g.serviceCode}</td>
                  <td className="px-2 py-2.5 text-[10px] text-zinc-400">{new Date(g.grantedAt).toLocaleString()}</td>
                  <td className="px-2 py-2.5 text-[10px] text-zinc-400">{new Date(g.expiresAt).toLocaleString()}</td>
                </tr>
              ))}
              {(access?.trialGrants ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-5 text-center text-[11px] text-zinc-500">
                    No free trial has been granted yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <Unlock className="w-4 h-4 text-emerald-400" />
          <span>Grant access without a payment</span>
        </h2>
        <p className="text-[11px] text-zinc-400">
          For goodwill, offline payment or a test account. A written reason is mandatory and the entry is recorded
          with your administrator identity.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input
            value={grant.userId}
            onChange={(e) => setGrant({ ...grant, userId: e.target.value })}
            placeholder="user id (from Users screen)"
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 outline-none focus:border-emerald-500/40"
          />
          <input
            value={grant.serviceCode}
            onChange={(e) => setGrant({ ...grant, serviceCode: e.target.value.toUpperCase() })}
            placeholder="SERVICE_CODE"
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 outline-none focus:border-emerald-500/40"
          />
          <input
            value={grant.reason}
            onChange={(e) => setGrant({ ...grant, reason: e.target.value })}
            placeholder="Reason (required)"
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 outline-none focus:border-emerald-500/40"
          />
        </div>
        <button
          onClick={() => void manualGrant()}
          disabled={busy !== null || !grant.userId || !grant.serviceCode || !grant.reason.trim()}
          className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-bold text-white flex items-center gap-2"
        >
          {busy === 'grant' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
          <span>Grant and record in audit trail</span>
        </button>
      </div>

      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-purple-400" />
            <span>Audit trail ({shown.length})</span>
          </h2>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filter by action, actor or reference"
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-[11px] text-zinc-100 outline-none focus:border-emerald-500/40 w-64"
          />
        </div>
        <div className="divide-y divide-zinc-800/70 max-h-[520px] overflow-y-auto">
          {shown.map((e) => (
            <div key={e.id} className="px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-mono font-semibold text-emerald-400">{e.action}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                  {e.actorRole}
                </span>
                <span className="text-[10px] text-zinc-500">{e.actor}</span>
                <span className="text-[10px] text-zinc-600 ml-auto">{new Date(e.createdAt).toLocaleString()}</span>
              </div>
              <p className="text-[11px] text-zinc-300 mt-1">{e.summary}</p>
            </div>
          ))}
          {shown.length === 0 && (
            <p className="px-4 py-6 text-center text-[11px] text-zinc-500">Nothing recorded yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-xl font-bold text-white flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-emerald-400" />
        <span>Access, Trials &amp; Audit</span>
      </h1>
      <p className="text-xs text-zinc-400 mt-1">
        Who currently holds access to which service, which free trials have already been consumed, and every
        commercial or curriculum change with the identity that made it.
      </p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ACTIVE: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
    TRIAL: 'bg-purple-500/10 text-purple-300 border-purple-500/25',
    EXPIRED: 'bg-amber-500/10 text-amber-300 border-amber-500/25',
    NONE: 'bg-zinc-800 text-zinc-400 border-zinc-700',
  };
  return (
    <span className={`text-[10px] px-2 py-1 rounded-md font-semibold border whitespace-nowrap ${styles[status] || styles.NONE}`}>
      {status}
    </span>
  );
}
