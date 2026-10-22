/**
 * Validated Configuration Layer
 * Strongly typed runtime environment parser and validator.
 */

import { GEMINI_MODEL } from '@/lib/gemini';
import { resolveRedisEndpoint } from '@/lib/queue/redis-connection';
import { crawlTimeoutMs, maxListingsPerSource } from '@/lib/jobs/feed';

export interface JobDiscoveryConfig {
  /** 0 means the schedule is off: only the Jobs screen button crawls. */
  crawlIntervalMinutes: number;
  crawlTimeoutMs: number;
  maxListingsPerSource: number;
  /** Boards an operator repointed with JOB_FEED_URL_<CODE>; URL, never a secret. */
  feedOverrides: Record<string, string>;
}

export function jobDiscoveryConfig(env: NodeJS.ProcessEnv = process.env): JobDiscoveryConfig {
  const rawInterval = parseInt(env.JOB_CRAWL_INTERVAL_MINUTES || '60', 10);
  const overrides: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    const match = /^JOB_FEED_URL_([A-Z0-9_]+)$/.exec(key);
    const url = (value || '').trim();
    if (match && url) overrides[match[1]] = url;
  }

  return {
    crawlIntervalMinutes: Number.isFinite(rawInterval) ? Math.max(0, rawInterval) : 60,
    crawlTimeoutMs: crawlTimeoutMs(env),
    maxListingsPerSource: maxListingsPerSource(env),
    feedOverrides: overrides,
  };
}

export interface AppConfig {
  env: 'development' | 'production' | 'test';
  port: number;
  appUrl: string;
  jobs: JobDiscoveryConfig;
  whatsapp: {
    phoneNumberId: string;
    verifyToken: string;
    accessToken: string;
    appSecret: string;
    isLiveConfigured: boolean;
  };
  gemini: {
    apiKey: string;
    model: string;
    isConfigured: boolean;
  };
  database: {
    url: string;
    isPostgresConfigured: boolean;
  };
  redis: {
    url: string;
    isConfigured: boolean;
    /** Where the endpoint came from: REDIS_URL, the Upstash TCP fields, or nowhere. */
    source: 'REDIS_URL' | 'UPSTASH_TCP' | 'NONE';
    /** `host:port (tls)` without credentials. */
    endpoint: string;
    error: string;
  };
  security: {
    jwtSecret: string;
    maxMessagesPerMinute: number;
    maxDailyTokensPerUser: number;
  };
  payments: {
    payeeName: string;
    momoCode: string;
    providerEndpointConfigured: boolean;
    webhookSecretConfigured: boolean;
    autoVerifyEnabled: boolean;
    ocrConfigured: boolean;
  };
}

export interface ConfigValidationResult {
  isValid: boolean;
  config: AppConfig;
  warnings: string[];
  errors: string[];
}

