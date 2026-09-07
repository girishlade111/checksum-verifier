import { motion } from 'framer-motion';
import { Moon, RotateCcw, Settings2, Sun, X } from 'lucide-react';

import { useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';

interface RowProps {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}

function Row({ id, title, description, children }: RowProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm text-foreground">
          {title}
        </Label>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  );
}

export function SettingsPanel() {
  const open = useUi((s) => s.settingsOpen);
  const setOpen = useUi((s) => s.setSettingsOpen);
  const settings = useSettings();

  if (!open) return null;

  return (
    <>
      <motion.div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 34 }}
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border/60 bg-card/95 backdrop-blur-xl"
      >
        <header className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Settings2 className="size-4 text-primary" aria-hidden="true" />
            Settings
          </h2>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close settings"
            onClick={() => setOpen(false)}
          >
            <X className="size-4" />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 pb-6">
          <section className="pt-2">
            <h3 className="pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Appearance
            </h3>
            <Row
              id="theme"
              title="Theme"
              description="Dark is the default. Your choice is remembered on this device."
            >
              <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-background/50 p-1">
                <button
                  type="button"
                  onClick={() => settings.setTheme('dark')}
                  aria-pressed={settings.theme === 'dark'}
                  className={
                    settings.theme === 'dark'
                      ? 'rounded-md bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary'
                      : 'rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground'
                  }
                >
                  <Moon className="mr-1 inline size-3.5" aria-hidden="true" />
                  Dark
                </button>
                <button
                  type="button"
                  onClick={() => settings.setTheme('light')}
                  aria-pressed={settings.theme === 'light'}
                  className={
                    settings.theme === 'light'
                      ? 'rounded-md bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary'
                      : 'rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground'
                  }
                >
                  <Sun className="mr-1 inline size-3.5" aria-hidden="true" />
                  Light
                </button>
              </div>
            </Row>

            <Row
              id="animations"
              title="Animations"
              description="Transitions, glows and the progress sweep. Honours your OS reduced-motion setting."
            >
              <Switch
                id="animations"
                checked={settings.animations}
                onCheckedChange={settings.setAnimations}
                aria-label="Enable animations"
              />
            </Row>

            <Row
              id="background-pattern"
              title="Background grid"
              description="A faint drifting grid behind the dashboard."
            >
              <Switch
                id="background-pattern"
                checked={settings.backgroundPattern}
                onCheckedChange={settings.setBackgroundPattern}
                aria-label="Enable background grid"
              />
            </Row>
          </section>

          <Separator className="my-2" />

          <section>
            <h3 className="pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Hashing
            </h3>

            <Row
              id="chunk-size"
              title="Chunk size"
              description="Bytes read per step. Larger is faster on SSDs, smaller keeps memory lower."
            >
              <Select
                value={String(settings.chunkSizeMb)}
                onValueChange={(value) => settings.setChunkSizeMb(Number(value))}
              >
                <SelectTrigger id="chunk-size" className="w-[104px]" aria-label="Chunk size">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[4, 8, 16, 32, 64].map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {value} MB
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>

            <Row
              id="concurrency"
              title="Parallel workers"
              description="How many files can be hashed at the same time in batch mode."
            >
              <Select
                value={String(settings.concurrency)}
                onValueChange={(value) => settings.setConcurrency(Number(value))}
              >
                <SelectTrigger id="concurrency" className="w-[104px]" aria-label="Parallel workers">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 6, 8].map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>

            <Row
              id="uppercase"
              title="Uppercase digests"
              description="Display hashes in CAPITALS. Copying always preserves the display case."
            >
              <Switch
                id="uppercase"
                checked={settings.uppercaseHashes}
                onCheckedChange={settings.setUppercaseHashes}
                aria-label="Uppercase digests"
              />
            </Row>

            <Row
              id="auto-detect"
              title="Auto-detect algorithm"
              description="Infer MD5 / SHA-1 / SHA-256 / SHA-512 from the length of a pasted digest."
            >
              <Switch
                id="auto-detect"
                checked={settings.autoDetectAlgorithm}
                onCheckedChange={settings.setAutoDetectAlgorithm}
                aria-label="Auto-detect algorithm"
              />
            </Row>

            <Row
              id="hash-unlisted"
              title="Hash unlisted files"
              description="In batch mode, also hash dropped files the manifest does not mention."
            >
              <Switch
                id="hash-unlisted"
                checked={settings.hashUnlistedFiles}
                onCheckedChange={settings.setHashUnlistedFiles}
                aria-label="Hash unlisted files"
              />
            </Row>
          </section>
        </div>

        <footer className="flex items-center justify-between border-t border-border/60 px-5 py-4">
          <Button variant="ghost" size="sm" onClick={settings.reset}>
            <RotateCcw className="size-4" aria-hidden="true" />
            Restore defaults
          </Button>
          <Button size="sm" onClick={() => setOpen(false)}>
            Done
          </Button>
        </footer>
      </motion.aside>
    </>
  );
}
