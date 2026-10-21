import { Conversation, ServiceDefinition, User } from '@/lib/types';
import { repo } from '@/lib/db/repository';
import { listMenuServices } from '@/lib/services/catalog';
import {
  TrialActivation,
  activateTrial,
  buildAccessReply,
  trialStartedNotice,
  type ReplyLanguage,
} from '@/lib/services/entitlements';

const MENU_KEYWORDS = [
  'menu',
  'services',
  'service',
  'choices',
  'hitamo',
  'serivisi',
  'list',
  'change service',
  'guhindura',
  'start',
  'muraho',
  'hello',
  'start over',
];

const MENU_TITLE: Record<ReplyLanguage, string> = {
  ENGLISH: 'Aguka AI — what can we help you with today?',
  KINYARWANDA: 'Aguka AI — dushobora kugufasha iki uyu munsi?',
};

const MENU_BUTTON: Record<ReplyLanguage, string> = {
  ENGLISH: 'Choose service',
  KINYARWANDA: 'Hitamo serivisi',
};

const MENU_SECTION: Record<ReplyLanguage, string> = {
  ENGLISH: 'Aguka services',
  KINYARWANDA: 'Serivisi za Aguka',
};

function clip(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, Math.max(1, max - 1))}…`;
}

/** WhatsApp interactive rows must be id-stable so a reply can be mapped back. */
export function rowIdFor(service: ServiceDefinition): string {
  return `svc:${service.code}`;
}

export interface ServiceMenu {
  services: ServiceDefinition[];
  bodyText: string;
  interactive: {
    type: 'list';
    header: { type: 'string'; string: string };
    body: { text: string };
    footer: { text: string };
    action: {
      button: string;
      sections: Array<{ title: string; rows: Array<{ id: string; title: string; description: string }> }>;
    };
  };
}

export function buildServiceMenu(lang: ReplyLanguage): ServiceMenu | null {
  const services = listMenuServices();
  if (services.length === 0) return null;

  const rows = services.map((s) => ({
    id: rowIdFor(s),
    title: clip(lang === 'KINYARWANDA' ? s.nameRw : s.nameEn, 24),
    description: clip(lang === 'KINYARWANDA' ? s.descriptionRw : s.descriptionEn, 72),
  }));

  // WhatsApp allows at most 10 rows per section.
  const sections: ServiceMenu['interactive']['action']['sections'] = [];
  for (let i = 0; i < rows.length; i += 10) {
    sections.push({
      title: sections.length === 0 ? clip(MENU_SECTION[lang], 24) : `${clip(MENU_SECTION[lang], 18)} ${sections.length + 1}`,
      rows: rows.slice(i, i + 10),
    });
  }

  const numbered = services
    .map((s, i) => `${i + 1}. ${clip(lang === 'KINYARWANDA' ? s.nameRw : s.nameEn, 40)}`)
    .join('\n');

  return {
    services,
    bodyText:
      `${MENU_TITLE[lang]}\n\n${numbered}\n\n` +
      (lang === 'KINYARWANDA'
        ? 'Hitamo muri lisiti, cyangwa wandike nomero.'
        : 'Pick one from the list, or reply with its number.'),
    interactive: {
      type: 'list',
      header: { type: 'string', string: clip('Aguka AI', 60) },
      body: { text: clip(MENU_TITLE[lang], 1024) },
      footer: { text: 'Aguka AI • Rwanda' },
      action: { button: clip(MENU_BUTTON[lang], 20), sections },
    },
  };
}

export function wantsMenu(text: string): boolean {
  const t = text.toLowerCase().trim();
  if (!t) return false;
  return MENU_KEYWORDS.some((k) => t === k || t.startsWith(`${k} `) || t.includes(` ${k} `));
}

export interface SelectionMatch {
  service: ServiceDefinition | null;
  via: 'row-id' | 'number' | 'name' | 'none';
}

/**
 * Resolves a WhatsApp reply into a catalog service. Button and list replies carry
 * the row id; typed replies arrive as a number or the visible service name.
 */
export function matchServiceFromReply(text: string): SelectionMatch {
  const raw = String(text || '').trim();
  if (!raw) return { service: null, via: 'none' };

  const services = listMenuServices();

  const lowered = raw.toLowerCase();
  if (lowered.startsWith('svc:')) {
    const code = raw.slice(4).trim().toUpperCase();
    const hit = services.find((s) => s.code === code) ?? repo.getServiceByCode(code);
    return { service: hit ?? null, via: 'row-id' };
  }

  if (/^\d{1,2}$/.test(lowered)) {
    const index = Number(lowered) - 1;
    return { service: services[index] ?? null, via: 'number' };
  }

  const named = services.find(
    (s) =>
      lowered === s.code.toLowerCase() ||
      lowered === s.nameEn.toLowerCase() ||
      lowered === s.nameRw.toLowerCase() ||
      lowered.includes(s.code.toLowerCase().replace(/_/g, ' '))
  );
  if (named) return { service: named, via: 'name' };

  return { service: null, via: 'none' };
}

export interface SelectionResult {
  service: ServiceDefinition;
  activation: TrialActivation;
  replyText: string;
  switched: boolean;
}

/**
 * Remembers the chosen service on the user and the conversation, then starts the
 * free trial if one is available. The reply states the expiry and the price.
 */
export function applySelection(
  user: User,
  conversation: Conversation,
  service: ServiceDefinition,
  lang: ReplyLanguage
): SelectionResult {
  const previous = conversation.activeServiceCode ?? user.selectedServiceCode ?? null;
  const switched = previous !== null && previous !== service.code;

  repo.updateUser(user.id, { selectedServiceCode: service.code, serviceSelectedAt: new Date().toISOString() });
  const updated = repo.updateConversation(conversation.id, {
    activeServiceCode: service.code,
    lastAgent: service.agentType,
  });
  if (updated) updated.memories.activeServiceCode = service.code;

  const activation = activateTrial(user, service);
  const entitlement = activation.entitlement;

  let replyText: string;
  if (activation.outcome === 'TRIAL_STARTED' && entitlement) {
    replyText =
      `${lang === 'KINYARWANDA' ? 'Wahisemo' : 'Selected'}: ${lang === 'KINYARWANDA' ? service.nameRw : service.nameEn}\n` +
      trialStartedNotice(service, entitlement, lang);
  } else if (activation.outcome === 'FREE_UNCHARGED') {
    replyText =
      `${lang === 'KINYARWANDA' ? 'Wahisemo' : 'Selected'}: ${lang === 'KINYARWANDA' ? service.nameRw : service.nameEn}\n` +
      (lang === 'KINYARWANDA'
        ? 'Iyi serivisi iraboneka ku buntu. Andika ikibazo cyawe.'
        : 'This service is free to use. Send your question.');
  } else if (activation.outcome === 'CHARGING_NOT_ENABLED') {
    replyText =
      `${lang === 'KINYARWANDA' ? 'Wahisemo' : 'Selected'}: ${lang === 'KINYARWANDA' ? service.nameRw : service.nameEn}\n` +
      (lang === 'KINYARWANDA'
        ? 'Igiciro ntikiremezwa n\'ubuyobozi, bityo iracyari ubuntu. Andika ikibazo cyawe.'
        : 'An administrator has not confirmed the price for this service yet, so it is open free of charge. Send your question.');
  } else if (activation.outcome === 'TRIAL_ALREADY_RUNNING' && entitlement) {
    const remaining = entitlement.usageLimit != null ? Math.max(0, entitlement.usageLimit - entitlement.usageCount) : null;
    replyText =
      `${lang === 'KINYARWANDA' ? 'Wahisemo' : 'Selected'}: ${lang === 'KINYARWANDA' ? service.nameRw : service.nameEn}\n` +
      (lang === 'KINYARWANDA'
        ? `Igerageza ry'ubuntu ryawe rikomeza kugeza ${entitlement.trialExpiresAt ? new Date(entitlement.trialExpiresAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}${remaining != null ? `, ubutumwa busigaye ${remaining}` : ''}.`
        : `Your free trial is already running until ${entitlement.trialExpiresAt ? new Date(entitlement.trialExpiresAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}${remaining != null ? `, ${remaining} messages left` : ''}.`);
  } else {
    const decision = activation.decision;
    replyText =
      `${lang === 'KINYARWANDA' ? 'Wahisemo' : 'Selected'}: ${lang === 'KINYARWANDA' ? service.nameRw : service.nameEn}\n` +
      buildAccessReply(service, decision, lang);
  }

  return { service, activation, replyText, switched };
}
