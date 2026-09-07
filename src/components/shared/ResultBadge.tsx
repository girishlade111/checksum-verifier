import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  CircleSlash,
  FileQuestion,
  Loader2,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { VerifyStatus } from '@/types';

interface StatusMeta {
  label: string;
  icon: LucideIcon;
  className: string;
  spin?: boolean;
}

export const STATUS_META: Record<VerifyStatus, StatusMeta> = {
  pending: {
    label: 'Queued',
    icon: CircleDashed,
    className: 'border-border/60 bg-muted/40 text-muted-foreground',
  },
  hashing: {
    label: 'Hashing',
    icon: Loader2,
    className: 'border-primary/30 bg-primary/10 text-primary',
    spin: true,
  },
  verified: {
    label: 'Verified',
    icon: CheckCircle2,
    className: 'border-success/30 bg-success/15 text-success',
  },
  failed: {
    label: 'Mismatch',
    icon: XCircle,
    className: 'border-destructive/30 bg-destructive/15 text-destructive',
  },
  missing: {
    label: 'Missing',
    icon: FileQuestion,
    className: 'border-warning/30 bg-warning/15 text-warning',
  },
  unlisted: {
    label: 'Not listed',
    icon: AlertTriangle,
    className: 'border-border/60 bg-muted/40 text-muted-foreground',
  },
  error: {
    label: 'Error',
    icon: AlertTriangle,
    className: 'border-destructive/30 bg-destructive/15 text-destructive',
  },
  cancelled: {
    label: 'Cancelled',
    icon: CircleSlash,
    className: 'border-border/60 bg-muted/40 text-muted-foreground',
  },
};

export interface ResultBadgeProps {
  status: VerifyStatus;
  /** Overrides the default label (e.g. "Verified" vs "Match"). */
  label?: string;
  className?: string;
}

export function ResultBadge({ status, label, className }: ResultBadgeProps) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium',
        meta.className,
        className,
      )}
    >
      <Icon className={cn('size-3.5', meta.spin && 'animate-spin')} aria-hidden="true" />
      {label ?? meta.label}
    </span>
  );
}

/**
 * Big animated verdict used by the single-file verifier.
 * Success pops in with a glowing emerald ring; failure shakes and glows rose.
 */
export function VerdictBadge({
  status,
  title,
  description,
}: {
  status: 'verified' | 'failed' | 'error';
  title: string;
  description?: string;
}) {
  const isSuccess = status === 'verified';
  const Icon = isSuccess ? CheckCircle2 : XCircle;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={status + title}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={
          isSuccess
            ? { opacity: 1, scale: 1 }
            : { opacity: 1, scale: 1, x: [0, -9, 8, -6, 4, 0] }
        }
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{
          duration: isSuccess ? 0.35 : 0.5,
          ease: isSuccess ? [0.16, 1, 0.3, 1] : 'easeInOut',
        }}
        role="status"
        aria-live="polite"
        className={cn(
          'flex items-start gap-3 rounded-xl border p-4',
          isSuccess
            ? 'border-success/40 bg-success/10 shadow-glow-success'
            : 'border-destructive/40 bg-destructive/10 shadow-glow-danger',
        )}
      >
        <motion.span
          initial={{ scale: 0, rotate: -25 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 16, delay: 0.05 }}
          className={cn(
            'relative mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full',
            isSuccess ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive',
          )}
        >
          {isSuccess && (
            <span className="absolute inset-0 animate-pulse-ring rounded-full bg-success/40" />
          )}
          <Icon className="size-5" strokeWidth={2.5} />
        </motion.span>

        <div className="min-w-0">
          <p
            className={cn(
              'text-sm font-semibold',
              isSuccess ? 'text-success' : 'text-destructive',
            )}
          >
            {title}
          </p>
          {description && (
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
