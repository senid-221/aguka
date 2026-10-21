import { OcrOutcome } from '@/lib/types';

export interface ReceiptLookupInput {
  reference: string;
  amount: number;
  currency: string;
  payerPhone: string;
}

export interface ReceiptLookupResult {
  configured: boolean;
  found: boolean;
  status: 'SUCCESSFUL' | 'FAILED' | 'PENDING' | 'UNKNOWN';
  providerTransactionId: string | null;
  providerAmount: number | null;
  raw: unknown;
  reason: string;
}

/**
 * Payment verification adapters.
 *
 * DEVELOPMENT ADAPTER (the only one active with no credentials): it performs no
 * network call and always reports "not configured", so an order can never be
 * marked verified by the code alone — an administrator has to confirm it.
 *
 * LIVE PATH: point MOMO_VERIFY_API_URL / MOMO_VERIFY_API_TOKEN at the operator's
 * own transaction-status endpoint. The request/response field names below are a
 * neutral contract that MUST be aligned with that API before use; nothing here
 * claims to know MTN's or Airtel's private schema.
 */
export async function lookupMobileMoneyTransaction(input: ReceiptLookupInput): Promise<ReceiptLookupResult> {
  const url = process.env.MOMO_VERIFY_API_URL?.trim();
  const token = process.env.MOMO_VERIFY_API_TOKEN?.trim();

  if (!url || !token) {
    return {
      configured: false,
      found: false,
      status: 'UNKNOWN',
      providerTransactionId: null,
      providerAmount: null,
      raw: null,
      reason:
        'No mobile money verification endpoint is configured (needs MOMO_VERIFY_API_URL and MOMO_VERIFY_API_TOKEN). Payment cannot be independently confirmed, so the order goes to the administrator review queue.',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        reference: input.reference,
        amount: input.amount,
        currency: input.currency,
        payer_phone: input.payerPhone,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        configured: true,
        found: false,
        status: 'UNKNOWN',
        providerTransactionId: null,
        providerAmount: null,
        raw: null,
        reason: `Verification endpoint responded ${response.status} ${response.statusText}; the payment is not confirmed.`,
      };
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const statusRaw = String(payload.status ?? payload.transaction_status ?? '').toUpperCase();
    const status =
      statusRaw === 'SUCCESSFUL' || statusRaw === 'SUCCESS' || statusRaw === 'COMPLETED'
        ? 'SUCCESSFUL'
        : statusRaw === 'PENDING'
          ? 'PENDING'
          : statusRaw === 'FAILED' || statusRaw === 'FAIL' || statusRaw === 'REVISED'
            ? 'FAILED'
            : 'UNKNOWN';

    return {
      configured: true,
      found: statusRaw.length > 0,
      status,
      providerTransactionId: payload.transactionId != null ? String(payload.transactionId) : payload.id != null ? String(payload.id) : null,
      providerAmount: payload.amount != null ? Number(payload.amount) : null,
      raw: payload,
      reason:
        status === 'SUCCESSFUL'
          ? 'Provider reports the transaction as successful.'
          : `Provider reported status "${statusRaw || 'unrecognised'}".`,
    };
  } catch (err: unknown) {
    return {
      configured: true,
      found: false,
      status: 'UNKNOWN',
      providerTransactionId: null,
      providerAmount: null,
      raw: null,
      reason: `Verification request failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// OCR
// ---------------------------------------------------------------------------

export interface OcrExtractResult {
  ok: boolean;
  text: string | null;
  provider: string;
  error: string | null;
}

const OCR_PROMPT =
  'Read this mobile money payment screenshot. Output every piece of visible text verbatim, one item per line: ' +
  'transaction id, reference, amount, currency, payee name, payee number, sender, date and time, and status message. ' +
  'Do not summarise, do not translate, do not guess missing values.';

/**
 * Text extraction for proof screenshots. Uses OpenAI vision when OPENAI_API_KEY
 * is present; otherwise reports unavailability instead of pretending to read the
 * receipt. Extracted text is supporting evidence only — it never verifies money.
 */
export async function extractReceiptText(imageBase64: string, mimeType: string): Promise<OcrExtractResult> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || key === 'your_api_key_here') {
    return {
      ok: false,
      text: null,
      provider: 'none',
      error:
        'OCR is not configured. Set OPENAI_API_KEY (or an equivalent vision endpoint) to read receipt screenshots; until then every proof is decided by an administrator.',
    };
  }

  const model = process.env.OPENAI_VISION_MODEL?.trim() || 'gpt-4o';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        max_tokens: 700,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: OCR_PROMPT },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        ok: false,
        text: null,
        provider: `openai:${model}`,
        error: `Vision request failed (${response.status}): ${body.slice(0, 300)}`,
      };
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = payload.choices?.[0]?.message?.content;
    if (!text || !text.trim()) {
      return { ok: false, text: null, provider: `openai:${model}`, error: 'The vision model returned no text.' };
    }
    return { ok: true, text: text.trim(), provider: `openai:${model}`, error: null };
  } catch (err: unknown) {
    return {
      ok: false,
      text: null,
      provider: `openai:${model}`,
      error: `Vision request failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Receipt field matching (supporting evidence, never proof of payment)
// ---------------------------------------------------------------------------

function digitsOnly(value: string): string {
  return value.replace(/[^\d]/g, '');
}

export function referenceAppears(text: string, reference: string): boolean {
  const t = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const r = reference.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return r.length > 0 && t.includes(r);
}

export function amountAppears(text: string, amount: number): boolean {
  const normalized = text.replace(/[\s,\u00a0]/g, '');
  const plain = String(Math.round(amount));
  const withSep = Math.round(amount).toLocaleString('en-US');
  return normalized.includes(plain) || normalized.includes(withSep) || normalized.includes(withSep.replace(/,/g, '.'));
}

export function payeeAppears(text: string, payeeName: string): boolean {
  const tokens = payeeName.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  if (tokens.length === 0) return false;
  const t = text.toLowerCase();
  return tokens.some((token) => t.includes(token));
}

export function buildOcrOutcome(
  extracted: OcrExtractResult,
  ctx: { reference: string; amount: number; payeeName: string }
): OcrOutcome {
  if (!extracted.ok || !extracted.text) {
    return {
      attempted: true,
      available: false,
      provider: extracted.provider,
      reason: extracted.error ?? 'Text could not be extracted from this screenshot.',
      extractedText: null,
      matchedAmount: null,
      matchedReference: null,
      matchedPayee: null,
    };
  }

  return {
    attempted: true,
    available: true,
    provider: extracted.provider,
    reason: 'Text was extracted; matches below are supporting evidence for the reviewing administrator.',
    extractedText: extracted.text.slice(0, 4000),
    matchedAmount: amountAppears(extracted.text, ctx.amount),
    matchedReference: referenceAppears(extracted.text, ctx.reference),
    matchedPayee: payeeAppears(extracted.text, ctx.payeeName),
  };
}

export function normalizedPhone(phone: string): string {
  return digitsOnly(phone).replace(/^00/, '');
}
