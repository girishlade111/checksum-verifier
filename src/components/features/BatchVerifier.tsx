import { memo, useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle2,
  Download,
  Eraser,
  FileStack,
  Files,
  ListChecks,
  Play,
  Square,
  TriangleAlert,
} from 'lucide-react';

import { ALL_ALGORITHM_IDS, type AlgorithmId } from '@/lib/algorithms';
import { formatBytes, formatElapsed, truncateFileName } from '@/lib/format';
import { buildCsv, buildManifest, downloadTextFile } from '@/lib/manifest-parser';
import { looksLikeManifest, summarize, useBatchStore, type BatchRow } from '@/store/batch';
import { useSettings } from '@/store/settings';
import { cn } from '@/lib/utils';
import type { PickedFile } from '@/lib/pick-files';
import type { VerifyStatus } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Dropzone } from '@/components/shared/Dropzone';
import { FileIcon } from '@/components/shared/FileIcon';
import { ProgressBar } from '@/components/shared/ProgressBar';
import { ResultBadge } from '@/components/shared/ResultBadge';
import { CopyButton } from '@/components/shared/CopyButton';

type FilterKey = 'all' | 'verified' | 'failed' | 'missing' | 'unlisted';

const FILTERS: Array<{ key: FilterKey; label: string; status?: VerifyStatus }> = [
  { key: 'all', label: 'All' },
  { key: 'verified', label: 'Verified', status: 'verified' },
  { key: 'failed', label: 'Failed', status: 'failed' },
  { key: 'missing', label: 'Missing', status: 'missing' },
  { key: 'unlisted', label: 'Not listed', status: 'unlisted' },
];

/** Size-weighted completion across every row that has a file behind it. */
function overallPercent(rows: BatchRow[]): number {
  let weighted = 0;
  let total = 0;
  for (const row of rows) {
    if (!row.size) continue;
    total += row.size;
    weighted += row.size * (row.status === 'verified' || row.status === 'failed' || row.status === 'unlisted' ? 100 : row.percent);
  }
  return total === 0 ? (rows.length && rows.every((r) => r.percent === 100) ? 100 : 0) : weighted / total;
}

/* --------------------------------- table row -------------------------------- */

const BatchRowItem = memo(function BatchRowItem({ index }: { index: number }) {
  const row = useBatchStore((state) => state.rows[index]);
  if (!row) return null;

  const digestTone =
    row.status === 'verified'
      ? 'text-success'
      : row.status === 'failed'
        ? 'text-destructive'
        : 'text-muted-foreground';

  return (
    <TableRow>
      <TableCell className="w-[132px]">
        <ResultBadge status={row.status} />
      </TableCell>

      <TableCell className="max-w-[280px]">
        <div className="flex items-center gap-2">
          <FileIcon filename={row.name} size={14} />
          <div className="min-w-0">
            <p className="truncate text-xs font-medium" title={row.name}>
              {truncateFileName(row.basename, 34)}
            </p>
            {row.name !== row.basename && (
              <p className="truncate font-mono text-[10px] text-muted-foreground" title={row.name}>
                {row.name}
              </p>
            )}
          </div>
        </div>
      </TableCell>

      <TableCell className="w-[92px] font-mono text-xs tabular-nums text-muted-foreground">
        {row.size === null ? '—' : formatBytes(row.size)}
      </TableCell>

      <TableCell className="w-[86px]">
        <span className="font-mono text-[11px] uppercase text-muted-foreground">
          {row.algorithm}
        </span>
      </TableCell>

      <TableCell className="max-w-[220px]">
        <span
          className="block truncate font-mono text-[11px] text-muted-foreground"
          title={row.expected ?? ''}
        >
          {row.expected ?? '—'}
        </span>
      </TableCell>

      <TableCell className="max-w-[220px]">
        {row.actual ? (
          <span className="flex items-center gap-1">
            <span className={cn('min-w-0 flex-1 truncate font-mono text-[11px]', digestTone)} title={row.actual}>
              {row.actual}
            </span>
            <CopyButton value={row.actual} label={`Copy digest for ${row.basename}`} />
          </span>
        ) : (
          <span className="font-mono text-[11px] text-muted-foreground/60">
            {row.status === 'hashing' ? `${Math.floor(row.percent)}%` : '—'}
          </span>
        )}
      </TableCell>

      <TableCell className="w-[80px] font-mono text-xs tabular-nums text-muted-foreground">
        {row.durationMs ? formatElapsed(row.durationMs) : '—'}
      </TableCell>
    </TableRow>
  );
});

/* -------------------------------- summary bar ------------------------------- */

