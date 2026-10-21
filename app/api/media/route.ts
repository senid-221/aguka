import { NextRequest, NextResponse } from 'next/server';
import { repo } from '@/lib/db/repository';

export async function GET() {
  const tasks = repo.getMediaTasks();
  return NextResponse.json({ tasks });
}

export async function POST(request: NextRequest) {
  try {
    const { operation, originalUrl, userName = 'Jean Claude Mugisha' } = await request.json();

    const created = repo.createMediaTask({
      userId: 'usr-rw-01',
      userName,
      operation: operation || 'PASSPORT_CROP',
      originalUrl: originalUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
      processedUrl: originalUrl,
      retentionDays: 30,
    });

    return NextResponse.json({ success: true, task: created });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
