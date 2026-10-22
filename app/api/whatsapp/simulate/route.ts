import { NextRequest, NextResponse } from 'next/server';
import { repo } from '@/lib/db/repository';
import { requireAdmin } from '@/lib/security/admin-auth';
import {
  buildButtonMessage,
  buildListMessage,
  buildTextMessage,
  buildImageMessage,
  WhatsAppOutgoingMessage,
} from '@/lib/whatsapp/gateway';
import { handleIncomingImage, handleIncomingText, InboundOutcome } from '@/lib/whatsapp/inbound';

export const runtime = 'nodejs';

/**
 * Runs the same inbound pipeline as the live webhook and returns the exact
 * payload that would be sent. Nothing is dispatched to a phone number here.
 */
export async function POST(request: NextRequest) {
  // Any caller could otherwise create a real user record from an arbitrary phone
  // number and spend provider tokens on it. Dashboard-only.
  if (!requireAdmin(request).ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { phoneNumber, name, messageText, imageBase64, imageMimeType, imageCaption } = await request.json();

    if (!phoneNumber) {
      return NextResponse.json({ error: 'phoneNumber is required' }, { status: 400 });
    }

    const hasImage = typeof imageBase64 === 'string' && imageBase64.length > 0;
    if (!hasImage && (!messageText || !String(messageText).trim())) {
      return NextResponse.json({ error: 'messageText or imageBase64 is required' }, { status: 400 });
    }

    const cleanPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
    const user = repo.getOrCreateUserByPhone(cleanPhone, name);
    const conversation = repo.getOrCreateConversation(user.id);

    // Local id only: this path never receives a Meta wamid because nothing is dispatched.
    const localMessageId = `sim-local-${Date.now()}`;
    repo.markMessageProcessed(localMessageId);
    const recipient = cleanPhone.replace(/\+/g, '');

    let outcome: InboundOutcome;
    let userMsg;

    if (hasImage) {
      const buffer = Buffer.from(String(imageBase64), 'base64');
      const caption = String(imageCaption ?? messageText ?? '').trim();
      userMsg = repo.addMessage(conversation.id, {
        waMessageId: localMessageId,
        role: 'USER',
        type: 'IMAGE',
        content: caption || `image (${imageMimeType || 'image/jpeg'})`,
        mediaUrl: `simulated-media:${localMessageId}`,
      });
      const proofJob = repo.enqueueJob('PROCESS_SIMULATED_PAYMENT_PROOF', { userId: user.id, conversationId: conversation.id });
      outcome = await handleIncomingImage(
        user,
        conversation,
        buffer,
        `${localMessageId}.jpg`,
        String(imageMimeType || 'image/jpeg'),
        caption
      );
      repo.updateJobStatus(proofJob.id, 'COMPLETED');
    } else {
      userMsg = repo.addMessage(conversation.id, {
        waMessageId: localMessageId,
        role: 'USER',
        type: 'TEXT',
        content: messageText,
      });
      const messageJob = repo.enqueueJob('PROCESS_SIMULATED_WHATSAPP_MESSAGE', {
        userId: user.id,
        conversationId: conversation.id,
        messageText,
      });
      outcome = await handleIncomingText(user, conversation, String(messageText));
      repo.updateJobStatus(messageJob.id, 'COMPLETED');
    }

    const assistantMsg = repo.addMessage(conversation.id, {
      role: 'ASSISTANT',
      type: outcome.image ? 'IMAGE' : 'TEXT',
      content: outcome.replyText,
      tokensUsed: outcome.tokensUsed,
      ...(outcome.image ? { mediaUrl: `stored:${outcome.image.storageKey}` } : {}),
    });

    // A studio result would be uploaded to Meta's media endpoint and sent as an
    // image message. The key is shown instead of the bytes: this endpoint never
    // dispatches, and the file lives in the private data directory.
    const outgoingPayload: WhatsAppOutgoingMessage = outcome.image
      ? buildImageMessage(recipient, `simulated-media-id-${outcome.image.taskId}`, outcome.replyText)
      : outcome.listMenu
        ? buildListMessage(recipient, outcome.listMenu.interactive)
        : outcome.buttons && outcome.buttons.length > 0
          ? buildButtonMessage(recipient, outcome.replyText, outcome.buttons)
          : buildTextMessage(recipient, outcome.replyText);

    return NextResponse.json({
      success: true,
      conversationId: conversation.id,
      userMessage: userMsg,
      assistantMessage: assistantMsg,
      outcome,
      serviceCode: conversation.activeServiceCode ?? null,
      outgoingPayload,
      image: outcome.image
        ? {
            taskId: outcome.image.taskId,
            storageKey: outcome.image.storageKey,
            mimeType: outcome.image.mimeType,
            width: outcome.image.width,
            height: outcome.image.height,
            expiresAt: outcome.image.expiresAt,
            uploaded: false,
          }
        : null,
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
