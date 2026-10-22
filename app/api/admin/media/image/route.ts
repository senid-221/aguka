import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/security/admin-auth';
import { repo } from '@/lib/db/repository';
import { durableStore } from '@/lib/db/store';

export const runtime = 'nodejs';

/**
 * Streams one studio-produced portrait to an authenticated administrator. The
 * file lives outside the web root under an opaque key, and a task whose output
 * reads `purged:` has already been deleted by the retention sweep.
 */
export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const taskId = request.nextUrl.searchParams.get('taskId') || '';
  const task = repo.getMediaTasks().find((t) => t.id === taskId);
  if (!task) return NextResponse.json({ error: 'Unknown media task' }, { status: 404 });

  const stored = task.processedUrl || '';
  if (stored.startsWith('purged:')) {
    return NextResponse.json(
      { error: `This photo was deleted after its ${task.retentionDays}-day retention window.` },
      { status: 410 }
    );
  }
  if (!stored.startsWith('stored:')) {
    return NextResponse.json({ error: 'This task has no file stored on this server.' }, { status: 404 });
  }

  const bytes = durableStore.readBinary(stored.slice('stored:'.length));
  if (!bytes) {
    return NextResponse.json(
      { error: 'The stored image file is missing from this server. It may have been deleted or the data directory moved.' },
      { status: 410 }
    );
  }

  return new NextResponse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(bytes.length),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
