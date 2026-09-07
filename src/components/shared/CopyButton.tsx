import { Check, Copy } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { Button, type ButtonProps } from '@/components/ui/button';

export interface CopyButtonProps extends Omit<ButtonProps, 'onClick' | 'value'> {
  value: string;
  /** Announced to screen readers. */
  label?: string;
}

export function CopyButton({ value, label = 'Copy to clipboard', className, ...props }: CopyButtonProps) {
  const { copy, copiedKey } = useCopyToClipboard();
  const copied = copiedKey !== null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={copied ? 'Copied!' : label}
      className={cn('text-muted-foreground hover:text-foreground', className)}
      onClick={(event) => {
        event.stopPropagation();
        void copy(value);
      }}
      {...props}
    >
      {copied ? (
        <Check className="size-3.5 text-success" aria-hidden="true" />
      ) : (
        <Copy className="size-3.5" aria-hidden="true" />
      )}
    </Button>
  );
}
