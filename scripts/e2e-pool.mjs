/**
 * Drives e2e/pool-test.html in headless Chrome.
 *
 *   node scripts/e2e-pool.mjs          (requires the Vite dev server on :5173)
 *
 * Exercises the REAL HashWorkerPool + hash.worker.ts inside a real browser: ES module
 * workers, hash-wasm, progress events, concurrency and cancellation.
 *
 * Why a real browser: the original "result not generated" bug lived entirely in async
 * dispatch timing inside the pool. It typechecked, it built, and the pure-JS engine tests
 * passed — it only reproduced once an actual worker was in play.
 */

import { launchChrome, waitFor } from './lib/cdp.mjs';

const TARGET_URL = 'http://127.0.0.1:5173/e2e/pool-test.html';

const ctx = await launchChrome({ timeoutMs: 90_000 });

try {
  await ctx.goto(TARGET_URL);

  const title = await waitFor(
    ctx,
    `/^E2E-(OK|FAIL)/.test(document.title) ? document.title : ''`,
    { timeoutMs: 90_000, intervalMs: 700 },
  );

  const payload = JSON.parse(
    await ctx.evaluate(`document.getElementById('out').textContent`),
  );

  console.log(`Browser E2E — ${payload.passed}/${payload.total} checks passed\n`);
  for (const r of payload.results) {
    console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name.padEnd(24)} ${r.pass ? '' : r.detail}`);
  }

  if (ctx.consoleErrors.length) {
    console.log('\nConsole errors:');
    for (const e of [...new Set(ctx.consoleErrors)].slice(0, 10)) {
      console.log('  ' + String(e).split('\n')[0]);
    }
  }

  console.log('');
  process.exitCode = payload.failedCount === 0 ? 0 : 1;
} catch (error) {
  console.error('\nE2E failed:', error.message);
  if (ctx.consoleErrors.length) {
    console.error('\nConsole errors:');
    for (const e of [...new Set(ctx.consoleErrors)].slice(0, 10)) {
      console.error('  ' + String(e).split('\n')[0]);
    }
  }
  process.exitCode = 1;
} finally {
  ctx.cleanup();
}
