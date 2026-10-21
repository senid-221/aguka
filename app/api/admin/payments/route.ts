import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/security/admin-auth';
import { repo } from '@/lib/db/repository';
import { paymentConfig, pendingReviewQueue, reconcileOrder, rejectPayment, verifyPayment } from '@/lib/payments/orders';

export const runtime = 'nodejs';

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/** Payment review queue, transactions and the evidence gathered per proof. */
export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.ok) return unauthorized();

  const queue = pendingReviewQueue().map(({ order, proofs, user, service }) => ({
    order,
    phone: user?.phoneNumber ?? order.userPhone,
    userName: user?.fullName ?? null,
    serviceName: service?.nameEn ?? order.serviceCode,
    proofs: proofs.map((p) => ({
      id: p.id,
      fileName: p.fileName,
      mimeType: p.mimeType,
      sizeBytes: p.sizeBytes,
      sha256: p.sha256,
      width: p.width,
      height: p.height,
      riskScore: p.riskScore,
      riskBand: p.riskBand,
      duplicateCount: p.duplicateProofIds.length,
      duplicateReferences: p.duplicateProofIds
        .map((id) => repo.getPaymentProofById(id)?.reference)
        .filter((r): r is string => Boolean(r)),
      signals: p.signals,
      ocr: p.ocr,
      reviewStatus: p.reviewStatus,
      createdAt: p.createdAt,
    })),
  }));

  return NextResponse.json({
    success: true,
    config: paymentConfig(),
    queue,
    orders: repo.getPaymentOrders(),
    stats: repo.getCommercialStats(),
  });
}

/**
 * Manual approval controls. Verification always records who did it and refuses
 * to act on an order that has no proof attached.
 */
export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.ok) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action || '').toUpperCase();
  const reference = String(body.reference || '')
    .trim()
    .toUpperCase();
  const actor = auth.email || 'admin';

  const order = reference ? repo.getPaymentOrderByReference(reference) : undefined;
  if (!order) return NextResponse.json({ error: `Unknown payment reference ${reference || '(none given)'}` }, { status: 404 });

  if (action === 'VERIFY') {
    const outcome = verifyPayment(order, {
      actor,
      source: 'MANUAL_ADMIN',
      note: typeof body.note === 'string' ? body.note : undefined,
    });
    return NextResponse.json(
      { success: outcome.ok, verified: outcome.ok, alreadyVerified: outcome.alreadyVerified, order: outcome.order, message: outcome.message },
      { status: outcome.ok ? 200 : 409 }
    );
  }

  if (action === 'REJECT') {
    const reason = String(body.reason || '').trim();
    if (!reason) return NextResponse.json({ error: 'A written rejection reason is required.' }, { status: 400 });
    const outcome = rejectPayment(order, actor, reason);
    return NextResponse.json({ success: outcome.ok, order: outcome.order, message: outcome.message });
  }

  if (action === 'RECONCILE') {
    const outcome = await reconcileOrder(order, actor);
    return NextResponse.json({
      success: outcome.ok,
      verified: outcome.ok,
      order: outcome.order,
      message: outcome.message,
    });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
