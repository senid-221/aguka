import { BaseJobConnector, ConnectorOptions } from './base-connector';
import { RawJobItem } from '../types';
import { SourceFetchError } from '../feed';
import { FeedJobConnector } from './feed-connector';

export const MIFOTRA_NO_FEED_REASON =
  'MIFOTRA e-recruitment serves an empty JavaScript shell to a reader that does not execute scripts, and publishes no RSS/Atom feed, sitemap or documented listings API. Nothing can be read without reverse-engineering the portal\'s private endpoint, which this platform will not do. Set JOB_FEED_URL_MIFOTRA to a feed or listing page the ministry provides to crawl it.';

/**
 * The government board stays honest: it reports why it cannot be read instead of
 * pretending to be healthy, and becomes crawlable the moment a real feed URL is
 * configured for it.
 */
export class MifotraConnector extends BaseJobConnector {
  readonly sourceCode = 'MIFOTRA';
  readonly name = 'MIFOTRA E-Recruitment Portal';
  readonly baseUrl = 'https://recruitment.mifotra.gov.rw';
  readonly robotsUrl = 'https://recruitment.mifotra.gov.rw/robots.txt';
  protected defaultTargets: string[] = [];

  async fetchRawJobs(): Promise<RawJobItem[]> {
    const feedUrl = this.feedUrlOverride();
    if (!feedUrl) {
      this.lastError = MIFOTRA_NO_FEED_REASON;
      throw new SourceFetchError('CONFIG', MIFOTRA_NO_FEED_REASON);
    }

    const delegate = new FeedJobConnector(
      {
        sourceCode: this.sourceCode,
        name: this.name,
        baseUrl: this.baseUrl,
        robotsUrl: this.robotsUrl,
        feedUrls: [feedUrl],
      },
      { env: this.env, fetchImpl: this.fetchImpl }
    );
    const items = await delegate.fetchRawJobs();
    this.lastSyncTime = new Date().toISOString();
    this.lastCount = items.length;
    return items;
  }
}
