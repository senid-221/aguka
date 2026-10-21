import { redactSecrets } from '@/lib/ai/prompt-security';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface StructuredLogPayload {
  level: LogLevel;
  timestamp: string;
  service: string;
  event: string;
  message?: string;
  requestId?: string;
  waMessageId?: string;
  userId?: string;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

class StructuredLogger {
  private serviceName: string;

  constructor(serviceName: string = 'aguka-platform') {
    this.serviceName = serviceName;
  }

  private sanitize(val: unknown): unknown {
    if (typeof val === 'string') {
      return redactSecrets(val);
    }
    if (typeof val === 'object' && val !== null) {
      if (Array.isArray(val)) {
        return val.map((item) => this.sanitize(item));
      }
      const sanitizedObj: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        if (/token|secret|password|key|auth|bearer/i.test(k)) {
          sanitizedObj[k] = '[REDACTED_BY_LOGGER]';
        } else {
          sanitizedObj[k] = this.sanitize(v);
        }
      }
      return sanitizedObj;
    }
    return val;
  }

  private emit(level: LogLevel, event: string, message?: string, context?: Partial<StructuredLogPayload>): StructuredLogPayload {
    const payload: StructuredLogPayload = {
      level,
      timestamp: new Date().toISOString(),
      service: this.serviceName,
      event,
      message: message ? redactSecrets(message) : undefined,
      requestId: context?.requestId,
      waMessageId: context?.waMessageId,
      userId: context?.userId,
      latencyMs: context?.latencyMs,
      metadata: context?.metadata ? (this.sanitize(context.metadata) as Record<string, unknown>) : undefined,
      error: context?.error,
    };

    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
      console.log(JSON.stringify(payload));
    } else {
      const prefix = `[${payload.timestamp}] [${level.toUpperCase()}] [${payload.service}] ${payload.event}:`;
      const body = payload.message || '';
      if (level === 'error') {
        console.error(prefix, body, payload.error || '', payload.metadata || '');
      } else if (level === 'warn') {
        console.warn(prefix, body, payload.metadata || '');
      } else {
        console.log(prefix, body, payload.metadata || '');
      }
    }

    return payload;
  }

  info(event: string, message?: string, context?: Partial<StructuredLogPayload>): StructuredLogPayload {
    return this.emit('info', event, message, context);
  }

  warn(event: string, message?: string, context?: Partial<StructuredLogPayload>): StructuredLogPayload {
    return this.emit('warn', event, message, context);
  }

  error(event: string, err: unknown, context?: Partial<StructuredLogPayload>): StructuredLogPayload {
    const errorDetails = err instanceof Error
      ? { name: err.name, message: redactSecrets(err.message), stack: err.stack ? redactSecrets(err.stack) : undefined }
      : { name: 'Error', message: redactSecrets(String(err)) };

    return this.emit('error', event, errorDetails.message, { ...context, error: errorDetails });
  }

  debug(event: string, message?: string, context?: Partial<StructuredLogPayload>): StructuredLogPayload {
    return this.emit('debug', event, message, context);
  }
}

export const logger = new StructuredLogger('aguka-backend');
