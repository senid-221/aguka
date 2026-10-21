import { NextRequest, NextResponse } from 'next/server';
import { repo } from '@/lib/db/repository';
import { requireAdmin } from '@/lib/security/admin-auth';
import { attachPaymentProof } from '@/lib/payments/orders';

export const runtime = 'nodejs';

function normalize(phone: string): string {
  return phone.replace(/[^0-9]/g, '').replace(/^250/, '').slice(-9);
}

/**
 * Receives a MoMo receipt screenshot. The upload is analysed (duplicate hash,
 * format, editing traces, OCR) and then waits for a human or provider
 * confirmation — nothing unlocks here.
 */
export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  let reference = '';
  let orderId = '';
  let buffer: Buffer | null = null;
  let fileName = 'receipt.png';
  let mimeType = 'image/png';
  let phoneNumber = '';

  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: 'Malformed multipart upload' }, { status: 400 });
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'A receipt image under field "file" is required' }, { status: 400 });
    }
    buffer = Buffer.from(await file.arrayBuffer());
    fileName = file.name || fileName;
    mimeType = file.type || mimeType;
    reference = String(form.get('reference') || '');
    orderId = String(form.get('orderId') || '');
    phoneNumber = String(form.get('phoneNumber') || '');
  } else {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const b64 = typeof body.imageBase64 === 'string' ? body.imageBase64.replace(/^data:[^;]+;base64,/, '') : '';
    if (!b64) return NextResponse.json({ error: 'Provide imageBase64 or a multipart "file"' }, { status: 400 });
    buffer = Buffer.from(b64, 'base64');
    fileName = typeof body.fileName === 'string' ? body.fileName : fileName;
    mimeType = typeof body.mimeType === 'string' ? body.mimeType : mimeType;
    reference = String(body.reference || '');
    orderId = String(body.orderId || '');
    phoneNumber = String(body.phoneNumber || '');
  }

  const order = reference
    ? repo.getPaymentOrderByReference(reference.trim().toUpperCase())
    : orderId
      ? repo.getPaymentOrderById(orderId)
      : undefined;

  if (!order) {
    return NextResponse.json(
      { error: 'Unknown payment reference. Request an order first so the receipt can be matched to it.' },
      { status: 404 }
    );
  }

  if (!auth.ok) {
    if (!phoneNumber) {
      return NextResponse.json(
        { error: 'Provide the phone number that owns this order so the receipt is filed against the right account.' },
        { status: 400 }
      );
    }
    if (normalize(phoneNumber) !== normalize(order.userPhone)) {
      return NextResponse.json({ error: 'This receipt does not belong to that phone number.' }, { status: 403 });
    }
  }

  if (order.status === 'VERIFIED') {
    return NextResponse.json({
      success: false,
      error: `Order ${order.reference} is already verified. Nothing further was recorded.`,
    });
  }

  try {
    const result = await attachPaymentProof(order, buffer, fileName, mimeType, phoneNumber || order.userPhone);
    return NextResponse.json({
      success: true,
      proof: result.proof,
      order: result.order,
      warnings: result.warnings,
      message:
        'Receipt received and analysed. It is now in the administrator review queue. The service stays locked until the payment is independently verified or confirmed by an administrator.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
