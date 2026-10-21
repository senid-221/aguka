import { ConnectionOptions, Job, Queue, Worker } from 'bullmq';
import { repo } from '@/lib/db/repository';
import { logger } from '@/lib/logging/logger';
import { QueuedJob, TaskStatus } from '@/lib/types';
import { runJob } from '@/lib/queue/jobs';
import { ResolvedRedisEndpoint, resolveRedisEndpoint } from '@/lib/queue/redis-connection';
import { QueueRuntimeSnapshot, setQueueRuntimeSnapshotProvider } from '@/lib/queue/status';

export interface QueueJobDefinition<T = Record<string, unknown>> {
  id: string;
  name: string;
  data: T;
  attempts: number;
  maxAttempts: number;
  backoffMs: number;
  status: TaskStatus;
  enqueuedAt: string;
  processedAt?: string;
  failedReason?: string;
}

export interface QueueHealth {
  ok: boolean;
  pendingJobs: number;
  activeWorkers: number;
  mode: string;
  error?: string;
}

export interface IQueueService {
  enqueue<T extends Record<string, unknown>>(jobName: string, data: T, maxAttempts?: number): Promise<QueueJobDefinition<T>>;
  processNext(): Promise<boolean>;
  getPendingCount(): number;
  healthCheck(): Promise<QueueHealth>;
}

const QUEUE_PING_TIMEOUT_MS = 4_000;
const REDIS_ENQUEUE_TIMEOUT_MS = 5_000;
const JOB_SETTLE_TIMEOUT_MS = 20_000;
const CLOSE_TIMEOUT_MS = 3_000;

/** BullMQ validates the server's version with INFO; some proxies forbid it. */
function skipVersionCheck(): boolean {
  return flagEnv('QUEUE_SKIP_VERSION_CHECK', false);
}

function flagEnv(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] || '').trim().toLowerCase();
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return fallback;
}

function queueName(): string {
  return (process.env.QUEUE_NAME || 'aguka-jobs').trim() || 'aguka-jobs';
}

function workerConcurrency(): number {
  const parsed = parseInt(process.env.QUEUE_CONCURRENCY || '5', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    );
  });
}

/**
 * One queue, two engines.
 *
 * `REDIS_URL` (or the Upstash TCP fields) selects BullMQ: jobs live in Redis,
 * retries and backoff are Redis-side, and a worker process executes them. With no
 * endpoint configured, the same job definitions run in this process so local
 * development still drains the queue — and health checks say plainly which engine
 * is in charge. Nothing here fabricates queue activity: the repository mirror is
 * updated from real execution, and a Redis enqueue that fails is recorded as
 * failed rather than quietly run somewhere else.
 */
class HybridQueueService implements IQueueService {
  private local: QueueJobDefinition[] = [];
  private endpoint: ResolvedRedisEndpoint | null = null;
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private lastError = '';
  private initialised = false;

  constructor() {
    for (const stored of repo.getQueuedJobs()) {
      if (stored.status === 'COMPLETED' || stored.status === 'FAILED' || stored.status === 'CANCELLED') continue;
      this.local.push({
        id: stored.id,
        name: stored.name,
        data: stored.data,
        attempts: stored.attempts,
        maxAttempts: stored.maxAttempts,
        backoffMs: 1000,
        status: 'QUEUED',
        enqueuedAt: stored.enqueuedAt,
        failedReason: stored.failedReason,
      });
      if (stored.status === 'PROCESSING') repo.updateJobStatus(stored.id, 'QUEUED');
    }

    setQueueRuntimeSnapshotProvider(() => this.snapshot());
  }

  // --- engine selection -----------------------------------------------------

