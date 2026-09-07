import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Binary, Download, Eraser, Layers, Play, Square } from 'lucide-react';

import {
  ALGORITHMS,
  ALL_ALGORITHM_IDS,
  ALGORITHM_MAP,
  type AlgorithmId,
} from '@/lib/algorithms';
import { formatBytes, formatElapsed, formatSpeed } from '@/lib/format';
import { downloadTextFile } from '@/lib/manifest-parser';
import type { PickedFile } from '@/lib/pick-files';
import { cn } from '@/lib/utils';
import { useHashing } from '@/hooks/useHashing';
import { useSettings } from '@/store/settings';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Dropzone } from '@/components/shared/Dropzone';
import { ProgressBar } from '@/components/shared/ProgressBar';
import { HashValue } from '@/components/shared/HashValue';
import { SelectedFile } from '@/components/shared/SelectedFile';

export function HashGenerator() {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [selected, setSelected] = useState<AlgorithmId[]>([...ALL_ALGORITHM_IDS]);

  const uppercaseHashes = useSettings((s) => s.uppercaseHashes);
  const hashing = useHashing();
  const { phase, progress, results, outcome, warm } = hashing;

  const isBusy = phase === 'hashing';
  const canRun = Boolean(file) && selected.length > 0 && !isBusy;

  const toggle = (id: AlgorithmId) => {
    setSelected((current) => {
      const next = current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id];
      // Keep a deterministic order so the result cards never jump around.
      return ALL_ALGORITHM_IDS.filter((value) => next.includes(value));
    });
    hashing.reset();
  };

  const run = () => {
    if (!file) return;
    void hashing.hashFile(file.file, selected);
  };

  const exportHashes = () => {
    if (!file || !results) return;
    const lines = [`# ${file.name} — ${formatBytes(file.size)}`, ''];
    for (const id of selected) {
      const digest = results[id];
      if (!digest) continue;
      lines.push(`${ALGORITHM_MAP[id].label.padEnd(8)} ${uppercaseHashes ? digest.toUpperCase() : digest}`);
    }
    downloadTextFile(`${file.name}.hashes.txt`, lines.join('\n'));
  };

  const summary = useMemo(() => {
    if (!outcome) return null;
    return `Hashed ${formatBytes(outcome.fileSize)} across ${selected.length} algorithm${selected.length === 1 ? '' : 's'} in ${formatElapsed(outcome.durationMs)}.`;
  }, [outcome, selected.length]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Binary className="size-4 text-primary" aria-hidden="true" />
              Choose a file
            </CardTitle>
            <CardDescription>
              Every selected algorithm is computed in a single pass over the file, so hashing four
              algorithms costs the same disk read as one.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <AnimatePresence mode="wait">
              {file ? (
                <SelectedFile
                  key={file.id}
                  picked={file}
                  onRemove={
                    isBusy
                      ? undefined
                      : () => {
                          hashing.reset();
                          setFile(null);
                        }
                  }
                />
              ) : (
                <Dropzone
                  key="dropzone"
                  multiple={false}
                  title="Drop any file"
                  subtitle="All four digests are produced at once"
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
              <Layers className="size-4 text-primary" aria-hidden="true" />
              Algorithms
            </CardTitle>
            <CardDescription>
              Deselect the ones you do not need to cut the work — and the wait — roughly in half.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {ALGORITHMS.map((meta) => {
                const active = selected.includes(meta.id);
                return (
                  <button
                    key={meta.id}
                    type="button"
                    role="switch"
                    aria-checked={active}
                    disabled={isBusy}
                    onClick={() => toggle(meta.id)}
                    className={cn(
                      'group flex items-start gap-3 rounded-xl border p-3 text-left transition-all',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      active
                        ? 'border-primary/50 bg-primary/10 shadow-glow'
                        : 'border-border/60 bg-card/40 hover:border-border hover:bg-card/70',
                      isBusy && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background',
                      )}
                      aria-hidden="true"
                    >
                      {active && (
                        <svg viewBox="0 0 12 12" className="size-3" fill="none">
                          <path
                            d="M2.5 6.5l2.2 2.2L9.5 4"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>

                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{meta.label}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {meta.hexLength} hex
                        </span>
                        {!meta.secure && (
                          <span className="rounded bg-warning/15 px-1 text-[10px] font-medium text-warning">
                            legacy
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                        {meta.note}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button onClick={run} disabled={!canRun}>
                {isBusy ? (
                  <Square className="size-4 fill-current" aria-hidden="true" />
                ) : (
                  <Play className="size-4" aria-hidden="true" />
                )}
                {isBusy ? 'Hashing…' : 'Compute digests'}
              </Button>

              {isBusy && (
                <Button variant="outline" onClick={hashing.cancel}>
                  Cancel
                </Button>
              )}

              <Button
                variant="ghost"
                onClick={() => {
                  hashing.reset();
                  setFile(null);
                }}
                disabled={isBusy || !file}
              >
                <Eraser className="size-4" aria-hidden="true" />
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* --------------------------------- results -------------------------------- */}
      <Card className="h-fit lg:sticky lg:top-6">
        <CardHeader>
          <CardTitle>Digests</CardTitle>
          <CardDescription>
            {phase === 'done' && summary ? summary : 'Results appear here once hashing finishes.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!warm && phase !== 'idle' ? (
            <div className="space-y-3">
              <Skeleton className="h-2.5 w-full" />
              {selected.map((id) => (
                <Skeleton key={id} className="h-[68px] w-full" />
              ))}
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
                      state={phase === 'done' ? 'success' : 'active'}
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
                  {hashing.error ?? 'The hashing worker reported an error.'}
                </div>
              )}

              <div className="space-y-2">
                {selected.map((id, index) => (
                  <motion.div
                    key={id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: results ? index * 0.06 : 0, duration: 0.3 }}
                  >
                    <HashValue
                      label={ALGORITHM_MAP[id].label}
                      value={results?.[id] ?? ''}
                      uppercase={uppercaseHashes}
                      tone={results ? 'default' : 'muted'}
                      copyable={Boolean(results?.[id])}
                    />
                  </motion.div>
                ))}
              </div>

              {results && (
                <Button variant="outline" className="w-full" onClick={exportHashes}>
                  <Download className="size-4" aria-hidden="true" />
                  Save as .txt
                </Button>
              )}

              {phase === 'idle' && (
                <p className="rounded-xl border border-dashed border-border/60 p-4 text-xs leading-relaxed text-muted-foreground">
                  Useful when a download page asks for a digest you have not been given, or when you
                  want to publish checksums for your own release artifacts.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
