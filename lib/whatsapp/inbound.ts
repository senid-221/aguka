import { AgentType, Conversation, LanguagePreference, User } from '@/lib/types';
import { repo } from '@/lib/db/repository';
import {
  AgentExecutionResult,
  buildStudioReply,
  detectLanguage,
  executeAgent,
  IMAGE_STUDIO_FAILED,
  IMAGE_STUDIO_OFF,
  requestsImageProduction,
} from '@/lib/ai/bilingual-router';
import { ensureCatalogSeeded, getService } from '@/lib/services/catalog';
import { buildAccessReply, consumeUsage, evaluateAccess, isChargeable, type ReplyLanguage } from '@/lib/services/entitlements';
import { applySelection, buildServiceMenu, matchServiceFromReply, rowIdFor, ServiceMenu, wantsMenu } from '@/lib/services/selection';
import { attachPaymentProof, createOrder, paymentInstructions } from '@/lib/payments/orders';
import { resolveImageCapability } from '@/lib/images/provider';
import { attachmentOf, runImageStudio, type ImageAttachment } from '@/lib/images/studio';
import { logger } from '@/lib/logging/logger';

export interface InboundOutcome {
  replyText: string;
  buttons?: Array<{ id: string; title: string }>;
  listMenu?: ServiceMenu;
  /** A file the studio produced that still has to be uploaded and sent. */
  image?: ImageAttachment;
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
    image: agentResult.image,
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
 * An inbound photo is either a payment screenshot or the photo someone wants
 * retouched. The caption decides: wording that asks for a picture goes to the
 * studio with the uploaded bytes as the reference, anything else is treated as a
 * receipt and queued for review. A reply never claims a payment was accepted.
 */
export async function handleIncomingImage(
  user: User,
  conversation: Conversation,
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  caption?: string
): Promise<InboundOutcome> {
  const lang: ReplyLanguage = user.preferredLang === 'ENGLISH' ? 'ENGLISH' : 'KINYARWANDA';
  const ask = String(caption || '').trim();
  if (ask && requestsImageProduction(ask)) {
    // The caption is the message the person just wrote, so it decides the reply
    // language instead of a preference set by an earlier turn.
    return retouchUploadedImage(user, conversation, buffer, mimeType, ask, replyLangOf(ask, user));
  }
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

/**
 * Retouches the photo the person just sent. The uploaded bytes stay in memory:
 * they are handed to the provider as the reference and only the generated result
 * is written to the private data directory.
 */
async function retouchUploadedImage(
  user: User,
  conversation: Conversation,
  buffer: Buffer,
  mimeType: string,
  ask: string,
  lang: ReplyLanguage
): Promise<InboundOutcome> {
  const started = Date.now();
  const capability = resolveImageCapability();
  const studioButtons = [{ id: 'btn_passport_specs', title: lang === 'KINYARWANDA' ? 'Amategeko ya pasiporo' : 'Passport Standards' }];

  if (!capability.configured) {
    return {
      replyText: IMAGE_STUDIO_OFF[lang],
      buttons: studioButtons,
      agentType: 'IMAGE_STUDIO',
      intent: 'IMAGE_STUDIO_NOT_CONFIGURED',
      tokensUsed: 0,
      modelUsed: 'capability-gate',
    };
  }

  const serviceCode = activeServiceCode(user, conversation);
  const service = serviceCode ? getService(serviceCode) : undefined;
  if (service) {
    const decision = evaluateAccess(user, service);
    if (!decision.allowed) {
      return {
        replyText: buildAccessReply(service, decision, lang),
        agentType: service.agentType,
        intent: `ACCESS_${decision.denialReason ?? 'DENIED'}`,
        tokensUsed: 0,
        modelUsed: 'access-control',
      };
    }
  }

  const studio = await runImageStudio({
    userId: user.id,
    userName: user.fullName || 'User',
    request: ask,
    reference: { buffer, mimeType },
  });
  const latencyMs = Date.now() - started;

  if (!studio.ok) {
    logger.error('IMAGE_STUDIO_FAILED', new Error(studio.error), {
      metadata: { provider: studio.provider, model: studio.model, userId: user.id, conversationId: conversation.id },
    });
    return {
      replyText: IMAGE_STUDIO_FAILED[lang],
      buttons: studioButtons,
      agentType: 'IMAGE_STUDIO',
      intent: 'IMAGE_STUDIO_FAILED',
      tokensUsed: 0,
      modelUsed: studio.model || capability.model,
    };
  }

  if (service) consumeUsage(user, service.code);
  repo.recordAgentRun(
    {
      conversationId: conversation.id,
      agentType: 'IMAGE_STUDIO',
      intentDetected: 'IMAGE_STUDIO_PRODUCED',
      modelUsed: studio.model,
      tokensInput: 0,
      tokensOutput: 0,
      latencyMs,
      status: 'COMPLETED',
      toolCallsCount: 1,
    },
    [
      {
        toolName: 'image_studio_render',
        arguments: { provider: studio.provider, reference: 'inbound-photo', bytes: buffer.byteLength },
        result: { taskId: studio.taskId, width: studio.width, height: studio.height, sizeBytes: studio.sizeBytes },
        latencyMs,
        redacted: true,
      },
    ]
  );

  return {
    replyText: buildStudioReply(lang, studio.width, studio.height, studio.taskId, studio.expiresAt),
    image: attachmentOf(studio),
    agentType: 'IMAGE_STUDIO',
    intent: 'IMAGE_STUDIO_PRODUCED',
    tokensUsed: 0,
    modelUsed: studio.model,
  };
}
