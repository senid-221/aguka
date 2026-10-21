/**
 * Security and Anti-Prompt-Injection Layer
 * Prevents jailbreaks, system prompt exfiltration, and sensitive data leakage.
 */

const FORBIDDEN_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
  /system\s+prompt/i,
  /reveal\s+(the\s+)?secret/i,
  /bypass\s+safety/i,
  /show\s+(me\s+)?(the\s+)?api\s*key/i,
  /gemini_api_key/i,
  /whatsapp_access_token/i,
  /database_url/i,
  /admin_jwt_secret/i,
  /eval\s*\(/i,
  /<script>/i,
];

const SECRET_PATTERNS = [
  /AIza[0-9A-Za-z-_]{30,}/g, // Google API keys
  /EAA[0-9A-Za-z-_]{20,}/g, // Meta access tokens
  /postgres:\/\/[^:]+:[^@]+@[^/]+\/[^?\s]+/gi, // Postgres connection strings
  /redis:\/\/[^:]*:[^@]+@[^/]+/gi, // Redis passwords
];

export function sanitizeUserInput(input: string): {
  isSafe: boolean;
  cleanText: string;
  flaggedReason?: string;
} {
  const trimmed = input.trim();

  for (const pattern of FORBIDDEN_INJECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        isSafe: false,
        cleanText: trimmed,
        flaggedReason: 'Suspicious prompt injection or secret extraction attempt detected.',
      };
    }
  }

  // Prevent giant payload buffer overflows
  const maxLen = 4000;
  const safeText = trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;

  return {
    isSafe: true,
    cleanText: safeText,
  };
}

export function redactSecrets(content: string): string {
  let redacted = content;
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED_CREDENTIAL]');
  }
  return redacted;
}

export function requiresUserConsent(action: string): boolean {
  const sensitiveActions = [
    'SUBMIT_REAL_JOB_APPLICATION',
    'SHARE_CV_WITH_EXTERNAL_EMPLOYER',
    'DELETE_ACCOUNT_PERMANENTLY',
    'AUTO_CHARGE_SUBSCRIPTION',
  ];
  return sensitiveActions.includes(action);
}
