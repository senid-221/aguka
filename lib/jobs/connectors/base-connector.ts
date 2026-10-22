import { RawJobItem, ConnectorHealthReport } from '../types';

export interface ConnectorOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

export abstract class BaseJobConnector {
  abstract readonly sourceCode: string;
  abstract readonly name: string;
  abstract readonly baseUrl: string;
  abstract readonly robotsUrl: string;

  /** Where this board's listings are read from, in request order. */
  protected abstract defaultTargets: string[];

  // Operator-declared permission for this board; set only after checking its
  // robots.txt and terms by hand.
  protected isPermittedSource: boolean = true;
  protected lastSyncTime?: string;
  protected lastError?: string;
  protected lastLatencyMs: number = 0;
  protected lastCount: number = 0;

  protected readonly env: NodeJS.ProcessEnv;
  protected readonly fetchImpl?: typeof fetch;

  constructor(options: ConnectorOptions = {}) {
    this.env = options.env ?? process.env;
    this.fetchImpl = options.fetchImpl;
  }

  /**
   * Operator-supplied listing/feed URL for this board (JOB_FEED_URL_<CODE>), so a
   * source can be repointed without a code change.
   */
  feedUrlOverride(): string | null {
    const raw = (this.env[`JOB_FEED_URL_${this.sourceCode}`] || '').trim();
    return raw || null;
  }

  targets(): string[] {
    const override = this.feedUrlOverride();
    return override ? [override] : this.defaultTargets;
  }

  /**
   * Returns the operator-declared permission for this source. No HTTP request is
   * made here, so this is a configuration read, not a live robots.txt check.
   */
  async verifyRobotsCompliance(): Promise<boolean> {
    return this.isPermittedSource;
  }

  /**
   * Reads the board and returns only what it printed. Throws SourceFetchError when
   * the board cannot be reached or has nothing machine-readable to read.
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
      status: this.lastError ? 'DEGRADED' : this.lastSyncTime ? 'HEALTHY' : 'UNKNOWN',
      lastSyncAt: this.lastSyncTime,
      latencyMs: this.lastLatencyMs,
      activeListingsCount: this.lastCount,
      robotsPermitted: this.isPermittedSource,
      lastErrorMessage: this.lastError,
    };
  }
}
