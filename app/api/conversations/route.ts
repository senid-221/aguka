import { NextRequest, NextResponse } from 'next/server';
import { repo } from '@/lib/db/repository';
import { requireAdmin } from '@/lib/security/admin-auth';

// A conversation list is every user's message history, so it is administrator-only
// even though the ids it takes are not secrets.
export async function GET(request: NextRequest) {
  if (!requireAdmin(request).ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
