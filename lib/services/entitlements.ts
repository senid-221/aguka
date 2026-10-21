import {
  AccessDecision,
  BillingPeriod,
  Currency,
  Entitlement,
  ServiceDefinition,
  User,
} from '@/lib/types';
import { repo } from '@/lib/db/repository';
import { newId } from '@/lib/util/ids';

export type ReplyLanguage = 'ENGLISH' | 'KINYARWANDA';

export interface TrialActivation {
  outcome:
    | 'FREE_UNCHARGED'
    | 'TRIAL_STARTED'
    | 'TRIAL_ALREADY_RUNNING'
    | 'ALREADY_PAID'
    | 'TRIAL_ALREADY_USED'
    | 'NO_TRIAL_CONFIGURED'
    | 'CHARGING_NOT_ENABLED';
  service: ServiceDefinition;
  entitlement: Entitlement | null;
  decision: AccessDecision;
}

const HOUR_MS = 3_600_000;

export function identityKeyOf(user: User): string {
  const raw = user.whatsappId || user.phoneNumber.replace(/[^\d]/g, '');
  return String(raw || user.id).toLowerCase();
}

function iso(now: number): string {
  return new Date(now).toISOString();
}

export function isPast(value: string | null | undefined, now = Date.now()): boolean {
  if (!value) return false;
  const t = Date.parse(value);
  return Number.isFinite(t) && t <= now;
}

export function periodEnd(fromMs: number, period: BillingPeriod): string | null {
  switch (period) {
    case 'DAILY':
      return iso(fromMs + 24 * HOUR_MS);
    case 'WEEKLY':
      return iso(fromMs + 7 * 24 * HOUR_MS);
    case 'MONTHLY': {
      const d = new Date(fromMs);
      d.setMonth(d.getMonth() + 1);
      return d.toISOString();
    }
    case 'PER_USE':
    default:
      return null;
  }
}

export function formatMoney(amount: number, currency: Currency): string {
  return `${amount.toLocaleString('en-US')} ${currency}`;
}

function decisionFor(
  service: ServiceDefinition,
  entitlement: Entitlement | null | undefined,
  extra: Partial<AccessDecision> = {}
): AccessDecision {
  return {
    allowed: false,
    serviceCode: service.code,
    status: entitlement?.status ?? 'NONE',
    remainingUsage: entitlement?.usageLimit == null ? null : Math.max(0, entitlement.usageLimit - entitlement.usageCount),
    trialExpiresAt: entitlement?.trialExpiresAt ?? null,
    paidUntil: entitlement?.paidUntil ?? null,
    price: service.price,
    currency: service.currency,
    billingPeriod: service.billingPeriod,
    ...extra,
  };
}

/**
 * Charging only applies when an administrator has enabled it for the service.
 * A service that is free, or paid but not yet charging, is open to everyone,
 * which keeps an unconfirmed price from locking a real user out.
 */
export function isChargeable(service: ServiceDefinition): boolean {
  return !service.isFree && service.chargeEnabled;
}

export function evaluateAccess(user: User, service: ServiceDefinition, now = Date.now()): AccessDecision {
  const entitlement = repo.getEntitlement(user.id, service.code);

  if (!service.isEnabled) {
    return decisionFor(service, entitlement, { denialReason: 'SERVICE_DISABLED' });
  }

  if (!isChargeable(service)) {
    return decisionFor(service, entitlement, { allowed: true, status: entitlement?.status ?? 'NONE' });
  }

  // Read once: a trial burned on another account with the same WhatsApp identity
  // must change the denial reason, not just block silently.
  const hasTrial = repo.findTrialGrants(user.id, service.code, identityKeyOf(user)).length > 0;

  if (!entitlement) {
    return decisionFor(service, null, { denialReason: hasTrial ? 'TRIAL_USED' : 'PAYMENT_REQUIRED' });
  }

  // Expire lazily so a restart or an idle period cannot extend access.
  if (entitlement.status === 'TRIAL') {
    if (isPast(entitlement.trialExpiresAt, now)) {
      repo.updateEntitlement(entitlement.id, { status: 'EXPIRED', usageLimit: entitlement.usageLimit });
      return decisionFor(service, { ...entitlement, status: 'EXPIRED' }, { denialReason: 'TRIAL_EXPIRED' });
    }
    if (entitlement.usageLimit != null && entitlement.usageCount >= entitlement.usageLimit) {
      return decisionFor(service, entitlement, { denialReason: 'USAGE_LIMIT_REACHED' });
    }
    return decisionFor(service, entitlement, { allowed: true });
  }

  if (entitlement.status === 'ACTIVE') {
    const timeExpired = entitlement.paidUntil != null && isPast(entitlement.paidUntil, now);
    const usesExhausted = entitlement.usageLimit != null && entitlement.usageCount >= entitlement.usageLimit;
    if (timeExpired || usesExhausted) {
      repo.updateEntitlement(entitlement.id, { status: 'EXPIRED' });
      return decisionFor(service, { ...entitlement, status: 'EXPIRED' }, {
        denialReason: usesExhausted && !timeExpired ? 'USAGE_LIMIT_REACHED' : 'TRIAL_EXPIRED',
      });
    }
    return decisionFor(service, entitlement, { allowed: true });
  }

  return decisionFor(service, entitlement, {
    denialReason: hasTrial ? 'TRIAL_USED' : 'PAYMENT_REQUIRED',
  });
}

