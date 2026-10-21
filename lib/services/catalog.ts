import { AgentType, ServiceDefinition } from '@/lib/types';
import { repo } from '@/lib/db/repository';

export type CatalogEntry = Omit<ServiceDefinition, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * The product's own service list, not sample data: every entry maps to a real
 * agent in the routing table. Prices ship at zero with `chargeEnabled: false`,
 * because an unconfirmed price must never bill a real person. An administrator
 * sets price/currency/trial/billing period and turns charging on per service.
 */
const DEFAULT_CATALOG: CatalogEntry[] = [
  {
    code: 'JOB_SEARCH',
    nameEn: 'Find Jobs',
    nameRw: 'Shaka akazi',
    descriptionEn: 'Verified Rwandan job listings',
    descriptionRw: 'Imirimo yemejwe mu Rwanda',
    agentType: 'JOB_FINDER',
    isEnabled: true,
    showInWhatsAppMenu: true,
    isFree: true,
    chargeEnabled: false,
    price: 0,
    currency: 'RWF',
    billingPeriod: 'MONTHLY',
    trialHours: 24,
    trialUsageLimit: 0,
    paidUsageLimit: 0,
    sortOrder: 10,
  },
  {
    code: 'CV_CREATION',
    nameEn: 'CV & Career Help',
    nameRw: "CV n'inama",
    descriptionEn: 'CVs, cover letters, interview prep',
    descriptionRw: 'CV, ibaruwa, kwitegura ikizamini',
    agentType: 'CAREER_ASSISTANT',
    isEnabled: true,
    showInWhatsAppMenu: true,
    isFree: true,
    chargeEnabled: false,
    price: 0,
    currency: 'RWF',
    billingPeriod: 'MONTHLY',
    trialHours: 24,
    trialUsageLimit: 0,
    paidUsageLimit: 0,
    sortOrder: 20,
  },
  {
    code: 'PHOTO_EDITING',
    nameEn: 'Photo Editing',
    nameRw: 'Kunoza ifoto',
    descriptionEn: 'Passport and CV photo guidance',
    descriptionRw: "Amabwiriza y'ifoto ya pasiporo",
    agentType: 'IMAGE_STUDIO',
    isEnabled: true,
    showInWhatsAppMenu: true,
    isFree: true,
    chargeEnabled: false,
    price: 0,
    currency: 'RWF',
    billingPeriod: 'PER_USE',
    trialHours: 24,
    trialUsageLimit: 0,
    paidUsageLimit: 0,
    sortOrder: 30,
  },
  {
    code: 'CODING_DEV',
    nameEn: 'Coding & Apps',
    nameRw: 'Kwandika code',
    descriptionEn: 'Build, debug and explain software',
    descriptionRw: 'Kubaka, kosora no gusobanura',
    agentType: 'CODING_AGENT',
    isEnabled: true,
    showInWhatsAppMenu: true,
    isFree: true,
    chargeEnabled: false,
    price: 0,
    currency: 'RWF',
    billingPeriod: 'MONTHLY',
    trialHours: 24,
    trialUsageLimit: 0,
    paidUsageLimit: 0,
    sortOrder: 40,
  },
  {
    code: 'STUDENT_TUTORING',
    nameEn: 'Student Tutoring',
    nameRw: 'Kwigisha abanyeshuri',
    descriptionEn: 'Bilingual STEM and language tutoring',
    descriptionRw: 'Kwigisha mu Kinyarwanda n\'Icyongereza',
    agentType: 'STUDY_TUTOR',
    isEnabled: true,
    showInWhatsAppMenu: true,
    isFree: true,
    chargeEnabled: false,
    price: 0,
    currency: 'RWF',
    billingPeriod: 'MONTHLY',
    trialHours: 24,
    trialUsageLimit: 0,
    paidUsageLimit: 0,
    sortOrder: 50,
  },
  {
    code: 'ROAD_SAFETY',
    nameEn: 'Road Safety Academy',
    nameRw: "Amategeko y'umuhanda",
    descriptionEn: 'Rwanda traffic rules and mock exams',
    descriptionRw: "Amategeko y'umuhanda n'ibizamini",
    agentType: 'ROAD_SAFETY_ACADEMY',
    isEnabled: true,
    showInWhatsAppMenu: true,
    isFree: true,
    chargeEnabled: false,
    price: 0,
    currency: 'RWF',
    billingPeriod: 'MONTHLY',
    trialHours: 24,
    trialUsageLimit: 0,
    paidUsageLimit: 0,
    sortOrder: 60,
  },
  {
    code: 'EMPLOYMENT_MATCHING',
    nameEn: 'Hire & Match Talent',
    nameRw: 'Guhuza abakozi',
    descriptionEn: 'Post vacancies, match verified workers',
    descriptionRw: 'Tanga imirimo, huza abakozi',
    agentType: 'EMPLOYMENT_MARKETPLACE',
    isEnabled: true,
    showInWhatsAppMenu: true,
    isFree: true,
    chargeEnabled: false,
    price: 0,
    currency: 'RWF',
    billingPeriod: 'MONTHLY',
    trialHours: 24,
    trialUsageLimit: 0,
    paidUsageLimit: 0,
    sortOrder: 70,
  },
];

export const AGENT_FOR_SERVICE_CODE: Record<string, AgentType> = Object.fromEntries(
  DEFAULT_CATALOG.map((s) => [s.code, s.agentType])
);

/** Creates the catalog only when an operator has not configured one yet. */
export function ensureCatalogSeeded(): { seeded: number; alreadyPresent: number } {
  const existing = repo.getServices();
  if (existing.length > 0) return { seeded: 0, alreadyPresent: existing.length };
  for (const entry of DEFAULT_CATALOG) repo.createService(entry);
  return { seeded: DEFAULT_CATALOG.length, alreadyPresent: 0 };
}

export function listAllServices(): ServiceDefinition[] {
  return [...repo.getServices()].sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
}

export function listMenuServices(): ServiceDefinition[] {
  return repo.getWhatsAppMenuServices();
}

export function getService(code: string): ServiceDefinition | undefined {
  return repo.getServiceByCode(String(code || '').trim().toUpperCase());
}

export function agentFor(service: ServiceDefinition): AgentType {
  return service.agentType;
}

export function validatePricing(patch: Partial<ServiceDefinition>): string[] {
  const errors: string[] = [];
  if (patch.price !== undefined && (!Number.isFinite(patch.price) || patch.price < 0)) {
    errors.push('price must be a number greater than or equal to 0');
  }
  if (patch.currency && !['RWF', 'USD', 'EUR'].includes(patch.currency)) errors.push('currency must be RWF, USD or EUR');
  if (patch.billingPeriod && !['PER_USE', 'DAILY', 'WEEKLY', 'MONTHLY'].includes(patch.billingPeriod)) {
    errors.push('billingPeriod must be PER_USE, DAILY, WEEKLY or MONTHLY');
  }
  if (patch.trialHours !== undefined && (patch.trialHours < 0 || patch.trialHours > 24 * 31)) {
    errors.push('trialHours must be between 0 and 744');
  }
  if (patch.trialUsageLimit !== undefined && patch.trialUsageLimit < 0) errors.push('trialUsageLimit cannot be negative');
  if (patch.paidUsageLimit !== undefined && patch.paidUsageLimit < 0) errors.push('paidUsageLimit cannot be negative');
  if (patch.chargeEnabled && patch.isFree) errors.push('a free service cannot have charging enabled');
  return errors;
}
