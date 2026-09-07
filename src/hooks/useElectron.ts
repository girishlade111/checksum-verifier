import { useEffect, useState } from 'react';

export interface ElectronApi {
  isElectron: boolean;
  platform: string;
  getApiBase: () => Promise<string>;
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  showItemInFolder: (fullPath: string) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
}

declare global {
  interface Window {
    electron?: ElectronApi;
  }
}

/** Access the Electron bridge, or `null` when running in a plain browser tab. */
export function useElectron(): ElectronApi | null {
  const [api] = useState<ElectronApi | null>(() => {
    if (typeof window === 'undefined') return null;
    const candidate = window.electron;
    return candidate && candidate.isElectron ? candidate : null;
  });

  return api;
}

/** `true` inside the desktop shell. */
export function useIsElectron(): boolean {
  return useElectron() !== null;
}

/** Reveals a file in the OS file manager (no-op in the browser). */
export function useShowInFolder() {
  const api = useElectron();

  useEffect(() => {
    /* keeps the hook order stable; api is read fresh inside the callback */
  }, [api]);

  return (fullPath?: string) => {
    if (!api || !fullPath) return;
    void api.showItemInFolder(fullPath);
  };
}
