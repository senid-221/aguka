import { AgentType, Conversation, LanguagePreference, User } from '@/lib/types';
import { repo } from '@/lib/db/repository';
import { AgentExecutionResult, detectLanguage, executeAgent } from '@/lib/ai/bilingual-router';
import { ensureCatalogSeeded, getService } from '@/lib/services/catalog';
import { evaluateAccess, isChargeable, type ReplyLanguage } from '@/lib/services/entitlements';
import { applySelection, buildServiceMenu, matchServiceFromReply, rowIdFor, ServiceMenu, wantsMenu } from '@/lib/services/selection';
import { attachPaymentProof, createOrder, paymentInstructions } from '@/lib/payments/orders';

export interface InboundOutcome {
  replyText: string;
  buttons?: Array<{ id: string; title: string }>;
  listMenu?: ServiceMenu;
  agentType: AgentType;
  intent: string;
  tokensUsed: number;
  modelUsed: string;
  /**
   * Only set when a model actually answered. Menu, selection and payment replies
   * are deterministic, so the inspector shows them as rule-based rather than
   * inventing a latency or tool trace.
   */
  detectedLanguage?: LanguagePreference;
  latencyMs?: number;
  toolCalls?: AgentExecutionResult['toolCalls'];
}

const PAY_WORDS = ['pay', 'how to pay', 'nishyure', 'kwishyura', 'payment', 'momo', 'price', 'igiciro', 'buy'];
const STATUS_WORDS = ['status', 'check', 'imerere', 'reba', 'my order'];

/** Greetings and confirmations so short they carry no grammar, in English. */
const ENGLISH_CUES = [
  'hi', 'hello', 'hey', 'yes', 'no', 'ok', 'okay', 'thanks', 'thank you', 'please',
  'help', 'start', 'menu', 'good', 'great', 'fine', 'sure', 'sorry', 'dear',
];

function storeLang(user: User, lang: ReplyLanguage): ReplyLanguage {
  if (user.preferredLang !== lang) repo.updateUser(user.id, { preferredLang: lang });
  return lang;
}

/**
 * A menu number or a one-word command carries no language cue, so the reply uses
 * the language the person last wrote in instead of defaulting them to English
 * mid-conversation.
 */
function replyLangOf(text: string, user: User): ReplyLanguage {
  if (detectLanguage(text) === 'KINYARWANDA') return storeLang(user, 'KINYARWANDA');
  if (matchesAny(text, ENGLISH_CUES)) return storeLang(user, 'ENGLISH');
  const wordCount = text.split(/\s+/).filter((w) => /[a-z]/i.test(w)).length;
  if (wordCount < 2) return user.preferredLang === 'ENGLISH' ? 'ENGLISH' : 'KINYARWANDA';
  return storeLang(user, 'ENGLISH');
}

function matchesAny(text: string, words: string[]): boolean {
  const t = text.toLowerCase().trim();
  return words.some((w) => t === w || t.startsWith(`${w} `) || t.includes(` ${w} `));
}

function activeServiceCode(user: User, conversation: Conversation): string | null {
  return conversation.activeServiceCode ?? user.selectedServiceCode ?? null;
}

function latestOrderFor(user: User, serviceCode?: string) {
  const orders = repo.getPaymentOrdersForUser(user.id).filter(
    (o) => !serviceCode || o.serviceCode === serviceCode
  );
  return orders[0] ?? null;
}

/**
 * Single entry point for every inbound WhatsApp text message (live webhook and
 * the local simulator both call this), so service selection, trial gating and
 * payment handling behave identically in both paths.
 */