/**
 * Grants the free trial for a service. A trial can only ever be granted once per
 * user per service, and the check also looks at the WhatsApp identity, so the
 * same person cannot re-register and trial again.
 */
export function activateTrial(user: User, service: ServiceDefinition, now = Date.now()): TrialActivation {
  const existing = repo.getEntitlement(user.id, service.code);

  if (!isChargeable(service)) {
    const entitlement = repo.createEntitlement({
      userId: user.id,
      serviceCode: service.code,
      status: 'NONE',
      trialStartsAt: null,
      trialExpiresAt: null,
      paidUntil: null,
      usageCount: 0,
      usageLimit: null,
      lastUsedAt: null,
    });
    return {
      outcome: 'FREE_UNCHARGED',
      service,
      entitlement,
      decision: evaluateAccess(user, service, now),
    };
  }

  if (existing?.status === 'ACTIVE') {
    return { outcome: 'ALREADY_PAID', service, entitlement: existing, decision: evaluateAccess(user, service, now) };
  }
  if (existing?.status === 'TRIAL') {
    return { outcome: 'TRIAL_ALREADY_RUNNING', service, entitlement: existing, decision: evaluateAccess(user, service, now) };
  }

  if (service.trialHours <= 0) {
    return { outcome: 'NO_TRIAL_CONFIGURED', service, entitlement: existing ?? null, decision: evaluateAccess(user, service, now) };
  }

  if (repo.findTrialGrants(user.id, service.code, identityKeyOf(user)).length > 0) {
    return { outcome: 'TRIAL_ALREADY_USED', service, entitlement: existing ?? null, decision: evaluateAccess(user, service, now) };
  }

  if (!service.chargeEnabled) {
    return { outcome: 'CHARGING_NOT_ENABLED', service, entitlement: existing ?? null, decision: evaluateAccess(user, service, now) };
  }

  const trialExpiresAt = iso(now + service.trialHours * HOUR_MS);
  const entitlement = repo.createEntitlement({
    userId: user.id,
    serviceCode: service.code,
    status: 'TRIAL',
    trialStartsAt: iso(now),
    trialExpiresAt,
    paidUntil: null,
    usageCount: 0,
    usageLimit: service.trialUsageLimit > 0 ? service.trialUsageLimit : null,
    lastUsedAt: null,
  });
  const updated = repo.updateEntitlement(entitlement.id, {
    status: 'TRIAL',
    trialStartsAt: iso(now),
    trialExpiresAt,
    usageLimit: service.trialUsageLimit > 0 ? service.trialUsageLimit : null,
  })!;

  repo.recordTrialGrant({
    userId: user.id,
    serviceCode: service.code,
    identityKey: identityKeyOf(user),
    grantedAt: iso(now),
    expiresAt: trialExpiresAt,
  });

  return { outcome: 'TRIAL_STARTED', service, entitlement: updated, decision: evaluateAccess(user, service, now) };
}

export function consumeUsage(user: User, serviceCode: string): void {
  const entitlement = repo.getEntitlement(user.id, serviceCode);
  if (!entitlement) return;
  repo.updateEntitlement(entitlement.id, {
    usageCount: entitlement.usageCount + 1,
    lastUsedAt: new Date().toISOString(),
  });
}

/**
 * Only ever called with an independently verified or administratively confirmed
 * payment. It is the sole path that produces paid access.
 */
export function grantPaidAccess(
  user: User,
  service: ServiceDefinition,
  opts: { fromMs?: number; verifiedBy: string; source: string }
): Entitlement {
  const from = opts.fromMs ?? Date.now();
  const paidUntil = periodEnd(from, service.billingPeriod);
  const usageLimit = service.billingPeriod === 'PER_USE'
    ? service.paidUsageLimit > 0
      ? service.paidUsageLimit
      : null
    : null;

  const existing = repo.getEntitlement(user.id, service.code);
  if (!existing) {
    return repo.createEntitlement({
      userId: user.id,
      serviceCode: service.code,
      status: 'ACTIVE',
      trialStartsAt: null,
      trialExpiresAt: null,
      paidUntil,
      usageCount: 0,
      usageLimit,
      lastUsedAt: null,
    });
  }

  // Renewals extend from the current end date so paid time is never lost.
  const baseMs = existing.paidUntil && !isPast(existing.paidUntil, from) ? Date.parse(existing.paidUntil) : from;
  return repo.updateEntitlement(existing.id, {
    status: 'ACTIVE',
    paidUntil: periodEnd(baseMs, service.billingPeriod),
    usageCount: 0,
    usageLimit,
  })!;
}

