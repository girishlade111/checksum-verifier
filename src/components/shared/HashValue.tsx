import { motion } from 'framer-motion';

import { cn } from '@/lib/utils';
import { groupHash } from '@/lib/format';
import { CopyButton } from './CopyButton';

export interface HashValueProps {
  label: string;
  value: string;
  /** Render the digest in UPPERCASE. */
  uppercase?: boolean;
  /** Insert a space every 8 hex characters. */
  group?: boolean;
  tone?: 'default' | 'success' | 'danger' | 'muted';
  /** `full` shows the digest on its own line, `inline` keeps it beside the label. */
  layout?: 'full' | 'inline';
  className?: string;
  copyable?: boolean;
}

const TONE_CLASS = {
  default: 'text-foreground',
  success: 'text-success',
  danger: 'text-destructive',
  muted: 'text-muted-foreground',
} as const;

/** A labelled, copyable hex digest. */
export function HashValue({
  label,
  value,
  uppercase = false,
  group = true,
  tone = 'default',
  layout = 'full',
  className,
  copyable = true,
}: HashValueProps) {
  const rendered = uppercase ? value.toUpperCase() : value.toLowerCase();
  const display = group ? groupHash(rendered) : rendered;

  return (
    <div
      className={cn(
        'rounded-lg border border-border/60 bg-background/40',
        layout === 'full' ? 'p-3' : 'flex items-center gap-2 px-3 py-2',
        className,
      )}
    >
      {layout === 'full' ? (
        <>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {label}
            </span>
            {copyable && value && <CopyButton value={rendered} label={`Copy ${label} hash`} />}
          </div>
          <motion.p
            key={display}
            initial={{ opacity: 0.4 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
            className={cn(
              'break-all font-mono text-[13px] leading-relaxed tabular-nums',
              TONE_CLASS[tone],
            )}
          >
            {display}
          </motion.p>
        </>
      ) : (
        <>
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <span
            className={cn(
              'min-w-0 flex-1 truncate font-mono text-xs tabular-nums',
              TONE_CLASS[tone],
            )}
            title={display}
          >
            {display}
          </span>
          {copyable && value && <CopyButton value={rendered} label={`Copy ${label} hash`} />}
        </>
      )}
    </div>
  );
}
