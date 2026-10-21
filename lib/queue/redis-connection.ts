/**
 * Resolves the Redis endpoint that BullMQ connects to.
 *
 * Two shapes are accepted: a single `REDIS_URL` (`redis://` or `rediss://`) or the
 * separate host and token that Upstash shows next to its TCP proxy, because its
 * REST endpoint cannot speak the protocol BullMQ needs. Credentials stay inside
 * the returned ioredis options — every string this module hands out is redacted.
 */

export type RedisEndpointSource = 'REDIS_URL' | 'UPSTASH_TCP' | 'NONE';

export interface ResolvedRedisEndpoint {
  configured: boolean;
  source: RedisEndpointSource;
  /** Options object handed to BullMQ so it can build and own its connections. */
  options: Record<string, unknown> | null;
  /** `host:port (tls)` with no credentials — safe for logs and the dashboard. */
  label: string;
  error: string | null;
}

const PLACEHOLDER_MARKERS = [
  'replace_with',
  'strong_redis_password',
  'secure_password',
  'your_',
  'changeme',
  'xxxxxxx',
];

function looksLikePlaceholder(value: string): boolean {
  const lower = value.toLowerCase();
  return PLACEHOLDER_MARKERS.some((marker) => lower.includes(marker));
}

const NOT_CONFIGURED: ResolvedRedisEndpoint = {
  configured: false,
  source: 'NONE',
  options: null,
  label: '',
  error: null,
};

function rejected(error: string): ResolvedRedisEndpoint {
  return { ...NOT_CONFIGURED, error };
}

function toOptions(input: {
  host: string;
  port: number;
  db: number;
  tls: boolean;
  username?: string;
  password?: string;
}): Record<string, unknown> {
  return {
    host: input.host,
    port: input.port,
    db: input.db,
    ...(input.tls ? { tls: {} } : {}),
    ...(input.password
      ? { username: input.username, password: input.password }
      : {}),
    // BullMQ holds a blocking read open until a job arrives; without this ioredis
    // aborts the command after its retry limit and the worker dies. No
    // `commandTimeout` either — it would kill that same blocking read every N
    // seconds. Bounded waits happen at the call site instead.
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectTimeout: 10_000,
  };
}

function describe(host: string, port: number, tls: boolean): string {
  return `${host}:${port} (${tls ? 'tls' : 'plain'})`;
}

export function resolveRedisEndpoint(
  env: Record<string, string | undefined> = process.env
): ResolvedRedisEndpoint {
  const rawUrl = (env.REDIS_URL || '').trim();
  const upstashHost = (env.UPSTASH_REDIS_TCP_HOST || '').trim();
  const upstashToken = (env.UPSTASH_REDIS_TOKEN || '').trim();

  if (rawUrl && !looksLikePlaceholder(rawUrl)) {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return rejected('REDIS_URL is not a valid redis:// or rediss:// URL.');
    }
    if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
      return rejected(`REDIS_URL must use redis:// or rediss://, got ${parsed.protocol}// .`);
    }
    if (!parsed.hostname) {
      return rejected('REDIS_URL has no host.');
    }
    const tls = parsed.protocol === 'rediss:';
    const port = Number(parsed.port || 6379);
    if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
      return rejected(`REDIS_URL port "${parsed.port}" is out of range.`);
    }
    const pathDb = parsed.pathname.replace(/^\//, '');
    const db = pathDb ? Number(pathDb) : 0;
    if (!Number.isInteger(db) || db < 0) {
      return rejected(`REDIS_URL database "${pathDb}" is not a number.`);
    }
    const username = parsed.username ? decodeURIComponent(parsed.username) : undefined;
    const password = parsed.password ? decodeURIComponent(parsed.password) : undefined;
    return {
      configured: true,
      source: 'REDIS_URL',
      options: toOptions({ host: parsed.hostname, port, db, tls, username, password }),
      label: describe(parsed.hostname, port, tls),
      error: null,
    };
  }

  if (upstashHost && upstashToken && !looksLikePlaceholder(upstashHost)) {
    const port = Number(env.UPSTASH_REDIS_TCP_PORT || 6379);
    if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
      return rejected(`UPSTASH_REDIS_TCP_PORT "${env.UPSTASH_REDIS_TCP_PORT}" is out of range.`);
    }
    return {
      configured: true,
      source: 'UPSTASH_TCP',
      options: toOptions({
        host: upstashHost,
        port,
        db: 0,
        tls: true,
        username: env.UPSTASH_REDIS_USERNAME || 'default',
        password: upstashToken,
      }),
      label: describe(upstashHost, port, true),
      error: null,
    };
  }

  return NOT_CONFIGURED;
}