const DENIAL_COPY: Record<string, Record<ReplyLanguage, string>> = {
  SERVICE_DISABLED: {
    ENGLISH: 'This service is currently switched off by the Aguka team. Try another service from the menu.',
    KINYARWANDA: 'Iyi serivisi irimo yazimwe n\'itsinda rya Aguka. Hitamo iyindi muri menu.',
  },
  TRIAL_USED: {
    ENGLISH: 'Your free trial for this service has already been used. Continue with a paid plan.',
    KINYARWANDA: 'Igerageza ry\'ubuntu kuri iyi serivisi ryarakoreshwe. Kwishyura ni ngombwa kugira ngo ukomeze.',
  },
  USAGE_LIMIT_REACHED: {
    ENGLISH: 'You have used all the free trial messages allowed for this service.',
    KINYARWANDA: 'Wakoresheje ubutumwa bwose bw\'igerageza ry\'iyi serivisi.',
  },
};

/**
 * Tells the user the price and expiry before any charge, and offers the payment
 * path. Never claims a payment was received.
 */
export function buildAccessReply(
  service: ServiceDefinition,
  decision: AccessDecision,
  lang: ReplyLanguage
): string {
  const price = formatMoney(service.price, service.currency);
  const RW_PERIOD: Record<BillingPeriod, string> = {
    PER_USE: 'buri gukoresha',
    DAILY: 'ku munsi',
    WEEKLY: 'ku cyumweru',
    MONTHLY: 'ku kwezi',
  };
  const periodLabel =
    lang === 'KINYARWANDA'
      ? RW_PERIOD[service.billingPeriod]
      : service.billingPeriod === 'PER_USE'
        ? 'per use'
        : `per ${service.billingPeriod.toLowerCase()}`;

  if (decision.denialReason === 'TRIAL_EXPIRED' || decision.denialReason === 'TRIAL_USED' || decision.denialReason === 'PAYMENT_REQUIRED' || decision.denialReason === 'USAGE_LIMIT_REACHED') {
    const head =
      decision.denialReason === 'USAGE_LIMIT_REACHED'
        ? DENIAL_COPY.USAGE_LIMIT_REACHED[lang]
        : decision.denialReason === 'TRIAL_USED'
          ? DENIAL_COPY.TRIAL_USED[lang]
          : lang === 'KINYARWANDA'
            ? `Igerageza ry\'ubuntu kuri ${service.nameRw} ryarangiye.`
            : `The free trial of ${service.nameEn} has ended.`;
    return (
      `${head}\n` +
      `${lang === 'KINYARWANDA' ? 'Igiciro' : 'Price'}: ${price} ${periodLabel}.\n` +
      (lang === 'KINYARWANDA'
        ? 'Andika "nishyure" kugira ngo ubone amabwiriza yo kwishyura n\'inomero y\'interaferansi. Serivisi ntibohorwa mbere y\'uko kwishyura kwaremezwa.'
        : 'Reply PAY to get MoMo payment instructions and your unique reference. The service unlocks only after the payment is verified.')
    );
  }

  if (decision.denialReason === 'SERVICE_DISABLED') return DENIAL_COPY.SERVICE_DISABLED[lang];

  return lang === 'KINYARWANDA'
    ? 'Ntibyakunze. Nyamuneka gerageza nyuma.'
    : 'Access could not be granted right now. Please try again.';
}

export function trialStartedNotice(service: ServiceDefinition, entitlement: Entitlement, lang: ReplyLanguage): string {
  const expires = entitlement.trialExpiresAt ? new Date(entitlement.trialExpiresAt) : null;
  const when = expires
    ? expires.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
    : '—';
  const limit =
    entitlement.usageLimit != null
      ? lang === 'KINYARWANDA'
        ? `\nNi ukuboneka ${entitlement.usageLimit} incuro z\'ubusa.`
        : `\nIncludes ${entitlement.usageLimit} free uses.`
      : '';
  const price = formatMoney(service.price, service.currency);

  return lang === 'KINYARWANDA'
    ? `Wahawe amasaha ${service.trialHours} y'ubuntu kuri ${service.nameRw}.\nBirangira: ${when}.${limit}\nNyuma yaho: ${price}. Tuzakwibutsa mbere y'uko wishyura; ntuhita wishyurwa.`
    : `You have ${service.trialHours} hours of free access to ${service.nameEn}.\nEnds: ${when}.${limit}\nAfter that it costs ${price}. We will tell you before any charge — you are never billed automatically.`;
}

export function newEntitlementId(): string {
  return newId('ent');
}
