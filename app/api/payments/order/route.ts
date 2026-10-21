import { NextRequest, NextResponse } from 'next/server';
import { repo } from '@/lib/db/repository';
import { getService } from '@/lib/services/catalog';
import { evaluateAccess, formatMoney, isChargeable } from '@/lib/services/entitlements';
import { createOrder, paymentConfig, paymentInstructions } from '@/lib/payments/orders';

export const runtime = 'nodejs';

/**
 * Starts a payment order for a chargeable service. Creating an order never
 * unlocks anything: it only produces the MoMo instructions and a reference.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const serviceCode = String(body.serviceCode || '')
    .trim()
    .toUpperCase();
  const service = getService(serviceCode);
  if (!service) return NextResponse.json({ error: `Unknown service ${serviceCode}` }, { status: 404 });

  const phone = String(body.phoneNumber || '').trim();
  const userId = String(body.userId || '').trim();
  if (!phone && !userId) {
    return NextResponse.json({ error: 'phoneNumber or userId is required' }, { status: 400 });
  }
  const cleanPhone = phone.startsWith('+') ? phone : `+${phone}`;
  const user = userId ? repo.getUserById(userId) : repo.getOrCreateUserByPhone(cleanPhone);
  if (!user) return NextResponse.json({ error: 'Unknown user' }, { status: 404 });

  if (!isChargeable(service)) {
    return NextResponse.json(
      {
        success: false,
        error: `${service.nameEn} is free right now, so there is nothing to pay for.`,
        service,
      },
      { status: 400 }
    );
  }

  const decision = evaluateAccess(user, service);
  if (decision.allowed && decision.status === 'ACTIVE') {
    return NextResponse.json({
      success: false,
      error: `Access to ${service.nameEn} is already active until ${decision.paidUntil ?? 'the usage limit'}. No new order was created.`,
      access: decision,
    });
  }

  const { order, reused } = createOrder(user, service, {
    idempotencyKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey : null,
  });

  const lang = user.preferredLang === 'ENGLISH' ? 'ENGLISH' : 'KINYARWANDA';
  const cfg = paymentConfig();

  return NextResponse.json({
    success: true,
    reused,
    order,
    instructions: paymentInstructions(order, service, lang),
    payee: { name: cfg.payeeName, momoCode: cfg.momoCode },
    amountLabel: formatMoney(order.amount, order.currency),
    warning:
      'Send the screenshot of the MoMo receipt to this chat or upload it here. The service unlocks only after an administrator or the payment provider confirms the payment.',
  });
}
