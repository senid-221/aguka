import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/security/admin-auth';
import { repo } from '@/lib/db/repository';

export const runtime = 'nodejs';

/** Read-only audit trail. Every commercial and content change lands here. */
export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const limitParam = Number(request.nextUrl.searchParams.get('limit') || 200);
  const action = (request.nextUrl.searchParams.get('action') || '').toUpperCase();
  const entries = repo.getAuditLog(Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 2000) : 200);

  return NextResponse.json({
    success: true,
    entries: action ? entries.filter((e) => e.action.toUpperCase().includes(action)) : entries,
  });
}
