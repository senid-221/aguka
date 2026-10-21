import { NextRequest, NextResponse } from 'next/server';
import { checkAdminCredentials, issueAdminToken } from '@/lib/security/admin-auth';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();
    if (!process.env.ADMIN_JWT_SECRET) {
      return NextResponse.json(
        { error: 'Admin sessions are disabled: set ADMIN_JWT_SECRET on this server.' },
        { status: 503 }
      );
    }
    if (typeof email !== 'string' || typeof password !== 'string' || !checkAdminCredentials(email, password)) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    return NextResponse.json({ token: issueAdminToken(email), expiresInSeconds: 8 * 3600 });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
