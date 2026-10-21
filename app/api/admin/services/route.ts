import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/security/admin-auth';
import { repo } from '@/lib/db/repository';
import { ensureCatalogSeeded, listAllServices, validatePricing } from '@/lib/services/catalog';
import { AgentType, BillingPeriod, Currency, ServiceDefinition } from '@/lib/types';

export const runtime = 'nodejs';

const AGENT_TYPES: AgentType[] = [
  'ROUTER',
  'JOB_FINDER',
  'CAREER_ASSISTANT',
  'EMPLOYMENT_MARKETPLACE',
  'CODING_AGENT',
  'IMAGE_STUDIO',
  'STUDY_TUTOR',
  'ROAD_SAFETY_ACADEMY',
];

const EDITABLE: Array<keyof ServiceDefinition> = [
  'nameEn',
  'nameRw',
  'descriptionEn',
  'descriptionRw',
  'agentType',
  'isEnabled',
  'showInWhatsAppMenu',
  'isFree',
  'chargeEnabled',
  'price',
  'currency',
  'billingPeriod',
  'trialHours',
  'trialUsageLimit',
  'paidUsageLimit',
  'sortOrder',
];

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/** Admin-only service configuration: availability, WhatsApp menu, pricing and trial policy. */
export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.ok) return unauthorized();
  ensureCatalogSeeded();
  return NextResponse.json({
    success: true,
    services: listAllServices(),
    stats: repo.getCommercialStats(),
    agentTypes: AGENT_TYPES,
  });
}

export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.ok) return unauthorized();

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  ensureCatalogSeeded();
  const code = String(body.code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_');
  if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 });
  if (repo.getServiceByCode(code)) {
    return NextResponse.json({ error: `Service ${code} already exists` }, { status: 409 });
  }

  const draft = {
    code,
    nameEn: String(body.nameEn || code),
    nameRw: String(body.nameRw || body.nameEn || code),
    descriptionEn: String(body.descriptionEn || ''),
    descriptionRw: String(body.descriptionRw || body.descriptionEn || ''),
    agentType: (AGENT_TYPES.includes(body.agentType as AgentType) ? body.agentType : 'GENERAL_ASSISTANT') as AgentType,
    isEnabled: body.isEnabled !== false,
    showInWhatsAppMenu: body.showInWhatsAppMenu !== false,
    isFree: body.isFree === true,
    chargeEnabled: body.chargeEnabled === true,
    price: Number(body.price) || 0,
    currency: (['RWF', 'USD', 'EUR'].includes(String(body.currency)) ? body.currency : 'RWF') as Currency,
    billingPeriod: (['PER_USE', 'DAILY', 'WEEKLY', 'MONTHLY'].includes(String(body.billingPeriod))
      ? body.billingPeriod
      : 'MONTHLY') as BillingPeriod,
    trialHours: Number.isFinite(Number(body.trialHours)) ? Number(body.trialHours) : 24,
    trialUsageLimit: Number(body.trialUsageLimit) || 0,
    paidUsageLimit: Number(body.paidUsageLimit) || 0,
    sortOrder: Number(body.sortOrder) || 100,
  };

  const errors = validatePricing(draft);
  if (errors.length) return NextResponse.json({ error: errors.join('; ') }, { status: 400 });
  if (draft.chargeEnabled && !draft.isFree && draft.price <= 0) {
    return NextResponse.json(
      { error: 'Charging is switched on but the price is 0. Set a price or leave charging off.' },
      { status: 400 }
    );
  }

  const service = repo.createService(draft);
  repo.appendAudit({
    actor: auth.email || 'admin',
    actorRole: 'ADMIN',
    action: 'SERVICE_CREATED',
    targetType: 'ServiceDefinition',
    targetId: service.id,
    summary: `Created service ${service.code} (enabled=${service.isEnabled}, charge=${service.chargeEnabled})`,
    before: null,
    after: service,
  });
  return NextResponse.json({ success: true, service }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.ok) return unauthorized();

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  ensureCatalogSeeded();
  const code = String(body.code || '')
    .trim()
    .toUpperCase();
  const existing = repo.getServiceByCode(code);
  if (!existing) return NextResponse.json({ error: `Unknown service ${code}` }, { status: 404 });

  const patch: Partial<ServiceDefinition> = {};
  for (const key of EDITABLE) {
    if (body[key] !== undefined) (patch as Record<string, unknown>)[key] = body[key];
  }

  const errors = validatePricing(patch);
  if (errors.length) return NextResponse.json({ error: errors.join('; ') }, { status: 400 });

  const merged = { ...existing, ...patch };
  if (merged.chargeEnabled && !merged.isFree && merged.price <= 0) {
    return NextResponse.json(
      { error: 'Refusing to switch charging on while the price is 0. Set a price first.' },
      { status: 400 }
    );
  }
  if (merged.isFree) {
    patch.chargeEnabled = false;
    patch.price = 0;
  }

  const service = repo.updateService(code, patch);
  if (!service) return NextResponse.json({ error: 'Update failed' }, { status: 500 });

  repo.appendAudit({
    actor: auth.email || 'admin',
    actorRole: 'ADMIN',
    action: 'SERVICE_UPDATED',
    targetType: 'ServiceDefinition',
    targetId: service.id,
    summary: `Updated ${code}: ${Object.keys(patch).join(', ')}`,
    before: existing,
    after: service,
  });
  return NextResponse.json({ success: true, service });
}

export async function DELETE(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.ok) return unauthorized();

  const code = String(request.nextUrl.searchParams.get('code') || '')
    .trim()
    .toUpperCase();
  const existing = repo.getServiceByCode(code);
  if (!existing) return NextResponse.json({ error: `Unknown service ${code}` }, { status: 404 });

  const active = repo.getEntitlements().filter((e) => e.serviceCode === code && (e.status === 'TRIAL' || e.status === 'ACTIVE'));
  if (active.length > 0) {
    return NextResponse.json(
      { error: `${code} still has ${active.length} live entitlement(s). Disable it instead of deleting.` },
      { status: 409 }
    );
  }

  repo.deleteService(code);
  repo.appendAudit({
    actor: auth.email || 'admin',
    actorRole: 'ADMIN',
    action: 'SERVICE_DELETED',
    targetType: 'ServiceDefinition',
    targetId: existing.id,
    summary: `Deleted service ${code}`,
    before: existing,
    after: null,
  });
  return NextResponse.json({ success: true });
}
