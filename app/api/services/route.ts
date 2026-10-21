import { NextResponse } from 'next/server';
import { ensureCatalogSeeded, listMenuServices } from '@/lib/services/catalog';

export const runtime = 'nodejs';

/** Public catalogue of the services a user can pick from in WhatsApp. */
export async function GET() {
  ensureCatalogSeeded();
  const services = listMenuServices().map((s) => ({
    code: s.code,
    nameEn: s.nameEn,
    nameRw: s.nameRw,
    descriptionEn: s.descriptionEn,
    descriptionRw: s.descriptionRw,
    agentType: s.agentType,
    isFree: s.isFree,
    chargeEnabled: s.chargeEnabled,
    price: s.chargeEnabled ? s.price : 0,
    currency: s.currency,
    billingPeriod: s.billingPeriod,
    trialHours: s.trialHours,
    trialUsageLimit: s.trialUsageLimit,
    paidUsageLimit: s.paidUsageLimit,
    sortOrder: s.sortOrder,
  }));
  return NextResponse.json({ success: true, count: services.length, services });
}