export async function handleIncomingText(
  user: User,
  conversation: Conversation,
  rawText: string
): Promise<InboundOutcome> {
  ensureCatalogSeeded();
  const text = String(rawText || '').trim();
  const lang = replyLangOf(text, user);

  const menu = buildServiceMenu(lang);
  const menuFirst: InboundOutcome = {
    replyText: menu
      ? menu.bodyText
      : lang === 'KINYARWANDA'
        ? 'Nta serivisi ziriho ubu. Nyamuneka gerageza nyuma.'
        : 'No services are currently enabled. Please try again later.',
    listMenu: menu ?? undefined,
    agentType: 'ROUTER',
    intent: 'SERVICE_MENU',
    tokensUsed: 0,
    modelUsed: 'service-selection',
  };

  // 1. Explicit choice: a list row, a button id, a menu number or a service name.
  const match = matchServiceFromReply(text);
  if (match.service) {
    const result = applySelection(user, conversation, match.service, lang);
    repo.addMessage(conversation.id, {
      role: 'SYSTEM',
      type: 'INTERACTIVE_REPLY',
      content: `service_selected:${result.service.code}`,
    });
    return {
      replyText: result.replyText,
      buttons: [
        {
          id: 'btn_menu',
          title: lang === 'KINYARWANDA' ? 'Izindi serivisi' : 'Change service',
        },
      ],
      agentType: result.service.agentType,
      intent: `SERVICE_SELECTED(${match.via})`,
      tokensUsed: 0,
      modelUsed: 'service-selection',
    };
  }

  // 2. Ask for the menu.
  if (wantsMenu(text) || (!activeServiceCode(user, conversation) && text.length > 0)) {
    // A brand-new contact always sees the menu first; their words are kept in
    // history but are not answered until they pick a service.
    return menuFirst;
  }

  const serviceCode = activeServiceCode(user, conversation);
  const service = serviceCode ? getService(serviceCode) : undefined;

  // 3. Payment instructions for the selected service.
  if (service && matchesAny(text, PAY_WORDS)) {
    if (!isChargeable(service)) {
      return {
        replyText:
          lang === 'KINYARWANDA'
            ? `${service.nameRw} iracyari ubuntu — nta kiguzi gisabwa.`
            : `${service.nameEn} is free right now — nothing to pay.`,
        agentType: service.agentType,
        intent: 'PAY_NOT_REQUIRED',
        tokensUsed: 0,
        modelUsed: 'payments',
      };
    }
    const decision = evaluateAccess(user, service);
    if (decision.allowed && decision.status === 'ACTIVE') {
      const until = decision.paidUntil
        ? new Date(decision.paidUntil).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
        : null;
      return {
        replyText:
          lang === 'KINYARWANDA'
            ? `Wamaze kubohora ${service.nameRw}. Birakomeza kugeza ${until ?? 'uko ukoresha byose'}. Nta kindi kiguzi gisabwa ubu.`
            : `${service.nameEn} is already active${until ? ` until ${until}` : ''}. Nothing to pay right now.`,
        agentType: service.agentType,
        intent: 'PAY_NOT_REQUIRED_ACTIVE',
        tokensUsed: 0,
        modelUsed: 'payments',
      };
    }
    const { order, reused } = createOrder(user, service, {
      idempotencyKey: `wa:${conversation.id}:${service.code}`,
      actor: user.phoneNumber,
      actorRole: 'USER',
    });
    return {
      replyText:
        (reused
          ? lang === 'KINYARWANDA'
            ? `Iyi ni yo gahunda yawe isanzweho (${order.reference}):`
            : `This is your existing order (${order.reference}):`
          : lang === 'KINYARWANDA'
            ? `Gahunda nshya ${order.reference}:`
            : `New order ${order.reference}:`) +
        `\n\n${paymentInstructions(order, service, lang)}`,
      buttons: [{ id: 'btn_menu', title: lang === 'KINYARWANDA' ? 'Izindi serivisi' : 'Change service' }],
      agentType: service.agentType,
      intent: 'PAYMENT_INSTRUCTIONS_SENT',
      tokensUsed: 0,
      modelUsed: 'payments',
    };
  }

  // 4. Order status.
  if (matchesAny(text, STATUS_WORDS)) {
    const order = latestOrderFor(user, serviceCode ?? undefined);
    if (!order) {
      return {
        replyText:
          lang === 'KINYARWANDA'
            ? 'Nta gahunda yo kwishyura ufite.'
            : 'You have no payment order.',
        agentType: service?.agentType ?? 'ROUTER',
        intent: 'NO_PAYMENT_ORDER',
        tokensUsed: 0,
        modelUsed: 'payments',
      };
    }
    return {
      replyText: describeOrder(order.reference, order.status, order.riskBand, lang),
      agentType: service?.agentType ?? 'ROUTER',
      intent: 'PAYMENT_STATUS',
      tokensUsed: 0,
      modelUsed: 'payments',
    };
  }

  // 5. Normal agent turn for the remembered service.
  const agentResult = await executeAgent(user, conversation, text, { serviceCode, replyLang: lang });
  return {
    replyText: agentResult.replyText,
    buttons: agentResult.buttons,
    agentType: agentResult.agentType,
    intent: agentResult.intent,
    tokensUsed: agentResult.tokensUsed,
    modelUsed: agentResult.modelUsed,
    detectedLanguage: agentResult.detectedLanguage,
    latencyMs: agentResult.latencyMs,
    toolCalls: agentResult.toolCalls,
  };
}