export function parseAndValidateConfig(env: NodeJS.ProcessEnv = process.env): ConfigValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  const nodeEnv = (env.NODE_ENV as AppConfig['env']) || 'development';
  const port = parseInt(env.PORT || '3000', 10) || 3000;
  const appUrl = env.APP_URL || 'http://localhost:3000';

  // WhatsApp Cloud API
  const waPhoneId = env.WHATSAPP_PHONE_NUMBER_ID || '';
  const waVerifyToken = env.WHATSAPP_VERIFY_TOKEN || '';
  const waAccessToken = env.WHATSAPP_ACCESS_TOKEN || '';
  const waAppSecret = env.WHATSAPP_APP_SECRET || '';

  const isWaLive = Boolean(
    waPhoneId &&
    waPhoneId !== '109876543210987' &&
    waAccessToken &&
    !waAccessToken.includes('replace_with')
  );

  if (!isWaLive) {
    warnings.push('WhatsApp Live credentials not configured; outgoing replies will not be delivered to Meta.');
  }

  if (!waVerifyToken) {
    warnings.push('WHATSAPP_VERIFY_TOKEN is not set; the Meta webhook handshake will be rejected.');
  }

  // Gemini API
  const geminiApiKey = env.GEMINI_API_KEY || '';
  const isGeminiLive = Boolean(geminiApiKey && geminiApiKey !== 'MY_GEMINI_API_KEY');

  if (!isGeminiLive) {
    warnings.push(
      'GEMINI_API_KEY is not set or using placeholder. Without it OpenAI answers first if it is configured, and with neither key the reply is an honest AI-not-configured notice.'
    );
  }

  // Text provider chain: Gemini answers, OpenAI rescues.
  const openAiTextKey = (env.OPENAI_API_KEY || '').trim();
  const isOpenAiLive = Boolean(
    openAiTextKey && !openAiTextKey.toLowerCase().includes('replace_with') && !openAiTextKey.toLowerCase().includes('your_')
  );
  if (isGeminiLive && !isOpenAiLive) {
    warnings.push(
      'Only one text provider is configured. A Gemini rate limit, timeout or blocked answer then has no rescue, and the person on WhatsApp is told the assistant could not get an answer. Set OPENAI_API_KEY to arm one.'
    );
  }
  if (isOpenAiLive && !isGeminiLive) {
    warnings.push(
      'Only one text provider is configured. Every reply depends on OpenAI alone, with no rescue behind it. Set GEMINI_API_KEY to add one.'
    );
  }

  // Database
  const dbUrl = env.DATABASE_URL || '';
  const isDbConfigured = Boolean(dbUrl && !dbUrl.includes('replace_with'));

  // Redis — BullMQ connects only when a real endpoint resolves.
  const redisUrl = env.REDIS_URL || '';
  const redisEndpoint = resolveRedisEndpoint(env);
  if (redisEndpoint.error) {
    warnings.push(`Queue: ${redisEndpoint.error} Jobs run in this process until it is fixed.`);
  }

  // Security
  const jwtSecret = env.ADMIN_JWT_SECRET || '';
  if (!jwtSecret) {
    warnings.push('ADMIN_JWT_SECRET is not set; admin sessions are disabled.');
  }
  const maxMessagesPerMinute = parseInt(env.MAX_MESSAGES_PER_MINUTE_PER_USER || '20', 10) || 20;
  const maxDailyTokensPerUser = parseInt(env.MAX_DAILY_AI_TOKENS_PER_USER || '50000', 10) || 50000;

  // Payments: MoMo payee, optional provider reconciliation and receipt OCR
  const payeeName = (env.MOMO_PAYEE_NAME || 'Vincent').trim();
  const momoCode = (env.MOMO_PAYEE_CODE || '935237').trim();
  const providerEndpointConfigured = Boolean((env.MOMO_VERIFY_API_URL || '').trim() && (env.MOMO_VERIFY_API_TOKEN || '').trim());
  const webhookSecretConfigured = Boolean((env.PAYMENT_WEBHOOK_SECRET || '').trim());
  const autoVerifyEnabled = env.PAYMENT_AUTO_VERIFY === 'true';
  const ocrConfigured = Boolean((env.OPENAI_API_KEY || '').trim()) && !(env.OPENAI_API_KEY || '').includes('replace_with');

  if (!providerEndpointConfigured) {
    warnings.push(
      'No MoMo reconciliation endpoint (MOMO_VERIFY_API_URL / MOMO_VERIFY_API_TOKEN): receipts are evidence only and every payment waits for administrator confirmation.'
    );
  }
  if (!webhookSecretConfigured) {
    warnings.push('PAYMENT_WEBHOOK_SECRET is not set: POST /api/payments/webhook rejects all callbacks.');
  }
  if (!ocrConfigured) {
    warnings.push(
      'OPENAI_API_KEY is not set: receipt screenshots are still hash- and metadata-checked but their text cannot be read, and the reply chain has no rescue provider behind Gemini.'
    );
  }
  if (autoVerifyEnabled && !providerEndpointConfigured) {
    warnings.push('PAYMENT_AUTO_VERIFY is on but no reconciliation endpoint exists, so auto-verification can never trigger.');
  }

  const config: AppConfig = {
    env: nodeEnv,
    port,
    appUrl,
    jobs: jobDiscoveryConfig(env),
    whatsapp: {
      phoneNumberId: waPhoneId,
      verifyToken: waVerifyToken,
      accessToken: waAccessToken,
      appSecret: waAppSecret,
      isLiveConfigured: isWaLive,
    },
    gemini: {
      apiKey: geminiApiKey,
      model: GEMINI_MODEL,
      isConfigured: isGeminiLive,
    },
    database: {
      url: dbUrl,
      isPostgresConfigured: isDbConfigured,
    },
    redis: {
      url: redisUrl,
      isConfigured: redisEndpoint.configured,
      source: redisEndpoint.source,
      endpoint: redisEndpoint.label,
      error: redisEndpoint.error ?? '',
    },
    security: {
      jwtSecret,
      maxMessagesPerMinute,
      maxDailyTokensPerUser,
    },
    payments: {
      payeeName,
      momoCode,
      providerEndpointConfigured,
      webhookSecretConfigured,
      autoVerifyEnabled,
      ocrConfigured,
    },
  };

  return {
    isValid: errors.length === 0,
    config,
    warnings,
    errors,
  };
}

