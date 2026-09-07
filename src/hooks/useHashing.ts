import { useCallback, useEffect, useRef, useState } from 'react';

import type { AlgorithmId } from '@/lib/algorithms';
import {
  HashCancelledError,
  hashPool,
  type HashJobOutcome,
  type HashProgress,
  type SubmittedJob,
} from '@/lib/hash-pool';
import { useSettings } from '@/store/settings';
import type { HashResults } from '@/workers/protocol';

export type HashPhase = 'idle' | 'hashing' | 'done' | 'cancelled' | 'error';

export interface UseHashingResult {
  phase: HashPhase;
  progress: HashProgress | null;
  results: HashResults | null;
  outcome: HashJobOutcome | null;
  error: string | null;
  /** True once at least one worker has compiled its wasm modules. */
  warm: boolean;
  hashFile: (file: File, algorithms: AlgorithmId[]) => Promise<HashResults | null>;
  cancel: () => void;
  reset: () => void;
}

/**
 * Bridge between React and the worker pool.
 *
 * The pool is a singleton shared by every view, so `warmUp()` is cheap after the first
 * call — we fire it on mount to hide the ~50 ms wasm compile behind the initial paint.
 */
export function useHashing(): UseHashingResult {
  const [phase, setPhase] = useState<HashPhase>('idle');
  const [progress, setProgress] = useState<HashProgress | null>(null);
  const [results, setResults] = useState<HashResults | null>(null);
  const [outcome, setOutcome] = useState<HashJobOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warm, setWarm] = useState(false);

  const jobRef = useRef<SubmittedJob | null>(null);
  const aliveRef = useRef(true);

  const chunkSizeMb = useSettings((s) => s.chunkSizeMb);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      jobRef.current?.cancel();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void hashPool.warmUp().then(() => {
      if (!cancelled && aliveRef.current) setWarm(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const reset = useCallback(() => {
    jobRef.current?.cancel();
    jobRef.current = null;
    setPhase('idle');
    setProgress(null);
    setResults(null);
    setOutcome(null);
    setError(null);
  }, []);

  const cancel = useCallback(() => {
    jobRef.current?.cancel();
    jobRef.current = null;
    setPhase('cancelled');
  }, []);

  const hashFile = useCallback(
    async (file: File, algorithms: AlgorithmId[]) => {
      jobRef.current?.cancel();

      setPhase('hashing');
      setProgress({
        bytesProcessed: 0,
        fileSize: file.size,
        percent: 0,
        bytesPerSecond: 0,
        etaSeconds: null,
      });
      setResults(null);
      setOutcome(null);
      setError(null);

      const submitted = hashPool.submit({
        file,
        algorithms,
        chunkSize: chunkSizeMb * 1024 * 1024,
        onProgress: (value) => {
          if (!aliveRef.current) return;
          setProgress(value);
        },
      });

      jobRef.current = submitted;

      try {
        const result = await submitted.promise;
        if (!aliveRef.current) return null;

        setResults(result.results);
        setOutcome(result);
        setProgress({
          bytesProcessed: result.fileSize,
          fileSize: result.fileSize,
          percent: 100,
          bytesPerSecond: result.bytesPerSecond,
          etaSeconds: 0,
        });
        setPhase('done');
        return result.results;
      } catch (caught) {
        if (!aliveRef.current) return null;

        if (caught instanceof HashCancelledError) {
          setPhase('cancelled');
        } else {
          setError(caught instanceof Error ? caught.message : String(caught));
          setPhase('error');
        }
        return null;
      } finally {
        if (jobRef.current?.jobId === submitted.jobId) jobRef.current = null;
      }
    },
    [chunkSizeMb],
  );

  return { phase, progress, results, outcome, error, warm, hashFile, cancel, reset };
}
