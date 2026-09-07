/**
 * Electron preload — the only bridge between the sandboxed renderer and Node.
 *
 * Everything is exposed behind `window.electron` and forwarded through `contextBridge`,
 * so the renderer keeps `nodeIntegration: false` and `contextIsolation: true`.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  /** Lets the renderer know it is running inside the desktop shell. */
  isElectron: true,

  /** `win32` | `darwin` | `linux` */
  platform: process.platform,

  /** Base URL the renderer should use for the Agent API (already proxied). */
  getApiBase: () => ipcRenderer.invoke('app:getApiBase'),

  /** Window controls for the custom title bar. */
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  /** Reveals a file in Explorer / Finder. `file.path` is available on dragged-in files. */
  showItemInFolder: (fullPath) => ipcRenderer.invoke('shell:showItemInFolder', fullPath),

  /** Opens a URL in the system browser instead of a nested Electron window. */
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
});
