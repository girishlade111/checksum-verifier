import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Github, ShieldCheck } from 'lucide-react';

import { APP_CONFIG } from '@/config';
import { applyTheme, useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';
import { BackgroundFX } from '@/components/layout/BackgroundFX';
import { AppHeader } from '@/components/layout/AppHeader';
import { Toaster } from '@/components/layout/Toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BatchVerifier } from '@/components/features/BatchVerifier';
import { HashGenerator } from '@/components/features/HashGenerator';
import { SingleVerifier } from '@/components/features/SingleVerifier';
import { AssistantPanel } from '@/components/features/AssistantPanel';
import { SettingsPanel } from '@/components/features/SettingsPanel';

export default function App() {
  const activeTab = useUi((s) => s.activeTab);
  const theme = useSettings((s) => s.theme);
  const animations = useSettings((s) => s.animations);

  // Keep <html class="dark"> in sync with the persisted setting.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const transition = animations
    ? { duration: 0.28, ease: [0.16, 1, 0.3, 1] as const }
    : { duration: 0 };

  // TooltipProvider must sit above every <Tooltip>; Radix throws
  // "`Tooltip` must be used within `TooltipProvider`" otherwise, which unmounts the
  // whole tree the moment an MD5/SHA-1 (non-collision-resistant) badge renders.
  return (
    <TooltipProvider delayDuration={200}>
      <div className="relative flex min-h-screen flex-col bg-background text-foreground">
        <BackgroundFX />
        <AppHeader />

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={animations ? { opacity: 0, y: 12 } : false}
              animate={{ opacity: 1, y: 0 }}
              exit={animations ? { opacity: 0, y: -8 } : undefined}
              transition={transition}
            >
              {activeTab === 'single' && <SingleVerifier />}
              {activeTab === 'batch' && <BatchVerifier />}
              {activeTab === 'generate' && <HashGenerator />}
            </motion.div>
          </AnimatePresence>
        </main>

        <footer className="border-t border-border/60 px-4 py-5 sm:px-6">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 text-[11px] text-muted-foreground">
            <p className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-success" aria-hidden="true" />
              {APP_CONFIG.privacyNote}
            </p>
            <p className="flex items-center gap-3">
              <span>
                {APP_CONFIG.name} v{APP_CONFIG.version}
              </span>
              <a
                href="https://github.com/Daninet/hash-wasm"
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
              >
                <Github className="size-3.5" aria-hidden="true" />
                Powered by hash-wasm
              </a>
            </p>
          </div>
        </footer>

        <AnimatePresence>
          <AssistantPanel key="assistant" />
        </AnimatePresence>
        <AnimatePresence>
          <SettingsPanel key="settings" />
        </AnimatePresence>

        <Toaster />
      </div>
    </TooltipProvider>
  );
}
