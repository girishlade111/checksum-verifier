/**
 * A tiny worker pool around `hash.worker.ts`.
 *
 * Why a pool instead of one worker? A single worker can only hash one file at a time,
 * which would serialise batch verification. A pool of `min(cores - 1, 4)` workers keeps
 * the UI thread free while several files are digested in parallel.
 */

import type { AlgorithmId } from './algorithms';
import { clamp } from './utils';
import {
  DEFAULT_CHUNK_SIZE,
  type HashResults,
  type WorkerRequest,
  type WorkerResponse,
} from '../workers/protocol';

export class HashCancelledError extends Error {
  constructor() {
    super('Hashing cancelled');
    this.name = 'HashCancelledError';
  }
}

export interface HashProgress {
  bytesProcessed: number;
  fileSize: number;
  percent: number;
  bytesPerSecond: number;
  etaSeconds: number | null;
}

export interface HashJobOptions {
  file: File;
  algorithms: AlgorithmId[];
  chunkSize?: number;
  onProgress?: (progress: HashProgress) => void;
}

export interface HashJobOutcome {
  results: HashResults;
  durationMs: number;
  bytesPerSecond: number;
  fileSize: number;
}

export interface SubmittedJob {
  jobId: string;
  promise: Promise<HashJobOutcome>;
  cancel: () => void;
}

type ProgressHandler = (progress: HashProgress) => void;

export interface PoolStats {
  workers: number;
  busy: number;
  queued: number;
  maxWorkers: number;
}

interface ActiveJob {
  jobId: string;
  request: Omit<Extract<WorkerRequest, { type: 'hash' }>, 'type'>;
  onProgress?: ProgressHandler;
  resolve: (outcome: HashJobOutcome) => void;
  reject: (error: Error) => void;
  /** True once the request has actually been handed to a worker. */
  dispatched: boolean;
  /** True when `cancel()` arrived before the worker ever received the request. */
  cancelled: boolean;
}

type QueuedJob = ActiveJob;

interface PooledWorker {
  id: number;
  worker: Worker;
  ready: Promise<void>;
  job: ActiveJob | null;
  markReady: () => void;
}

/**
 * How long we wait for a freshly spawned worker to report `ready`. Without this, a
 * worker that fails while compiling its wasm modules would leave the job pending
 * forever with no visible error.
 */
const READY_TIMEOUT_MS = 20_000;

function defaultConcurrency() {
  const cores =
    typeof navigator !== 'undefined' && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 4;
  return clamp(cores - 1, 1, 4);
}

export class HashWorkerPool {
  private workers: PooledWorker[] = [];
  private queue: QueuedJob[] = [];
  private seq = 0;
  private nextWorkerId = 1;
  private listeners = new Set<(stats: PoolStats) => void>();

  constructor(public maxWorkers: number = defaultConcurrency()) {}

  /* ------------------------------- public API ------------------------------- */

  submit(options: HashJobOptions): SubmittedJob {
    const jobId = `job_${++this.seq}_${Date.now().toString(36)}`;

    let resolveRef!: (outcome: HashJobOutcome) => void;
    let rejectRef!: (error: Error) => void;

    const promise = new Promise<HashJobOutcome>((resolve, reject) => {
      resolveRef = resolve;
      rejectRef = reject;
    });

    const job: QueuedJob = {
      jobId,
      request: {
        jobId,
        file: options.file,
        algorithms: options.algorithms,
        chunkSize: options.chunkSize ?? DEFAULT_CHUNK_SIZE,
      },
      onProgress: options.onProgress,
      resolve: resolveRef,
      reject: rejectRef,
      dispatched: false,
      cancelled: false,
    };

    this.queue.push(job);
    this.pump();
    this.emitStats();

    return {
      jobId,
      promise,
      cancel: () => this.cancel(jobId),
    };
  }

  cancel(jobId: string) {
    // Not started yet -> drop from the queue.
    const queuedIndex = this.queue.findIndex((job) => job.jobId === jobId);
    if (queuedIndex >= 0) {
      const [job] = this.queue.splice(queuedIndex, 1);
      job.reject(new HashCancelledError());
      this.emitStats();
      return;
    }

    // Assigned to a worker -> either stop it mid-stream, or, if the request has not
    // been handed over yet, flag it so the deferred dispatch drops the job instead of
    // starting work that was already cancelled.
    for (const pooled of this.workers) {
      if (pooled.job?.jobId === jobId) {
        const job = pooled.job;
        if (job.dispatched) {
          pooled.worker.postMessage({ type: 'cancel', jobId } satisfies WorkerRequest);
        } else {
          job.cancelled = true;
        }
        return;
      }
    }
  }

  cancelAll() {
    for (const job of [...this.queue]) this.cancel(job.jobId);
    for (const pooled of this.workers) {
      if (pooled.job) this.cancel(pooled.job.jobId);
    }
  }

