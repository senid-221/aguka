import { NextRequest, NextResponse } from 'next/server';
import { repo } from '@/lib/db/repository';
import { executeAgent } from '@/lib/ai/bilingual-router';
import { WhatsAppOutgoingMessage } from '@/lib/whatsapp/gateway';

export async function POST(request: NextRequest) {
  try {
    const { phoneNumber, name, messageText } = await request.json();

    if (!phoneNumber) {
      return NextResponse.json({ error: 'phoneNumber is required' }, { status: 400 });
    }

    if (!messageText || !messageText.trim()) {
      return NextResponse.json({ error: 'Message text is required' }, { status: 400 });
    }

    const cleanPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
    const user = repo.getOrCreateUserByPhone(cleanPhone, name);
    const conversation = repo.getOrCreateConversation(user.id);

    // Local id only: this path never receives a Meta wamid because nothing is dispatched.
    const localMessageId = `sim-local-${Date.now()}`;
    repo.markMessageProcessed(localMessageId);

    // Save incoming user message
    const userMsg = repo.addMessage(conversation.id, {
      waMessageId: localMessageId,
      role: 'USER',
      type: 'TEXT',
      content: messageText,
    });

    // Enqueue background tracking job
    repo.enqueueJob('PROCESS_SIMULATED_WHATSAPP_MESSAGE', {
      userId: user.id,
      conversationId: conversation.id,
      messageText,
    });

    // Execute bilingual agent orchestrator
    const agentResult = await executeAgent(user, conversation, messageText);

    // Save assistant reply
    const assistantMsg = repo.addMessage(conversation.id, {
      role: 'ASSISTANT',
      type: 'TEXT',
      content: agentResult.replyText,
      tokensUsed: agentResult.tokensUsed,
    });

    // Build WhatsApp outgoing payload representation
    const outgoingPayload: WhatsAppOutgoingMessage = agentResult.buttons && agentResult.buttons.length > 0
      ? {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanPhone.replace(/\+/g, ''),
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
          to: cleanPhone.replace(/\+/g, ''),
          type: 'text',
          text: {
            body: agentResult.replyText,
            preview_url: true,
          },
        };

    return NextResponse.json({
      success: true,
      conversationId: conversation.id,
      userMessage: userMsg,
      assistantMessage: assistantMsg,
      agentResult,
      outgoingPayload,
      delivery: {
        dispatched: false,
        reason:
          'This simulator builds and shows the payload only. The real delivery path is POST /api/whatsapp/webhook with Meta Cloud API credentials.',
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
