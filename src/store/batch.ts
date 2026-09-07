import { create } from 'zustand';

import { ALGORITHM_MAP, type AlgorithmId } from '@/lib/algorithms';
import { cleanExpectedHash, hashesEqual } from '@/lib/compare';
import { baseName, extensionOf } from '@/lib/format';
import { HashCancelledError, hashPool, type SubmittedJob } from '@/lib/hash-pool';
import { parseManifest, type ManifestParseResult } from '@/lib/manifest-parser';
import type { PickedFile } from '@/lib/pick-files';
import type { VerifyStatus } from '@/types';

export interface BatchRow {
  id: string;
  /** Path as written in the manifest, or the dropped file's relative path. */
  name: string;
  basename: string;
  /** Id of the matched `PickedFile`; `null` for missing / unmatched entries. */
  fileId: string | null;
  /** `null` for manifest entries with no matching file. */
  size: number | null;
  expected: string | null;
  actual: string | null;
  algorithm: AlgorithmId;
  status: VerifyStatus;
  error: string | null;
  percent: number;
  bytesPerSecond: number;
  durationMs: number | null;
  /** Manifest line number, for entries that came from a manifest. */
  line: number | null;
}

export interface BatchSummary {
  total: number;
  verified: number;
  failed: number;
  missing: number;
  unlisted: number;
  pending: number;
  hashing: number;
  error: number;
  cancelled: number;
  bytes: number;
}

interface BatchState {
  manifestName: string | null;
  manifest: ManifestParseResult | null;
  manifestError: string | null;
  files: PickedFile[];
  rows: BatchRow[];
  running: boolean;
  /** Set once a run reaches a terminal state for every row. */
  finishedAt: number | null;

  setManifest: (picked: PickedFile, text: string) => void;
  clearManifest: () => void;
  addFiles: (picked: PickedFile[]) => void;
  removeFile: (id: string) => void;
  clearAll: () => void;

  verify: (options: {
    algorithms: AlgorithmId[];
    chunkSizeMb: number;
    hashUnlisted: boolean;
  }) => Promise<void>;
  cancel: () => void;
}

/** Jobs of the current run, kept out of React state so cancelling stays synchronous. */
let activeJobs: SubmittedJob[] = [];
let rowSeq = 0;

function makeRow(partial: Partial<BatchRow> & Pick<BatchRow, 'name' | 'algorithm'>): BatchRow {
  rowSeq += 1;
  return {
    id: `row_${rowSeq}`,
    basename: baseName(partial.name),
    fileId: partial.fileId ?? null,
    size: partial.size ?? null,
    expected: partial.expected ?? null,
    actual: partial.actual ?? null,
    status: partial.status ?? 'pending',
    error: partial.error ?? null,
    percent: partial.percent ?? 0,
    bytesPerSecond: partial.bytesPerSecond ?? 0,
    durationMs: partial.durationMs ?? null,
    line: partial.line ?? null,
    ...partial,
  };
}

/** Files that are obviously manifests, shown separately from payload files. */
export function looksLikeManifest(file: PickedFile): boolean {
  const ext = extensionOf(file.name);
  const name = file.name.toLowerCase();
  return (
    ext === 'sums' ||
    ext === 'sha256' ||
    ext === 'sha512' ||
    ext === 'sha1' ||
    ext === 'md5' ||
    ext === 'asc' ||
    ext === 'sig' ||
    ext === 'txt' ||
    ext === 'csv' ||
    name.includes('sums') ||
    name.endsWith('.sha256sum') ||
    name.endsWith('.md5sum')
  );
}

/**
 * Matches manifest entries against dropped files.
 * 1. exact path match (`dist/app.apk` vs `dist/app.apk`)
 * 2. basename match (`./dist/app.apk` vs `app.apk`)
 * 3. suffix match (`dist/app.apk` vs `release/dist/app.apk`)
 */
