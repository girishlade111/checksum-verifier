/**
 * End-to-end test of the real UI in headless Chrome.
 *
 *   node scripts/e2e-ui.mjs          (requires the Vite dev server on :5173)
 *
 * This is the test that actually reproduces the user's report: "app not working properly,
 * Result not generate." It drops a real file onto the Single File Verifier dropzone,
 * clicks Generate, and waits for the computed digest to render — the whole path through
 * React -> useHashing -> HashWorkerPool -> hash.worker.ts -> back into the DOM.
 *
 * Against the buggy pool this test hangs and reports a timeout, exactly like the app did.
 */

import { launchChrome, waitFor } from './lib/cdp.mjs';

// Overridable so the same suite can validate the production bundle served by
// `vite preview` — which is what Electron actually ships.
const APP_URL = process.env.E2E_URL ?? 'http://127.0.0.1:5173/';

// SHA-256 and MD5 of the ASCII string "hello world".
const SHA256 = 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9';
const MD5 = '5eb63bbbe01eeed093cb22bb8f5acdc3';

/**
 * Finds the feature action button ("Generate hash" / "Verify file" / "Hashing…").
 *
 * The tab strip also contains a tab labelled "Generate hash", and Radix renders tabs as
 * <button role="tab"> — a naive querySelectorAll('button') matches that tab first and
 * silently switches views instead of running the hash. Excluding role="tab" is essential.
 */
const FIND_ACTION_BUTTON = `(texts) => {
  const wanted = Array.isArray(texts) ? texts : [texts];
  return [...document.querySelectorAll('button')]
    .filter((b) => b.getAttribute('role') !== 'tab')
    .find((b) => wanted.some((t) => (b.textContent || '').includes(t))) ?? null;
}`;

const checks = [];
const check = (name, pass, detail = '') => {
  checks.push({ name, pass, detail });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(34)} ${pass ? '' : detail}`);
};

const ctx = await launchChrome({ timeoutMs: 60_000 });

try {
  await ctx.goto(APP_URL);
  console.log('UI E2E — File Checksum Verifier\n');

  /* 1. The app shell renders --------------------------------------------------- */
  const heading = await waitFor(ctx, `document.querySelector('h1')?.textContent ?? ''`);
  check('app shell renders', Boolean(heading), `h1 = ${JSON.stringify(heading)}`);

  const dropzoneReady = await waitFor(
    ctx,
    `!!document.querySelector('[role="button"][aria-label^="Drop a file to verify"]')`,
  );
  check('dropzone present', Boolean(dropzoneReady));

  /* 2. Drop a real file onto the dropzone -------------------------------------- */
  const dropped = await ctx.evaluate(`(async () => {
    const zone = document.querySelector('[role="button"][aria-label^="Drop a file to verify"]');
    if (!zone) return 'no-dropzone';

    const file = new File([new TextEncoder().encode('hello world')], 'hello.txt', {
      type: 'application/octet-stream',
    });
    const dt = new DataTransfer();
    dt.items.add(file);

    zone.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
    zone.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true }));
    zone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
    return 'dropped';
  })()`);
  check('file dispatched', dropped === 'dropped', `got ${dropped}`);

  // The file chip replaces the dropzone once state updates.
  const chip = await waitFor(
    ctx,
    `document.body.innerText.includes('hello.txt') ? 'shown' : ''`,
    { timeoutMs: 15_000 },
  );
  check('file accepted into state', chip === 'shown');

  /* 3. Click Generate hash ----------------------------------------------------- */
  // Watch for the "Hashing…" label with a MutationObserver installed BEFORE the click.
  // Polling is not reliable here: an 11-byte file finishes in well under one poll
  // interval, so the intermediate phase comes and goes unseen.
  await ctx.evaluate(`(() => {
    window.__sawHashing = false;
    const obs = new MutationObserver(() => {
      if (document.body.innerText.includes('Hashing')) window.__sawHashing = true;
    });
    obs.observe(document.body, { subtree: true, childList: true, characterData: true });
    window.__phaseObserver = obs;
    return 'watching';
  })()`);

  const clicked = await ctx.evaluate(`(() => {
    const btn = (${FIND_ACTION_BUTTON})(['Generate hash', 'Verify file']);
    if (!btn) return 'no-button';
    if (btn.disabled) return 'disabled';
    btn.click();
    return 'clicked';
  })()`);
  check('generate button clickable', clicked === 'clicked', `got ${clicked}`);

  /* 4. Wait for the computed digest to appear ---------------------------------- */
  // HashValue renders the digest grouped ("b94d27b9 934d3e08 …"), so strip all
  // whitespace before comparing against the contiguous hex string.
  const gotSha = await waitFor(
    ctx,
    `document.body.innerText.replace(/\\s+/g, '').toLowerCase().includes(${JSON.stringify(SHA256)}) ? 'ok' : ''`,
    { timeoutMs: 60_000, intervalMs: 500 },
  ).catch(() => '');

  check('SHA-256 digest rendered', gotSha === 'ok', 'digest never appeared in the DOM');

  // Read the observer flag: proves the UI really passed through the hashing phase.
  const sawHashing = await ctx.evaluate('window.__sawHashing === true');
  check('enters hashing phase', sawHashing === true, 'button never switched to "Hashing…"');

  /* 5. The verdict badge should be present ------------------------------------- */
  const verdict = await ctx.evaluate(
    `document.body.innerText.includes('Hash generated') || document.body.innerText.includes('Match') ? 'ok' : 'none'`,
  );
  check('verdict badge rendered', verdict === 'ok', `got ${verdict}`);

  /* 6. Switch to SHA-1 and confirm the digest updates -------------------------- */
  const md5Result = await ctx.evaluate(`(async () => {
    // Open the algorithm Select and choose MD5.
    const trigger = document.querySelector('#algorithm');
    if (!trigger) return 'no-select';
    trigger.click();
    await new Promise((r) => setTimeout(r, 400));
    const option = [...document.querySelectorAll('[role="option"]')].find((o) =>
      /MD5/.test(o.textContent || ''),
    );
    if (!option) return 'no-option';
    option.click();
    await new Promise((r) => setTimeout(r, 400));
    const btn = (${FIND_ACTION_BUTTON})(['Generate hash', 'Verify file']);
    if (!btn) return 'no-button';
    if (btn.disabled) return 'disabled';
    btn.click();
    return 'clicked';
  })()`);

  if (md5Result === 'clicked') {
    const gotMd5 = await waitFor(
      ctx,
      `document.body.innerText.replace(/\\s+/g, '').toLowerCase().includes(${JSON.stringify(MD5)}) ? 'ok' : ''`,
      { timeoutMs: 60_000, intervalMs: 500 },
    ).catch(() => '');
    check('algorithm switch + re-hash', gotMd5 === 'ok', 'MD5 digest never appeared');
  } else {
    check('algorithm switch + re-hash', false, `could not switch algorithm: ${md5Result}`);
  }

  if (ctx.consoleErrors.length) {
    console.log('\nConsole errors:');
    for (const e of [...new Set(ctx.consoleErrors)].slice(0, 8)) {
      console.log('  ' + String(e).split('\n')[0]);
    }
  }
} finally {
  ctx.cleanup();
}

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} UI checks passed.`);

// Set exitCode rather than calling process.exit(): process.exit() truncates buffered
// stdout when it is a pipe, which made whole test runs silently print nothing.
process.exitCode = failed.length === 0 ? 0 : 1;
