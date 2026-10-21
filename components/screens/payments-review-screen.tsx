'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Banknote,
  RefreshCw,
  ShieldCheck,
  XCircle,
  AlertCircle,
  Loader2,
  Image as ImageIcon,
  Search,
  Clock,
} from 'lucide-react';
import { AdminGate } from '@/components/layout/admin-gate';
import { adminBlobUrl, adminFetch, useAdminSession } from '@/lib/client/admin-session';

interface Signal {
  code: string;
  label: string;
  detail: string;
  severity: 'INFO' | 'WARN' | 'HIGH';
  weight: number;
}

interface Ocr {
  attempted: boolean;
  available: boolean;
  provider: string;
  reason: string;
  extractedText: string | null;
  matchedAmount: boolean | null;
  matchedReference: boolean | null;
  matchedPayee: boolean | null;
}

interface Proof {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  width: number | null;
  height: number | null;
  riskScore: number;
  riskBand: 'LOW' | 'MEDIUM' | 'HIGH';
  duplicateCount: number;
  duplicateReferences: string[];
  signals: Signal[];
  ocr: Ocr;
  reviewStatus: string;
  createdAt: string;
}

interface Order {
  id: string;
  reference: string;
  userPhone: string;
  serviceCode: string;
  payeeMomoCode: string;
  amount: number;
  currency: string;
  status: string;
  riskBand: string | null;
  verificationSource: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  providerTransactionId: string | null;
  rejectionReason: string | null;
  grantedEntitlementUntil: string | null;
  createdAt: string;
  proofIds: string[];
}

interface QueueItem {
  order: Order;
  phone: string;
  userName: string | null;
  serviceName: string;
  proofs: Proof[];
}

interface PaymentsPayload {
  config: {
    payeeName: string;
    momoCode: string;
    autoVerifyFromProvider: boolean;
    providerEndpointConfigured: boolean;
  };
  queue: QueueItem[];
  orders: Order[];
  stats: Record<string, number>;
}