function describeOrder(reference: string, status: string, risk: string | null, lang: ReplyLanguage): string {
  const lines: Record<string, [string, string]> = {
    AWAITING_PROOF: [
      `Order ${reference}: waiting for your payment screenshot.`,
      `Gahunda ${reference}: turindira ifoto ya resita yawe.`,
    ],
    PROOF_UPLOADED: [
      `Order ${reference}: screenshot received and being checked.`,
      `Gahunda ${reference}: ifoto yoherejwe, irimo gusuzumwa.`,
    ],
    UNDER_REVIEW: [
      `Order ${reference}: under review by the Aguka team${risk ? ` (screenshot risk flag: ${risk})` : ''}. Access stays locked until an administrator confirms the payment.`,
      `Gahunda ${reference}: irimo gusuzumwa n'itsinda rya Aguka${risk ? ` (ikimenyetso: ${risk})` : ''}. Serivisi ntibohorwa mbere y'uko umuyobozi abyemeza.`,
    ],
    VERIFIED: [
      `Order ${reference}: payment verified. Your service is unlocked.`,
      `Gahunda ${reference}: kwishyura byemejwe. Serivisi iraboneka.`,
    ],
    REJECTED: [
      `Order ${reference}: rejected. Contact Aguka support if you believe this is wrong.`,
      `Gahunda ${reference}: ntiyemewe. Twandikire niba ubona ko ari ikosa.`,
    ],
    EXPIRED: [`Order ${reference}: expired. Ask for new payment instructions.`, `Gahunda ${reference}: yarangiye. Andika "nishyure" kugira ngo ubone amabwiriza mashya.`],
  };
  const entry = lines[status] ?? lines.AWAITING_PROOF;
  return lang === 'KINYARWANDA' ? entry[1] : entry[0];
}

/**
 * A screenshot sent on WhatsApp is attached to the user's open order and routed
 * to review. The reply never claims the payment was accepted.
 */
export async function handleIncomingImage(
  user: User,
  conversation: Conversation,
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<InboundOutcome> {
  const lang: ReplyLanguage = user.preferredLang === 'ENGLISH' ? 'ENGLISH' : 'KINYARWANDA';
  const pick = (en: string, rw: string) => (lang === 'ENGLISH' ? en : rw);
  const open = repo
    .getPaymentOrdersForUser(user.id)
    .find((o) => o.status === 'AWAITING_PROOF' || o.status === 'PROOF_UPLOADED' || o.status === 'UNDER_REVIEW');

  if (!open) {
    return {
      replyText: pick(
        'This screenshot was not linked to a payment order, so nothing was recorded against an account. Send "pay" for the service you want, then send the receipt.',
        'Iyi foto ntiyahujwe na gahunda yo kwishyura, bityo nta cyanditswe. Ohereza "pay" ku serivisi ushaka, hanyuma ohereza resita.'
      ),
      agentType: 'ROUTER',
      intent: 'PROOF_WITHOUT_ORDER',
      tokensUsed: 0,
      modelUsed: 'payments',
    };
  }

  try {
    const { proof, order, warnings } = await attachPaymentProof(open, buffer, fileName, mimeType, user.phoneNumber);
    return {
      replyText:
        pick(
          `Screenshot received for order ${order.reference}. It is queued for administrator review — access unlocks only after the payment itself is confirmed.`,
          `Ifoto yakiriye ku gahunda ${order.reference}. Izasuzumwa n\'umuyobozi — serivisi ntibohorwa niba kwishyura bitaremezwwe.`
        ) +
        (warnings.length > 0
          ? `\n\n${pick(
              `Checks raised ${warnings.length} flag(s) for the reviewer:`,
              `Isuzuma ryagaragaje ${warnings.length} ikimenyetso:`
            )}\n- ${warnings.slice(0, 3).join('\n- ')}`
          : `\n\n${pick(
              `Automatic checks found no anomalies (risk ${proof.riskBand}), but a person still confirms the payment.`,
              `Isuzuma ryikora nta gikubo ryabonye (risk ${proof.riskBand}), ariko umuntu akwiye kubyemeza.`
            )}`),
      agentType: 'ROUTER',
      intent: 'PAYMENT_PROOF_RECEIVED',
      tokensUsed: 0,
      modelUsed: 'payments',
    };
  } catch (err: unknown) {
    return {
      replyText: pick(
        `The screenshot could not be stored: ${err instanceof Error ? err.message : String(err)}`,
        `Ifoto ntiyabitswe: ${err instanceof Error ? err.message : String(err)}`
      ),
      agentType: 'ROUTER',
      intent: 'PAYMENT_PROOF_FAILED',
      tokensUsed: 0,
      modelUsed: 'payments',
    };
  }
}
