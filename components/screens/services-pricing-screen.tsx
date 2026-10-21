'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Wallet,
  Save,
  Plus,
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ListChecks,
} from 'lucide-react';
import { AdminGate } from '@/components/layout/admin-gate';
import { adminFetch, useAdminSession } from '@/lib/client/admin-session';

interface Service {
  id: string;
  code: string;
  nameEn: string;
  nameRw: string;
  descriptionEn: string;
  descriptionRw: string;
  agentType: string;
  isEnabled: boolean;
  showInWhatsAppMenu: boolean;
  isFree: boolean;
  chargeEnabled: boolean;
  price: number;
  currency: 'RWF' | 'USD' | 'EUR';
  billingPeriod: 'PER_USE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
  trialHours: number;
  trialUsageLimit: number;
  paidUsageLimit: number;
  sortOrder: number;
}

interface Stats {
  services: number;
  enabledServices: number;
  chargeableServices: number;
  entitlements: number;
  activeTrials: number;
  trialGrants: number;
  paymentOrders: number;
  verifiedPayments: number;
}

interface ServicesPayload {
  services: Service[];
  stats: Stats;
  agentTypes: string[];
}

const BLANK: Service = {
  id: '',
  code: '',
  nameEn: '',
  nameRw: '',
  descriptionEn: '',
  descriptionRw: '',
  agentType: 'ROUTER',
  isEnabled: true,
  showInWhatsAppMenu: true,
  isFree: true,
  chargeEnabled: false,
  price: 0,
  currency: 'RWF',
  billingPeriod: 'MONTHLY',
  trialHours: 24,
  trialUsageLimit: 0,
  paidUsageLimit: 0,
  sortOrder: 100,
};

