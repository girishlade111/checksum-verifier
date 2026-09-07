import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { clamp } from '@/lib/utils';

export type ThemeMode = 'dark' | 'light';

function defaultConcurrency() {
  const cores =
    typeof navigator !== 'undefined' && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 4;
  return clamp(cores - 1, 1, 4);
}

export interface SettingsState {
  theme: ThemeMode;
  /** Size of the chunks streamed into the hashing worker, in MB. */
  chunkSizeMb: number;
  /** How many hashing workers may run at once. */
  concurrency: number;
  /** Render digests in UPPERCASE (default is lowercase, like `sha256sum`). */
  uppercaseHashes: boolean;
  /** Infer the algorithm from a pasted digest. */
  autoDetectAlgorithm: boolean;
  /** Decorative animated grid in the background. */
  backgroundPattern: boolean;
  /** Master switch for non-essential motion (also honours prefers-reduced-motion). */
  animations: boolean;
  /** Include files that are not listed in the manifest when batch verifying. */
  hashUnlistedFiles: boolean;

  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setChunkSizeMb: (value: number) => void;
  setConcurrency: (value: number) => void;
  setUppercaseHashes: (value: boolean) => void;
  setAutoDetectAlgorithm: (value: boolean) => void;
  setBackgroundPattern: (value: boolean) => void;
  setAnimations: (value: boolean) => void;
  setHashUnlistedFiles: (value: boolean) => void;
  reset: () => void;
}

const defaults = {
  theme: 'dark' as ThemeMode,
  chunkSizeMb: 16,
  concurrency: defaultConcurrency(),
  uppercaseHashes: false,
  autoDetectAlgorithm: true,
  backgroundPattern: true,
  animations: true,
  hashUnlistedFiles: true,
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaults,
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
      setChunkSizeMb: (value) => set({ chunkSizeMb: clamp(Math.round(value), 1, 64) }),
      setConcurrency: (value) => set({ concurrency: clamp(Math.round(value), 1, 8) }),
      setUppercaseHashes: (value) => set({ uppercaseHashes: value }),
      setAutoDetectAlgorithm: (value) => set({ autoDetectAlgorithm: value }),
      setBackgroundPattern: (value) => set({ backgroundPattern: value }),
      setAnimations: (value) => set({ animations: value }),
      setHashUnlistedFiles: (value) => set({ hashUnlistedFiles: value }),
      reset: () => set({ ...defaults }),
    }),
    {
      name: 'checksum-verifier:settings',
      version: 1,
    },
  ),
);

/** Applies the theme class to <html>; safe to call from anywhere. */
export function applyTheme(theme: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}
