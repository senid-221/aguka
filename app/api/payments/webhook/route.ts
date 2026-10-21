import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { repo } from '@/lib/db/repository';
import { reconcileOrder, rejectPayment, verifyPayment } from '@/lib/payments/orders';

export const runtime = 'nodejs';

interface ProviderEvent {
  reference: string;
  status: string;
  transactionId: string | null;
  amount: number | null;
  currency: string | null;
  payerPhone: string | null;
}

function signatureOk(raw: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const given = header.replace(/^sha256=/, '');
  const expected = crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(given, 'hex');
  if (a.length !== b.length || a.length === 0) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Inbound confirmation from a payment provider. Fails closed: without
 * PAYMENT_WEBHOOK_SECRET nothing is accepted, and a signed event only unlocks a
 * service when the operator has explicitly turned on PAYMENT_AUTO_VERIFY.
 */
export async function POST(request: NextRequest) {
  const secret = (process.env.PAYMENT_WEBHOOK_SECRET || '').trim();
  const raw = await request.text();

  if (!secret) {
    return NextResponse.json(
      {
        error:
          'Payment webhooks are disabled on this deployment. Set PAYMENT_WEBHOOK_SECRET to the shared secret issued by your provider before accepting callbacks.',
      },
      { status: 503 }
    );
  }

  const header =
    request.headers.get('x-aguka-signature') ||
    request.headers.get('x-hub-signature-256') ||
    request.headers.get('signature');

  if (!signatureOk(raw, header, secret)) {
    return NextResponse.json({ error: 'Invalid or missing webhook signature' }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Webhook body is not valid JSON' }, { status: 400 });
  }

  const event: ProviderEvent = {
    reference: String(payload.reference || payload.orderId || payload.outReference || '')
      .trim()
      .toUpperCase(),
    status: String(payload.status || payload.state || '').toUpperCase(),
    transactionId: payload.transactionId ? String(payload.transactionId) : payload.providerId ? String(payload.providerId) : null,
    amount: typeof payload.amount === 'number' ? payload.amount : null,
    currency: payload.currency ? String(payload.currency).toUpperCase() : null,
    payerPhone: payload.payerPhone || payload.phone ? String(payload.payerPhone || payload.phone) : null,
  };

  const order = event.reference ? repo.getPaymentOrderByReference(event.reference) : undefined;

  if (!order) {
    return NextResponse.json({
      received: true,
      matched: false,
      note: 'No order with that reference exists here, so nothing was changed.',
    });
  }

  repo.appendAudit({
    actor: 'payment-webhook',
    actorRole: 'SYSTEM',
    action: 'PAYMENT_WEBHOOK_RECEIVED',
    targetType: 'PaymentOrder',
    targetId: order.id,
    summary: `Provider reported ${event.status || 'UNKNOWN'} for ${order.reference}${event.transactionId ? ` (tx ${event.transactionId})` : ''}`,
    before: { status: order.status },
    after: { status: order.status, providerStatus: event.status, providerTransactionId: event.transactionId },
  });

  if (order.status === 'VERIFIED') {
    return NextResponse.json({ received: true, matched: true, note: 'Order was already verified; no change.' });
  }

  if (event.status === 'FAILED' || event.status === 'CANCELLED') {
    const outcome = rejectPayment(order, 'payment-webhook', `Provider reported ${event.status}`);
    return NextResponse.json({ received: true, matched: true, verified: false, order: outcome.order });
  }

  if (event.status === 'SUCCESSFUL' || event.status === 'COMPLETED') {
    if (event.amount != null && Math.round(event.amount) !== Math.round(order.amount)) {
      return NextResponse.json(
        {
          received: true,
          matched: true,
          verified: false,
          order: repo.updatePaymentOrder(order.id, {
            providerTransactionId: event.transactionId,
            status: order.proofIds.length ? 'UNDER_REVIEW' : order.status,
          }),
          note: `The provider amount (${event.amount}) does not match the order amount (${order.amount}), so an administrator must review it.`,
        },
        { status: 200 }
      );
    }

    const withTx = repo.updatePaymentOrder(order.id, { providerTransactionId: event.transactionId });
    if (!withTx) return NextResponse.json({ error: 'Order disappeared mid-request' }, { status: 500 });

    if (process.env.PAYMENT_AUTO_VERIFY === 'true') {
      const outcome = verifyPayment(withTx, {
        actor: `provider:${order.reference}`,
        source: 'PAYMENT_PROVIDER_API',
        note: 'Confirmed by signed provider webhook',
        providerTransactionId: event.transactionId,
      });
      return NextResponse.json({
        received: true,
        matched: true,
        verified: outcome.ok,
        order: outcome.order,
        note: outcome.message,
      });
    }

    const reconciled = await reconcileOrder(withTx, 'payment-webhook');
    return NextResponse.json({
      received: true,
      matched: true,
      verified: false,
      order: reconciled.order,
      note: 'The provider reports success, but PAYMENT_AUTO_VERIFY is off, so an administrator must confirm it. The independent lookup result is recorded in the audit trail.',
    });
  }

  return NextResponse.json({
    received: true,
    matched: true,
    verified: false,
    note: `Status ${event.status || 'UNKNOWN'} needs no action yet.`,
  });
}
