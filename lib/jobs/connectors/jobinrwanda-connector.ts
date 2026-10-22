import { BaseJobConnector, ConnectorOptions } from './base-connector';
import { RawJobItem } from '../types';
import {
  SourceFetchError,
  crawlTimeoutMs,
  clipText,
  extractElements,
  fetchDocument,
  maxListingsPerSource,
  resolveUrl,
  stripTags,
  toIsoDate,
} from '../feed';

const DAY_FIRST = '(\\d{1,2}[-/.]\\d{1,2}[-/.]\\d{2,4})';

function readField(block: string, marker: RegExp): string {
  const m = marker.exec(block);
  return m ? stripTags(m[1]) : '';
}

/**
 * Job in Rwanda is a Drupal site that prints its job teasers server-side, so the
 * listing page itself is the feed: title, employer, city, published date and
 * deadline are all in the rendered card. Its /rss.xml is the site-wide node feed
 * (pages and FAQs, not jobs), which is why the card page is read instead.
 */
export class JobInRwandaConnector extends BaseJobConnector {
  readonly sourceCode = 'JOB_IN_RWANDA';
  readonly name = 'Job in Rwanda';
  readonly baseUrl = 'https://www.jobinrwanda.com';
  readonly robotsUrl = 'https://www.jobinrwanda.com/robots.txt';
  protected defaultTargets = ['https://www.jobinrwanda.com/jobs/all'];

  async fetchRawJobs(): Promise<RawJobItem[]> {
    const pages = this.targets();
    const raw: RawJobItem[] = [];
    const seen = new Set<string>();
    let latencyMs = 0;

    for (const page of pages) {
      const doc = await fetchDocument(page, {
        fetchImpl: this.fetchImpl,
        timeoutMs: crawlTimeoutMs(this.env),
      });
      latencyMs += doc.latencyMs;
      for (const item of this.parseCards(doc.body, doc.url)) {
        if (seen.has(item.externalId)) continue;
        seen.add(item.externalId);
        raw.push(item);
      }
    }

    if (!raw.length) {
      throw new SourceFetchError(
        'NETWORK',
        `${this.name} returned no job cards on ${pages.join(', ')} — the page changed shape and needs a parser update`
      );
    }

    const capped = raw.slice(0, maxListingsPerSource(this.env));
    this.lastSyncTime = new Date().toISOString();
    this.lastLatencyMs = latencyMs;
    this.lastCount = capped.length;
    return capped;
  }

  parseCards(html: string, baseUrl: string): RawJobItem[] {
    const out: RawJobItem[] = [];

    for (const card of extractElements(html, 'article')) {
      const body = card.inner;
      const link = /href="(\/job\/[^"#?]+)"/.exec(body);
      if (!link) continue;

      const sourceUrl = resolveUrl(link[1], baseUrl);
      const externalId = link[1].split('/').pop() || link[1];
      const title = readField(
        body,
        /field--name-title[^>]*>([\s\S]*?)<\/span>/i
      );
      if (!title || !sourceUrl.startsWith('http')) continue;

      const employer = stripTags((/<a href="\/employer\/[^"]+">([\s\S]*?)<\/a>/i.exec(body) || ['', ''])[1]);
      const location = readField(body, /fa-map-marker-alt[^>]*>\s*<\/i>([^|]*)/i);
      const published = (new RegExp(`Published on ${DAY_FIRST}`, 'i').exec(body) || [])[1];
      const deadlineIso = (/<time datetime="([^"]+)"/i.exec(body) || [])[1];
      const deadlineDayFirst = (new RegExp(`Deadline\\s*${DAY_FIRST}`, 'i').exec(body) || [])[1];

      // The card paragraph, split where Drupal starts the badge ("Job", "Tender"):
      // the first half is the facts the board prints, the second is its own label.
      const cardParagraph = /<p class="card-text">([\s\S]*?)<\/p>/i.exec(body)?.[1] || body;
      const [factsBlock = '', badgeBlock = ''] = cardParagraph.split(/<span class="badge/i);
      const facts = stripTags(factsBlock.replace(/<!--[\s\S]*?-->/g, ' '));
      const seniority = stripTags(facts.split(/\|/).pop() || '').replace(/^Deadline\s*[\d-\/:.TZ]+/i, '').trim();

      out.push({
        externalId,
        sourceCode: this.sourceCode,
        sourceName: this.name,
        title,
        employer: employer || this.name,
        location: location || 'Rwanda',
        rawJobType: /intern/i.test(`${title} ${facts}`) ? 'Internship' : undefined,
        description: clipText(facts, 320),
        requirements: seniority && seniority !== 'Not specified' ? clipText(seniority, 160) : undefined,
        tags: [stripTags((/>([^<]*)<\/span>/i.exec(badgeBlock) || ['', ''])[1])].filter(Boolean),
        sourceUrl,
        deadline: deadlineIso || toIsoDate(deadlineDayFirst) || undefined,
        discoveredAt: toIsoDate(published) || undefined,
      });
    }

    return out;
  }
}