export function PaymentsReviewScreen() {
  const session = useAdminSession();
  const [data, setData] = useState<PaymentsPayload | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [settled, setSettled] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [preview, setPreview] = useState<Record<string, string>>({});
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const objectUrls = useRef<string[]>([]);
  // The first load runs from the effect below and later ones from Reload, so the
  // spinner is derived instead of started synchronously inside the effect.
  const loading = session.authed && (!settled || refreshing);

  const load = useCallback(() => {
    void adminFetch<PaymentsPayload>('/api/admin/payments').then((res) => {
      setRefreshing(false);
      setSettled(true);
      if (res.ok && res.data) setData(res.data);
      else if (res.error) setMessage({ kind: 'error', text: res.error });
    });
  }, []);

  useEffect(() => {
    if (session.authed) load();
  }, [session.authed, load]);

  useEffect(
    () => () => {
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.current = [];
    },
    []
  );

  const act = useCallback(
    async (action: 'VERIFY' | 'REJECT' | 'RECONCILE', reference: string, reason?: string) => {
      setBusy(`${action}:${reference}`);
      const res = await adminFetch<{ message: string; verified: boolean }>(
        '/api/admin/payments',
        { method: 'POST', body: JSON.stringify({ action, reference, reason }) }
      );
      setBusy(null);
      setMessage({
        kind: res.ok ? 'ok' : 'error',
        text: res.data?.message || res.error || 'No response from the server.',
      });
      if (res.ok) load();
    },
    [load]
  );

  const showReceipt = useCallback(async (proofId: string) => {
    if (preview[proofId]) return;
    setBusy(`image:${proofId}`);
    const res = await adminBlobUrl(`/api/admin/payments/image?proofId=${encodeURIComponent(proofId)}`);
    setBusy(null);
    if (res.url) {
      objectUrls.current.push(res.url);
      setPreview((prev) => ({ ...prev, [proofId]: res.url! }));
    } else {
      setMessage({ kind: 'error', text: res.error || 'The receipt image could not be loaded.' });
    }
  }, [preview]);

  if (!session.authed) {
    return (
      <div className="p-4 sm:p-6 space-y-5">
        <Header />
        <AdminGate session={session} scope="Payment verification is the only way a paid service unlocks, so it is administrator-only." />
      </div>
    );
  }

  const queue = data?.queue ?? [];
  const orders = data?.orders ?? [];

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
          {message.kind === 'ok' ? <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
          <span>{message.text}</span>
        </div>
      )}

      {data && (
        <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <Stat label="MoMo payee" value={`${data.config.payeeName} · ${data.config.momoCode}`} />
          <Stat label="Orders" value={String(data.stats.paymentOrders ?? 0)} />
          <Stat label="Awaiting review" value={String(data.stats.awaitingReview ?? 0)} />
          <Stat label="Verified" value={String(data.stats.verifiedPayments ?? 0)} />
          <div className="sm:col-span-2 lg:col-span-4 p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-400 leading-relaxed">
            {!data.config.providerEndpointConfigured ? (
              <span className="text-amber-300">
                No payment-provider endpoint is configured (MOMO_VERIFY_API_URL / MOMO_VERIFY_API_TOKEN). Receipt
                screenshots and their forensic analysis are supporting evidence only — nothing here confirms that
                money actually arrived, so each order must be checked against your own MoMo statement and approved
                by an administrator.
              </span>
            ) : (
              <span>
                A provider endpoint is configured. Auto-verification is{' '}
                <strong className="text-zinc-200">{data.config.autoVerifyFromProvider ? 'ON' : 'OFF'}</strong>
                {data.config.autoVerifyFromProvider
                  ? '; successful lookups unlock the service without a human step.'
                  : '; every match still needs an administrator to press Verify.'}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-zinc-900 border border-zinc-800">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <span>Verification queue ({queue.length})</span>
          </h2>
          <button
            onClick={() => { setRefreshing(true); load(); }}
            disabled={loading}
            className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[11px] font-semibold text-zinc-200 flex items-center gap-1.5"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            <span>Reload</span>
          </button>
        </div>

        <div className="p-4 space-y-4">
          {queue.length === 0 && (
            <p className="text-xs text-zinc-500 py-4 text-center">
              Nothing is waiting for review. Orders appear here as soon as a customer uploads a receipt.
            </p>
          )}

          {queue.map((item) => (
            <div key={item.order.id} className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-sm font-bold text-white">{item.order.reference}</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    {item.serviceName} · {item.phone}
                    {item.userName ? ` (${item.userName})` : ''} ·{' '}
                    {item.order.amount.toLocaleString()} {item.order.currency}
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">
                    Sent to MoMo code {item.order.payeeMomoCode ?? data?.config.momoCode} ·{' '}
                    {new Date(item.order.createdAt).toLocaleString()}
                  </p>
                </div>
                <RiskBadge band={item.order.riskBand ?? 'LOW'} />
              </div>

              {item.proofs.length === 0 && (
                <p className="text-[11px] text-amber-300">
                  This order is in the queue without any receipt attached. Verify is blocked until a screenshot is
                  uploaded or the provider confirms the payment.
                </p>
              )}

              {item.proofs.map((proof) => (
                <div key={proof.id} className="p-3 rounded-lg bg-zinc-900/70 border border-zinc-800 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold text-zinc-200 truncate max-w-[60%]">{proof.fileName}</p>
                    <p className="text-[10px] font-mono text-zinc-500">
                      {Math.round(proof.sizeBytes / 1024)} KB · {proof.width ?? '?'}×{proof.height ?? '?'} ·{' '}
                      sha {proof.sha256.slice(0, 10)}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => void showReceipt(proof.id)}
                      disabled={busy === `image:${proof.id}`}
                      className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[11px] font-semibold text-zinc-200 flex items-center gap-1.5 disabled:opacity-60"
                    >
                      {busy === `image:${proof.id}` ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ImageIcon className="w-3.5 h-3.5" />
                      )}
                      <span>{preview[proof.id] ? 'Receipt loaded' : 'Load receipt'}</span>
                    </button>
                    {proof.duplicateCount > 0 && (
                      <span className="px-2 py-1 rounded-md bg-red-500/10 border border-red-500/20 text-[10px] font-semibold text-red-300">
                        Same image used for {proof.duplicateReferences.join(', ') || `${proof.duplicateCount} other proof(s)`}
                      </span>
                    )}
                  </div>

                  {preview[proof.id] && (
                    <img
                      src={preview[proof.id]}
                      alt={`Receipt for ${item.order.reference}`}
                      className="max-h-72 w-auto rounded-lg border border-zinc-800 bg-white"
                    />
                  )}

                  <div className="space-y-1">
                    {proof.signals
                      .filter((s) => s.severity !== 'INFO')
                      .map((s, i) => (
                        <p
                          key={i}
                          className={`text-[11px] flex items-start gap-1.5 ${
                            s.severity === 'HIGH' ? 'text-red-300' : 'text-amber-300'
                          }`}
                        >
                          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>
                            <strong className="font-semibold">{s.label}:</strong> {s.detail}
                          </span>
                        </p>
                      ))}
                    {proof.signals
                      .filter((s) => s.severity === 'INFO')
                      .map((s, i) => (
                        <p key={i} className="text-[11px] text-zinc-500 flex items-start gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>
                            <strong className="font-semibold">{s.label}:</strong> {s.detail}
                          </span>
                        </p>
                      ))}
                    {proof.signals.length === 0 && (
                      <p className="text-[11px] text-zinc-500">No forensic findings for this image.</p>
                    )}
                  </div>

                  <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-400">
                    <p className="font-semibold text-zinc-300 mb-1">Receipt text reading</p>
                    {proof.ocr.available ? (
                      <div className="space-y-0.5">
                        <p>
                          Reference: <Match value={proof.ocr.matchedReference} /> · Amount:{' '}
                          <Match value={proof.ocr.matchedAmount} /> · Payee: <Match value={proof.ocr.matchedPayee} />
                        </p>
                        {proof.ocr.extractedText && (
                          <p className="mt-1.5 max-h-24 overflow-y-auto whitespace-pre-wrap font-mono text-[10px] text-zinc-500">
                            {proof.ocr.extractedText}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-amber-300">{proof.ocr.reason}</p>
                    )}
                  </div>
                </div>
              ))}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  onClick={() => void act('VERIFY', item.order.reference)}
                  disabled={busy !== null || item.proofs.length === 0}
                  className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-[11px] font-bold text-white flex items-center gap-1.5"
                >
                  {busy === `VERIFY:${item.order.reference}` ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-3.5 h-3.5" />
                  )}
                  <span>Confirm payment &amp; unlock</span>
                </button>
                <button
                  onClick={() => void act('RECONCILE', item.order.reference)}
                  disabled={busy !== null}
                  className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 disabled:opacity-50 text-[11px] font-semibold text-zinc-200 flex items-center gap-1.5"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Ask provider</span>
                </button>
                <div className="flex items-center gap-1.5 flex-1 min-w-[220px]">
                  <input
                    value={rejectReason[item.order.reference] ?? ''}
                    onChange={(e) => setRejectReason((prev) => ({ ...prev, [item.order.reference]: e.target.value }))}
                    placeholder="Reason for rejecting (required)"
                    className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-[11px] text-zinc-100 outline-none focus:border-red-500/40"
                  />
                  <button
                    onClick={() => void act('REJECT', item.order.reference, rejectReason[item.order.reference])}
                    disabled={busy !== null || !(rejectReason[item.order.reference] ?? '').trim()}
                    className="px-3 py-2 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/25 disabled:opacity-40 text-[11px] font-bold text-red-300 flex items-center gap-1.5"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Reject</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800">
          <h2 className="text-sm font-bold text-white">All transactions ({orders.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
                <th className="px-4 py-2.5 font-semibold">Reference</th>
                <th className="px-2 py-2.5 font-semibold">Customer</th>
                <th className="px-2 py-2.5 font-semibold">Service</th>
                <th className="px-2 py-2.5 font-semibold">Amount</th>
                <th className="px-2 py-2.5 font-semibold">Status</th>
                <th className="px-2 py-2.5 font-semibold">Verified by</th>
                <th className="px-2 py-2.5 font-semibold">Until</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-zinc-950/40">
                  <td className="px-4 py-2.5 font-mono text-zinc-200">{o.reference}</td>
                  <td className="px-2 py-2.5 text-zinc-300">{o.userPhone}</td>
                  <td className="px-2 py-2.5 text-zinc-300">{o.serviceCode}</td>
                  <td className="px-2 py-2.5 text-zinc-300">
                    {o.amount.toLocaleString()} {o.currency}
                  </td>
                  <td className="px-2 py-2.5">
                    <StatusPill status={o.status} />
                  </td>
                  <td className="px-2 py-2.5 text-[10px] text-zinc-400">
                    {o.verifiedBy ? `${o.verifiedBy}${o.verificationSource ? ` (${o.verificationSource})` : ''}` : '—'}
                  </td>
                  <td className="px-2 py-2.5 text-[10px] text-zinc-400">
                    {o.grantedEntitlementUntil ? new Date(o.grantedEntitlementUntil).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-zinc-500 text-xs">
                    No payment orders exist yet. They are created when a customer chooses a paid service.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-xl font-bold text-white flex items-center gap-2">
        <Banknote className="w-5 h-5 text-emerald-400" />
        <span>MoMo Payment Verification</span>
      </h1>
      <p className="text-xs text-zinc-400 mt-1">
        Receipts are analysed for editing traces, duplicates and matching text, but that analysis is supporting
        evidence only. A paid service unlocks only after you confirm the payment or the provider API verifies it.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">{label}</p>
      <p className="text-sm font-bold text-white mt-1 break-all">{value}</p>
    </div>
  );
}

function RiskBadge({ band }: { band: string }) {
  const styles =
    band === 'HIGH'
      ? 'bg-red-500/10 text-red-300 border-red-500/25'
      : band === 'MEDIUM'
        ? 'bg-amber-500/10 text-amber-300 border-amber-500/25'
        : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25';
  return (
    <span className={`text-[10px] px-2 py-1 rounded-md font-semibold border ${styles}`}>
      {band} risk
    </span>
  );
}

function Match({ value }: { value: boolean | null }) {
  if (value === true) return <span className="text-emerald-400 font-semibold">match</span>;
  if (value === false) return <span className="text-red-300 font-semibold">not found</span>;
  return <span className="text-zinc-500">unknown</span>;
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    VERIFIED: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
    REJECTED: 'bg-red-500/10 text-red-300 border-red-500/25',
    UNDER_REVIEW: 'bg-amber-500/10 text-amber-300 border-amber-500/25',
    PROOF_UPLOADED: 'bg-amber-500/10 text-amber-300 border-amber-500/25',
    AWAITING_PROOF: 'bg-zinc-800 text-zinc-300 border-zinc-700',
    EXPIRED: 'bg-zinc-800 text-zinc-400 border-zinc-700',
  };
  return (
    <span className={`text-[10px] px-2 py-1 rounded-md font-semibold border whitespace-nowrap ${styles[status] || styles.AWAITING_PROOF}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
