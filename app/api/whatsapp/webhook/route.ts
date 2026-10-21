import { NextRequest, NextResponse } from 'next/server';
import { 
  verifyWebhookChallenge, 
  verifyMetaSignature, 
  parseWhatsAppWebhookPayload,
  sendWhatsAppMessage,
  WhatsAppOutgoingMessage
} from '@/lib/whatsapp/gateway';
import { repo } from '@/lib/db/repository';
import { executeAgent } from '@/lib/ai/bilingual-router';

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

      // Extract message text
      let userText = '';
      if (msg.type === 'text' && msg.text) {
        userText = msg.text.body;
      } else if (msg.type === 'interactive' && msg.interactive) {
        if (msg.interactive.button_reply) {
          userText = msg.interactive.button_reply.title;
        } else if (msg.interactive.list_reply) {
          userText = msg.interactive.list_reply.title;
        }
      }

      if (!userText.trim()) continue;

      // Add user message to conversation history
      repo.addMessage(conversation.id, {
        waMessageId: msg.id,
        role: 'USER',
        type: 'TEXT',
        content: userText,
      });

      // 5. Asynchronously execute AI orchestrator
      // In production, this can also be queued into Redis BullMQ
      repo.enqueueJob('PROCESS_WHATSAPP_MESSAGE', {
        userId: user.id,
        conversationId: conversation.id,
        userText,
      });

      const agentResult = await executeAgent(user, conversation, userText);

      // Save assistant response to conversation history
      repo.addMessage(conversation.id, {
        role: 'ASSISTANT',
        type: 'TEXT',
        content: agentResult.replyText,
        tokensUsed: agentResult.tokensUsed,
      });

      // 6. Dispatch reply to user via WhatsApp Gateway
      const outgoing: WhatsAppOutgoingMessage = agentResult.buttons && agentResult.buttons.length > 0
        ? {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: msg.from,
            type: 'interactive',
            interactive: {
              type: 'button',
              body: { text: agentResult.replyText },
              footer: { text: 'Aguka AI • Rwanda' },
              action: {
                buttons: agentResult.buttons.slice(0, 3).map((b) => ({
                  type: 'reply',
                  reply: { id: b.id, title: b.title.slice(0, 20) },
                })),
              },
            },
          }
        : {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: msg.from,
            type: 'text',
            text: {
              body: agentResult.replyText,
              preview_url: true,
            },
          };

      await sendWhatsAppMessage(outgoing);
    }

    // Always acknowledge quickly to Meta with 200 OK
    return NextResponse.json({ status: 'EVENT_RECEIVED' }, { status: 200 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Error in WhatsApp webhook POST:', errorMsg);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
