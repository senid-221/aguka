/**
 * Lets the persistence layer report queue facts without importing the queue,
 * which would close an import cycle (queue → repository → queue).
 */

export type QueueEngine = 'IN_MEMORY' | 'REDIS_BULLMQ';

export interface QueueRuntimeSnapshot {
  engine: QueueEngine;
  /** Human-readable, credential-free, e.g. `Redis BullMQ · host:6379 (tls)`. */
  mode: string;
  endpoint: string;
  activeWorkers: number;
  lastError: string;
}

const UNKNOWN: QueueRuntimeSnapshot = {
  engine: 'IN_MEMORY',
  mode: 'In-Process Resilient Queue',
  endpoint: '',
  activeWorkers: 0,
  lastError: '',
};

let reporter: (() => QueueRuntimeSnapshot) | null = null;

export function setQueueRuntimeSnapshotProvider(provider: () => QueueRuntimeSnapshot): void {
  reporter = provider;
}

export function getQueueRuntimeSnapshot(): QueueRuntimeSnapshot {
  return reporter ? reporter() : UNKNOWN;
}
