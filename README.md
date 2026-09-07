# Checksum Verifier — File Integrity Studio

Verify downloaded files against published digests with **MD5, SHA-1, SHA-256 and SHA-512**.

Everything happens **on your device**. Files are never uploaded, there is no telemetry, and the
hashing runs in WebAssembly Web Workers so multi-gigabyte ISOs never freeze the UI.

The app ships as three things at once:

| Target | Command | Notes |
| --- | --- | --- |
| Browser app (recommended for development) | `npm run dev` | Vite on `http://localhost:5173` + Agent API on `:3001` |
| Electron desktop app | `npm run dev:electron` | Same code, wrapped in a native window |
| Static bundle | `npm run build` | Output in `dist/` |

---

## Quick start

```bash
npm install
npm run dev
# open http://localhost:5173
```

Hashing works immediately — it needs no configuration and no network.

### Enabling the AI assistant (optional)

The assistant is powered by the CodeBuddy Agent SDK and runs on a small Express server:

```bash
cp .env.example .env
# add CODEBUDDY_API_KEY (or log in with the CodeBuddy CLI)
npm run dev
```

If the backend is not running, the app still works; the assistant panel simply reports
"Agent backend offline" and tells you how to start it.

### Electron

```bash
npm run dev:electron      # Vite + API + Electron with hot reload
npm run start:electron    # build once, then launch the desktop shell
```

Electron serves the built `dist/` over a loopback HTTP server rather than `file://`, because
Chromium refuses to load ES-module Web Workers from `file://` URLs. The same server proxies
`/api/*` to the Express backend.

---

## Features

**Single verify** — drop a file, paste the expected digest, get an unambiguous
match / mismatch verdict. The algorithm is auto-detected from the digest length, and pasted
values are cleaned up first (`sha256:` prefixes, quotes, whitespace, trailing filenames,
uppercase).

**Batch verify** — drop a checksum manifest (`SHA256SUMS`, `MD5SUMS`, BSD-style,
colon-separated or CSV) plus a folder of files. Files are matched by path, then basename,
then path suffix. The results table shows Verified / Mismatch / Missing / Not-listed per file,
and you can export a CSV report or write the computed digests back out as a GNU manifest.

**Generate hash** — compute all four digests for a file in a single pass over the data.

**Assistant** — a streaming CodeBuddy Agent, with tool-call visibility, permission prompts,
model switching and SQLite-backed conversation history. It cannot read your files; it only
sees what you paste.

---

## How the hashing engine works

`src/workers/hash.worker.ts` is the core of the app:

1. **Chunked streaming.** The file is read with `Blob.slice().arrayBuffer()` one chunk at a
   time (16 MB by default, configurable in Settings). Only one chunk is alive at any moment,
   so a 32 GB ISO costs ~16 MB of RAM instead of 32 GB.
2. **Multiple algorithms, one pass.** Every selected hash is fed the *same* chunk in the same
   loop iteration — generating four digests costs one disk read, not four.
3. **Cooperative cancellation.** `slice().arrayBuffer()` awaits real I/O, which yields to the
   event loop, so a `cancel` message is always processed between chunks.
4. **Throttled progress.** Progress is emitted at most ~16×/second, so a 2 GB file produces
   ~130 UI updates rather than thousands.

`src/lib/hash-pool.ts` wraps the worker in a pool of `min(cores - 1, 4)` workers so batch
verification runs in parallel without ever blocking the main thread.

---

## Project structure

```
src/
├── components/
│   ├── ui/            shadcn-style primitives (Radix + Tailwind + CVA)
│   ├── features/      SingleVerifier · BatchVerifier · HashGenerator · Assistant · Settings
│   ├── shared/        Dropzone · ProgressBar · FileIcon · ResultBadge · HashValue · …
│   └── layout/        AppHeader (animated tabs) · BackgroundFX · Toaster
├── hooks/             useHashing · useFileDrop · useAgentChat · useElectron · useCopyToClipboard
├── lib/               algorithms · compare · manifest-parser · hash-pool · pick-files · format
├── store/             zustand stores (settings · ui · batch)
├── workers/           hash.worker.ts + the main<->worker message protocol
└── types.ts           shared domain types

server/                Express + CodeBuddy Agent SDK bridge (SSE streaming, SQLite)
electron/              main.cjs + preload.cjs
scripts/               smoke tests for the hashing engine and manifest parser
```

---

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server + Agent API (browser development) |
| `npm run dev:web` | Vite only |
| `npm run dev:server` | Express Agent API only |
| `npm run dev:electron` | Vite + API + Electron |
| `npm run build` | Typecheck, then build to `dist/` |
| `npm run start:electron` | Build and open the desktop app |
| `npm run typecheck` | Typecheck the frontend |
| `npm run typecheck:server` | Typecheck the server and Electron config |
| `npm test` | Run the engine + manifest smoke tests |

---

## Accessibility

Dropzones are reachable by keyboard (Tab → Enter/Space opens the native picker), progress bars
expose `role="progressbar"` with live values, verdicts announce through `aria-live`, every icon-only
button has an `aria-label`, and the OS reduced-motion preference disables CSS animation. The
in-app **Animations** switch covers Framer Motion.

## Requirements

- Node.js 22.5+ (the server uses the built-in `node:sqlite`; no native modules to compile)
- A modern browser with WebAssembly and ES-module Web Workers
