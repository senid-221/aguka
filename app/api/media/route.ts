import { NextRequest, NextResponse } from 'next/server';
import { repo } from '@/lib/db/repository';

export async function GET() {
  const tasks = repo.getMediaTasks();
  return NextResponse.json({ tasks });
}

export async function POST(request: NextRequest) {
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
