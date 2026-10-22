import { NextRequest, NextResponse } from 'next/server';
import { repo } from '@/lib/db/repository';
import { requireAdmin } from '@/lib/security/admin-auth';

// Everything here is personal data: a profile, a whole conversation history, or the
// deletion of both. The userId arrives in the request, so the only thing that can
// authorise it is an administrator session — never the caller's own claim.
export async function GET(request: NextRequest) {
  if (!requireAdmin(request).ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const users = repo.getUsers();
  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  if (!requireAdmin(request).ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { action, userId } = await request.json();

    if (action === 'EXPORT_DATA') {
      const user = repo.getUserById(userId);
      const conversations = repo.getConversations().filter((c) => c.userId === userId);
      return NextResponse.json({
        exportDate: new Date().toISOString(),
        regulation: 'Rwanda Law N° 058/2021 on Personal Data Protection',
        user,
        conversations,
      });
    }

    if (action === 'DELETE_DATA') {
      const result = repo.deleteUserData(userId);
      return NextResponse.json(result);
    }

    if (action === 'TOGGLE_BLOCK') {
      const user = repo.getUserById(userId);
      if (user) {
        repo.updateUser(userId, { isBlocked: !user.isBlocked });
      }
      return NextResponse.json({ success: true, user });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
