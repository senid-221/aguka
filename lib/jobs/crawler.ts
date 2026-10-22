import { JobListing, JobSource } from '@/lib/types';
import { normalizeJobListing, deduplicateListings } from './normalizer';
import { SourceFetchError } from './feed';
import { BaseJobConnector, ConnectorOptions } from './connectors/base-connector';
import { JobInRwandaConnector } from './connectors/jobinrwanda-connector';
import { MifotraConnector } from './connectors/mifotra-connector';
import { createRemoteTechConnector, createGenericFeedConnector } from './connectors/feed-connector';

export type CrawlStatus = 'OK' | 'NO_PUBLIC_FEED' | 'FAILED' | 'UNKNOWN_SOURCE';

export interface SourceCrawlResult {
  sourceCode: string;
  sourceName: string;
  status: CrawlStatus;
  /** What the board actually did: read, stored, refreshed, skipped, plus the reason when it failed. */
  note: string;
  read: number;
  stored: number;
  refreshed: number;
  skipped: number;
  latencyMs: number;
  activeListingsCount: number;
}

export interface CrawlRunResult {
  ranAt: string;
  results: SourceCrawlResult[];
  stored: number;
  refreshed: number;
}

export type CrawlOptions = ConnectorOptions;

/** The slice of the repository a crawl needs, so a test can hand it an empty store. */
export interface JobCrawlStore {
  getSources(): JobSource[];
  upsertCrawledJob(listing: JobListing): boolean;
  recordSourceCrawl(code: string, patch: {
    healthStatus: JobSource['healthStatus'];
    lastCrawledAt: string;
    activeListingsCount: number;
    lastCrawlStatus: CrawlStatus;
    lastCrawlNote: string;
  }): void;
  countActiveJobsForSource(sourceId: string): number;
}

export function connectorForSource(source: JobSource, options: ConnectorOptions = {}): BaseJobConnector {
  switch (source.code) {
    case 'MIFOTRA':
      return new MifotraConnector(options);
    case 'JOB_IN_RWANDA':
      return new JobInRwandaConnector(options);
    case 'REMOTE_TECH':
      return createRemoteTechConnector(options);
    default:
      break;
  }

  const override = (options.env?.[`JOB_FEED_URL_${source.code}`] || process.env[`JOB_FEED_URL_${source.code}`] || '').trim();
  if (override) {
    return createGenericFeedConnector({
      sourceCode: source.code,
      name: source.name,
      baseUrl: source.baseUrl,
      feedUrl: override,
    }, options);
  }

  return new UnconfiguredSourceConnector(source, options);
}

/** A configured board this platform has no reader for — reported, never guessed at. */
class UnconfiguredSourceConnector extends BaseJobConnector {
  readonly sourceCode: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly robotsUrl: string;
  protected defaultTargets: string[] = [];

  constructor(source: JobSource, options: ConnectorOptions = {}) {
    super(options);
    this.sourceCode = source.code;
    this.name = source.name;
    this.baseUrl = source.baseUrl;
    this.robotsUrl = `${source.baseUrl.replace(/\/$/, '')}/robots.txt`;
  }

  async fetchRawJobs(): Promise<never> {
    throw new SourceFetchError(
      'CONFIG',
      `${this.name} has no reader for its page shape yet. If it publishes an RSS or Atom feed, set JOB_FEED_URL_${this.sourceCode} to that URL and the crawl will use it.`
    );
  }
}

function failureKind(err: unknown): { status: CrawlStatus; note: string } {
  if (err instanceof SourceFetchError) {
    if (err.kind === 'CONFIG') return { status: 'NO_PUBLIC_FEED', note: err.message };
    if (err.kind === 'TIMEOUT') return { status: 'FAILED', note: `Timed out: ${err.message}` };
    if (err.kind === 'HTTP_STATUS') return { status: 'FAILED', note: `Board refused: ${err.message}` };
    if (err.kind === 'TOO_LARGE') return { status: 'FAILED', note: `Reply too large: ${err.message}` };
    return { status: 'FAILED', note: `Could not reach the board: ${err.message}` };
  }
  return { status: 'FAILED', note: `Could not read the board: ${err instanceof Error ? err.message : String(err)}` };
}