  private ensureEngine(): void {
    if (this.initialised) return;
    this.initialised = true;

    const endpoint = resolveRedisEndpoint();
    this.endpoint = endpoint;
    if (endpoint.error) {
      this.lastError = endpoint.error;
      logger.warn('QUEUE_REDIS_CONFIG_INVALID', endpoint.error);
      return;
    }
    if (!endpoint.configured || !endpoint.options) return;

    try {
      const connection = {
        ...endpoint.options,
        skipVersionCheck: skipVersionCheck(),
      } as ConnectionOptions;
      this.queue = new Queue(queueName(), {
        connection,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: { age: 24 * 3600, count: 1000 },
          removeOnFail: false,
        },
      });
      this.queue.on('error', (err) => {
        this.lastError = err.message;
        logger.error('QUEUE_REDIS_ERROR', err, { metadata: { endpoint: endpoint.label } });
      });
      logger.info('QUEUE_ENGINE_SELECTED', `BullMQ queue "${queueName()}" → ${endpoint.label}`, {
        metadata: { source: endpoint.source, engine: 'REDIS_BULLMQ' },
      });
    } catch (err: unknown) {
      this.queue = null;
      this.lastError = err instanceof Error ? err.message : String(err);
      logger.error('QUEUE_ENGINE_INIT_FAILED', err instanceof Error ? err : new Error(this.lastError), {
        metadata: { endpoint: endpoint.label },
      });
    }
  }

  private useRedis(): boolean {
    this.ensureEngine();
    return Boolean(this.queue);
  }

  /**
   * Attach a BullMQ worker to this process. Enabled by default outside
   * production, because a developer pointing at Upstash still needs jobs to run;
   * a serverless deployment must leave this off and run `npm run worker` on an
   * always-on host instead.
   */
  private attachWorker(force = false): boolean {
    if (!this.useRedis()) return false;
    if (this.worker) return true;
    if (!force && !flagEnv('QUEUE_INLINE_WORKER', process.env.NODE_ENV !== 'production')) return false;

    try {
      const connection = {
        ...this.endpoint!.options,
        skipVersionCheck: skipVersionCheck(),
      } as ConnectionOptions;
      const worker = new Worker(queueName(), (job) => this.execute(job), {
        connection,
        concurrency: workerConcurrency(),
      });
      worker.on('completed', (job) => repo.updateJobStatus(String(job.id), 'COMPLETED'));
      worker.on('failed', (job, err) => {
        this.lastError = err.message;
        const jobId = job ? String(job.id) : '';
        if (jobId) repo.updateJobStatus(jobId, 'FAILED', err.message);
        logger.error('QUEUE_JOB_FAILED', err, { metadata: { jobId } });
      });
      worker.on('error', (err) => {
        this.lastError = err.message;
        logger.error('QUEUE_WORKER_ERROR', err, { metadata: { endpoint: this.endpoint?.label } });
      });
      this.worker = worker;
      logger.info('QUEUE_WORKER_ATTACHED', `Worker on "${queueName()}" (concurrency ${workerConcurrency()})`);
      return true;
    } catch (err: unknown) {
      this.lastError = err instanceof Error ? err.message : String(err);
      logger.error('QUEUE_WORKER_ATTACH_FAILED', err instanceof Error ? err : new Error(this.lastError));
      return false;
    }
  }

  private async execute(job: Job): Promise<{ detail: string; processedCount: number }> {
    const recordId = String(job.id);
    repo.updateJobStatus(recordId, 'PROCESSING');
    const payload = (job.data || {}) as Record<string, unknown>;
    const outcome = await runJob(job.name, payload, recordId);
    return { detail: outcome.detail, processedCount: outcome.processedCount };
  }

  // --- IQueueService --------------------------------------------------------

  async enqueue<T extends Record<string, unknown>>(
    jobName: string,
    data: T,
    maxAttempts: number = 3
  ): Promise<QueueJobDefinition<T>> {
    const record: QueuedJob = repo.enqueueJob(jobName, data, maxAttempts);
    const definition: QueueJobDefinition<T> = {
      id: record.id,
      name: record.name,
      data,
      attempts: 0,
      maxAttempts,
      backoffMs: 1000,
      status: 'QUEUED',
      enqueuedAt: record.enqueuedAt,
    };

    if (!this.useRedis()) {
      this.local.push(definition as QueueJobDefinition);
      logger.info('JOB_ENQUEUED', `Job ${jobName} added to the in-process queue`, {
        metadata: { jobId: definition.id, maxAttempts },
      });
      return definition;
    }

    try {
      await withTimeout(
        this.queue!.add(jobName, { ...data }, {
          jobId: record.id,
          attempts: maxAttempts,
          backoff: { type: 'exponential', delay: definition.backoffMs },
        }),
        REDIS_ENQUEUE_TIMEOUT_MS,
        `BullMQ add ${jobName}`
      );
      logger.info('JOB_ENQUEUED', `Job ${jobName} added to the BullMQ queue`, {
        metadata: { jobId: definition.id, endpoint: this.endpoint?.label, maxAttempts },
      });
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      this.lastError = reason;
      repo.updateJobStatus(record.id, 'FAILED', `REDIS_ENQUEUE_FAILED: ${reason}`);
      definition.status = 'FAILED';
      definition.failedReason = reason;
      logger.error('JOB_ENQUEUE_FAILED', err instanceof Error ? err : new Error(reason), {
        metadata: { jobId: definition.id, endpoint: this.endpoint?.label },
      });
    }
    return definition;
  }

  async processNext(): Promise<boolean> {
    if (this.useRedis()) {
      if (!this.worker && !this.attachWorker()) return false;
      const counts = await withTimeout(
        this.queue!.getJobCounts('waiting', 'delayed', 'active'),
        QUEUE_PING_TIMEOUT_MS,
        'BullMQ getJobCounts'
      ).catch(() => null);
      if (!counts) return false;
      if (counts.waiting + counts.delayed + counts.active === 0) return false;
      return this.waitForSettlement(this.worker!);
    }

    const job = this.local.find((j) => j.status === 'QUEUED');
    if (!job) return false;

    job.status = 'PROCESSING';
    job.attempts++;
    repo.updateJobStatus(job.id, 'PROCESSING');

    try {
      const outcome = await runJob(job.name, job.data, job.id);
      job.status = 'COMPLETED';
      job.processedAt = new Date().toISOString();
      repo.updateJobStatus(job.id, 'COMPLETED');
      logger.info('JOB_COMPLETED', `Job ${job.name} finished: ${outcome.detail}`, {
        metadata: { jobId: job.id, processedCount: outcome.processedCount },
      });
      return true;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      job.failedReason = errMsg;
      if (job.attempts < job.maxAttempts) {
        job.status = 'QUEUED';
        logger.warn('JOB_RETRY_SCHEDULED', `Job ${job.name} failed, will retry: ${errMsg}`, {
          metadata: { jobId: job.id, nextAttempt: job.attempts + 1 },
        });
      } else {
        job.status = 'FAILED';
        job.processedAt = new Date().toISOString();
        repo.updateJobStatus(job.id, 'FAILED', errMsg);
        logger.error('JOB_DEAD_LETTER', new Error(errMsg), {
          metadata: { jobId: job.id, totalAttempts: job.attempts },
        });
      }
      return false;
    }
  }

  private waitForSettlement(worker: Worker): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const finish = (settled: boolean) => {
        clearTimeout(timer);
        worker.off('completed', onCompleted);
        worker.off('failed', onFailed);
        resolve(settled);
      };
      const onCompleted = () => finish(true);
      const onFailed = () => finish(true);
      const timer = setTimeout(() => finish(false), JOB_SETTLE_TIMEOUT_MS);
      worker.once('completed', onCompleted);
      worker.once('failed', onFailed);
    });
  }

  getPendingCount(): number {
    if (this.queue) {
      return repo.getQueuedJobs().filter((j) => j.status === 'QUEUED').length;
    }
    return this.local.filter((j) => j.status === 'QUEUED').length;
  }

  async healthCheck(): Promise<QueueHealth> {
    if (!this.useRedis()) {
      const pending = this.local.filter((j) => j.status === 'QUEUED').length;
      if (this.endpoint?.configured) {
        return { ok: false, pendingJobs: pending, activeWorkers: 0, mode: 'BullMQ engine unavailable', error: this.lastError };
      }
      return { ok: true, pendingJobs: pending, activeWorkers: 0, mode: 'In-Process Resilient Queue' };
    }

    try {
      const counts = await withTimeout(
        this.queue!.getJobCounts('waiting', 'delayed', 'active'),
        QUEUE_PING_TIMEOUT_MS,
        'BullMQ getJobCounts'
      );
      const workers = this.worker ? 1 : 0;
      return {
        ok: true,
        pendingJobs: counts.waiting + counts.delayed,
        activeWorkers: workers,
        mode: `Redis BullMQ · ${this.endpoint?.label ?? ''} · ${counts.active} active`,
      };
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      this.lastError = reason;
      return {
        ok: false,
        pendingJobs: this.getPendingCount(),
        activeWorkers: this.worker ? 1 : 0,
        mode: `Redis BullMQ · ${this.endpoint?.label ?? ''} · UNREACHABLE`,
        error: reason,
      };
    }
  }

  private snapshot(): QueueRuntimeSnapshot {
    const engine = this.queue ? 'REDIS_BULLMQ' : 'IN_MEMORY';
    return {
      engine,
      mode: this.queue
        ? `Redis BullMQ · ${this.endpoint?.label ?? ''}${this.worker ? ' · worker attached' : ' · no worker in this process'}`
        : 'In-Process Resilient Queue',
      endpoint: this.endpoint?.label ?? '',
      activeWorkers: this.worker ? 1 : 0,
      lastError: this.lastError,
    };
  }

  async close(): Promise<void> {
    // BullMQ's connections keep retrying when the server is gone, so a plain
    // close() never settles; bound it so shutdown signals always finish.
    const settle = async (p: Promise<unknown>) => {
      await Promise.race([p, new Promise((resolve) => setTimeout(resolve, CLOSE_TIMEOUT_MS))]);
    };
    if (this.worker) {
      const worker = this.worker;
      this.worker = null;
      await settle(worker.close());
    }
    if (this.queue) {
      const queue = this.queue;
      this.queue = null;
      await settle(queue.close());
    }
  }
}

export const queueService = new HybridQueueService();

/** Internal members the process entry points need, without widening the public API. */
interface QueueEngineInternals {
  ensureEngine(): void;
  attachWorker(force?: boolean): boolean;
  endpoint: ResolvedRedisEndpoint | null;
}

const internals = queueService as unknown as QueueEngineInternals;

/**
 * Entry point for the standalone worker process (`npm run worker`). Returns false
 * when no Redis endpoint is configured, so the script can exit with an honest
 * message rather than idling without a queue.
 */
export function startQueueWorker(): boolean {
  return internals.attachWorker(true);
}

export function getQueueEndpointLabel(): string {
  internals.ensureEngine();
  return internals.endpoint?.label ?? '';
}