export function ServicesPricingScreen() {
  const session = useAdminSession();
  const [services, setServices] = useState<Service[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [agentTypes, setAgentTypes] = useState<string[]>(['ROUTER']);
  const [draft, setDraft] = useState<Service | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [settled, setSettled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  // The first load runs from the effect below and later ones from Reload, so the
  // spinner is derived instead of started synchronously inside the effect.
  const loading = session.authed && (!settled || refreshing);

  const load = useCallback(() => {
    void adminFetch<ServicesPayload>('/api/admin/services').then((res) => {
      setRefreshing(false);
      setSettled(true);
      if (res.ok && res.data) {
        setServices(res.data.services);
        setStats(res.data.stats);
        setAgentTypes(res.data.agentTypes);
      } else if (res.error) {
        setMessage({ kind: 'error', text: res.error });
      }
    });
  }, []);

  useEffect(() => {
    if (session.authed) load();
  }, [session.authed, load]);

  const patchService = useCallback(
    async (code: string, patch: Partial<Service>) => {
      setSaving(true);
      const res = await adminFetch<{ service: Service }>(
        '/api/admin/services',
        { method: 'PATCH', body: JSON.stringify({ code, ...patch }) }
      );
      setSaving(false);
      if (res.ok && res.data) {
        setServices((prev) => prev.map((s) => (s.code === code ? res.data!.service : s)));
        setMessage({ kind: 'ok', text: `${code} updated.` });
        return true;
      }
      setMessage({ kind: 'error', text: res.error || 'Update rejected.' });
      return false;
    },
    []
  );

  const saveDraft = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    const isNew = draft.id === '';
    const res = await adminFetch<{ service: Service }>(
      isNew ? '/api/admin/services' : '/api/admin/services',
      { method: isNew ? 'POST' : 'PATCH', body: JSON.stringify(draft) }
    );
    setSaving(false);
    if (res.ok && res.data) {
      setMessage({ kind: 'ok', text: isNew ? `${res.data.service.code} created.` : `${res.data.service.code} saved.` });
      setDraft(null);
      load();
      return;
    }
    setMessage({ kind: 'error', text: res.error || 'The server refused this configuration.' });
  }, [draft, load]);

  const removeService = useCallback(
    async (code: string) => {
      setSaving(true);
      const res = await adminFetch(`/api/admin/services?code=${encodeURIComponent(code)}`, { method: 'DELETE' });
      setSaving(false);
      if (res.ok) {
        setServices((prev) => prev.filter((s) => s.code !== code));
        setMessage({ kind: 'ok', text: `${code} deleted.` });
      } else {
        setMessage({ kind: 'error', text: res.error || 'Deletion refused.' });
      }
    },
    []
  );

  const summary = useMemo(
    () => [
      { label: 'Services', value: stats?.services ?? '—' },
      { label: 'Enabled', value: stats?.enabledServices ?? '—' },
      { label: 'Chargeable', value: stats?.chargeableServices ?? '—' },
      { label: 'Entitlements', value: stats?.entitlements ?? '—' },
      { label: 'Live trials', value: stats?.activeTrials ?? '—' },
      { label: 'Verified payments', value: stats?.verifiedPayments ?? '—' },
    ],
    [stats]
  );

  if (!session.authed) {
    return (
      <div className="p-4 sm:p-6 space-y-5">
        <Header />
        <AdminGate session={session} scope="Pricing, trial policy and service availability can only be changed by an administrator." />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <Header />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {summary.map((card) => (
          <div key={card.label} className="p-3 rounded-xl bg-zinc-900 border border-zinc-800">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">{card.label}</p>
            <p className="text-lg font-bold text-white mt-1">{card.value}</p>
          </div>
        ))}
      </div>

      {message && (
        <div
          className={`p-3 rounded-xl border flex items-start gap-2 text-xs ${
            message.kind === 'ok'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
          }`}
        >
          {message.kind === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-400 leading-relaxed">
        Every service ships with charging switched off and a price of 0, so an unconfirmed price can never bill
        or lock out a real person. Turn on <span className="text-zinc-200 font-semibold">Charge</span> only after
        you have set the amount — the server refuses to enable charging at 0.
      </div>

      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-emerald-400" />
            <span>Services, WhatsApp menu and pricing</span>
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setRefreshing(true); load(); }}
              disabled={loading}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[11px] font-semibold text-zinc-200 flex items-center gap-1.5"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              <span>Reload</span>
            </button>
            <button
              onClick={() => setDraft({ ...BLANK })}
              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-[11px] font-bold text-white flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New service</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
                <th className="px-4 py-2.5 font-semibold">Service</th>
                <th className="px-2 py-2.5 font-semibold">Agent</th>
                <th className="px-2 py-2.5 font-semibold">Enabled</th>
                <th className="px-2 py-2.5 font-semibold">In menu</th>
                <th className="px-2 py-2.5 font-semibold">Charge</th>
                <th className="px-2 py-2.5 font-semibold">Price</th>
                <th className="px-2 py-2.5 font-semibold">Trial h</th>
                <th className="px-2 py-2.5 font-semibold">Trial uses</th>
                <th className="px-2 py-2.5 font-semibold">Paid uses</th>
                <th className="px-2 py-2.5 font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {services.map((s) => (
                <tr key={s.code} className="hover:bg-zinc-950/40">
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-white">{s.nameEn}</p>
                    <p className="text-[10px] text-zinc-400">{s.nameRw}</p>
                    <p className="text-[10px] font-mono text-zinc-500">{s.code}</p>
                  </td>
                  <td className="px-2 py-2.5 text-zinc-300">{s.agentType}</td>
                  <td className="px-2 py-2.5">
                    <Toggle on={s.isEnabled} onChange={(v) => void patchService(s.code, { isEnabled: v })} />
                  </td>
                  <td className="px-2 py-2.5">
                    <Toggle on={s.showInWhatsAppMenu} onChange={(v) => void patchService(s.code, { showInWhatsAppMenu: v })} />
                  </td>
                  <td className="px-2 py-2.5">
                    <Toggle on={s.chargeEnabled} disabled={s.isFree} onChange={(v) => void patchService(s.code, { chargeEnabled: v })} />
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-1">
                      <NumberCell value={s.price} min={0} step={50} onCommit={(v) => void patchService(s.code, { price: v })} />
                      <select
                        value={s.currency}
                        onChange={(e) => void patchService(s.code, { currency: e.target.value as Service['currency'] })}
                        className="bg-zinc-950 border border-zinc-800 rounded-md px-1 py-1 text-[10px] text-zinc-300 outline-none"
                      >
                        <option value="RWF">RWF</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                      </select>
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-0.5">{s.billingPeriod.replace('_', ' ')}</p>
                  </td>
                  <td className="px-2 py-2.5">
                    <NumberCell value={s.trialHours} min={0} max={744} onCommit={(v) => void patchService(s.code, { trialHours: v })} />
                  </td>
                  <td className="px-2 py-2.5">
                    <NumberCell value={s.trialUsageLimit} min={0} onCommit={(v) => void patchService(s.code, { trialUsageLimit: v })} />
                  </td>
                  <td className="px-2 py-2.5">
                    <NumberCell value={s.paidUsageLimit} min={0} onCommit={(v) => void patchService(s.code, { paidUsageLimit: v })} />
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => setDraft({ ...s })}
                        className="px-2 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[10px] font-semibold text-zinc-200"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => void removeService(s.code)}
                        disabled={saving}
                        className="p-1.5 rounded-md bg-zinc-800 hover:bg-red-500/20 border border-zinc-700 text-zinc-400 hover:text-red-300 disabled:opacity-50"
                        aria-label={`Delete ${s.code}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {services.length === 0 && !loading && (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-center text-zinc-500 text-xs">
                    No services are configured yet. The catalog seeds automatically on the next WhatsApp menu request.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {draft && (
        <div className="p-5 rounded-2xl bg-zinc-900 border border-emerald-500/20 space-y-4">
          <h2 className="text-sm font-bold text-white">
            {draft.id ? `Edit ${draft.code}` : 'Create a service'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Code (stable key)">
              <input
                value={draft.code}
                disabled={Boolean(draft.id)}
                onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
                className={inputClass}
                placeholder="PHOTO_EDITING"
              />
            </Field>
            <Field label="Routed agent">
              <select
                value={draft.agentType}
                onChange={(e) => setDraft({ ...draft, agentType: e.target.value })}
                className={inputClass}
              >
                {agentTypes.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Name (English)">
              <input value={draft.nameEn} onChange={(e) => setDraft({ ...draft, nameEn: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Izina (Kinyarwanda)">
              <input value={draft.nameRw} onChange={(e) => setDraft({ ...draft, nameRw: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Description (English)">
              <textarea
                rows={2}
                value={draft.descriptionEn}
                onChange={(e) => setDraft({ ...draft, descriptionEn: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Ibisobanuro (Kinyarwanda)">
              <textarea
                rows={2}
                value={draft.descriptionRw}
                onChange={(e) => setDraft({ ...draft, descriptionRw: e.target.value })}
                className={inputClass}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Price">
              <input
                type="number"
                min={0}
                step="50"
                value={draft.price}
                onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })}
                className={inputClass}
              />
            </Field>
            <Field label="Billing period">
              <select
                value={draft.billingPeriod}
                onChange={(e) => setDraft({ ...draft, billingPeriod: e.target.value as Service['billingPeriod'] })}
                className={inputClass}
              >
                <option value="PER_USE">Per use</option>
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </Field>
            <Field label="Trial hours (0 = none)">
              <input
                type="number"
                min={0}
                max={744}
                value={draft.trialHours}
                onChange={(e) => setDraft({ ...draft, trialHours: Number(e.target.value) })}
                className={inputClass}
              />
            </Field>
            <Field label="Sort order">
              <input
                type="number"
                value={draft.sortOrder}
                onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })}
                className={inputClass}
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Check label="Enabled" on={draft.isEnabled} onChange={(v) => setDraft({ ...draft, isEnabled: v })} />
            <Check label="Show in WhatsApp menu" on={draft.showInWhatsAppMenu} onChange={(v) => setDraft({ ...draft, showInWhatsAppMenu: v })} />
            <Check label="Free service" on={draft.isFree} onChange={(v) => setDraft({ ...draft, isFree: v, chargeEnabled: v ? false : draft.chargeEnabled })} />
            <Check
              label="Charging enabled"
              on={draft.chargeEnabled}
              disabled={draft.isFree}
              onChange={(v) => setDraft({ ...draft, chargeEnabled: v })}
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void saveDraft()}
              disabled={saving || !draft.code || !draft.nameEn}
              className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-bold text-white flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{draft.id ? 'Save changes' : 'Create service'}</span>
            </button>
            <button
              onClick={() => setDraft(null)}
              className="px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-semibold text-zinc-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const inputClass =
  'w-full bg-zinc-950 text-xs text-zinc-100 px-3 py-2 rounded-lg border border-zinc-800 focus:border-emerald-500/40 outline-none';

function Header() {
  return (
    <div>
      <h1 className="text-xl font-bold text-white flex items-center gap-2">
        <Wallet className="w-5 h-5 text-emerald-400" />
        <span>Services, Trials &amp; Pricing</span>
      </h1>
      <p className="text-xs text-zinc-400 mt-1">
        Which services exist, which appear in the WhatsApp selection menu, and what each one costs after the free
        trial. Changes apply immediately and are recorded in the audit trail.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Check({
  label,
  on,
  disabled,
  onChange,
}: {
  label: string;
  on: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={`flex items-center gap-2 text-xs ${disabled ? 'text-zinc-600' : 'text-zinc-300'}`}>
      <input
        type="checkbox"
        checked={on}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="w-3.5 h-3.5 accent-emerald-500"
      />
      <span>{label}</span>
    </label>
  );
}

function Toggle({ on, disabled, onChange }: { on: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative w-9 h-5 rounded-full transition-colors ${
        disabled ? 'bg-zinc-800 cursor-not-allowed' : on ? 'bg-emerald-600' : 'bg-zinc-700'
      }`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`}
      />
    </button>
  );
}

function NumberCell({
  value,
  min = 0,
  max,
  step = 1,
  onCommit,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onCommit: (value: number) => void;
}) {
  const [local, setLocal] = useState(String(value));
  const [shown, setShown] = useState(value);
  // Adopt a server-side change during render so an admin edit elsewhere replaces
  // the draft text instead of the cell keeping a stale value.
  if (value !== shown) {
    setShown(value);
    setLocal(String(value));
  }

  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        const parsed = Number(local);
        if (!Number.isFinite(parsed)) {
          setLocal(String(value));
          return;
        }
        const clamped = Math.max(min, max !== undefined ? Math.min(max, parsed) : parsed);
        if (clamped !== value) onCommit(clamped);
        setLocal(String(clamped));
      }}
      className="w-20 bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1 text-[11px] text-zinc-100 outline-none focus:border-emerald-500/40"
    />
  );
}
