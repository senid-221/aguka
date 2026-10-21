import { BaseJobConnector } from './base-connector';
import { RawJobItem } from '../types';

export class MifotraConnector extends BaseJobConnector {
  readonly sourceCode = 'MIFOTRA';
  readonly name = 'MIFOTRA E-Recruitment Portal';
  readonly baseUrl = 'https://recruitment.mifotra.gov.rw';
  readonly robotsUrl = 'https://recruitment.mifotra.gov.rw/robots.txt';

  async fetchRawJobs(): Promise<RawJobItem[]> {
    // No live feed is wired to this board yet. Returning nothing keeps invented
    // vacancies out of the listing pool.
    return [];
  }
}
