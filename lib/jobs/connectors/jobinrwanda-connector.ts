import { BaseJobConnector } from './base-connector';
import { RawJobItem } from '../types';

export class JobInRwandaConnector extends BaseJobConnector {
  readonly sourceCode = 'JOB_IN_RWANDA';
  readonly name = 'Job in Rwanda Official Feed';
  readonly baseUrl = 'https://www.jobinrwanda.com';
  readonly robotsUrl = 'https://www.jobinrwanda.com/robots.txt';

  async fetchRawJobs(): Promise<RawJobItem[]> {
    // No live feed is wired to this board yet. Returning nothing keeps invented
    // vacancies out of the listing pool.
    return [];
  }
}
