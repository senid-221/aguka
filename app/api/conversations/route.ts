import { NextRequest, NextResponse } from 'next/server';
import { repo } from '@/lib/db/repository';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get('id');

  if (conversationId) {
    const conv = repo.getConversationById(conversationId);
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    const user = repo.getUserById(conv.userId);
    return NextResponse.json({ conversation: conv, user });
  }

  const conversations = repo.getConversations();
  const users = repo.getUsers();

  const enriched = conversations.map((c) => ({
    ...c,
    user: users.find((u) => u.id === c.userId),
  }));

  return NextResponse.json({ conversations: enriched });
}
