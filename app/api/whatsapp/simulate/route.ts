import { NextRequest, NextResponse } from 'next/server';
import { repo } from '@/lib/db/repository';
import { executeAgent } from '@/lib/ai/bilingual-router';
import { WhatsAppOutgoingMessage } from '@/lib/whatsapp/gateway';

export async function POST(request: NextRequest) {
  try {
    const { phoneNumber = '+250788912345', name = 'Jean Claude Mugisha', messageText } = await request.json();

    if (!messageText || !messageText.trim()) {
      return NextResponse.json({ error: 'Message text is required' }, { status: 400 });
    }

    const cleanPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
    const user = repo.getOrCreateUserByPhone(cleanPhone, name);
    const conversation = repo.getOrCreateConversation(user.id);

    const waMsgId = `wamid.sim.${Date.now()}`;
    repo.markMessageProcessed(waMsgId);

    // Save incoming user message
    const userMsg = repo.addMessage(conversation.id, {
      waMessageId: waMsgId,
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
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
