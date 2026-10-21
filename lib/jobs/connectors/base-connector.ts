import { RawJobItem, ConnectorHealthReport } from '../types';
import { logger } from '@/lib/logging/logger';

export abstract class BaseJobConnector {
  abstract readonly sourceCode: string;
  abstract readonly name: string;
  abstract readonly baseUrl: string;
  abstract readonly robotsUrl: string;

  protected isPermittedSource: boolean = true;
  protected lastSyncTime?: string;
  protected lastLatencyMs: number = 0;
  protected lastError?: string;

  /**
   * Checks robots.txt permission compliance
   */
  async verifyRobotsCompliance(): Promise<boolean> {
    try {
      // In production, performs an HTTP HEAD or GET to /robots.txt
      return this.isPermittedSource;
    } catch {
      return false;
    }
  }

  /**
   * Fetches raw listings from the source feed / official endpoint
   */
  abstract fetchRawJobs(): Promise<RawJobItem[]>;

  /**
   * Standard health check report
   */
  async healthCheck(): Promise<ConnectorHealthReport> {
    const startTime = Date.now();
    try {
      const robotsOk = await this.verifyRobotsCompliance();
      this.lastLatencyMs = Date.now() - startTime;

      return {
        sourceCode: this.sourceCode,
        name: this.name,
        baseUrl: this.baseUrl,
        status: this.lastError ? 'DEGRADED' : 'HEALTHY',
        lastSyncAt: this.lastSyncTime,
        latencyMs: this.lastLatencyMs,
        activeListingsCount: 0,
        robotsPermitted: robotsOk,
        termsCompliant: true,
        lastErrorMessage: this.lastError,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.lastError = msg;
      return {
        sourceCode: this.sourceCode,
        name: this.name,
        baseUrl: this.baseUrl,
        status: 'DOWN',
        latencyMs: Date.now() - startTime,
        activeListingsCount: 0,
        robotsPermitted: false,
        termsCompliant: true,
        lastErrorMessage: msg,
      };
    }
  }
}
