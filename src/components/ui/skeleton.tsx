import { cn } from '@/lib/utils';

/**
 * Shimmering placeholder used while the hashing workers are still compiling their
 * WebAssembly modules.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md bg-muted/60',
        'after:absolute after:inset-0 after:-translate-x-full after:animate-shimmer',
        'after:bg-gradient-to-r after:from-transparent after:via-foreground/10 after:to-transparent',
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
