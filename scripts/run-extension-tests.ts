import { UsageLimiter } from '@/lib/security/rate-limiter';
import { issueAdminToken, verifyAdminToken } from '@/lib/security/admin-auth';
import { findExpiredMedia } from '@/lib/maintenance/retention';

let failed = 0;
const t = (name: string, ok: boolean) => { console.log(`${ok ? '✓' : '✗'} ${name}`); if (!ok) failed++; };

const l = new UsageLimiter(3, 100);
const now = 1_000_000;
t('allows up to limit', [1, 2, 3].every((i) => l.check('u', now + i).allowed));
const blocked = l.check('u', now + 10);
t('blocks 4th in window', !blocked.allowed && blocked.reason === 'RATE_LIMIT');
t('window slides', l.check('u', now + 61_000).allowed);
l.recordTokens('v', 100, now);
t('daily token budget enforced', l.check('v', now).reason === 'DAILY_TOKEN_BUDGET');

const secret = 'x'.repeat(32);
const tok = issueAdminToken('a@b.rw', 60, secret);
t('valid admin token', verifyAdminToken(tok, secret).valid);
t('tampered token rejected', !verifyAdminToken(tok.slice(0, -2) + 'zz', secret).valid);
t('expired token rejected', !verifyAdminToken(issueAdminToken('a@b.rw', -10, secret), secret).valid);
t('retention report shape', Array.isArray(findExpiredMedia().expiredIds));

process.exit(failed ? 1 : 0);
