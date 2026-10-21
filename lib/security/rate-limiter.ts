import { appConfig } from '@/lib/config';

/**
 * Sliding-window per-user message rate limiter + daily AI token budget.
 * In-memory implementation (swap the store for Redis INCR/EXPIRE in production).
 * Limits come from MAX_MESSAGES_PER_MINUTE_PER_USER / MAX_DAILY_AI_TOKENS_PER_USER.
 */

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
  reason?: 'RATE_LIMIT' | 'DAILY_TOKEN_BUDGET';
}

const WINDOW_MS = 60_000;

export class UsageLimiter {
  private hits = new Map<string, number[]>();
  private tokens = new Map<string, { day: string; used: number }>();

  constructor(
    private maxPerMinute: number = appConfig.security.maxMessagesPerMinute,
    private maxDailyTokens: number = appConfig.security.maxDailyTokensPerUser
  ) {}

  private today(now: number): string {
    return new Date(now).toISOString().slice(0, 10);
  }

  /** Checks both limits and, if allowed, records the hit. */
  check(userId: string, now: number = Date.now()): RateLimitDecision {
    const budget = this.tokens.get(userId);
    if (budget && budget.day === this.today(now) && budget.used >= this.maxDailyTokens) {
      return { allowed: false, remaining: 0, retryAfterMs: 0, reason: 'DAILY_TOKEN_BUDGET' };
    }

    const recent = (this.hits.get(userId) || []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= this.maxPerMinute) {
      this.hits.set(userId, recent);
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: WINDOW_MS - (now - recent[0]),
        reason: 'RATE_LIMIT',
      };
    }

    recent.push(now);
    this.hits.set(userId, recent);
    return { allowed: true, remaining: this.maxPerMinute - recent.length, retryAfterMs: 0 };
  }

  recordTokens(userId: string, used: number, now: number = Date.now()): void {
    const day = this.today(now);
    const cur = this.tokens.get(userId);
    if (!cur || cur.day !== day) this.tokens.set(userId, { day, used });
    else cur.used += used;
  }

  getTokensUsed(userId: string, now: number = Date.now()): number {
    const cur = this.tokens.get(userId);
    return cur && cur.day === this.today(now) ? cur.used : 0;
  }

  reset(): void {
    this.hits.clear();
    this.tokens.clear();
  }
}

export const usageLimiter = new UsageLimiter();

/** Bilingual user-facing message for a blocked request. */
export function limitMessage(d: RateLimitDecision): string {
  if (d.reason === 'DAILY_TOKEN_BUDGET') {
    return 'Wagejeje ku gipimo cy\'uyu munsi. Ongera ugerageze ejo. / You have reached today\'s usage limit. Please try again tomorrow.';
  }
  const secs = Math.max(1, Math.ceil(d.retryAfterMs / 1000));
  return `Utumenyetso twinshi cyane. Ongera ugerageze nyuma y'amasegonda ${secs}. / Too many messages. Please retry in ${secs}s.`;
}