  /** Pre-spawns workers so the first hash does not pay the wasm compile cost. */
  warmUp(count = this.maxWorkers) {
    for (let i = 0; i < Math.min(count, this.maxWorkers); i += 1) {
      this.spawn();
    }

    const pending = this.workers.map((w) => w.ready);
    if (pending.length === 0) return Promise.resolve();

    // `allSettled` + timeout: a worker that fails while compiling its wasm modules is
    // removed by `onerror`, and its `ready` promise then never settles. Awaiting it
    // naively would leave callers (and the skeleton UI) waiting forever.
    return Promise.race([
      Promise.allSettled(pending),
      new Promise<void>((resolve) => {
        setTimeout(resolve, READY_TIMEOUT_MS);
      }),
    ]);
  }

  getStats(): PoolStats {
    return {
      workers: this.workers.length,
      busy: this.workers.filter((w) => w.job !== null).length,
      queued: this.queue.length,
      maxWorkers: this.maxWorkers,
    };
  }

  onStatsChange(listener: (stats: PoolStats) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  terminate() {
    this.cancelAll();
    for (const pooled of this.workers) pooled.worker.terminate();
    this.workers = [];
    this.emitStats();
  }

  /* -------------------------------- internals ------------------------------- */

  private emitStats() {
    const stats = this.getStats();
    for (const listener of this.listeners) listener(stats);
  }

  private spawn(): PooledWorker {
    let markReady: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
      markReady = resolve;
    });

    const worker = new Worker(new URL('../workers/hash.worker.ts', import.meta.url), {
      type: 'module',
      name: `hash-worker-${this.nextWorkerId}`,
    });

    const pooled: PooledWorker = {
      id: this.nextWorkerId++,
      worker,
      ready,
      job: null,
      markReady,
    };

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (!message) return;

      if (message.type === 'ready') {
        pooled.markReady();
        return;
      }

      const job = pooled.job;
      if (!job || job.jobId !== message.jobId) return;

      switch (message.type) {
        case 'progress': {
          job.onProgress?.({
            bytesProcessed: message.bytesProcessed,
            fileSize: message.fileSize,
            percent: message.percent,
            bytesPerSecond: message.bytesPerSecond,
            etaSeconds: message.etaSeconds,
          });
          break;
        }
        case 'done':
          pooled.job = null;
          job.resolve({
            results: message.results,
            durationMs: message.durationMs,
            bytesPerSecond: message.bytesPerSecond,
            fileSize: message.fileSize,
          });
          this.pump();
          this.emitStats();
          break;
        case 'cancelled':
          pooled.job = null;
          job.reject(new HashCancelledError());
          this.pump();
          this.emitStats();
          break;
        case 'error':
          pooled.job = null;
          job.reject(new Error(message.message));
          this.pump();
          this.emitStats();
          break;
        default:
          break;
      }
    };

    worker.onerror = (event) => {
      const job = pooled.job;
      pooled.job = null;
      if (job) {
        job.reject(new Error(event.message || 'Hashing worker crashed'));
      }
      // Replace the broken worker with a fresh one.
      this.workers = this.workers.filter((w) => w.id !== pooled.id);
      worker.terminate();
      this.pump();
      this.emitStats();
    };

    this.workers.push(pooled);
    return pooled;
  }

  private pump() {
    if (this.queue.length === 0) return;

    let pooled =
      this.workers.find((w) => w.job === null) ??
      (this.workers.length < this.maxWorkers ? this.spawn() : undefined);

    while (pooled && this.queue.length > 0) {
      const job = this.queue.shift()!;

      // IMPORTANT: capture the owning worker in a `const`. Declaring it with `let` in
      // the enclosing scope and reading it inside the async callback would capture the
      // *binding*, so by the time the microtask ran it would already point at the next
      // worker (or undefined) and the guard below would always bail out — the request
      // was never posted and the job hung in `hashing` forever.
      const target = pooled;
      target.job = job;

      const watchdog = setTimeout(() => {
        if (job.dispatched || target.job?.jobId !== job.jobId) return;
        target.job = null;
        job.reject(
          new Error(
            'The hashing worker did not start within 20 seconds. Reload the page and try again.',
          ),
        );
        this.pump();
        this.emitStats();
      }, READY_TIMEOUT_MS);

      void target.ready.then(() => {
        clearTimeout(watchdog);
        if (target.job?.jobId !== job.jobId) return;

        // Cancelled while the worker was still compiling / booting.
        if (job.cancelled) {
          target.job = null;
          job.reject(new HashCancelledError());
          this.pump();
          this.emitStats();
          return;
        }

        job.dispatched = true;
        target.worker.postMessage({ type: 'hash', ...job.request } satisfies WorkerRequest);
      });

      pooled =
        this.workers.find((w) => w.job === null) ??
        (this.workers.length < this.maxWorkers ? this.spawn() : undefined);
    }

    this.emitStats();
  }
}

/** Shared singleton used by every feature view. */
export const hashPool = new HashWorkerPool();
