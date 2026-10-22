import { NextRequest, NextResponse } from 'next/server';
import { repo } from '@/lib/db/repository';
import { requireAdmin } from '@/lib/security/admin-auth';

export async function GET(request: NextRequest) {
  if (!requireAdmin(request).ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tasks = repo.getMediaTasks();
  return NextResponse.json({ tasks });
}

export async function POST(request: NextRequest) {
  if (!requireAdmin(request).ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { userId, userName, operation, originalUrl } = await request.json();

    if (!userId || !originalUrl) {
      return NextResponse.json({ error: 'userId and originalUrl are required' }, { status: 400 });
    }

    const created = repo.createMediaTask({
      userId,
      userName: userName || repo.getUserById(userId)?.fullName || userId,
      operation: operation || 'PASSPORT_CROP',
      originalUrl,
      retentionDays: 30,
    });

    return NextResponse.json({ success: true, task: created });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