const SummaryChips = memo(function SummaryChips() {
  const rows = useBatchStore((state) => state.rows);
  const summary = useMemo(() => summarize(rows), [rows]);

  if (summary.total === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Badge variant="success">
        <CheckCircle2 className="size-3.5" aria-hidden="true" />
        {summary.verified} verified
      </Badge>
      {summary.failed > 0 && (
        <Badge variant="destructive">
          <TriangleAlert className="size-3.5" aria-hidden="true" />
          {summary.failed} failed
        </Badge>
      )}
      {summary.missing > 0 && (
        <Badge variant="warning">{summary.missing} missing</Badge>
      )}
      {summary.unlisted > 0 && <Badge variant="muted">{summary.unlisted} not listed</Badge>}
      {(summary.error > 0 || summary.cancelled > 0) && (
        <Badge variant="muted">
          {summary.error + summary.cancelled} incomplete
        </Badge>
      )}
      <span className="text-muted-foreground">
        {summary.total} entries · {formatBytes(summary.bytes)}
      </span>
    </div>
  );
});

/* ------------------------------- main component ----------------------------- */

export function BatchVerifier() {
  const [filter, setFilter] = useState<FilterKey>('all');

  const chunkSizeMb = useSettings((s) => s.chunkSizeMb);
  const hashUnlisted = useSettings((s) => s.hashUnlistedFiles);

  const manifest = useBatchStore((s) => s.manifest);
  const manifestName = useBatchStore((s) => s.manifestName);
  const manifestError = useBatchStore((s) => s.manifestError);
  const files = useBatchStore((s) => s.files);
  const rows = useBatchStore((s) => s.rows);
  const running = useBatchStore((s) => s.running);
  const setManifest = useBatchStore((s) => s.setManifest);
  const clearManifest = useBatchStore((s) => s.clearManifest);
  const addFiles = useBatchStore((s) => s.addFiles);
  const removeFile = useBatchStore((s) => s.removeFile);
  const clearAll = useBatchStore((s) => s.clearAll);
  const verify = useBatchStore((s) => s.verify);
  const cancel = useBatchStore((s) => s.cancel);

  const algorithms = ALL_ALGORITHM_IDS as AlgorithmId[];

  const readManifest = useCallback(
    async (picked: PickedFile) => {
      const text = await picked.file.text();
      setManifest(picked, text);
    },
    [setManifest],
  );

  const onPayloadFiles = useCallback(
    (picked: PickedFile[]) => {
      const manifests = picked.filter(looksLikeManifest);
      const payloads = picked.filter((file) => !looksLikeManifest(file));

      if (payloads.length > 0) addFiles(payloads);
      // A lone checksum file dropped onto the payload area is almost certainly the manifest.
      if (manifests.length > 0 && !manifest) {
        void readManifest(manifests[0]);
      } else if (manifests.length > 0 && payloads.length === 0) {
        void readManifest(manifests[0]);
      }
    },
    [addFiles, manifest, readManifest],
  );

  const visible = useMemo(() => {
    const status = FILTERS.find((entry) => entry.key === filter)?.status;
    if (!status) return rows.map((_, index) => index);
    return rows.reduce<number[]>((acc, row, index) => {
      if (row.status === status) acc.push(index);
      return acc;
    }, []);
  }, [filter, rows]);

  const percent = overallPercent(rows);
  const hasRun = rows.length > 0;
  const canVerify = Boolean(manifest && manifest.entries.length > 0 && files.length > 0);

  const exportCsv = () => {
    downloadTextFile(
      'verification-report.csv',
      buildCsv(
        rows.map((row) => ({
          file: row.name,
          status: row.status,
          algorithm: row.algorithm,
          size: row.size ?? '',
          expected: row.expected ?? '',
          computed: row.actual ?? '',
        })),
        [
          { key: 'file', header: 'File' },
          { key: 'status', header: 'Status' },
          { key: 'algorithm', header: 'Algorithm' },
          { key: 'size', header: 'Size (bytes)' },
          { key: 'expected', header: 'Expected hash' },
          { key: 'computed', header: 'Computed hash' },
        ],
      ),
      'text/csv',
    );
  };

  const exportManifest = () => {
    const algorithm = manifest?.algorithm ?? rows[0]?.algorithm ?? 'sha256';
    downloadTextFile(
      `${algorithm.toUpperCase()}SUMS`,
      buildManifest(
        rows
          .filter((row) => row.actual && row.algorithm === algorithm)
          .map((row) => ({ filename: row.name, hash: row.actual! })),
        algorithm,
      ),
    );
  };

  return (
    <div className="space-y-6">
      {/* ------------------------------- inputs ------------------------------- */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileStack className="size-4 text-primary" aria-hidden="true" />
              Checksum manifest
            </CardTitle>
            <CardDescription>
              GNU (<code className="font-mono text-[11px]">SHA256SUMS</code>), BSD, colon-separated
              and CSV layouts are all parsed automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {manifestName ? (
              <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/60 p-3">
                <FileIcon filename={manifestName} size={20} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{manifestName}</p>
                  <p className="text-xs text-muted-foreground">
                    {manifest?.entries.length ?? 0} entries
                    {manifest?.algorithm ? ` · ${manifest.algorithm.toUpperCase()}` : ''}
                    {manifest?.skipped ? ` · ${manifest.skipped} lines skipped` : ''}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove manifest"
                  disabled={running}
                  onClick={clearManifest}
                >
                  <Eraser className="size-4" />
                </Button>
              </div>
            ) : (
              <Dropzone
                compact
                multiple={false}
                accept=".txt,.sums,.sha256,.sha512,.sha1,.md5,.csv,.asc,text/plain"
                title="Drop SHA256SUMS"
                subtitle="or any checksum list"
                onFiles={(picked) => void readManifest(picked[0])}
              />
            )}

            {manifestError && (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                {manifestError}
              </p>
            )}

            {manifest && manifest.errors.length > 0 && (
              <details className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
                <summary className="cursor-pointer font-medium">
                  {manifest.errors.length} line{manifest.errors.length === 1 ? '' : 's'} could not be
                  parsed
                </summary>
                <ul className="mt-2 space-y-1 pl-4">
                  {manifest.errors.slice(0, 8).map((line) => (
                    <li key={line} className="list-disc font-mono text-[11px]">
                      {line}
                    </li>
                  ))}
                  {manifest.errors.length > 8 && (
                    <li className="list-disc">…and {manifest.errors.length - 8} more</li>
                  )}
                </ul>
              </details>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Files className="size-4 text-primary" aria-hidden="true" />
              Files to verify
            </CardTitle>
            <CardDescription>
              Drop a whole folder — nested files are matched by path first, then by name.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Dropzone
              compact
              directory
              title="Drop files or a folder"
              subtitle={`${files.length} file${files.length === 1 ? '' : 's'} staged`}
              disabled={running}
              onFiles={onPayloadFiles}
            />

            {files.length > 0 && (
              <ScrollArea className="max-h-52 rounded-xl border border-border/60">
                <ul className="divide-y divide-border/40">
                  {files.slice(0, 200).map((picked) => (
                    <li key={picked.id} className="flex items-center gap-2 px-3 py-2">
                      <FileIcon filename={picked.name} size={14} />
                      <span className="min-w-0 flex-1 truncate text-xs" title={picked.relativePath}>
                        {picked.relativePath || picked.name}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                        {formatBytes(picked.size)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${picked.name}`}
                        disabled={running}
                        onClick={() => removeFile(picked.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Eraser className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------- actions ------------------------------ */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-5">
          <Button onClick={() => void verify({ algorithms, chunkSizeMb, hashUnlisted })} disabled={!canVerify || running}>
            {running ? (
              <Square className="size-4 fill-current" aria-hidden="true" />
            ) : (
              <Play className="size-4" aria-hidden="true" />
            )}
            {running ? 'Verifying…' : `Verify ${files.length || ''} file${files.length === 1 ? '' : 's'}`}
          </Button>

          {running && (
            <Button variant="outline" onClick={cancel}>
              Stop
            </Button>
          )}

          <Button variant="ghost" onClick={clearAll}>
            Clear everything
          </Button>

          {!canVerify && (
            <span className="text-xs text-muted-foreground">
              {!manifest
                ? 'Add a manifest to get started.'
                : files.length === 0
                  ? 'Now add the files the manifest refers to.'
                  : ''}
            </span>
          )}

          <div className="ml-auto flex flex-wrap gap-2">
            {hasRun && (
              <>
                <Button variant="outline" size="sm" onClick={exportCsv}>
                  <Download className="size-4" aria-hidden="true" />
                  CSV report
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={exportManifest}
                      disabled={!rows.some((row) => row.actual)}
                    >
                      <Download className="size-4" aria-hidden="true" />
                      Manifest
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Writes the computed digests back out as a GNU manifest you can publish or feed
                    into <code className="font-mono">sha256sum -c</code>.
                  </TooltipContent>
                </Tooltip>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------- results ------------------------------ */}
      {(running || hasRun) && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <ListChecks className="size-4 text-primary" aria-hidden="true" />
                Results
              </CardTitle>
              <div className="flex flex-wrap gap-1">
                {FILTERS.map((entry) => (
                  <button
                    key={entry.key}
                    type="button"
                    onClick={() => setFilter(entry.key)}
                    className={cn(
                      'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      filter === entry.key
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                    )}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <SummaryChips />
              <AnimatePresence>
                {(running || percent > 0) && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <ProgressBar
                      value={percent}
                      state={running ? 'active' : percent >= 100 ? 'success' : 'idle'}
                      label={
                        running
                          ? `Hashing ${rows.filter((r) => r.status === 'hashing').length} file(s) in parallel`
                          : 'Batch complete'
                      }
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </CardHeader>

          <CardContent>
            <ScrollArea className="max-h-[520px] rounded-xl border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Algo</TableHead>
                    <TableHead>Expected</TableHead>
                    <TableHead>Computed</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                        No rows match this filter.
                      </TableCell>
                    </TableRow>
                  ) : (
                    visible.map((index) => <BatchRowItem key={rows[index]?.id ?? index} index={index} />)
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
