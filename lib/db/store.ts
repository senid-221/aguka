import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

/**
 * Durable storage for the operational records this platform must never lose:
 * users, entitlements, trial grants, payment orders, uploaded proofs, road
 * safety content and the audit trail.
 *
 * Scope note: PostgreSQL (via Prisma) is the production datastore and
 * `prisma/schema.prisma` carries the matching models and migration SQL, but the
 * Prisma client is not installed in this build, so live persistence here is an
 * atomic, versioned JSON file plus a private binary directory. Health checks
 * report this honestly instead of claiming a database connection.
 */

const SCHEMA_VERSION = 1;
const FLUSH_DELAY_MS = 400;

export interface Persistable {
  exportState(): Record<string, unknown>;
  hydrateState(state: Record<string, unknown>): void;
}

export interface StoreStatus {
  mode: 'IN_MEMORY_ONLY' | 'FILE_BACKED_JSON';
  filePath: string;
  proofsDir: string;
  loadedFromDisk: boolean;
  lastSavedAt: string | null;
  lastSaveError: string | null;
  records: number;
}

export interface Snapshot {
  schemaVersion: number;
  savedAt: string;
  data: Record<string, unknown>;
}

function resolveDataDir(): string {
  const configured = process.env.AGUKA_DATA_DIR;
  if (configured && configured.trim()) return path.resolve(process.cwd(), configured.trim());
  return path.join(process.cwd(), '.aguka-data');
}

class DurableStore {
  private dir: string;
  private snapshotFile: string;
  private proofsDir: string;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private lastSerialized: string | null = null;
  private target: Persistable | null = null;
  readonly status: StoreStatus;

  constructor() {
    this.dir = resolveDataDir();
    this.snapshotFile = path.join(this.dir, 'repository-snapshot.json');
    this.proofsDir = path.join(this.dir, 'proofs');
    this.status = {
      mode: 'FILE_BACKED_JSON',
      filePath: this.snapshotFile,
      proofsDir: this.proofsDir,
      loadedFromDisk: false,
      lastSavedAt: null,
      lastSaveError: null,
      records: 0,
    };
  }

  get dataDir(): string {
    return this.dir;
  }

  /** Reads the previous snapshot and keeps it in sync with the repository singleton. */
  attach(target: Persistable): void {
    if (this.target === target) return;
    this.target = target;
    try {
      if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
      if (!existsSync(this.proofsDir)) mkdirSync(this.proofsDir, { recursive: true });
    } catch (err: unknown) {
      this.status.mode = 'IN_MEMORY_ONLY';
      this.status.lastSaveError = `Cannot create ${this.dir}: ${messageOf(err)}`;
      return;
    }

    if (!existsSync(this.snapshotFile)) return;

    try {
      const raw = readFileSync(this.snapshotFile, 'utf8');
      const parsed = JSON.parse(raw) as Snapshot;
      if (parsed.schemaVersion !== SCHEMA_VERSION) {
        this.status.lastSaveError = `Snapshot schema v${parsed.schemaVersion} is not readable by v${SCHEMA_VERSION}; starting empty.`;
        return;
      }
      target.hydrateState(parsed.data || {});
      this.status.loadedFromDisk = true;
      this.status.lastSavedAt = parsed.savedAt;
      this.lastSerialized = raw;
    } catch (err: unknown) {
      this.status.lastSaveError = `Snapshot unreadable, starting empty: ${messageOf(err)}`;
    }
  }

  /** Schedules a debounced, atomic flush of the current repository state. */
  scheduleSave(source: Persistable): void {
    if (!this.target || this.status.mode === 'IN_MEMORY_ONLY') return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.writeChain = this.writeChain.then(() => this.flushNow(source)).catch(() => undefined);
    }, FLUSH_DELAY_MS);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  flushNow(source: Persistable): void {
    const data = source.exportState();
    let records = 0;
    for (const value of Object.values(data)) {
      if (Array.isArray(value)) records += value.length;
    }
    this.status.records = records;

    const snapshot: Snapshot = {
      schemaVersion: SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      data,
    };
    const serialized = JSON.stringify(snapshot);
    if (serialized === this.lastSerialized) return;

    const tempFile = `${this.snapshotFile}.${process.pid}.tmp`;
    try {
      writeFileSync(tempFile, serialized, 'utf8');
      renameSync(tempFile, this.snapshotFile);
      this.lastSerialized = serialized;
      this.status.lastSavedAt = snapshot.savedAt;
      this.status.lastSaveError = null;
    } catch (err: unknown) {
      this.status.lastSaveError = messageOf(err);
      try {
        if (existsSync(tempFile)) renameSync(tempFile, `${this.snapshotFile}.failed-${Date.now()}`);
      } catch {
        // A leftover temp file must not mask the original error.
      }
    }
  }

  /**
   * Stores payment proof bytes outside the web root so they cannot be fetched by
   * guessing a URL. Returns an opaque key plus the integrity hash.
   */
  saveBinary(buffer: Buffer, mimeHint: string): { key: string; sha256: string; sizeBytes: number; mimeHint: string } {
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const key = `${randomUUID()}-${sha256.slice(0, 16)}`;
    if (!existsSync(this.proofsDir)) mkdirSync(this.proofsDir, { recursive: true });
    writeFileSync(path.join(this.proofsDir, `${key}.bin`), buffer);
    return { key, sha256, sizeBytes: buffer.length, mimeHint };
  }

  readBinary(key: string): Buffer | null {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[0-9a-f]{16}$/.test(key)) {
      return null;
    }
    const file = path.join(this.proofsDir, `${key}.bin`);
    if (!existsSync(file)) return null;
    return readFileSync(file);
  }

  deleteBinary(key: string): boolean {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[0-9a-f]{16}$/.test(key)) {
      return false;
    }
    const file = path.join(this.proofsDir, `${key}.bin`);
    if (!existsSync(file)) return false;
    renameSync(file, `${file}.deleted`);
    return true;
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const globalRef = globalThis as unknown as { __agukaDurableStore?: DurableStore };
export const durableStore = globalRef.__agukaDurableStore ?? new DurableStore();
globalRef.__agukaDurableStore = durableStore;

/**
 * Wraps the repository singleton so every method call flushes durable state.
 * Called before the first request touches the repository.
 */
export function withPersistence<T extends Persistable>(instance: T): T {
  const g = globalThis as unknown as { __agukaPersistedRepository?: T };
  if (g.__agukaPersistedRepository) return g.__agukaPersistedRepository;

  const proxy = new Proxy(instance, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;
      const fn = value as (...args: unknown[]) => unknown;
      return (...args: unknown[]) => {
        const result = fn.apply(target, args);
        durableStore.scheduleSave(target);
        return result;
      };
    },
  }) as T;

  durableStore.attach(instance);
  g.__agukaPersistedRepository = proxy;
  return proxy;
}