function matchFilesToManifest(
  manifest: ManifestParseResult,
  files: PickedFile[],
): Map<number, PickedFile> {
  const byPath = new Map<string, PickedFile>();
  const byBasename = new Map<string, PickedFile>();
  const remaining = new Set<PickedFile>();

  for (const picked of files) {
    byPath.set(picked.relativePath.replace(/\\/g, '/').replace(/^\.\//, ''), picked);
    if (!byBasename.has(picked.name)) byBasename.set(picked.name, picked);
    remaining.add(picked);
  }

  const result = new Map<number, PickedFile>();

  const take = (picked: PickedFile | undefined) => {
    if (!picked || !remaining.has(picked)) return undefined;
    remaining.delete(picked);
    return picked;
  };

  // Pass 1 — exact paths (most reliable).
  manifest.entries.forEach((entry, index) => {
    const hit = take(byPath.get(entry.filename));
    if (hit) result.set(index, hit);
  });

  // Pass 2 — basenames.
  manifest.entries.forEach((entry, index) => {
    if (result.has(index)) return;
    const hit = take(byBasename.get(entry.basename));
    if (hit) result.set(index, hit);
  });

  // Pass 3 — path suffix, for manifests written from a different root directory.
  manifest.entries.forEach((entry, index) => {
    if (result.has(index)) return;
    const suffix = `/${entry.filename}`;
    for (const picked of remaining) {
      const path = `/${picked.relativePath.replace(/\\/g, '/')}`;
      if (path.endsWith(suffix)) {
        const hit = take(picked);
        if (hit) {
          result.set(index, hit);
          break;
        }
      }
    }
  });

  return result;
}

export const useBatchStore = create<BatchState>()((set, get) => ({
  manifestName: null,
  manifest: null,
  manifestError: null,
  files: [],
  rows: [],
  running: false,
  finishedAt: null,

  setManifest: (picked, text) => {
    const parsed = parseManifest(text);
    set({
      manifestName: picked.name,
      manifest: parsed,
      manifestError: parsed.entries.length === 0 ? 'No checksum entries found in that file.' : null,
      rows: [],
      finishedAt: null,
    });
  },

  clearManifest: () =>
    set({ manifestName: null, manifest: null, manifestError: null, rows: [], finishedAt: null }),

  addFiles: (picked) =>
    set((state) => {
      // De-duplicate by relative path + size.
      const seen = new Set(state.files.map((f) => `${f.relativePath}:${f.size}`));
      const next = picked.filter((f) => !seen.has(`${f.relativePath}:${f.size}`));
      return { files: [...state.files, ...next], rows: [], finishedAt: null };
    }),

  removeFile: (id) =>
    set((state) => ({
      files: state.files.filter((file) => file.id !== id),
      rows: [],
      finishedAt: null,
    })),

  clearAll: () => {
    get().cancel();
    set({
      manifestName: null,
      manifest: null,
      manifestError: null,
      files: [],
      rows: [],
      running: false,
      finishedAt: null,
    });
  },

  cancel: () => {
    for (const job of activeJobs) job.cancel();
    activeJobs = [];
    set((state) => ({
      running: false,
      rows: state.rows.map((row) =>
        row.status === 'hashing' || row.status === 'pending'
          ? { ...row, status: 'cancelled' as VerifyStatus }
          : row,
      ),
    }));
  },

  verify: async ({ algorithms, chunkSizeMb, hashUnlisted }) => {
    const { manifest, files } = get();
    if (!manifest || manifest.entries.length === 0) return;

    get().cancel();
    activeJobs = [];

    const matches = matchFilesToManifest(manifest, files);
    const usedFileIds = new Set<string>();
    const rows: BatchRow[] = [];

    // --- rows driven by the manifest --------------------------------------------
    manifest.entries.forEach((entry, index) => {
      const picked = matches.get(index);
      const algorithm =
        entry.algorithm ?? manifest.algorithm ?? algorithms[0] ?? 'sha256';

      if (picked) {
        usedFileIds.add(picked.id);
        rows.push(
          makeRow({
            name: entry.filename,
            algorithm,
            fileId: picked.id,
            size: picked.size,
            expected: entry.hash,
            status: 'pending',
            line: entry.line,
          }),
        );
      } else {
        rows.push(
          makeRow({
            name: entry.filename,
            algorithm,
            expected: entry.hash,
            status: 'missing',
            line: entry.line,
          }),
        );
      }
    });

    // --- dropped files the manifest never mentions ------------------------------
    if (hashUnlisted) {
      const fallback = manifest.algorithm ?? algorithms[0] ?? 'sha256';
      for (const picked of files) {
        if (usedFileIds.has(picked.id)) continue;
        rows.push(
          makeRow({
            name: picked.relativePath || picked.name,
            algorithm: fallback,
            fileId: picked.id,
            size: picked.size,
            expected: null,
            status: 'unlisted',
          }),
        );
      }
    }

    set({ rows, running: true, finishedAt: null });

    // --- run the hashing jobs ----------------------------------------------------
    const jobs = rows
      .map((row, index) => ({ row, index, picked: findFileForRow(row, files) }))
      .filter((entry): entry is { row: BatchRow; index: number; picked: PickedFile } =>
        Boolean(entry.picked),
      )
      .map(({ row, index, picked }) => {
        const job = hashPool.submit({
          file: picked.file,
          algorithms: [row.algorithm],
          chunkSize: chunkSizeMb * 1024 * 1024,
          onProgress: (progress) => {
            // Only push an update when the visible percentage actually moves.
            set((state) => {
              const current = state.rows[index];
              if (!current) return {};
              if (
                Math.floor(current.percent) === Math.floor(progress.percent) &&
                progress.percent < 100
              ) {
                return {};
              }
              const rows = [...state.rows];
              rows[index] = {
                ...current,
                status: 'hashing',
                percent: progress.percent,
                bytesPerSecond: progress.bytesPerSecond,
              };
              return { rows };
            });
          },
        });

        return { row, index, job };
      });

    activeJobs = jobs.map((entry) => entry.job);

    await Promise.all(
      jobs.map(async ({ row, index, job }) => {
        try {
          const outcome = await job.promise;
          const actual = outcome.results[row.algorithm] ?? null;
          const verified = row.expected !== null && hashesEqual(actual, row.expected);

          set((state) => {
            if (!state.rows[index]) return {};
            const rows = [...state.rows];
            rows[index] = {
              ...state.rows[index],
              status: row.expected === null ? 'unlisted' : verified ? 'verified' : 'failed',
              actual,
              percent: 100,
              durationMs: outcome.durationMs,
              bytesPerSecond: outcome.bytesPerSecond,
              error: null,
            };
            return { rows };
          });
        } catch (error) {
          const cancelled = error instanceof HashCancelledError;
          set((state) => {
            if (!state.rows[index]) return {};
            const rows = [...state.rows];
            rows[index] = {
              ...state.rows[index],
              status: cancelled ? 'cancelled' : 'error',
              error: cancelled ? null : error instanceof Error ? error.message : String(error),
            };
            return { rows };
          });
        }
      }),
    );

    activeJobs = [];
    set({ running: false, finishedAt: Date.now() });
  },
}));

function findFileForRow(row: BatchRow, files: PickedFile[]): PickedFile | undefined {
  if (row.fileId) {
    const exact = files.find((picked) => picked.id === row.fileId);
    if (exact) return exact;
  }
  // Fallback for rows that predate `fileId`: match on path, then basename.
  const target = row.name.replace(/\\/g, '/').replace(/^\.\//, '');
  return (
    files.find((picked) => {
      const path = picked.relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
      return path === target;
    }) ?? files.find((picked) => picked.name === row.basename)
  );
}

/** Derives the counters shown above the results table. */
export function summarize(rows: BatchRow[]): BatchSummary {
  return rows.reduce<BatchSummary>(
    (acc, row) => {
      acc.total += 1;
      acc[row.status] += 1;
      acc.bytes += row.size ?? 0;
      return acc;
    },
    {
      total: 0,
      verified: 0,
      failed: 0,
      missing: 0,
      unlisted: 0,
      pending: 0,
      hashing: 0,
      error: 0,
      cancelled: 0,
      bytes: 0,
    },
  );
}

/** Human label for a row's expected digest length, used in the table header. */
export function rowAlgorithmLabel(row: BatchRow): string {
  return ALGORITHM_MAP[row.algorithm]?.label ?? row.algorithm.toUpperCase();
}

/** Re-exported so views can normalise pasted digests the same way the store does. */
export { cleanExpectedHash };
