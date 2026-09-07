import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useUi, type Toast } from '@/store/ui';
import { Button } from '@/components/ui/button';

const ICONS: Record<Toast['variant'], LucideIcon> = {
  default: Info,
  success: CheckCircle2,
  error: AlertTriangle,
};

const TONE: Record<Toast['variant'], string> = {
  default: 'border-border/60 bg-card/95',
  success: 'border-success/40 bg-card/95',
  error: 'border-destructive/40 bg-card/95',
};

const ICON_TONE: Record<Toast['variant'], string> = {
  default: 'text-muted-foreground',
  success: 'text-success',
  error: 'text-destructive',
};

function ToastCard({ toast }: { toast: Toast }) {
  const dismiss = useUi((s) => s.dismissToast);
  const Icon = ICONS[toast.variant];

  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(toast.id), 4200);
    return () => window.clearTimeout(timer);
  }, [dismiss, toast.id]);

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 340, damping: 28 }}
      className={cn(
        'pointer-events-auto flex w-full items-start gap-3 rounded-xl border p-3 shadow-lg shadow-black/20 backdrop-blur',
        TONE[toast.variant],
      )}
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', ICON_TONE[toast.variant])} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{toast.title}</p>
        {toast.description && (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {toast.description}
          </p>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Dismiss notification"
        onClick={() => dismiss(toast.id)}
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="size-3.5" />
      </Button>
    </motion.li>
  );
}

export function Toaster() {
  const toasts = useUi((s) => s.toasts);

  return (
    <ul
      aria-live="polite"
      aria-relevant="additions"
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} />
        ))}
      </AnimatePresence>
    </ul>
  );
}
