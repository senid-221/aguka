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
    caption?: string;
    url?: string;
  };
  document?: {
    id: string;
    filename: string;
    mime_type: string;
    url?: string;
  };
}

/**
 * Read receipts and typing indicators need a Graph version that supports them,
 * so every call shares one version instead of the older constant this file used
 * to hardcode. Typing indicators are unavailable before v22.0.
 */
const DEFAULT_GRAPH_VERSION = 'v23.0';

export function whatsappGraphVersion(env: NodeJS.ProcessEnv = process.env): string {
  const configured = String(env.WHATSAPP_GRAPH_VERSION || '').trim();
  return /^v\d+\.\d+$/.test(configured) ? configured : DEFAULT_GRAPH_VERSION;
}

function graphUrl(path: string): string {
  return `https://graph.facebook.com/${whatsappGraphVersion()}/${path}`;
}

export interface WhatsAppOutgoingMessage {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'text' | 'interactive' | 'image';
  text?: {
    preview_url?: boolean;
    body: string;
  };
  image?: {
    id?: string;
    link?: string;
    caption?: string;
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
          } else if (type === 'image' && m.image) {
            const img = m.image as { id?: string; mime_type?: string; sha256?: string; caption?: string };
            parsed.image = {
              id: String(img.id || ''),
              mime_type: String(img.mime_type || 'image/jpeg'),
              sha256: String(img.sha256 || ''),
              caption: img.caption ? String(img.caption) : undefined,
            };
          } else if (type === 'document' && m.document) {
            const doc = m.document as { id?: string; filename?: string; mime_type?: string };
            parsed.document = {
              id: String(doc.id || ''),
              filename: String(doc.filename || 'document'),
              mime_type: String(doc.mime_type || 'application/octet-stream'),
            };
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
      const url = graphUrl(`${phoneNumberId}/messages`);
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

function liveCredentials(): { phoneNumberId: string; accessToken: string } | null {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || phoneNumberId === '109876543210987' || !accessToken || accessToken.includes('replace_with')) {
    return null;
  }
  return { phoneNumberId, accessToken };
}

/** Whether this server can actually call Meta, for health and agent grounding. */
export function isWhatsAppLiveConfigured(): boolean {
  return liveCredentials() !== null;
}

export interface WhatsAppPresencePayload {
  messaging_product: 'whatsapp';
  status: 'read';
  message_id: string;
  typing_indicator?: { type: 'text' };
}

export interface WhatsAppPresenceResult {
  ok: boolean;
  mode: 'LIVE_META_API' | 'NOT_CONFIGURED';
  error?: string;
}

/**
 * The read receipt and the typing indicator are the same Cloud API call: mark
 * the inbound wamid as read, optionally attaching the indicator. Meta shows the
 * indicator for at most 25 seconds or until the reply is sent, whichever is
 * first, which is why the webhook refreshes it while a long turn is running.
 */
export function buildPresencePayload(messageId: string, typing: boolean): WhatsAppPresencePayload {
  return {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
    ...(typing ? { typing_indicator: { type: 'text' as const } } : {}),
  };
}

/**
 * Never throws and never blocks the reply on a Meta problem: a receipt is a
 * courtesy, and an expired token or a rate limit must not cost the person their
 * answer. The caller logs the failure; the user is never told about it.
 */
export async function markWhatsAppMessageRead(
  messageId: string,
  options: { typing?: boolean } = {}
): Promise<WhatsAppPresenceResult> {
  const creds = liveCredentials();
  if (!creds) return { ok: false, mode: 'NOT_CONFIGURED' };
  if (!messageId) return { ok: false, mode: 'NOT_CONFIGURED', error: 'The inbound message carried no id.' };

  try {
    const res = await fetch(graphUrl(`${creds.phoneNumberId}/messages`), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildPresencePayload(messageId, options.typing === true)),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      let detail = `Meta answered status ${res.status}`;
      try {
        const data = (await res.json()) as { error?: { message?: string } };
        if (data?.error?.message) detail = data.error.message;
      } catch {
        // A non-JSON error body still leaves the status code, which is enough.
      }
      return { ok: false, mode: 'LIVE_META_API', error: detail };
    }
    return { ok: true, mode: 'LIVE_META_API' };
  } catch (err: unknown) {
    return { ok: false, mode: 'LIVE_META_API', error: err instanceof Error ? err.message : String(err) };
  }
}

/** Meta drops the indicator after ~25s, so re-send well inside that window. */
export const WHATSAPP_TYPING_REFRESH_MS = 20_000;

/**
 * Starts "seen + typing…" for an inbound message and keeps it alive until the
 * turn ends. `ready` is the first call, awaited by the webhook so the receipt is
 * on the wire before the model starts thinking.
 */
