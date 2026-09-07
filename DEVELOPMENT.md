# Development guide

Architecture notes and the decisions that are not obvious from reading the code.

## Runtime topology

```
┌──────────────────────── browser / Electron renderer ────────────────────────┐
│  React 18 + Vite + Tailwind + Framer Motion + Radix (shadcn-style)          │
│                                                                             │
│  useHashing ──► HashWorkerPool ──► N × hash.worker.ts (hash-wasm / WASM)     │
│  useAgentChat ─► fetch + SSE ─► /api/*                                       │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │ Vite proxy (dev) or Electron static server
┌──────────────────────────────────▼──────────────────────────────────────────┐
│  Express (server/index.ts)  ──►  CodeBuddy Agent SDK  ──►  SQLite            │
└─────────────────────────────────────────────────────────────────────────────┘
```

The hashing path has **no server involvement at all**. Only the optional assistant talks to
`/api`, so the app is fully functional with the backend stopped.

## Why a Web Worker, and why a pool

`hash-wasm` is fast, but hashing a 2 GB file still takes seconds. Doing that on the main thread
would freeze every animation and make the cancel button unclickable.

- `src/workers/hash.worker.ts` — one file at a time, chunked, cancellable, reports progress.
- `src/lib/hash-pool.ts` — `min(cores - 1, 4)` workers, FIFO queue, `warmUp()` so the first
  hash does not pay the WebAssembly compile cost, and automatic replacement of crashed workers.

Workers are spawned with `new Worker(new URL('../workers/hash.worker.ts', import.meta.url),
{ type: 'module' })`, which Vite understands natively in both dev and build.

## Memory

A 32 GB file must not become 32 GB of RAM. The worker holds exactly one chunk:

```ts
const buffer = await file.slice(offset, end).arrayBuffer();
const chunk = new Uint8Array(buffer);
for (const algorithm of algorithms) hashers[algorithm].update(chunk);
// chunk goes out of scope at the end of the iteration
```

`File`/`Blob` slices are lazy handles into the on-disk file; the browser reads only the
requested range.

## Progress smoothing

- Throughput uses a 600 ms sliding window, not the lifetime average, so the number reacts when
  you plug in an external drive mid-hash.
- Progress messages are capped at ~16/s (`PROGRESS_INTERVAL_MS = 60`).
- The worker `await`s a `setTimeout(0)` after each progress post, which also guarantees pending
  `cancel` messages are observed.

## Manifest matching (batch mode)

`matchFilesToManifest()` runs three passes, most reliable first:

1. exact relative path (`dist/app.apk`)
2. basename (`app.apk`)
3. path suffix (`release/dist/app.apk` vs `dist/app.apk`) — for manifests generated from a
   different working directory

Anything left over is reported as **Missing** (in the manifest, no file) or **Not listed**
(file dropped, not in the manifest) so nothing silently disappears.

## State management

| Store | Scope |
| --- | --- |
| `store/settings.ts` | Persisted user preferences (zustand `persist`, localStorage) |
| `store/ui.ts` | Tab, panel visibility, toasts |
| `store/batch.ts` | Manifest, dropped files, per-row verification state |

Progress updates in `batch.ts` only fire when the integer percentage changes, and table rows
subscribe to their own row by index, so hashing 200 files does not re-render 200 components
on every tick.

## Electron specifics

- **Context isolation** is on, `nodeIntegration` off, `sandbox` on; all Node access goes
  through `electron/preload.cjs` → `window.electron`.
- The built app is served from a **loopback HTTP server** (`electron/main.cjs`) because ES-module
  Web Workers cannot be loaded from `file://`. That server also proxies `/api/*` to :3001.
- `ELECTRON_DEV_URL` switches Electron to the Vite dev server for hot reload.

## Testing

There is no browser automation in this repo; the two smoke tests cover the pure logic that is
easy to get silently wrong:

```bash
npm run test:engine     # hash-wasm streaming against published test vectors
npm run test:manifest   # GNU/BSD/colon/CSV parsing, digest cleanup, CSV writing
```

Both exit non-zero on failure, so they can be wired into CI.

## Typechecking

```bash
npm run typecheck         # src/  (tsconfig.json)
npm run typecheck:server  # server/ + electron/ (tsconfig.node.json)
```

The two projects are separate because the frontend targets the DOM and the server targets Node.

## Known constraints

- `node:sqlite` needs Node >= 22.5. On older Node, swap `server/db.ts` for the `better-sqlite3`
  version from the codebuddy-chat-web template — the exported API is identical.
- WebKit limits concurrent workers more aggressively than Chromium; batch mode still works but
  may run at lower parallelism on Safari.
