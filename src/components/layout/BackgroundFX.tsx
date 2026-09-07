import { useSettings } from '@/store/settings';

/**
 * Decorative backdrop: a faint drifting grid plus two soft radial glows.
 * Purely cosmetic and pointer-events:none, and it disappears entirely when the
 * user turns the pattern off or asks their OS for reduced motion.
 */
export function BackgroundFX() {
  const enabled = useSettings((s) => s.backgroundPattern);
  const animations = useSettings((s) => s.animations);
  const theme = useSettings((s) => s.theme);

  if (!enabled) return null;

  const animate = animations;

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* drifting grid */}
      <div
        className={[
          'absolute inset-0 opacity-[0.35]',
          animate && 'animate-grid-drift',
          theme === 'dark' ? 'opacity-40' : 'opacity-30',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          backgroundImage: `linear-gradient(to right, hsl(var(--border) / 0.6) 1px, transparent 1px),
                            linear-gradient(to bottom, hsl(var(--border) / 0.6) 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)',
        }}
      />

      {/* glows */}
      <div
        className="absolute -left-32 -top-40 size-[520px] rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle, hsl(var(--primary) / 0.16), transparent 65%)',
        }}
      />
      <div
        className="absolute -right-40 top-1/4 size-[560px] rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle, hsl(var(--success) / 0.12), transparent 65%)',
        }}
      />
    </div>
  );
}
