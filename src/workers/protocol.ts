import type { AlgorithmId } from '../lib/algorithms';

/** Chunk size used while streaming a file into the hashing worker. */
export const DEFAULT_CHUNK_SIZE = 16 * 1024 * 1024; // 16 MB — tune up to 64MB on beefier machines

export type HashResults = Record<AlgorithmId, string>;

/* ------------------------------- main -> worker ------------------------------ */

export type WorkerRequest =
  | {
      type: 'hash';
      jobId: string;
      file: File;
      algorithms: AlgorithmId[];
      chunkSize?: number;
    }
  | { type: 'cancel'; jobId: string };

/* ------------------------------- worker -> main ------------------------------ */

export interface WorkerProgress {
  type: 'progress';
  jobId: string;
  /** Bytes already fed into the hashers. */
  bytesProcessed: number;
  fileSize: number;
  /** 0 - 100 */
  percent: number;
  /** Smoothed, recent throughput (not the lifetime average). */
  bytesPerSecond: number;
  /** Remaining seconds, or `null` while the estimate is still unstable. */
  etaSeconds: number | null;
}

export type WorkerResponse =
  /** Sent once per worker when the wasm modules are compiled and ready. */
  | { type: 'ready' }
  | { type: 'start'; jobId: string; fileSize: number; algorithms: AlgorithmId[] }
  | WorkerProgress
  | {
      type: 'done';
      jobId: string;
      results: HashResults;
      durationMs: number;
      bytesPerSecond: number;
      fileSize: number;
    }
  | { type: 'cancelled'; jobId: string }
  | { type: 'error'; jobId: string; message: string };
