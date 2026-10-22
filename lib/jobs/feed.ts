/**
 * Transport and parsing for the job board connectors.
 *
 * Listings are read from what the board itself publishes — an RSS/Atom feed where
 * one exists, otherwise the server-rendered listing page. Only the facts a board
 * prints (title, employer, location, dates) plus a short excerpt and the link back
 * to the posting are kept; the full advertisement text is never copied into this
 * platform's store.
 */

export const DEFAULT_FETCH_TIMEOUT_MS = 15_000;
export const DEFAULT_MAX_BYTES = 2_000_000;
/** A polite, identifiable UA — boards block generic ones and a named bot is honest. */
export const CRAWLER_USER_AGENT =
  'AgukaAIJobDiscovery/1.0 (+https://aguka.ai; WhatsApp jobs assistant; read-only)';

export type FetchFailure = 'TIMEOUT' | 'TOO_LARGE' | 'HTTP_STATUS' | 'NETWORK' | 'CONFIG';

export class SourceFetchError extends Error {
  readonly kind: FetchFailure;
  readonly status: number | null;

  constructor(kind: FetchFailure, message: string, status: number | null = null) {
    super(message);
    this.name = 'SourceFetchError';
    this.kind = kind;
    this.status = status;
  }
}

export interface FetchedDocument {
  url: string;
  body: string;
  status: number;
  latencyMs: number;
  bytes: number;
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = parseInt(raw || '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function crawlTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  return positiveInt(env.JOB_CRAWL_TIMEOUT_MS, DEFAULT_FETCH_TIMEOUT_MS);
}

/**
 * GETs a document with a hard deadline and a byte cap, so one slow board cannot
 * hold a queue worker (or an admin's sync click) open indefinitely.
 */
export async function fetchDocument(
  url: string,
  init: { fetchImpl?: typeof fetch; timeoutMs?: number; maxBytes?: number } = {}
): Promise<FetchedDocument> {
  const timeoutMs = init.timeoutMs ?? crawlTimeoutMs();
  const maxBytes = init.maxBytes ?? DEFAULT_MAX_BYTES;
  const doFetch = init.fetchImpl ?? globalThis.fetch;
  const startedAt = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await doFetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': CRAWLER_USER_AGENT, accept: 'text/html,application/xml,application/rss+xml;q=0.9,*/*;q=0.8' },
    });

    if (!res.ok) {
      throw new SourceFetchError(
        'HTTP_STATUS',
        `${new URL(url).host} responded ${res.status}`,
        res.status
      );
    }

    const body = await res.text();
    if (body.length > maxBytes) {
      throw new SourceFetchError('TOO_LARGE', `${new URL(url).host} sent ${body.length} bytes, over the ${maxBytes} cap`);
    }

    return {
      url,
      body,
      status: res.status,
      latencyMs: Date.now() - startedAt,
      bytes: body.length,
    };
  } catch (err) {
    if (err instanceof SourceFetchError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    if (controller.signal.aborted) {
      throw new SourceFetchError('TIMEOUT', `${new URL(url).host} did not answer within ${timeoutMs}ms`);
    }
    throw new SourceFetchError('NETWORK', `${new URL(url).host}: ${message}`);
  } finally {
    clearTimeout(timer);
  }
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
};

export function decodeEntities(raw: string): string {
  return raw
    .replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
      if (entity.startsWith('#x') || entity.startsWith('#X')) {
        const code = parseInt(entity.slice(2), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      if (entity.startsWith('#')) {
        const code = parseInt(entity.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      const named = NAMED_ENTITIES[entity.toLowerCase()];
      return named ?? match;
    });
}

/**
 * Text out of markup. Feed bodies arrive entity-escaped (&lt;p&gt;), so the decode
 * happens first and the tags it reveals are stripped with it. Some feeds escape
 * twice (&amp;nbsp;), so decoding repeats until the text settles.
 */
export function stripTags(html: string): string {
  let text = html;
  for (let pass = 0; pass < 3; pass += 1) {
    const decoded = decodeEntities(text);
    if (decoded === text) break;
    text = decoded;
  }
  return text
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Shortest safe form of "one second of reading" — a preview, never the whole ad. */
export const EXCERPT_MAX_CHARS = 320;

export function excerptFromHtml(html: string, maxChars: number = EXCERPT_MAX_CHARS): string {
  return clipText(stripTags(html), maxChars);
}

export function clipText(raw: string, maxChars: number): string {
  const text = raw.trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).replace(/\s+\S*$/, '')}…`;
}

export interface FeedItem {
  title: string;
  url: string;
  externalId: string;
  publishedRaw: string | null;
  categories: string[];
  summaryHtml: string;
  /** Board-specific extra elements this platform maps: <region>, <dc:creator>, … */
  extras: Record<string, string>;
}

/**
 * True when the document is the kind of thing an item list is read from. A board's
 * web page also contains the word "feed" in markup, so only the three feed root
 * elements count here.
 */
export function looksLikeFeed(document: string): boolean {
  return /<(rss|feed|rdf:RDF)\b/i.test(document.slice(0, 2048));
}

/**
 * Minimal RSS 2.0 / Atom reader. A full XML parser is not worth a dependency for
 * the flat item lists these boards publish, and a mis-shaped feed must yield
 * nothing rather than a half-read listing.
 */
export function parseFeed(xml: string, baseUrl: string): FeedItem[] {
  const blocks = extractBlocks(xml, 'item').concat(extractBlocks(xml, 'entry'));
  if (!blocks.length) return [];

  const parsed: FeedItem[] = [];
  for (const block of blocks) {
    const title = stripTags(readTag(block, 'title') ?? '');
    const url = resolveUrl(readLink(block) ?? readTag(block, 'link') ?? '', baseUrl);
    if (!title || !url) continue;

    const guid = (readTag(block, 'guid') ?? readTag(block, 'id') ?? '').trim();
    parsed.push({
      title,
      url,
      externalId: guid || url,
      publishedRaw: (readTag(block, 'pubDate') ?? readTag(block, 'updated') ?? readTag(block, 'published') ?? '').trim() || null,
      categories: readAllTags(block, 'category').map(stripTags).filter(Boolean),
      summaryHtml: readTag(block, 'description') ?? readTag(block, 'summary') ?? readTag(block, 'content') ?? '',
      extras: {
        region: stripTags(readTag(block, 'region') ?? ''),
        creator: stripTags(readTag(block, 'dc:creator') ?? ''),
      },
    });
  }
  return parsed;
}

function extractBlocks(xml: string, tag: string): string[] {
  return extractElements(xml, tag).map((el) => el.inner);
}

/**
 * Top-level element bodies plus their opening-tag attributes (which is where a
 * board puts the node id and the classes the card is identified by).
 */
export function extractElements(html: string, tag: string): { attrs: string; inner: string }[] {
  const out: { attrs: string; inner: string }[] = [];
  let source = html;
  const selfClosing = new RegExp(`<${tag}(\\s[^>]*)?/>`, 'gi');
  source = source.replace(selfClosing, '');

  const pattern = new RegExp(`<${tag}(\\s[^>]*)?>`, 'gi');
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    const end = source.indexOf(`</${tag}>`, match.index + match[0].length);
    if (end === -1) continue;
    out.push({ attrs: match[1] || '', inner: source.slice(match.index + match[0].length, end) });
    pattern.lastIndex = end;
  }
  return out;
}

export function readAttribute(attrs: string, name: string): string | null {
  const m = new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(attrs);
  return m ? m[1] : null;
}

function readTag(block: string, tag: string): string | null {
  const m = new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i').exec(block);
  if (m) return unwrapCdata(m[2].trim());
  const self = new RegExp(`<${tag}(\\s[^>]*)?/>`, 'i').exec(block);
  return self ? '' : null;
}

function unwrapCdata(raw: string): string {
  return raw.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
}

function readAllTags(block: string, tag: string): string[] {
  const out: string[] = [];
  const pattern = new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(block))) out.push(m[2].trim());
  return out;
}

/** Atom puts the href on <link>, not in the text. */
function readLink(block: string): string | null {
  const m = /<link[^>]*href="([^"]+)"[^>]*>/i.exec(block);
  return m ? m[1].trim() : null;
}

export function resolveUrl(raw: string, baseUrl: string): string {
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return '';
  }
}

/**
 * Turns a board's date text into ISO. Day-first numeric dates (23-10-2026) are what
 * Rwandan boards print, and Date() reads those as invalid rather than as October —
 * so they are handled explicitly instead of guessed.
 */
export function toIsoDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text) return null;

  const dmy = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(text);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const stamp = Date.UTC(year, month - 1, day, 23, 59, 59);
    const d = new Date(stamp);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function maxListingsPerSource(env: NodeJS.ProcessEnv = process.env): number {
  return positiveInt(env.JOB_CRAWL_MAX_LISTINGS, 60);
}
