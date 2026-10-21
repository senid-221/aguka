import { PaymentOrder, PaymentProof, ProofSignal, ServiceDefinition, User } from '@/lib/types';
import { repo } from '@/lib/db/repository';
import { durableStore } from '@/lib/db/store';
import { newPaymentReference } from '@/lib/util/ids';
import {
  buildOcrOutcome,
  extractReceiptText,
  lookupMobileMoneyTransaction,
  normalizedPhone,
} from '@/lib/payments/adapters';
import { analyseProof, probeImage, riskFrom } from '@/lib/payments/image-forensics';
import { formatMoney, grantPaidAccess } from '@/lib/services/entitlements';

const MAX_PROOF_BYTES = 10 * 1024 * 1024;

export interface PaymentConfig {
  payeeName: string;
  momoCode: string;
  autoVerifyFromProvider: boolean;
  providerEndpointConfigured: boolean;
}

/**
 * Where the user sends the money. The payee name and MoMo code are the
 * operator's own configuration; defaults are the values the owner of this
 * deployment supplied, and they can be overridden per environment.
 */
export function paymentConfig(): PaymentConfig {
  return {
    payeeName: process.env.MOMO_PAYEE_NAME?.trim() || 'Vincent',
    momoCode: process.env.MOMO_PAYEE_CODE?.trim() || '935237',
    autoVerifyFromProvider: process.env.PAYMENT_AUTO_VERIFY === 'true',
    providerEndpointConfigured: Boolean(process.env.MOMO_VERIFY_API_URL?.trim() && process.env.MOMO_VERIFY_API_TOKEN?.trim()),
  };
}

export interface CreatedOrder {
  order: PaymentOrder;
  reused: boolean;
}

/**
 * Creating an order is idempotent: the same idempotency key returns the same
 * reference, so a double-tapped WhatsApp button cannot ask a customer to pay
 * twice.
 */
export function createOrder(
  user: User,
  service: ServiceDefinition,
  opts: { idempotencyKey?: string | null; actor?: string; actorRole?: 'ADMIN' | 'SYSTEM' | 'USER' } = {}
): CreatedOrder {
  const key = opts.idempotencyKey?.trim() || null;
  if (key) {
    const existing = repo.getPaymentOrderByIdempotencyKey(key);
    if (existing) return { order: existing, reused: true };
  }

  let reference = newPaymentReference();
  for (let attempt = 0; attempt < 5 && repo.getPaymentOrderByReference(reference); attempt++) {
    reference = newPaymentReference();
  }

  const cfg = paymentConfig();
  const order = repo.createPaymentOrder({
    reference,
    userId: user.id,
    userPhone: user.phoneNumber,
    serviceCode: service.code,
    amount: service.price,
    currency: service.currency,
    billingPeriod: service.billingPeriod,
    payeeName: cfg.payeeName,
    payeeMomoCode: cfg.momoCode,
    status: 'AWAITING_PROOF',
    idempotencyKey: key,
    proofIds: [],
    riskBand: null,
    verificationSource: null,
    verifiedBy: null,
    verifiedAt: null,
    providerTransactionId: null,
    rejectionReason: null,
    grantedEntitlementUntil: null,
  });

  repo.appendAudit({
    actor: opts.actor ?? user.phoneNumber,
    actorRole: opts.actorRole ?? 'USER',
    action: 'PAYMENT_ORDER_CREATED',
    targetType: 'PaymentOrder',
    targetId: order.id,
    summary: `Order ${order.reference} for ${service.code}: ${formatMoney(order.amount, order.currency)}`,
    before: null,
    after: { reference: order.reference, amount: order.amount, currency: order.currency },
  });

  return { order, reused: false };
}

