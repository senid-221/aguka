import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/security/admin-auth';
import { repo } from '@/lib/db/repository';
import { grantPaidAccess } from '@/lib/services/entitlements';

export const runtime = 'nodejs';

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/** Admin view of who holds access to what, and why. */
export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.ok) return unauthorized();

  const entitlements = repo.getEntitlements().map((e) => {
    const user = repo.getUserById(e.userId);
    const service = repo.getServiceByCode(e.serviceCode);
    return {
      ...e,
      phone: user?.phoneNumber ?? 'unknown',
      userName: user?.fullName ?? null,
      serviceName: service ? `${service.nameEn} / ${service.nameRw}` : e.serviceCode,
    };
  });

  return NextResponse.json({
    success: true,
    entitlements,
    trialGrants: repo.getAllTrialGrants().map((g) => {
      const user = repo.getUserById(g.userId);
      return { ...g, phone: user?.phoneNumber ?? 'unknown' };
    }),
  });
}

/**
 * Manual entitlement control. Granting access outside a verified payment is
 * allowed only for an authenticated administrator and is always audited.
 */
export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.ok) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action || '');
  const actor = auth.email || 'admin';
  const entitlementId = String(body.entitlementId || '');

  if (action === 'REVOKE') {
    const existing = repo.getEntitlements().find((e) => e.id === entitlementId);
    if (!existing) return NextResponse.json({ error: 'Unknown entitlement' }, { status: 404 });
    const updated = repo.updateEntitlement(existing.id, {
      status: 'NONE',
      paidUntil: null,
      trialExpiresAt: existing.trialExpiresAt && existing.trialExpiresAt > new Date().toISOString() ? null : existing.trialExpiresAt,
      usageLimit: 0,
    });
    repo.appendAudit({
      actor,
      actorRole: 'ADMIN',
      action: 'ENTITLEMENT_REVOKED',
      targetType: 'Entitlement',
      targetId: existing.id,
      summary: `Revoked ${existing.serviceCode} for user ${existing.userId}`,
      before: existing,
      after: updated,
    });
    return NextResponse.json({ success: true, entitlement: updated });
  }

  if (action === 'GRANT') {
    const userId = String(body.userId || '');
    const serviceCode = String(body.serviceCode || '')
      .trim()
      .toUpperCase();
    const reason = String(body.reason || '').trim();
    if (!reason) {
      return NextResponse.json({ error: 'A written reason is required to grant access without a verified payment.' }, { status: 400 });
    }
    const user = repo.getUserById(userId);
    const service = repo.getServiceByCode(serviceCode);
    if (!user || !service) return NextResponse.json({ error: 'Unknown user or service' }, { status: 404 });

    const entitlement = grantPaidAccess(user, service, { verifiedBy: actor, source: 'MANUAL_ADMIN' });
    repo.appendAudit({
      actor,
      actorRole: 'ADMIN',
      action: 'ENTITLEMENT_GRANTED_MANUALLY',
      targetType: 'Entitlement',
      targetId: entitlement.id,
      summary: `Granted ${serviceCode} to ${user.phoneNumber} without payment verification. Reason: ${reason}`,
      before: null,
      after: entitlement,
    });
    return NextResponse.json({ success: true, entitlement });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
