import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/security/admin-auth';
import { repo } from '@/lib/db/repository';
import { durableStore } from '@/lib/db/store';

export const runtime = 'nodejs';

/**
 * Streams one stored receipt to an authenticated administrator. Bytes live
 * outside the web root and are never reachable without this check.
 */
export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const proofId = request.nextUrl.searchParams.get('proofId') || '';
  const proof = proofId ? repo.getPaymentProofById(proofId) : undefined;
  if (!proof) return NextResponse.json({ error: 'Unknown proof' }, { status: 404 });

  const bytes = durableStore.readBinary(proof.storageKey);
  if (!bytes) {
    return NextResponse.json(
      { error: 'The stored image file is missing from this server. It may have been deleted or the data directory moved.' },
      { status: 410 }
    );
  }

  return new NextResponse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, {
    headers: {
      'Content-Type': proof.mimeType,
      'Content-Length': String(bytes.length),
      'Content-Disposition': `inline; filename="${proof.fileName.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
