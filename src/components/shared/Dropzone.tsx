import { useRef, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FolderOpen, Loader2, UploadCloud } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useFileDrop } from '@/hooks/useFileDrop';
import { DIRECTORY_INPUT_ATTRS, filesFromFileList, type PickedFile } from '@/lib/pick-files';
import { Button } from '@/components/ui/button';

export interface DropzoneProps {
  onFiles: (files: PickedFile[]) => void | Promise<void>;
  /** `<input accept>` value, e.g. `.txt,.sha256`. */
  accept?: string;
  /** Pick a whole folder instead of individual files. */
  directory?: boolean;
  multiple?: boolean;
  title: string;
  subtitle?: string;
  hint?: string;
  icon?: ReactNode;
  disabled?: boolean;
  /** Extra predicate on top of `accept` (applied to drops, where `accept` does not exist). */
  filter?: (file: PickedFile) => boolean;
  onReject?: (message: string) => void;
  className?: string;
  compact?: boolean;
}

/**
 * Keyboard-accessible dropzone.
 *
 * The outer element is a `role="button"` with `tabIndex=0` so the flow is fully usable
 * without a mouse: Tab to it, press Enter/Space, and the native picker opens.
 */
export function Dropzone({
  onFiles,
  accept,
  directory = false,
  multiple = true,
  title,
  subtitle,
  hint,
  icon,
  disabled = false,
  filter,
  onReject,
  className,
  compact = false,
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const { isDragging, isReading, dropProps } = useFileDrop({
    onFiles,
    disabled,
    accept: filter,
    onReject,
  });

  const open = () => inputRef.current?.click();

  return (
    <motion.div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label={`${title}. Click or press Enter to browse, or drop files here.`}
      onClick={disabled ? undefined : open}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      }}
      animate={{ scale: isDragging ? 1.01 : 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      {...dropProps}
      className={cn(
        'group relative flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed text-center outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        compact ? 'px-5 py-6' : 'px-6 py-10',
        disabled
          ? 'cursor-not-allowed border-border/40 bg-muted/10 opacity-60'
          : 'cursor-pointer border-border/70 bg-card/30 hover:border-primary/50 hover:bg-card/60',
        isDragging && 'border-primary bg-primary/5 shadow-glow',
        className,
      )}
    >
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        {...(directory ? DIRECTORY_INPUT_ATTRS : {})}
        onChange={(event) => {
          const picked = filesFromFileList(event.target.files);
          // Reset so picking the same file twice still fires `change`.
          event.target.value = '';
          const accepted = filter ? picked.filter(filter) : picked;
          if (accepted.length > 0) void onFiles(accepted);
          else if (picked.length > 0) onReject?.('That file type is not supported here.');
        }}
      />

      <AnimatePresence mode="wait" initial={false}>
        {isReading ? (
          <motion.span
            key="reading"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="inline-flex size-12 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary"
          >
            <Loader2 className="size-6 animate-spin" aria-hidden="true" />
          </motion.span>
        ) : (
          <motion.span
            key="idle"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 320, damping: 20 }}
            className={cn(
              'inline-flex size-12 items-center justify-center rounded-xl border transition-colors',
              isDragging
                ? 'border-primary/40 bg-primary/15 text-primary'
                : 'border-border/70 bg-muted/40 text-muted-foreground group-hover:text-primary',
            )}
          >
            {icon ?? (directory ? <FolderOpen className="size-6" /> : <UploadCloud className="size-6" />)}
          </motion.span>
        )}
      </AnimatePresence>

      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">
          {isDragging ? 'Release to add' : title}
        </p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>

      {!compact && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none"
        >
          {directory ? 'Choose folder' : 'Browse files'}
        </Button>
      )}

      {hint && <p className="text-[11px] text-muted-foreground/80">{hint}</p>}
    </motion.div>
  );
}
