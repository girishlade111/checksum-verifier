import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Eraser, Fingerprint, Play, ShieldCheck, Square } from 'lucide-react';

import { ALGORITHMS, ALGORITHM_MAP, type AlgorithmId } from '@/lib/algorithms';
import { inspectExpectedHash } from '@/lib/compare';
import { cn } from '@/lib/utils';
import { formatElapsed, formatSpeed } from '@/lib/format';
import type { PickedFile } from '@/lib/pick-files';
import { useHashing } from '@/hooks/useHashing';
import { useSettings } from '@/store/settings';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Dropzone } from '@/components/shared/Dropzone';
import { ProgressBar, type ProgressState } from '@/components/shared/ProgressBar';
import { HashValue } from '@/components/shared/HashValue';
import { SelectedFile } from '@/components/shared/SelectedFile';
import { VerdictBadge } from '@/components/shared/ResultBadge';

function progressState(phase: ReturnType<typeof useHashing>['phase']): ProgressState {
  switch (phase) {
    case 'hashing':
      return 'active';
    case 'done':
      return 'success';
    case 'error':
      return 'error';
    default:
      return 'idle';
  }
}

export function SingleVerifier() {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [expected, setExpected] = useState('');
  const [algorithm, setAlgorithm] = useState<AlgorithmId>('sha256');

  const uppercaseHashes = useSettings((s) => s.uppercaseHashes);
  const autoDetectAlgorithm = useSettings((s) => s.autoDetectAlgorithm);
  const chunkSizeMb = useSettings((s) => s.chunkSizeMb);

  const hashing = useHashing();
  const { phase, progress, results, outcome, error, warm } = hashing;

  const expectedInfo = useMemo(
    () => inspectExpectedHash(expected, algorithm),
    [expected, algorithm],
  );

  // Auto-switch the algorithm when the pasted digest has a recognisable length.
  useEffect(() => {
    if (autoDetectAlgorithm && expectedInfo.detected) {
      setAlgorithm((current) => (current === expectedInfo.detected ? current : expectedInfo.detected!));
    }
  }, [autoDetectAlgorithm, expectedInfo.detected]);

  const hasExpected = expectedInfo.value.length > 0;
  const canRun = Boolean(file) && (!hasExpected || expectedInfo.valid);
  const isBusy = phase === 'hashing';

  const actual = results ? results[algorithm] : null;
  const verdict = useMemo(() => {
    if (phase !== 'done' || !actual) return null;
    if (!hasExpected) {
      return { status: 'verified' as const, title: 'Hash generated', description: 'No expected digest was supplied, so nothing was compared.' };
    }
    const match = actual.toLowerCase() === expectedInfo.value.toLowerCase();
    return match
      ? {
          status: 'verified' as const,
          title: 'Match — file is intact',
          description: `The ${ALGORITHM_MAP[algorithm].label} digest matches the value you supplied. The file was not corrupted or altered in transit.`,
        }
      : {
          status: 'failed' as const,
          title: 'Mismatch — do not trust this file',
          description:
            'The digests differ. Re-download from the official source and check that you compared against a digest published by the vendor over HTTPS.',
        };
  }, [actual, algorithm, expectedInfo.value, hasExpected, phase]);

  const run = () => {
    if (!file) return;
    void hashing.hashFile(file.file, [algorithm]);
  };

  const resetAll = () => {
    hashing.reset();
    setFile(null);
    setExpected('');
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* ------------------------------- left column ------------------------------ */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Fingerprint className="size-4 text-primary" aria-hidden="true" />
              1 — Choose the file
            </CardTitle>
            <CardDescription>
              The file never leaves your device. It is read in {chunkSizeMb} MB chunks inside a Web
              Worker.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <AnimatePresence mode="wait">
              {file ? (
                <SelectedFile
                  key={file.id}
                  picked={file}
                  onRemove={isBusy ? undefined : () => { hashing.reset(); setFile(null); }}
                  right={
                    <Badge variant="muted">{ALGORITHM_MAP[algorithm].label}</Badge>
                  }
                />
              ) : (
                <Dropzone
                  key="dropzone"
                  multiple={false}
                  title="Drop a file to verify"
                  subtitle="APK, ISO, ZIP, DMG — any file, any size"
                  hint="Happens entirely offline. Nothing is uploaded."
                  onFiles={(picked) => {
                    hashing.reset();
                    setFile(picked[0] ?? null);
                  }}
                />
              )}
            </AnimatePresence>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
              2 — Paste the expected hash
            </CardTitle>
            <CardDescription>
              Optional. Leave it empty to simply generate the digest.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
              <div className="space-y-2">
                <Label htmlFor="expected-hash">Expected digest</Label>
                <Input
                  id="expected-hash"
                  value={expected}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="e.g. 3a7bd3e2360a… or sha256:3a7bd3e2360a…"
                  className="font-mono text-xs"
                  aria-invalid={hasExpected && !expectedInfo.valid}
                  aria-describedby="expected-hash-help"
                  onChange={(event) => setExpected(event.target.value)}
                />
                <p
                  id="expected-hash-help"
                  className={cn(
                    'text-xs',
                    hasExpected && !expectedInfo.valid && 'text-destructive',
                    hasExpected && expectedInfo.valid && expectedInfo.reason && 'text-warning',
                    (!hasExpected ||
                      (hasExpected && expectedInfo.valid && !expectedInfo.reason)) &&
                      'text-muted-foreground',
                  )}
                >
                  {!hasExpected
                    ? `Expecting ${ALGORITHM_MAP[algorithm].hexLength} hex characters for ${ALGORITHM_MAP[algorithm].label}.`
                    : (expectedInfo.reason ??
                      `Detected ${ALGORITHM_MAP[expectedInfo.detected!].label} (${expectedInfo.value.length} characters).`)}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="algorithm">Algorithm</Label>
                <Select
                  value={algorithm}
                  onValueChange={(value) => setAlgorithm(value as AlgorithmId)}
                >
                  <SelectTrigger id="algorithm" aria-label="Hashing algorithm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALGORITHMS.map((meta) => (
                      <SelectItem key={meta.id} value={meta.id}>
                        <span className="flex items-center gap-2">
                          {meta.label}
                          {!meta.secure && (
                            <span className="text-[10px] text-muted-foreground">(legacy)</span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{ALGORITHM_MAP[algorithm].note}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={run} disabled={!canRun || isBusy}>
                {isBusy ? (
                  <Square className="size-4 fill-current" aria-hidden="true" />
                ) : (
                  <Play className="size-4" aria-hidden="true" />
                )}
                {isBusy ? 'Hashing…' : hasExpected ? 'Verify file' : 'Generate hash'}
              </Button>

              {isBusy && (
                <Button variant="outline" onClick={hashing.cancel}>
                  Cancel
                </Button>
              )}

              {(file || expected || phase !== 'idle') && (
                <Button variant="ghost" onClick={resetAll} disabled={isBusy}>
                  <Eraser className="size-4" aria-hidden="true" />
                  Reset
                </Button>
              )}

              {!ALGORITHM_MAP[algorithm].secure && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="warning" tabIndex={0}>
                      Not collision resistant
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    {ALGORITHM_MAP[algorithm].label} can be forged. It only proves the file was not
                    corrupted, not that it is authentic.
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------ right column ----------------------------- */}
      <div className="space-y-6">
        <Card className="lg:sticky lg:top-6">
          <CardHeader>
            <CardTitle>Result</CardTitle>
            <CardDescription>
              {phase === 'idle'
                ? 'Waiting for a file.'
                : phase === 'hashing'
                  ? 'Streaming the file through the worker…'
                  : phase === 'cancelled'
                    ? 'Cancelled.'
                    : phase === 'error'
                      ? 'Something went wrong.'
                      : 'Finished.'}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {!warm && phase !== 'idle' ? (
              <div className="space-y-3">
                <Skeleton className="h-2.5 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : (
              <>
                <AnimatePresence mode="wait">
                  {(phase === 'hashing' || phase === 'done') && progress && (
                    <motion.div
                      key="progress"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <ProgressBar
                        value={progress.percent}
                        state={progressState(phase)}
                        bytesProcessed={progress.bytesProcessed}
                        fileSize={progress.fileSize}
                        bytesPerSecond={progress.bytesPerSecond}
                        etaSeconds={progress.etaSeconds}
                        label={file?.name}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {phase === 'error' && (
                  <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                    {error ?? 'The hashing worker reported an error.'}
                  </div>
                )}

                {phase === 'cancelled' && (
                  <div className="rounded-xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
                    Verification cancelled before completion.
                  </div>
                )}

                {verdict && (
                  <VerdictBadge
                    status={verdict.status}
                    title={verdict.title}
                    description={verdict.description}
                  />
                )}

                {actual && (
                  <div className="space-y-2">
                    {hasExpected && (
                      <HashValue
                        label={`Expected · ${ALGORITHM_MAP[algorithm].label}`}
                        value={expectedInfo.value}
                        uppercase={uppercaseHashes}
                        tone="muted"
                      />
                    )}
                    <HashValue
                      label={`Computed · ${ALGORITHM_MAP[algorithm].label}`}
                      value={actual}
                      uppercase={uppercaseHashes}
                      tone={verdict?.status === 'failed' ? 'danger' : 'success'}
                    />
                  </div>
                )}

                {outcome && phase === 'done' && (
                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border border-border/50 bg-background/40 p-2">
                      <dt className="text-muted-foreground">Throughput</dt>
                      <dd className="font-mono tabular-nums">{formatSpeed(outcome.bytesPerSecond)}</dd>
                    </div>
                    <div className="rounded-lg border border-border/50 bg-background/40 p-2">
                      <dt className="text-muted-foreground">Elapsed</dt>
                      <dd className="font-mono tabular-nums">{formatElapsed(outcome.durationMs)}</dd>
                    </div>
                  </dl>
                )}

                {phase === 'idle' && (
                  <p className="rounded-xl border border-dashed border-border/60 p-4 text-xs leading-relaxed text-muted-foreground">
                    Drag a file in, paste the digest published alongside the download, and press
                    Verify. Chrome, Edge, Firefox and Safari are all supported — the hashing runs in
                    WebAssembly workers.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
