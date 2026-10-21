import { createHmac, timingSafeEqual } from 'crypto';
import { appConfig } from '@/lib/config';

/**
 * Minimal HS256 JWT for admin dashboard sessions (no external dependency).
 * Secret: ADMIN_JWT_SECRET. Credentials: ADMIN_DEFAULT_EMAIL / ADMIN_DEFAULT_PASSWORD.
 */

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function issueAdminToken(email: string, ttlSeconds = 8 * 3600, secret = appConfig.security.jwtSecret): string {
  if (!secret) throw new Error('ADMIN_JWT_SECRET is not configured; cannot issue admin sessions.');
  const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64(JSON.stringify({ sub: email, role: 'ADMIN', exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  return `${header}.${payload}.${sign(`${header}.${payload}`, secret)}`;
}

export function verifyAdminToken(
  token: string | null | undefined,
  secret = appConfig.security.jwtSecret
): { valid: boolean; email?: string } {
  if (!secret || !token) return { valid: false };
  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false };
  const expected = Buffer.from(sign(`${parts[0]}.${parts[1]}`, secret));
  const given = Buffer.from(parts[2]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { valid: false };
  try {
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (p.role !== 'ADMIN' || typeof p.exp !== 'number' || p.exp < Date.now() / 1000) return { valid: false };
    return { valid: true, email: p.sub };
  } catch {
    return { valid: false };
  }
}

export function checkAdminCredentials(email: string, password: string): boolean {
  const e = process.env.ADMIN_DEFAULT_EMAIL || '';
  const p = process.env.ADMIN_DEFAULT_PASSWORD || '';
  if (!e || !p) return false;
  const a = Buffer.from(`${email}\0${password}`);
  const b = Buffer.from(`${e}\0${p}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function requireAdmin(req: Request): { ok: boolean; email?: string } {
  const h = req.headers.get('authorization') || '';
  const r = verifyAdminToken(h.startsWith('Bearer ') ? h.slice(7) : null);
  return { ok: r.valid, email: r.email };
}
