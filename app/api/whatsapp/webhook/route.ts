import { NextRequest, NextResponse } from 'next/server';
import {
  verifyWebhookChallenge,
  verifyMetaSignature,
  parseWhatsAppWebhookPayload,
  sendWhatsAppMessage,
  downloadWhatsAppMedia,
  buildTextMessage,
  buildButtonMessage,
  buildListMessage,
} from '@/lib/whatsapp/gateway';
import { repo } from '@/lib/db/repository';
import { handleIncomingImage, handleIncomingText, InboundOutcome } from '@/lib/whatsapp/inbound';

/**
 * GET handler: Verifies WhatsApp Webhook during Meta App Setup
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const verification = verifyWebhookChallenge(mode, token, challenge);

  if (verification.isValid && verification.challenge) {
    return new NextResponse(verification.challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  if (!process.env.WHATSAPP_VERIFY_TOKEN) {
    return NextResponse.json(
      { error: 'WHATSAPP_VERIFY_TOKEN is not configured on this server; webhook cannot be verified' },
      { status: 403 }
    );
  }

  return NextResponse.json(
    { error: 'Invalid verification token or challenge mismatch' },
    { status: 403 }
  );
}

/**
 * POST handler: Receives incoming messages, delivery statuses & events from WhatsApp
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-hub-signature-256');

    // 1. Verify HMAC-SHA256 signature if app secret is provided
    const isSignatureValid = verifyMetaSignature(rawBody, signature);
    if (!isSignatureValid) {
      console.warn('WhatsApp webhook signature verification failed');
      return NextResponse.json({ error: 'Invalid HMAC signature' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);

    // 2. Parse incoming messages
    const incomingMessages = parseWhatsAppWebhookPayload(payload);

    for (const msg of incomingMessages) {
      // 3. Deduplicate events
      if (repo.isMessageAlreadyProcessed(msg.id)) {
        continue;
      }
      repo.markMessageProcessed(msg.id);

      // Record event log
      repo.recordWebhookEvent({
        eventId: msg.id,
        senderWaId: msg.from,
        eventType: `messages.${msg.type}`,
        isProcessed: true,
        payloadSummary: msg.text?.body || `Interactive or ${msg.type} message`,
      });

      // 4. Resolve or create user & conversation
      const user = repo.getOrCreateUserByPhone(`+${msg.from}`);
      const conversation = repo.getOrCreateConversation(user.id);

      let outcome: InboundOutcome;

      if (msg.type === 'image' && msg.image) {
        // Payment screenshots arrive as image attachments.
        const downloaded = await downloadWhatsAppMedia(msg.image.id);
        if (!downloaded.ok || !downloaded.buffer) {
          outcome = {
            replyText: `The attachment could not be retrieved: ${downloaded.error}`,
            agentType: 'ROUTER',
            intent: 'MEDIA_DOWNLOAD_FAILED',
            tokensUsed: 0,
            modelUsed: 'media',
          };
        } else {
          repo.addMessage(conversation.id, {
            waMessageId: msg.id,
            role: 'USER',
            type: 'IMAGE',
            content: `image (${downloaded.mimeType})`,
            mediaUrl: `whatsapp-media:${msg.image.id}`,
          });
          outcome = await handleIncomingImage(user, conversation, downloaded.buffer, `${msg.id}.jpg`, downloaded.mimeType);
        }
      } else {
        // Extract message text. A list/button reply carries the row id, which is
        // the reliable way to map a service selection back to the catalog.
        let userText = '';
        if (msg.type === 'text' && msg.text) {
          userText = msg.text.body;
        } else if (msg.interactive) {
          if (msg.interactive.button_reply) {
            userText = msg.interactive.button_reply.id || msg.interactive.button_reply.title;
          } else if (msg.interactive.list_reply) {
            userText = msg.interactive.list_reply.id || msg.interactive.list_reply.title;
          }
        }

        if (!userText.trim()) continue;

        // Add user message to conversation history
        repo.addMessage(conversation.id, {
          waMessageId: msg.id,
          role: 'USER',
          type: msg.interactive ? 'INTERACTIVE_REPLY' : 'TEXT',
          content: userText,
        });

        // 5. Process through the shared inbound pipeline (service selection →
        //    entitlement gate → agent). The record is closed once the inline run
        //    finishes, so the queue view never shows work still pending.
        const traceJob = repo.enqueueJob('PROCESS_WHATSAPP_MESSAGE', {
          userId: user.id,
          conversationId: conversation.id,
          userText,
        });

        outcome = await handleIncomingText(user, conversation, userText);
        repo.updateJobStatus(traceJob.id, 'COMPLETED');
      }

      // Save assistant response to conversation history
      repo.addMessage(conversation.id, {
        role: 'ASSISTANT',
        type: 'TEXT',
        content: outcome.replyText,
        tokensUsed: outcome.tokensUsed,
      });

      // 6. Dispatch reply to user via WhatsApp Gateway
      const payload = outcome.listMenu
        ? buildListMessage(msg.from, outcome.listMenu.interactive)
        : outcome.buttons && outcome.buttons.length > 0
          ? buildButtonMessage(msg.from, outcome.replyText, outcome.buttons)
          : buildTextMessage(msg.from, outcome.replyText);

      await sendWhatsAppMessage(payload);
    }

    // Always acknowledge quickly to Meta with 200 OK
    return NextResponse.json({ status: 'EVENT_RECEIVED' }, { status: 200 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Error in WhatsApp webhook POST:', errorMsg);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
