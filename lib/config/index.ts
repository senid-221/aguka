/**
 * Validated Configuration Layer
 * Strongly typed runtime environment parser and validator.
 */

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
  const waVerifyToken = env.WHATSAPP_VERIFY_TOKEN || 'aguka_rwanda_webhook_secret_token_2026';
  const waAccessToken = env.WHATSAPP_ACCESS_TOKEN || '';
  const waAppSecret = env.WHATSAPP_APP_SECRET || '';

  const isWaLive = Boolean(
    waPhoneId &&
    waPhoneId !== '109876543210987' &&
    waAccessToken &&
    !waAccessToken.includes('replace_with')
  );

  if (!isWaLive && nodeEnv === 'production') {
    warnings.push('WhatsApp Live credentials not configured; operating in simulated adapter mode.');
  }

  // Gemini API
  const geminiApiKey = env.GEMINI_API_KEY || '';
  const isGeminiLive = Boolean(geminiApiKey && geminiApiKey !== 'MY_GEMINI_API_KEY');

  if (!isGeminiLive) {
    warnings.push('GEMINI_API_KEY is not set or using placeholder; AI provider using resilient mock fallback.');
  }

  // Database
  const dbUrl = env.DATABASE_URL || '';
  const isDbConfigured = Boolean(dbUrl && !dbUrl.includes('replace_with'));

  // Redis
  const redisUrl = env.REDIS_URL || '';
  const isRedisConfigured = Boolean(redisUrl && !redisUrl.includes('replace_with'));

  // Security
  const jwtSecret = env.ADMIN_JWT_SECRET || 'aguka_secret_jwt_fallback_key_min_32_characters';
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
      model: 'gemini-3.8-flash',
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
