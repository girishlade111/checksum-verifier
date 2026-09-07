/**
 * Minimal Chrome DevTools Protocol client used by the browser E2E scripts.
 *
 * Deliberately dependency-free: Node ships a global `WebSocket`, and that plus `fetch`
 * is all CDP needs. Keeps the E2E suite installable without pulling in Puppeteer.
 */

import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

/** Returns a port the OS says is currently free. */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

class CdpSession {
  /** @param {WebSocket} socket */
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    /** @type {Map<number, {resolve: Function, reject: Function}>} */
    this.pending = new Map();
    /** @type {Map<string, Function>} */
    this.handlers = new Map();
    socket.addEventListener('message', (event) => this.#onMessage(String(event.data)));
  }

  #onMessage(raw) {
    const msg = JSON.parse(raw);
    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message} (code ${msg.error.code})`));
      else resolve(msg.result);
      return;
    }
    const handler = this.handlers.get(msg.method);
    if (handler) handler(msg.params);
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify(payload));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 30_000);
    });
  }

  on(method, handler) {
    this.handlers.set(method, handler);
  }
}

/**
 * Boots headless Chrome and returns a page bound to a fresh tab.
 *
 * Every run gets its own user-data-dir and its own debugging port. Sharing either causes
 * intermittent "endpoint never came up" failures when a previous Chrome is still alive,
 * and killing stray chrome.exe processes is not acceptable — the user's own browser may
 * be among them.
 *
 * @param {object} [options]
 * @param {number} [options.port]        Override the debugging port.
 * @param {string} [options.profileDir]  Override the (isolated) user-data-dir.
 * @param {number} [options.timeoutMs]
 */
export async function launchChrome({ port, profileDir, timeoutMs = 60_000 } = {}) {
  const debugPort = port ?? (await freePort());
  const ownsProfile = !profileDir;
  const profile = profileDir ?? (await mkdtemp(join(tmpdir(), 'cbc-e2e-')));

  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${debugPort}`,
      '--remote-allow-origins=*',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      `--user-data-dir=${profile}`,
      '--window-size=1440,1000',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let killed = false;
  const cleanup = () => {
    if (killed) return;
    killed = true;
    try {
      chrome.kill('SIGKILL');
    } catch {
      /* already exited */
    }
    if (ownsProfile) {
      // Give Chrome a moment to release the profile dir before removing it.
      setTimeout(() => {
        void rm(profile, { recursive: true, force: true });
      }, 500).unref?.();
    }
  };

  // Wait for the DevTools HTTP endpoint.
  let version;
  for (let i = 0; i < 120; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (res.ok) {
        version = await res.json();
        break;
      }
    } catch {
      /* not up yet */
    }
    await delay(500);
  }
  if (!version) {
    cleanup();
    throw new Error(
      `Chrome DevTools endpoint never came up on port ${debugPort} (profile ${profile}). ` +
        'Another Chrome may be holding the port; the test normally avoids this by picking a free one.',
    );
  }

  const browser = new CdpSession(new WebSocket(version.webSocketDebuggerUrl));
  await new Promise((resolve, reject) => {
    browser.socket.addEventListener('open', resolve, { once: true });
    browser.socket.addEventListener('error', reject, { once: true });
  });

  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });

  const page = { send: (method, params) => browser.send(method, params, sessionId) };

  /** Console errors and uncaught exceptions, for diagnosing silent failures. */
  const consoleErrors = [];
  browser.on('Runtime.exceptionThrown', (params) => {
    const d = params.exceptionDetails;
    consoleErrors.push(d.exception?.description || d.text || 'unknown exception');
  });
  browser.on('Runtime.consoleAPICalled', (params) => {
    if (params.type === 'error') {
      consoleErrors.push(params.args.map((a) => a.value ?? a.description ?? a.type).join(' '));
    }
  });

  await page.send('Runtime.enable');
  await page.send('Page.enable');

  return {
    browser,
    page,
    consoleErrors,
    cleanup,
    /**
     * Navigate and wait for the new document to actually be live.
     *
     * Polling readyState alone is not enough: the tab starts on about:blank, which is
     * already 'complete', so a naive check returns before navigation has even begun.
     * Wait for a real http(s) URL as well, and tolerate "execution context was destroyed"
     * while the document is being swapped.
     */
    async goto(url) {
      await page.send('Page.navigate', { url });
      const started = Date.now();
      while (Date.now() - started < 30_000) {
        await delay(200);
        const r = await page
          .send('Runtime.evaluate', {
            expression:
              "document.readyState === 'complete' && /^https?:/.test(location.href) ? location.href : ''",
            returnByValue: true,
          })
          .catch(() => ({ result: { value: '' } }));
        if (r.result?.value) return;
      }
      throw new Error(`Page never finished loading: ${url}`);
    },
    /** Evaluate an expression and return its JSON value. */
    async evaluate(expression) {
      const r = await page.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (r.exceptionDetails) {
        throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      }
      return r.result?.value;
    },
    timeoutMs,
  };
}

/**
 * Fails fast if the target URL is not being served.
 *
 * Without this, a stopped dev server surfaces as a confusing 90-second "timed out
 * waiting for <selector>" from deep inside the test rather than as the real cause.
 */
export async function requireServer(url, { timeoutMs = 10_000 } = {}) {
  const started = Date.now();
  let lastError = 'unknown error';
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) return;
      lastError = `HTTP ${res.status}`;
    } catch (error) {
      lastError = error?.cause?.code || error?.message || String(error);
    }
    await delay(500);
  }
  throw new Error(
    `Cannot reach ${url} (${lastError}). Start the dev server first: npm run dev:web`,
  );
}

/**
 * Polls `expression` until it returns a truthy value.
 * @returns {Promise<any>} the first truthy value
 */
export async function waitFor(ctx, expression, { timeoutMs = ctx.timeoutMs, intervalMs = 400 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await ctx.evaluate(expression);
    if (value) return value;
    await delay(intervalMs);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}
