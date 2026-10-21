import { BaseJobConnector } from './base-connector';
import { RawJobItem } from '../types';

export class RemoteJobsConnector extends BaseJobConnector {
  readonly sourceCode = 'REMOTE_TECH';
  readonly name = 'Global Remote Tech (Africa & EMEA friendly)';
  readonly baseUrl = 'https://weworkremotely.com';
  readonly robotsUrl = 'https://weworkremotely.com/robots.txt';

  async fetchRawJobs(): Promise<RawJobItem[]> {
    // No live feed is wired to this board yet. Returning nothing keeps invented
    // vacancies out of the listing pool.
    return [];
  }
}