export function paymentInstructions(order: PaymentOrder, service: ServiceDefinition, lang: 'ENGLISH' | 'KINYARWANDA'): string {
  const money = formatMoney(order.amount, order.currency);
  return lang === 'KINYARWANDA'
    ? `AMABWIRIZA YO KWISHYURA (${service.nameRw})
1. Fungura MoMo kuri telefone yawe.
2. Koresha MoMo Pay / Pay Bill: ${order.payeeMomoCode}
3. Uwakira: ${order.payeeName}
4. Igiciro: ${money}
5. Andika iyi nomero mu busobanuro bw'ubutumwa: ${order.reference}
6. Nyuma yo kwishyura, ohereza ifoto ya resita (screenshot) hano.

Iyi nomero ni iy'iyi gahunda imwe gusa (${order.reference}). Serivisi ntijya ibohorwa mbere y'uko kwishyura byemejwe.`
    : `PAYMENT INSTRUCTIONS (${service.nameEn})
1. Open MoMo on your phone.
2. Use MoMo Pay / Pay Bill code: ${order.payeeMomoCode}
3. Recipient: ${order.payeeName}
4. Amount: ${money}
5. Enter this reference in the message/note field: ${order.reference}
6. After paying, send a screenshot of the receipt here.

This reference is for this one order only (${order.reference}). The service never unlocks before the payment is verified.`;
}

export interface ProofUploadResult {
  proof: PaymentProof;
  order: PaymentOrder;
  warnings: string[];
}

export async function attachPaymentProof(
  order: PaymentOrder,
  buffer: Buffer,
  fileName: string,
  declaredMimeType: string,
  uploadedBy: string
): Promise<ProofUploadResult> {
  if (buffer.length === 0) throw new Error('The uploaded file is empty.');
  if (buffer.length > MAX_PROOF_BYTES) throw new Error(`Proof images must be ${MAX_PROOF_BYTES / 1024 / 1024} MB or smaller.`);

  const probe = probeImage(buffer);
  const findings = analyseProof(buffer, probe, {
    declaredMimeType,
    fileName,
    reference: order.reference,
    amount: order.amount,
    payeeName: order.payeeName,
  });

  const stored = durableStore.saveBinary(buffer, declaredMimeType);

  const duplicates = repo
    .findPaymentProofsByHash(stored.sha256)
    .filter((p) => p.orderId !== order.id);
  if (duplicates.length > 0) {
    const seen = [...new Set(duplicates.map((d) => d.reference))];
    findings.push({
      code: 'DUPLICATE_IMAGE',
      detail: `The exact same image bytes were already uploaded for order ${seen.join(', ')}.`,
      severity: 'HIGH',
      weight: 45,
    });
  }

  const ocrResult = await extractReceiptText(buffer.toString('base64'), probe.format === 'JPEG' ? 'image/jpeg' : `image/${probe.format.toLowerCase()}`);
  const ocr = buildOcrOutcome(ocrResult, {
    reference: order.reference,
    amount: order.amount,
    payeeName: order.payeeName,
  });

  if (ocr.available) {
    if (ocr.matchedReference === false) {
      findings.push({ code: 'REFERENCE_NOT_IN_IMAGE', detail: `The text read from the screenshot does not contain ${order.reference}.`, severity: 'HIGH', weight: 35 });
    }
    if (ocr.matchedAmount === false) {
      findings.push({ code: 'AMOUNT_NOT_IN_IMAGE', detail: `The amount ${order.amount} does not appear in the screenshot text.`, severity: 'HIGH', weight: 30 });
    }
    if (ocr.matchedPayee === false) {
      findings.push({ code: 'PAYEE_NOT_IN_IMAGE', detail: `The recipient name "${order.payeeName}" is not visible in the screenshot text.`, severity: 'WARN', weight: 20 });
    }
  } else {
    findings.push({
      code: 'OCR_UNAVAILABLE',
      detail: ocr.reason,
      severity: 'INFO',
      weight: 0,
    });
  }

  const risk = riskFrom(findings);
  const signals: ProofSignal[] = findings.map((f) => ({
    code: f.code,
    label: f.code.replace(/_/g, ' '),
    detail: f.detail,
    severity: f.severity,
    weight: f.weight,
  }));

  const proof = repo.createPaymentProof({
    orderId: order.id,
    reference: order.reference,
    userId: order.userId,
    uploadedBy,
    storageKey: stored.key,
    fileName,
    mimeType: probe.format === 'UNKNOWN' ? declaredMimeType : `image/${probe.format.toLowerCase()}`,
    sizeBytes: stored.sizeBytes,
    sha256: stored.sha256,
    width: probe.width,
    height: probe.height,
    duplicateProofIds: duplicates.map((d) => d.id),
    signals,
    riskScore: risk.score,
    riskBand: risk.band,
    ocr,
    reviewStatus: 'UNREVIEWED',
  });

  const updated = repo.updatePaymentOrder(order.id, {
    status: order.status === 'VERIFIED' ? 'VERIFIED' : 'UNDER_REVIEW',
    proofIds: [...order.proofIds, proof.id],
    riskBand: risk.band,
  })!;

  repo.appendAudit({
    actor: uploadedBy,
    actorRole: 'USER',
    action: 'PAYMENT_PROOF_UPLOADED',
    targetType: 'PaymentProof',
    targetId: proof.id,
    summary: `Proof for ${order.reference}: risk ${risk.band} (${risk.score}), OCR ${ocr.available ? 'read' : 'unavailable'}, ${signals.filter((s) => s.severity !== 'INFO').length} warning(s)`,
    before: { status: order.status },
    after: { status: updated.status, riskBand: risk.band, sha256: proof.sha256 },
  });

  return {
    proof,
    order: updated,
    warnings: signals.filter((s) => s.severity !== 'INFO').map((s) => s.detail),
  };
}

