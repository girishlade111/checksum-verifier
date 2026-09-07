import { motion } from 'framer-motion';
import {
  FileCheck2,
  FileStack,
  Fingerprint,
  Moon,
  Settings2,
  Sparkles,
  Sun,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { APP_CONFIG } from '@/config';
import { useSettings } from '@/store/settings';
import { useUi, type MainTab } from '@/store/ui';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const TABS: Array<{ value: MainTab; label: string; icon: LucideIcon }> = [
  { value: 'single', label: 'Single verify', icon: Fingerprint },
  { value: 'batch', label: 'Batch verify', icon: FileStack },
  { value: 'generate', label: 'Generate hash', icon: FileCheck2 },
];

function TabNav({ className }: { className?: string }) {
  const activeTab = useUi((s) => s.activeTab);
  const setActiveTab = useUi((s) => s.setActiveTab);
  const animations = useSettings((s) => s.animations);

  return (
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as MainTab)}>
      <TabsList className={className}>
        {TABS.map((tab) => {
          const active = activeTab === tab.value;
          const Icon = tab.icon;
          return (
            <TabsTrigger key={tab.value} value={tab.value} className="px-3">
              {active && animations && (
                <motion.span
                  layoutId="tab-underline"
                  className="absolute inset-0 rounded-lg border border-primary/30 bg-primary/12"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              {active && !animations && (
                <span className="absolute inset-0 rounded-lg border border-primary/30 bg-primary/12" />
              )}
              <Icon className="relative size-4" aria-hidden="true" />
              <span className="relative">{tab.label}</span>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}

export function AppHeader() {
  const theme = useSettings((s) => s.theme);
  const toggleTheme = useSettings((s) => s.toggleTheme);
  const toggleAssistant = useUi((s) => s.toggleAssistant);
  const assistantOpen = useUi((s) => s.assistantOpen);
  const setSettingsOpen = useUi((s) => s.setSettingsOpen);

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
            aria-hidden="true"
          >
            <FileCheck2 className="size-5" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold leading-tight">{APP_CONFIG.name}</h1>
            <p className="hidden truncate text-[11px] text-muted-foreground sm:block">
              {APP_CONFIG.tagline}
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <div className="hidden lg:block">
            <TabNav />
          </div>

          <Button
            variant={assistantOpen ? 'secondary' : 'ghost'}
            size="icon"
            aria-label="Toggle checksum assistant"
            aria-pressed={assistantOpen}
            onClick={toggleAssistant}
          >
            <Sparkles className="size-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            aria-label="Open settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="border-t border-border/50 px-4 py-2.5 lg:hidden sm:px-6">
        <TabNav className={cn('w-full')} />
      </div>
    </header>
  );
}