export async function crawlSource(
  source: JobSource,
  store: JobCrawlStore,
  options: CrawlOptions = {}
): Promise<SourceCrawlResult> {
  const startedAt = Date.now();
  const ranAt = new Date().toISOString();
  const env = options.env ?? process.env;

  const finish = (
    status: CrawlStatus,
    note: string,
    counts: { read: number; stored: number; refreshed: number; skipped: number },
    health: JobSource['healthStatus']
  ): SourceCrawlResult => {
    const activeListingsCount = store.countActiveJobsForSource(source.id);
    store.recordSourceCrawl(source.code, {
      healthStatus: health,
      lastCrawledAt: ranAt,
      activeListingsCount,
      lastCrawlStatus: status,
      lastCrawlNote: note,
    });
    return {
      sourceCode: source.code,
      sourceName: source.name,
      status,
      note,
      ...counts,
      latencyMs: Date.now() - startedAt,
      activeListingsCount,
    };
  };

  let rawItems;
  try {
    rawItems = await connectorForSource(source, { env, fetchImpl: options.fetchImpl }).fetchRawJobs();
  } catch (err) {
    const failure = failureKind(err);
    return finish(failure.status, failure.note, { read: 0, stored: 0, refreshed: 0, skipped: 0 },
      failure.status === 'NO_PUBLIC_FEED' ? 'WARNING' : 'DOWN');
  }

  const listings: JobListing[] = [];
  let skipped = 0;
  for (const raw of rawItems) {
    try {
      listings.push(normalizeJobListing(raw, source.id));
    } catch {
      // A row this platform cannot ground to a real URL is dropped, never invented.
      skipped++;
    }
  }

  const { unique, duplicatesCount } = deduplicateListings(listings);
  skipped += duplicatesCount;

  let stored = 0;
  let refreshed = 0;
  for (const listing of unique) {
    if (store.upsertCrawledJob(listing)) stored++;
    else refreshed++;
  }

  // The gap between rows read and rows stored is explained in the board's own history,
  // so an admin never has to guess whether listings went missing.
  const skipNote = skipped ? `; ${skipped} row(s) not stored (duplicate posting or no link back)` : '';
  const note = `${unique.length} listing${unique.length === 1 ? '' : 's'} read from ${source.baseUrl} in ${Date.now() - startedAt}ms${skipNote}`;
  return finish('OK', note, { read: rawItems.length, stored, refreshed, skipped }, 'HEALTHY');
}

export async function crawlAllSources(
  store: JobCrawlStore,
  options: CrawlOptions = {},
  onResult?: (result: SourceCrawlResult) => void
): Promise<CrawlRunResult> {
  const results: SourceCrawlResult[] = [];
  for (const source of store.getSources()) {
    const result = await crawlSource(source, store, options);
    results.push(result);
    onResult?.(result);
  }
  return {
    ranAt: new Date().toISOString(),
    results,
    stored: results.reduce((sum, r) => sum + r.stored, 0),
    refreshed: results.reduce((sum, r) => sum + r.refreshed, 0),
  };
}

export async function crawlOneSource(
  sourceCode: string,
  store: JobCrawlStore,
  options: CrawlOptions = {}
): Promise<SourceCrawlResult> {
  const source = store.getSources().find((s) => s.code === sourceCode);
  if (!source) {
    return {
      sourceCode,
      sourceName: sourceCode,
      status: 'UNKNOWN_SOURCE',
      note: `No board is configured with the code ${sourceCode}`,
      read: 0,
      stored: 0,
      refreshed: 0,
      skipped: 0,
      latencyMs: 0,
      activeListingsCount: 0,
    };
  }
  return crawlSource(source, store, options);
}