export interface VerificationInput {
  actor: string;
  source: 'MANUAL_ADMIN' | 'PAYMENT_PROVIDER_API';
  note?: string;
  providerTransactionId?: string | null;
}

export interface VerificationResult {
  ok: boolean;
  order: PaymentOrder;
  message: string;
  alreadyVerified: boolean;
}

/**
 * The only path that unlocks a paid service. Manual confirmation requires an
 * authenticated administrator identity; provider confirmation additionally
 * requires the operator to have switched auto-verification on.
 */
export function verifyPayment(order: PaymentOrder, input: VerificationInput): VerificationResult {
  if (order.status === 'VERIFIED') {
    return { ok: true, order, message: `Order ${order.reference} was already verified.`, alreadyVerified: true };
  }
  if (order.status === 'REJECTED') {
    return { ok: false, order, message: `Order ${order.reference} was rejected. Create a new order after the customer re-pays.`, alreadyVerified: false };
  }
  if (!input.actor || !input.actor.trim()) {
    return { ok: false, order, message: 'A verifying identity is required; payments cannot be verified anonymously.', alreadyVerified: false };
  }
  if (input.source === 'MANUAL_ADMIN' && order.proofIds.length === 0) {
    return {
      ok: false,
      order,
      message: 'No payment proof has been attached to this order yet, so there is nothing to confirm.',
      alreadyVerified: false,
    };
  }

  const user = repo.getUserById(order.userId);
  const service = repo.getServiceByCode(order.serviceCode);
  if (!user || !service) {
    return { ok: false, order, message: 'The user or service for this order no longer exists; nothing was unlocked.', alreadyVerified: false };
  }

  const entitlement = grantPaidAccess(user, service, {
    verifiedBy: input.actor,
    source: input.source,
  });

  const updated = repo.updatePaymentOrder(order.id, {
    status: 'VERIFIED',
    verificationSource: input.source,
    verifiedBy: input.actor,
    verifiedAt: new Date().toISOString(),
    providerTransactionId: input.providerTransactionId ?? order.providerTransactionId,
    grantedEntitlementUntil: entitlement.paidUntil,
    rejectionReason: null,
  })!;

  repo.appendAudit({
    actor: input.actor,
    actorRole: input.source === 'MANUAL_ADMIN' ? 'ADMIN' : 'SYSTEM',
    action: 'PAYMENT_VERIFIED',
    targetType: 'PaymentOrder',
    targetId: updated.id,
    summary: `${updated.reference} verified via ${input.source}${input.note ? `: ${input.note}` : ''}. ${service.code} unlocked until ${entitlement.paidUntil ?? 'usage limit'}.`,
    before: { status: order.status },
    after: { status: updated.status, entitlementId: entitlement.id, paidUntil: entitlement.paidUntil },
  });

  return {
    ok: true,
    order: updated,
    message: `Payment for ${service.nameEn} verified. Access is now active.`,
    alreadyVerified: false,
  };
}

