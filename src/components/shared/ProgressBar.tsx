import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatBytes, formatDuration, formatSpeed } from '@/lib/format';

export type ProgressState = 'active' | 'success' | 'error' | 'idle';

export interface ProgressBarProps {
  /** 0 - 100 */
  value: number;
  state?: ProgressState;
  bytesProcessed?: number;
  fileSize?: number;
  bytesPerSecond?: number;
  etaSeconds?: number | null;
  label?: string;
  className?: string;
}

const FILL_CLASS: Record<ProgressState, string> = {
  idle: 'from-zinc-500 to-zinc-400',
  active: 'from-sky-400 via-blue-500 to-indigo-500',
  success: 'from-emerald-400 via-emerald-500 to-teal-400',
  error: 'from-rose-500 via-red-500 to-orange-500',
};

/**
 * Streaming progress bar with a smoothed fill, throughput and ETA.
 * On success the bar emits a single expanding light sweep ("the pulse").
 */
export function ProgressBar({
  value,
  state = 'active',
  bytesProcessed,
  fileSize,
  bytesPerSecond,
  etaSeconds,
  label,
  className,
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
  const showMeta =
    typeof bytesProcessed === 'number' && typeof fileSize === 'number' && fileSize > 0;

  return (
    <div className={cn('space-y-2', className)}>
      {(label || showMeta) && (
        <div className="flex items-baseline justify-between gap-3 text-xs">
          <span className="truncate text-muted-foreground">{label ?? 'Processing'}</span>
          <span className="font-mono tabular-nums text-foreground">
            {clamped.toFixed(clamped < 100 ? 1 : 0)}%
          </span>
        </div>
      )}

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
        aria-label={label ?? 'Hashing progress'}
        className={cn(
          'relative h-2.5 w-full overflow-hidden rounded-full border border-border/50 bg-secondary/60',
          state === 'success' && 'border-success/40',
          state === 'error' && 'border-destructive/40',
        )}
      >
        <motion.div
          className={cn('h-full rounded-full bg-gradient-to-r', FILL_CLASS[state])}
          initial={{ width: 0 }}
          animate={{ width: `${clamped}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 22, mass: 0.4 }}
        >
          {/* Moving sheen while the job is running. */}
          {state === 'active' && (
            <div className="relative h-full w-full overflow-hidden rounded-full">
              <div className="absolute inset-y-0 -left-1/3 w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-white/35 to-transparent" />
            </div>
          )}
        </motion.div>

        {/* Completion sweep. */}
        <AnimatePresence>
          {state === 'success' && (
            <motion.div
              key="sweep"
              className="pointer-events-none absolute inset-y-0 w-24 bg-gradient-to-r from-transparent via-emerald-200/70 to-transparent"
              initial={{ x: '-30%' }}
              animate={{ x: '420%' }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
            />
          )}
        </AnimatePresence>
      </div>

      {showMeta && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="font-mono tabular-nums">
            {formatBytes(bytesProcessed ?? 0)} / {formatBytes(fileSize ?? 0)}
          </span>

          <span className="flex items-center gap-3 font-mono tabular-nums">
            {state === 'success' ? (
              <span className="inline-flex items-center gap-1 text-success">
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                Done
              </span>
            ) : (
              <>
                {typeof bytesPerSecond === 'number' && bytesPerSecond > 0 && (
                  <span>{formatSpeed(bytesPerSecond)}</span>
                )}
                {state === 'active' && etaSeconds !== null && etaSeconds !== undefined && (
                  <span>~{formatDuration(etaSeconds)} left</span>
                )}
              </>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
