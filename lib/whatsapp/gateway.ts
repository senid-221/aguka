import crypto from 'node:crypto';

export interface WhatsAppIncomingMessage {
  from: string; // phone number e.g. "250788912345"
  id: string;   // wamid.xxx
  timestamp: string;
  type: 'text' | 'image' | 'interactive' | 'button' | 'document' | 'audio';
  text?: {
    body: string;
  };
  interactive?: {
    type: 'button_reply' | 'list_reply';
    button_reply?: {
      id: string;
      title: string;
    };
    list_reply?: {
      id: string;
      title: string;
      description?: string;
    };
  };
  image?: {
    id: string;
    mime_type: string;
    sha256: string;
    url?: string;
  };
  document?: {
    id: string;
    filename: string;
    mime_type: string;
    url?: string;
  };
}

export interface WhatsAppOutgoingMessage {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'text' | 'interactive';
  text?: {
    preview_url?: boolean;
    body: string;
  };
  interactive?: {
    type: 'button' | 'list';
    header?: {
      type: 'text';
      text: string;
    };
    body: {
      text: string;
    };
    footer?: {
      text: string;
    };
    action: {
      buttons?: Array<{
        type: 'reply';
        reply: {
          id: string;
          title: string;
        };
      }>;
      button?: string;
      sections?: Array<{
        title: string;
        rows: Array<{
          id: string;
          title: string;
          description?: string;
        }>;
      }>;
    };
  };
}

/**
 * Validates the Meta WhatsApp Webhook Subscription challenge (GET)
 */
export function verifyWebhookChallenge(
  mode: string | null,
  token: string | null,
  challenge: string | null,
  expectedVerifyToken: string = process.env.WHATSAPP_VERIFY_TOKEN || ''
): { isValid: boolean; challenge?: string } {
  if (!expectedVerifyToken) return { isValid: false };
  if (mode === 'subscribe' && token === expectedVerifyToken && challenge) {
    return { isValid: true, challenge };
  }
  return { isValid: false };
}

/**
 * Validates Meta's HMAC-SHA256 signature from the 'x-hub-signature-256' header (POST)
 */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string = process.env.WHATSAPP_APP_SECRET || ''
): boolean {
  // Without WHATSAPP_APP_SECRET any unsigned POST is accepted, so this build is
  // for local testing only — set the secret before exposing the webhook publicly.
  if (!appSecret || appSecret === 'replace_with_meta_app_secret_for_sha256_signature_verification') {
    return true;
  }

  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const expectedHash = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody, 'utf8')
    .digest('hex');

  const actualHash = signatureHeader.replace('sha256=', '');

  try {
    const expectedBuf = Buffer.from(expectedHash, 'hex');
    const actualBuf = Buffer.from(actualHash, 'hex');
    if (expectedBuf.length !== actualBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    return false;
  }
}

/**
 * Parses raw Meta Webhook JSON payload into structured messages
 */
export function parseWhatsAppWebhookPayload(body: Record<string, unknown>): WhatsAppIncomingMessage[] {
  const messages: WhatsAppIncomingMessage[] = [];

  try {
    const entry = (body.entry as Array<Record<string, unknown>>) || [];
    for (const ent of entry) {
      const changes = (ent.changes as Array<Record<string, unknown>>) || [];
      for (const ch of changes) {
        const val = ch.value as Record<string, unknown> | undefined;
        if (!val) continue;

        const msgs = (val.messages as Array<Record<string, unknown>>) || [];
        for (const m of msgs) {
          const from = String(m.from || '');
          const id = String(m.id || '');
          const timestamp = String(m.timestamp || '');
          const type = String(m.type || 'text') as WhatsAppIncomingMessage['type'];

          const parsed: WhatsAppIncomingMessage = {
            from,
            id,
            timestamp,
            type,
          };

          if (type === 'text' && m.text) {
            const t = m.text as { body?: string };
            parsed.text = { body: String(t.body || '') };
          } else if (type === 'interactive' && m.interactive) {
            parsed.interactive = m.interactive as WhatsAppIncomingMessage['interactive'];
          } else if (type === 'button' && m.button) {
            const btn = m.button as { text?: string; payload?: string };
            parsed.interactive = {
              type: 'button_reply',
              button_reply: {
                id: btn.payload || 'button_clicked',
                title: btn.text || '',
              },
            };
          }

          messages.push(parsed);
        }
      }
    }
  } catch (err) {
    console.error('Error parsing WhatsApp webhook:', err);
  }

  return messages;
}

/**
 * Dispatches an outgoing message to the user via Meta Cloud API
 */
export async function sendWhatsAppMessage(payload: WhatsAppOutgoingMessage): Promise<{
  success: boolean;
  messageId: string;
  mode: 'LIVE_META_API' | 'NOT_CONFIGURED';
  error?: string;
}> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  const isLiveConfigured = Boolean(
    phoneNumberId &&
    phoneNumberId !== '109876543210987' &&
    accessToken &&
    !accessToken.includes('replace_with')
  );

  if (isLiveConfigured) {
    try {
      const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        return {
          success: false,
          messageId: '',
          mode: 'LIVE_META_API',
          error: data.error?.message || 'Failed to dispatch Meta WhatsApp message',
        };
      }

      return {
        success: true,
        messageId: data.messages?.[0]?.id || '',
        mode: 'LIVE_META_API',
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        messageId: '',
        mode: 'LIVE_META_API',
        error: errorMsg,
      };
    }
  }

  return {
    success: false,
    messageId: '',
    mode: 'NOT_CONFIGURED',
    error:
      'WhatsApp credentials (WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN) are not configured. Nothing was dispatched.',
  };
}
