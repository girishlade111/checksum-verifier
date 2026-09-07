/**
 * hash.worker.ts
 *
 * The heart of the app: streams a File into one or more `hash-wasm` hashers without
 * ever materialising the whole file in memory.
 *
 * Design notes
 * ------------
 * 1. **Chunked streaming.** The file is read with `Blob.slice().arrayBuffer()` one
 *    chunk at a time. Only a single chunk is alive at any moment, so a 32 GB ISO costs
 *    ~16 MB of RAM instead of 32 GB. The previous chunk becomes garbage as soon as the
 *    loop moves on.
 * 2. **Multiple algorithms, one pass.** Every selected hash is fed the *same* chunk in
 *    the same loop iteration, so generating MD5 + SHA-1 + SHA-256 + SHA-512 costs one
 *    disk read instead of four.
 * 3. **Cooperative cancellation.** `file.slice().arrayBuffer()` awaits real I/O, which
 *    yields to the event loop, so an incoming `cancel` message is always processed
 *    between chunks.
 * 4. **Progress back-pressure.** Progress is throttled to ~16 messages/second; a 2 GB
 *    file therefore produces ~130 UI updates instead of thousands.
 */

import { createMD5, createSHA1, createSHA256, createSHA512, type IHasher } from 'hash-wasm';
import type { AlgorithmId } from '../lib/algorithms';
import {
  DEFAULT_CHUNK_SIZE,
  type HashResults,
  type WorkerProgress,
  type WorkerRequest,
  type WorkerResponse,
} from './protocol';

// `self` is typed as `Window` under the DOM lib; casting gives us the worker surface
// without pulling in a second (conflicting) `webworker` lib.
const ctx = self as unknown as Worker;

const HASHER_FACTORIES: Record<AlgorithmId, () => Promise<IHasher>> = {
  md5: createMD5,
  sha1: createSHA1,
  sha256: createSHA256,
  sha512: createSHA512,
};

/** Progress messages are emitted at most this often. */
const PROGRESS_INTERVAL_MS = 60;
/** Throughput is smoothed over this sliding window. */
const SPEED_WINDOW_MS = 600;

interface CancellableJob {
  jobId: string;
  cancelled: boolean;
}

let activeJob: CancellableJob | null = null;

function post(message: WorkerResponse) {
  ctx.postMessage(message);
}

/** Awaitable yield so queued `cancel` messages are always observed. */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function runJob(request: Extract<WorkerRequest, { type: 'hash' }>) {
  const { jobId, file, algorithms, chunkSize = DEFAULT_CHUNK_SIZE } = request;
  const fileSize = file.size;

  const job: CancellableJob = { jobId, cancelled: false };
  activeJob = job;

  const startedAt = performance.now();

  try {
    // ---- 1. Spin up one streaming hasher per requested algorithm -----------------
    const hashers = {} as Record<AlgorithmId, IHasher>;
    for (const algorithm of algorithms) {
      const factory = HASHER_FACTORIES[algorithm];
      if (!factory) throw new Error(`Unsupported algorithm: ${algorithm}`);
      const hasher = await factory();
      hasher.init();
      hashers[algorithm] = hasher;
    }

    if (job.cancelled) {
      post({ type: 'cancelled', jobId });
      return;
    }

    post({ type: 'start', jobId, fileSize, algorithms });

    // ---- 2. Stream the file ------------------------------------------------------
    let offset = 0;
    let lastPostAt = 0;
    let windowStart = performance.now();
    let windowBytes = 0;
    let smoothedSpeed = 0;

    const size = Math.max(1024, Math.min(chunkSize, 64 * 1024 * 1024));

    while (offset < fileSize) {
      if (job.cancelled) {
        post({ type: 'cancelled', jobId });
        return;
      }

      const end = Math.min(offset + size, fileSize);
      const buffer = await file.slice(offset, end).arrayBuffer();
      // One chunk in flight at a time -> constant memory usage regardless of file size.
      const chunk = new Uint8Array(buffer);

      for (const algorithm of algorithms) {
        hashers[algorithm].update(chunk);
      }

      offset = end;
      windowBytes += chunk.byteLength;

      const now = performance.now();
      const windowElapsed = now - windowStart;
      if (windowElapsed >= SPEED_WINDOW_MS) {
        smoothedSpeed = (windowBytes / windowElapsed) * 1000;
        windowStart = now;
        windowBytes = 0;
      }

      if (now - lastPostAt >= PROGRESS_INTERVAL_MS || offset === fileSize) {
        lastPostAt = now;
        const elapsedSeconds = (now - startedAt) / 1000;
        const overallSpeed = elapsedSeconds > 0 ? offset / elapsedSeconds : 0;
        const effectiveSpeed = smoothedSpeed > 0 ? smoothedSpeed : overallSpeed;
        const remaining = fileSize - offset;

        const progress: WorkerProgress = {
          type: 'progress',
          jobId,
          bytesProcessed: offset,
          fileSize,
          percent: fileSize > 0 ? Math.min(100, (offset / fileSize) * 100) : 100,
          bytesPerSecond: effectiveSpeed,
          etaSeconds:
            effectiveSpeed > 0 && remaining > 0
              ? remaining / effectiveSpeed
              : remaining > 0
                ? null
                : 0,
        };
        post(progress);

        // Give the UI thread breathing room between large chunks.
        await yieldToEventLoop();
      }

      // Drop the reference explicitly so the chunk can be collected immediately.
      chunk.fill(0);
    }

    // ---- 3. Finalise -------------------------------------------------------------
    const results: HashResults = {} as HashResults;
    for (const algorithm of algorithms) {
      results[algorithm] = hashers[algorithm].digest('hex') as string;
    }

    const finishedAt = performance.now();
    const durationMs = Math.max(1, finishedAt - startedAt);

    post({
      type: 'done',
      jobId,
      results,
      durationMs,
      bytesPerSecond: (fileSize / durationMs) * 1000,
      fileSize,
    });
  } catch (error) {
    if (job.cancelled) {
      post({ type: 'cancelled', jobId });
      return;
    }
    post({
      type: 'error',
      jobId,
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (activeJob?.jobId === jobId) activeJob = null;
  }
}

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (!message) return;

  switch (message.type) {
    case 'hash':
      void runJob(message);
      break;
    case 'cancel':
      if (activeJob && activeJob.jobId === message.jobId) {
        activeJob.cancelled = true;
      }
      break;
    default:
      break;
  }
};

// The pool waits for this before handing over the first job.
post({ type: 'ready' });

export {};
