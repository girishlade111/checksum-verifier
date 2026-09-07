import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/**
 * Vite configuration.
 *
 * Notes for Electron:
 *  - `base: './'` keeps every asset URL relative so the built bundle also works when
 *    served from a sub-path (or through Electron's tiny static server).
 *  - `worker.format: 'es'` keeps the hashing worker as an ES module, which is what the
 *    `new Worker(new URL('./workers/hash.worker.ts', import.meta.url), { type: 'module' })`
 *    call sites emit. Both the Vite dev server and the built bundle serve it over http,
 *    so module workers are supported (this is why Electron serves `dist` over a local
 *    http server instead of `file://`).
 */
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  worker: {
    format: 'es',
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      // CodeBuddy Agent SDK bridge (Express server in /server)
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
    target: 'es2020',
  },
});