export function beginWhatsAppTyping(messageId: string): {
  ready: Promise<WhatsAppPresenceResult>;
  stop: () => void;
} {
  if (!liveCredentials() || !messageId) {
    return { ready: Promise.resolve({ ok: false, mode: 'NOT_CONFIGURED' }), stop: () => {} };
  }

  const ready = markWhatsAppMessageRead(messageId, { typing: true });
  const timer = setInterval(() => {
    void markWhatsAppMessageRead(messageId, { typing: true });
  }, WHATSAPP_TYPING_REFRESH_MS);
  // Never hold the process open for a courtesy refresh.
  if (typeof timer.unref === 'function') timer.unref();

  return { ready, stop: () => clearInterval(timer) };
}

/**
 * Fetches an inbound media attachment (a payment screenshot, for example) from
 * the Meta media API. Returns an explicit failure when credentials are missing
 * or the download errors — an unconfigured server never pretends to have the
 * image bytes.
 */
export async function downloadWhatsAppMedia(
  mediaId: string,
  maxBytes = 10 * 1024 * 1024
): Promise<{ ok: boolean; buffer: Buffer | null; mimeType: string; error: string | null }> {
  const creds = liveCredentials();
  if (!creds) {
    return {
      ok: false,
      buffer: null,
      mimeType: '',
      error: 'WhatsApp media download needs WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN.',
    };
  }
  if (!mediaId) {
    return { ok: false, buffer: null, mimeType: '', error: 'The incoming message carried no media id.' };
  }

  try {
    const metaRes = await fetch(graphUrl(mediaId), {
      headers: { Authorization: `Bearer ${creds.accessToken}` },
    });
    const meta = (await metaRes.json()) as { url?: string; mime_type?: string; error?: { message?: string } };
    if (!metaRes.ok || !meta.url) {
      return {
        ok: false,
        buffer: null,
        mimeType: meta.mime_type || '',
        error: meta.error?.message || `Media lookup failed with status ${metaRes.status}`,
      };
    }

    const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${creds.accessToken}` } });
    if (!fileRes.ok) {
      return { ok: false, buffer: null, mimeType: meta.mime_type || '', error: `Media fetch failed with status ${fileRes.status}` };
    }
    const bytes = Buffer.from(await fileRes.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      return { ok: false, buffer: null, mimeType: meta.mime_type || '', error: 'Attachment is larger than the 10 MB proof limit.' };
    }
    return { ok: true, buffer: bytes, mimeType: meta.mime_type || 'image/jpeg', error: null };
  } catch (err: unknown) {
    return {
      ok: false,
      buffer: null,
      mimeType: '',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function buildTextMessage(to: string, body: string): WhatsAppOutgoingMessage {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body, preview_url: false },
  };
}

export function buildButtonMessage(
  to: string,
  body: string,
  buttons: Array<{ id: string; title: string }>
): WhatsAppOutgoingMessage {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      footer: { text: 'Aguka AI • Rwanda' },
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: 'reply',
          reply: { id: b.id, title: b.title.slice(0, 20) },
        })),
      },
    },
  };
}

/**
 * A WhatsApp list message needs a text header ≤ 60 characters, so the header is
 * always present even when only the first section fits the row limits.
 */
export function buildListMessage(
  to: string,
  list: {
    type: 'list';
    header: { type: 'string'; string: string };
    body: { text: string };
    footer: { text: string };
    action: { button: string; sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }> };
  }
): WhatsAppOutgoingMessage {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: list.header.string.slice(0, 60) },
      body: { text: list.body.text },
      footer: { text: list.footer.text },
      action: { button: list.action.button, sections: list.action.sections },
    },
  };
}

/** Meta accepts at most 5 MB for image attachments on the media endpoint. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Uploads generated pixels to Meta's media endpoint and returns the media id
 * used by an `image` message. Missing credentials fail explicitly instead of
 * silently dropping the attachment.
 */
export async function uploadWhatsAppMedia(
  buffer: Buffer,
  mimeType: string
): Promise<{ ok: boolean; mediaId: string; error: string | null }> {
  const creds = liveCredentials();
  if (!creds) {
    return {
      ok: false,
      mediaId: '',
      error: 'WhatsApp media upload needs WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN.',
    };
  }
  if (buffer.byteLength === 0) {
    return { ok: false, mediaId: '', error: 'There were no image bytes to upload.' };
  }
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    return { ok: false, mediaId: '', error: 'The image is larger than the 5 MB WhatsApp limit.' };
  }

  try {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', mimeType || 'image/jpeg');
    form.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType || 'image/jpeg' }));

    const res = await fetch(graphUrl(`${creds.phoneNumberId}/media`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.accessToken}` },
      body: form,
    });
    const data = (await res.json()) as { id?: string; error?: { message?: string } };
    if (!res.ok || !data.id) {
      return {
        ok: false,
        mediaId: '',
        error: data.error?.message || `Media upload failed with status ${res.status}`,
      };
    }
    return { ok: true, mediaId: data.id, error: null };
  } catch (err: unknown) {
    return { ok: false, mediaId: '', error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Captions are limited to 1024 characters by the Cloud API.
 */
export function buildImageMessage(to: string, mediaId: string, caption: string): WhatsAppOutgoingMessage {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'image',
    image: { id: mediaId, caption: caption.slice(0, 1024) },
  };
}
