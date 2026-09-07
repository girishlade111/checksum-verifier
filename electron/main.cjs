/**
 * Electron main process.
 *
 * Why a local HTTP server instead of `file://`?
 * ---------------------------------------------------------------------------------
 * The hashing engine runs in an **ES module Web Worker** (`new Worker(url, {type:'module'})`).
 * Chromium refuses to load module workers from `file://` URLs, and the `hash-wasm`
 * payload is fetched by the worker itself. Serving the built `dist/` folder over a
 * loopback HTTP server sidesteps that entirely and keeps dev/prod behaviour identical.
 *
 * The same server transparently proxies `/api/*` to the Express Agent backend, so the
 * frontend can keep using the relative `/api` prefix it uses in the browser.
 */

const { app, BrowserWindow, ipcMain, shell, dialog, nativeImage } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');

const DEV_URL = process.env.ELECTRON_DEV_URL || 'http://localhost:5173';
const API_PORT = Number(process.env.AGENT_API_PORT) || 3001;
const DIST_DIR = path.join(__dirname, '..', 'dist');

let staticServer = null;
let staticPort = null;

/* ------------------------------- mime handling ------------------------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
};

function mimeFor(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

/* --------------------------------- utilities -------------------------------- */

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** Streams `/api/*` requests through to the Express backend, SSE-friendly. */
function proxyToApi(req, res) {
  const upstream = http.request(
    {
      host: '127.0.0.1',
      port: API_PORT,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${API_PORT}` },
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );

  upstream.on('error', () => {
    if (res.headersSent) return res.end();
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'agent-backend-offline',
        message: `The Agent API on port ${API_PORT} is not running. Start it with "npm run dev:server".`,
      }),
    );
  });

  req.pipe(upstream);
}

/* ------------------------------ static file host ---------------------------- */

async function startStaticServer() {
  const port = await findFreePort();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);

    if (url.pathname.startsWith('/api/')) {
      proxyToApi(req, res);
      return;
    }

    // Strip the query string, map `/` to index.html, then fall back to SPA routing.
    let pathname = decodeURIComponent(url.pathname);
    let filePath = path.join(DIST_DIR, pathname);

    // Guard against path traversal.
    if (!filePath.startsWith(DIST_DIR)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(DIST_DIR, 'index.html');
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': mimeFor(filePath), 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  });

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));

  staticServer = server;
  staticPort = port;
  return port;
}

/* --------------------------------- window ---------------------------------- */

function appIcon() {
  const candidates = [
    path.join(__dirname, '..', 'public', 'icon.png'),
    path.join(__dirname, 'icon.png'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return nativeImage.createFromPath(candidate);
  }
  return undefined;
}

async function createWindow() {
  const isDev = Boolean(process.env.ELECTRON_DEV_URL);
  const icon = appIcon();

  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#09090b',
    title: 'Checksum Verifier',
    ...(icon ? { icon } : {}),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      // The hashing worker is same-origin, so this stays on.
      allowRunningInsecureContent: false,
    },
  });

  const target = isDev ? DEV_URL : `http://127.0.0.1:${staticPort}/`;
  await win.loadURL(target);

  win.once('ready-to-show', () => win.show());

  // Never navigate away from the local app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  return win;
}

/* ----------------------------------- IPC ----------------------------------- */

function registerIpc(getWindow) {
  ipcMain.handle('app:getApiBase', () => '/api');

  ipcMain.handle('window:minimize', (event) => event.sender.getOwnerBrowserWindow()?.minimize());
  ipcMain.handle('window:maximize', (event) => {
    const win = event.sender.getOwnerBrowserWindow();
    if (!win) return false;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return win.isMaximized();
  });
  ipcMain.handle('window:close', (event) => event.sender.getOwnerBrowserWindow()?.close());
  ipcMain.handle('window:isMaximized', (event) =>
    Boolean(event.sender.getOwnerBrowserWindow()?.isMaximized()),
  );

  ipcMain.handle('shell:showItemInFolder', (_event, fullPath) => {
    if (typeof fullPath === 'string' && fullPath) shell.showItemInFolder(fullPath);
  });

  ipcMain.handle('shell:openExternal', async (_event, url) => {
    if (typeof url === 'string' && /^https?:\/\//.test(url)) await shell.openExternal(url);
  });
}

/* --------------------------------- lifecycle -------------------------------- */

let mainWindow = null;

async function boot() {
  if (!process.env.ELECTRON_DEV_URL) {
    if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
      dialog.showErrorBox(
        'Build not found',
        'Run "npm run build" once so Electron has a dist/ folder to serve.',
      );
      app.quit();
      return;
    }
    await startStaticServer();
  }

  registerIpc(() => mainWindow);
  mainWindow = await createWindow();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(boot).catch((error) => {
  console.error('[electron] boot failed', error);
  dialog.showErrorBox('Startup error', String(error && error.message ? error.message : error));
  app.quit();
});

app.on('window-all-closed', () => {
  if (staticServer) staticServer.close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) boot();
});

app.on('before-quit', () => {
  if (staticServer) staticServer.close();
});
