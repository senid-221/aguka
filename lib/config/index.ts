/**
 * Validated Configuration Layer
 * Strongly typed runtime environment parser and validator.
 */

import { GEMINI_MODEL } from '@/lib/gemini';

export interface AppConfig {
  env: 'development' | 'production' | 'test';
  port: number;
  appUrl: string;
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
  };
  security: {
    jwtSecret: string;
    maxMessagesPerMinute: number;
    maxDailyTokensPerUser: number;
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
    warnings.push('GEMINI_API_KEY is not set or using placeholder; agents reply with an AI-not-configured notice.');
  }

  // Database
  const dbUrl = env.DATABASE_URL || '';
  const isDbConfigured = Boolean(dbUrl && !dbUrl.includes('replace_with'));

  // Redis
  const redisUrl = env.REDIS_URL || '';
  const isRedisConfigured = Boolean(redisUrl && !redisUrl.includes('replace_with'));

  // Security
  const jwtSecret = env.ADMIN_JWT_SECRET || '';
  if (!jwtSecret) {
    warnings.push('ADMIN_JWT_SECRET is not set; admin sessions are disabled.');
  }
  const maxMessagesPerMinute = parseInt(env.MAX_MESSAGES_PER_MINUTE_PER_USER || '20', 10) || 20;
  const maxDailyTokensPerUser = parseInt(env.MAX_DAILY_AI_TOKENS_PER_USER || '50000', 10) || 50000;

  const config: AppConfig = {
    env: nodeEnv,
    port,
    appUrl,
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
      isConfigured: isRedisConfigured,
    },
    security: {
      jwtSecret,
      maxMessagesPerMinute,
      maxDailyTokensPerUser,
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
  };
}