export function rejectPayment(order: PaymentOrder, actor: string, reason: string): VerificationResult {
  if (order.status === 'VERIFIED') {
    return { ok: false, order, message: 'A verified payment cannot be rejected; revoke the entitlement instead.', alreadyVerified: false };
  }
  const updated = repo.updatePaymentOrder(order.id, {
    status: 'REJECTED',
    rejectionReason: reason,
    verifiedBy: actor,
    verifiedAt: new Date().toISOString(),
  })!;
  repo.appendAudit({
    actor,
    actorRole: 'ADMIN',
    action: 'PAYMENT_REJECTED',
    targetType: 'PaymentOrder',
    targetId: updated.id,
    summary: `${updated.reference} rejected: ${reason}`,
    before: { status: order.status },
    after: { status: updated.status, reason },
  });
  return { ok: true, order: updated, message: `Order ${order.reference} was rejected.`, alreadyVerified: false };
}

/**
 * Reconciliation against the operator's payment API. Without the endpoint this
 * changes nothing and tells the admin why; with it, auto-verification only
 * applies when PAYMENT_AUTO_VERIFY is explicitly enabled.
 */
export async function reconcileOrder(order: PaymentOrder, actor: string): Promise<VerificationResult> {
  const lookup = await lookupMobileMoneyTransaction({
    reference: order.reference,
    amount: order.amount,
    currency: order.currency,
    payerPhone: normalizedPhone(order.userPhone),
  });

  repo.appendAudit({
    actor,
    actorRole: 'ADMIN',
    action: 'PAYMENT_PROVIDER_LOOKUP',
    targetType: 'PaymentOrder',
    targetId: order.id,
    summary: lookup.configured
      ? `Provider status for ${order.reference}: ${lookup.status}${lookup.providerTransactionId ? ` (id ${lookup.providerTransactionId})` : ''}`
      : `No provider lookup possible for ${order.reference}: ${lookup.reason}`,
    before: { status: order.status },
    after: { status: order.status, providerStatus: lookup.status, reason: lookup.reason },
  });

  const amountMatches = lookup.providerAmount == null || Math.round(lookup.providerAmount) === Math.round(order.amount);

  if (lookup.status === 'SUCCESSFUL' && lookup.found && amountMatches) {
    const cfg = paymentConfig();
    if (!cfg.autoVerifyFromProvider) {
      return {
        ok: false,
        order: repo.getPaymentOrderById(order.id) ?? order,
        message: 'The provider reports this payment as successful, but PAYMENT_AUTO_VERIFY is off, so an administrator must confirm it.',
        alreadyVerified: false,
      };
    }
    return verifyPayment(repo.getPaymentOrderById(order.id) ?? order, {
      actor: `provider:${order.reference}`,
      source: 'PAYMENT_PROVIDER_API',
      note: lookup.reason,
      providerTransactionId: lookup.providerTransactionId,
    });
  }

  return {
    ok: false,
    order: repo.getPaymentOrderById(order.id) ?? order,
    message: lookup.reason,
    alreadyVerified: false,
  };
}

export function pendingReviewQueue(): Array<{ order: PaymentOrder; proofs: PaymentProof[]; user: User | undefined; service: ServiceDefinition | undefined }> {
  return repo
    .getPaymentOrders()
    .filter((o) => o.status === 'UNDER_REVIEW' || o.status === 'PROOF_UPLOADED')
    .map((order) => ({
      order,
      proofs: repo.getPaymentProofs(order.id),
      user: repo.getUserById(order.userId),
      service: repo.getServiceByCode(order.serviceCode),
    }))
    .sort((a, b) => {
      const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
      return (rank[a.order.riskBand ?? 'LOW'] ?? 2) - (rank[b.order.riskBand ?? 'LOW'] ?? 2);
    });
}