export const appConfig = parseAndValidateConfig().config;

// Values published in .env.example / boilerplate are placeholders, not credentials.
const PLACEHOLDER_VALUES = new Set([
  'MY_GEMINI_API_KEY',
  '109876543210987',
  'aguka_rwanda_webhook_secret_token_2026',
]);

/**
 * Reports whether each environment variable holds a real value.
 * Only presence is exposed — never the value itself.
 */
export function getEnvPresence(env: NodeJS.ProcessEnv = process.env): Record<string, boolean> {
  const present = (name: string): boolean => {
    const value = (env[name] || '').trim();
    if (!value) return false;
    if (PLACEHOLDER_VALUES.has(value)) return false;
    if (value.includes('replace_with') || value.toLowerCase().includes('your_')) return false;
    return true;
  };

  return {
    GEMINI_API_KEY: present('GEMINI_API_KEY'),
    WHATSAPP_PHONE_NUMBER_ID: present('WHATSAPP_PHONE_NUMBER_ID'),
    WHATSAPP_ACCESS_TOKEN: present('WHATSAPP_ACCESS_TOKEN'),
    WHATSAPP_VERIFY_TOKEN: present('WHATSAPP_VERIFY_TOKEN'),
    WHATSAPP_APP_SECRET: present('WHATSAPP_APP_SECRET'),
    DATABASE_URL: present('DATABASE_URL'),
    REDIS_URL: present('REDIS_URL'),
    ADMIN_JWT_SECRET: present('ADMIN_JWT_SECRET'),
    ADMIN_DEFAULT_EMAIL: present('ADMIN_DEFAULT_EMAIL'),
    ADMIN_DEFAULT_PASSWORD: present('ADMIN_DEFAULT_PASSWORD'),
    OPENAI_API_KEY: present('OPENAI_API_KEY'),
    MOMO_PAYEE_NAME: present('MOMO_PAYEE_NAME'),
    MOMO_PAYEE_CODE: present('MOMO_PAYEE_CODE'),
    MOMO_VERIFY_API_URL: present('MOMO_VERIFY_API_URL'),
    MOMO_VERIFY_API_TOKEN: present('MOMO_VERIFY_API_TOKEN'),
    PAYMENT_WEBHOOK_SECRET: present('PAYMENT_WEBHOOK_SECRET'),
    PAYMENT_AUTO_VERIFY: present('PAYMENT_AUTO_VERIFY'),
    AGUKA_DATA_DIR: present('AGUKA_DATA_DIR'),
    OPENAI_IMAGE_MODEL: present('OPENAI_IMAGE_MODEL'),
    OPENAI_TEXT_MODEL: present('OPENAI_TEXT_MODEL'),
    GEMINI_IMAGE_MODEL: present('GEMINI_IMAGE_MODEL'),
    PASSPORT_PHOTO_WIDTH: present('PASSPORT_PHOTO_WIDTH'),
    IMAGE_RETENTION_DAYS: present('IMAGE_RETENTION_DAYS'),
    JOB_CRAWL_INTERVAL_MINUTES: present('JOB_CRAWL_INTERVAL_MINUTES'),
    JOB_CRAWL_MAX_LISTINGS: present('JOB_CRAWL_MAX_LISTINGS'),
    JOB_CRAWL_TIMEOUT_MS: present('JOB_CRAWL_TIMEOUT_MS'),
  };
}
