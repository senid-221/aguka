import { BaseJobConnector, ConnectorOptions } from './base-connector';
import { RawJobItem } from '../types';
import {
  SourceFetchError,
  FeedItem,
  crawlTimeoutMs,
  excerptFromHtml,
  fetchDocument,
  looksLikeFeed,
  maxListingsPerSource,
  parseFeed,
  toIsoDate,
} from '../feed';

/** "Employer: Role" is the convention these boards title their items with. */
export function splitEmployerFromTitle(title: string): { employer: string; role: string } {
  const colon = title.indexOf(':');
  if (colon > 0 && colon <= 48) {
    const employer = title.slice(0, colon).trim();
    const role = title.slice(colon + 1).trim();
    if (employer && role) return { employer, role: role };
  }
  return { employer: '', role: title };
}

function salaryFromText(text: string): string | undefined {
  const m = /\(([^)]*\$\s?[\d,.]+[^)]*)\)/.exec(text);
  return m ? m[1].trim() : undefined;
}

export interface FeedConnectorConfig {
  sourceCode: string;
  name: string;
  baseUrl: string;
  robotsUrl: string;
  /** RSS/Atom URLs this board publishes, tried in order. */
  feedUrls: string[];
}

/**
 * Reads a board that publishes RSS 2.0 or Atom. Everything a listing needs comes
 * from the feed itself; nothing is filled in by guessing.
 */
export class FeedJobConnector extends BaseJobConnector {
  readonly sourceCode: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly robotsUrl: string;
  protected defaultTargets: string[];

  constructor(config: FeedConnectorConfig, options: ConnectorOptions = {}) {
    super(options);
    this.sourceCode = config.sourceCode;
    this.name = config.name;
    this.baseUrl = config.baseUrl;
    this.robotsUrl = config.robotsUrl;
    this.defaultTargets = config.feedUrls;
  }

  async fetchRawJobs(): Promise<RawJobItem[]> {
    const feeds = this.targets();
    if (!feeds.length) {
      throw new SourceFetchError('CONFIG', `${this.name} has no feed URL configured`);
    }

    const items: FeedItem[] = [];
    const seen = new Set<string>();
    let latencyMs = 0;

    for (const feedUrl of feeds) {
      const doc = await fetchDocument(feedUrl, {
        fetchImpl: this.fetchImpl,
        timeoutMs: crawlTimeoutMs(this.env),
      });
      latencyMs += doc.latencyMs;
      const feedItems = parseFeed(doc.body, doc.url);
      // An empty feed is a real answer; a page that was never a feed is not. Reading
      // a board's home page as a feed would otherwise store nothing and report the
      // board as healthy, which is how a mistyped JOB_FEED_URL_<CODE> hides.
      if (!feedItems.length && !looksLikeFeed(doc.body)) {
        throw new SourceFetchError(
          'CONFIG',
          `${this.name}: ${feedUrl} answered ${doc.status} but is not an RSS or Atom document, so it has no listings this platform can read. Set JOB_FEED_URL_${this.sourceCode} to the feed address the board publishes, not to a page.`
        );
      }
      for (const item of feedItems) {
        const key = item.externalId || item.url;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push(item);
      }
    }

    const cap = maxListingsPerSource(this.env);
    const mapped = items
      .slice(0, cap)
      .map((item) => this.mapItem(item))
      .filter((raw): raw is RawJobItem => raw !== null);

    this.lastSyncTime = new Date().toISOString();
    this.lastLatencyMs = latencyMs;
    this.lastCount = mapped.length;
    return mapped;
  }

  protected mapItem(item: FeedItem): RawJobItem | null {
    const { employer, role } = splitEmployerFromTitle(item.title);
    const title = role || item.title;
    if (!title || !item.url.startsWith('http')) return null;

    const summary = excerptFromHtml(item.summaryHtml);
    const creator = item.extras.creator || '';

    return {
      externalId: item.externalId || item.url,
      sourceCode: this.sourceCode,
      sourceName: this.name,
      title,
      employer: employer || creator || this.name,
      location: item.extras.region || item.categories[0] || 'Remote',
      rawJobType: 'Remote',
      description: summary || `${title} — posted on ${this.name}. Open the posting to read the full advertisement.`,
      salaryRange: salaryFromText(item.title),
      sourceUrl: item.url,
      deadline: undefined,
      discoveredAt: toIsoDate(item.publishedRaw) || undefined,
      tags: item.categories.slice(0, 4),
    };
  }
}

/** The board this platform reads remote listings from, and its published feeds. */
export function createRemoteTechConnector(options: ConnectorOptions = {}): FeedJobConnector {
  return new FeedJobConnector(
    {
      sourceCode: 'REMOTE_TECH',
      name: 'Global Remote Tech for Africa',
      baseUrl: 'https://weworkremotely.com',
      robotsUrl: 'https://weworkremotely.com/robots.txt',
      feedUrls: [
        'https://weworkremotely.com/categories/remote-programming-jobs.rss',
        'https://weworkremotely.com/categories/remote-design-jobs.rss',
      ],
    },
    options
  );
}

/**
 * A source with no connector of its own, pointed at an operator-supplied feed.
 * Used when JOB_FEED_URL_<CODE> is set for a board whose listings are published
 * as RSS/Atom.
 */
export function createGenericFeedConnector(
  config: { sourceCode: string; name: string; baseUrl: string; feedUrl: string },
  options: ConnectorOptions = {}
): FeedJobConnector {
  const host = new URL(config.baseUrl).host;
  return new FeedJobConnector(
    {
      sourceCode: config.sourceCode,
      name: config.name,
      baseUrl: config.baseUrl,
      robotsUrl: `https://${host}/robots.txt`,
      feedUrls: [config.feedUrl],
    },
    options
  );
}
