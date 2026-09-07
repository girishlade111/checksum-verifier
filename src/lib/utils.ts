import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn/ui style class merger. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** True when the app is running inside Electron (vs. a plain browser tab). */
export const isElectron =
  typeof navigator !== 'undefined' &&
  /electron/i.test(navigator.userAgent) &&
  typeof window !== 'undefined' &&
  typeof (window as unknown as { electron?: unknown }).electron !== 'undefined';

/** Defensive clamp helper. */
export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Promise-based sleep, used by the simulated "warm up" states. */
export function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function createId(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}
