import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { formatBytes, truncateFileName } from '@/lib/format';
import type { PickedFile } from '@/lib/pick-files';
import { Button } from '@/components/ui/button';
import { FileIcon } from './FileIcon';

export interface SelectedFileProps {
  picked: PickedFile;
  onRemove?: () => void;
  right?: ReactNode;
  className?: string;
  /** Show the relative path under the basename (useful for folder drops). */
  showPath?: boolean;
}

export function SelectedFile({
  picked,
  onRemove,
  right,
  className,
  showPath = false,
}: SelectedFileProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      className={cn(
        'flex items-center gap-3 rounded-xl border border-border/60 bg-card/60 p-3',
        className,
      )}
    >
      <FileIcon filename={picked.name} size={20} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground" title={picked.name}>
          {truncateFileName(picked.name, 48)}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatBytes(picked.size)}
          {showPath && picked.relativePath && picked.relativePath !== picked.name && (
            <span className="ml-2 font-mono opacity-70" title={picked.relativePath}>
              {picked.relativePath}
            </span>
          )}
        </p>
      </div>

      {right}

      {onRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${picked.name}`}
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive"
        >
          <X className="size-4" />
        </Button>
      )}
    </motion.div>
  );
}
