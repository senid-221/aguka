import { RawJobItem, ConnectorHealthReport } from '../types';

export abstract class BaseJobConnector {
  abstract readonly sourceCode: string;
  abstract readonly name: string;
  abstract readonly baseUrl: string;
  abstract readonly robotsUrl: string;

  // Operator-declared permission for this board; set only after checking its
  // robots.txt and terms by hand.
  protected isPermittedSource: boolean = true;
  protected lastSyncTime?: string;
  protected lastError?: string;

  /**
   * Returns the operator-declared permission for this source. No HTTP request is
   * made here, so this is a configuration read, not a live robots.txt check.
   */
  async verifyRobotsCompliance(): Promise<boolean> {
    return this.isPermittedSource;
  }

  /**
   * Fetches raw listings from the source feed / official endpoint
   */
  abstract fetchRawJobs(): Promise<RawJobItem[]>;

  /**
   * Standard health check report
   */
  async healthCheck(): Promise<ConnectorHealthReport> {
    return {
      sourceCode: this.sourceCode,
      name: this.name,
      baseUrl: this.baseUrl,
      status: this.lastError ? 'DEGRADED' : 'UNKNOWN',
      lastSyncAt: this.lastSyncTime,
      latencyMs: 0,
      activeListingsCount: 0,
      robotsPermitted: this.isPermittedSource,
    };
  }
}
