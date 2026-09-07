/**
 * End-to-end browser test for the worker pool.
 *
 * Runs the REAL HashWorkerPool + hash.worker.ts inside a real browser (Chrome, ES module
 * workers, hash-wasm) and reports results as JSON in #out. Driven by scripts/e2e-pool.mjs.
 *
 * This exists because the original "result not generated" bug lived purely in async
 * dispatch timing — it typechecked, built, and passed the pure-JS engine tests, and only
 * reproduced once a real worker was in play.
 */

import { HashWorkerPool, HashCancelledError } from '../src/lib/hash-pool';
import type { AlgorithmId } from '../src/lib/algorithms';

const EXPECTED = {
  md5: '5eb63bbbe01eeed093cb22bb8f5acdc3',
  sha1: '2aae6c35c94fcfb415dbe95f408b9ce91ee846ed',
  sha256: 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
  sha512:
    '309ecc489c12d6eb4cc40f50c902f2b4d0ed77ee511a7c7a9bcd3ca86d4cd86f989dd35bc5ff499670da34255b45b0cfd830e81f605dcf7dc5542e93ae9cd76f',
} satisfies Record<AlgorithmId, string>;

const ALL: AlgorithmId[] = ['md5', 'sha1', 'sha256', 'sha512'];

function makeFile(name: string, text: string): File {
  return new File([new TextEncoder().encode(text)], name, { type: 'application/octet-stream' });
}

const results: { name: string; pass: boolean; detail: string }[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
}

/* -- 1. Single job, all four algorithms, on a fresh pool ------------------------ */
async function testSingle() {
  const pool = new HashWorkerPool(2);
  const file = makeFile('hello.txt', 'hello world');

  const progressUpdates: number[] = [];
  const outcome = await pool.submit({
    file,
    algorithms: ALL,
    chunkSize: 4096,
    onProgress: (p) => progressUpdates.push(p.percent),
  }).promise;

  for (const algo of ALL) {
    const actual = outcome.results[algo];
    check(
      `single/${algo}`,
      actual === EXPECTED[algo],
      `got ${actual ?? 'undefined'} want ${EXPECTED[algo]}`,
    );
  }

  check('single/progress', progressUpdates.length > 0, `${progressUpdates.length} progress events`);
  check('single/fileSize', outcome.fileSize === 11, `fileSize=${outcome.fileSize}`);

  pool.terminate();
}

/* -- 2. Several concurrent jobs across the pool -------------------------------- */
async function testConcurrent() {
  const pool = new HashWorkerPool(3);
  const files = [
    makeFile('a.txt', 'hello world'),
    makeFile('b.txt', 'hello world'),
    makeFile('c.txt', 'hello world'),
    makeFile('d.txt', 'hello world'),
  ];

  const outcomes = await Promise.all(
    files.map((file) => pool.submit({ file, algorithms: ['sha256'] as AlgorithmId[] }).promise),
  );

  outcomes.forEach((outcome, index) => {
    check(
      `concurrent/job${index}`,
      outcome.results.sha256 === EXPECTED.sha256,
      `got ${outcome.results.sha256 ?? 'undefined'}`,
    );
  });

  pool.terminate();
}

/* -- 3. Cancel before the worker has booted (pre-dispatch path) ---------------- */
async function testCancelBeforeDispatch() {
  const pool = new HashWorkerPool(2);
  const file = makeFile('cancel.txt', 'hello world');

  const job = pool.submit({ file, algorithms: ['sha256'] as AlgorithmId[] });
  // Cancel synchronously: the worker is still compiling wasm, so `dispatched` is false.
  job.cancel();

  let cancelled = false;
  let message = '';
  try {
    await job.promise;
  } catch (error) {
    cancelled = error instanceof HashCancelledError;
    message = error instanceof Error ? error.message : String(error);
  }

  check('cancel/pre-dispatch', cancelled, `rejected with: ${message || 'nothing (hung)'}`);
  pool.terminate();
}

/* -- 4. A cancelled job must not block the next one --------------------------- */
async function testCancelThenSucceed() {
  const pool = new HashWorkerPool(1);
  const file = makeFile('x.txt', 'hello world');

  const first = pool.submit({ file, algorithms: ['sha256'] as AlgorithmId[] });
  first.cancel();
  try {
    await first.promise;
  } catch {
    /* expected */
  }

  const outcome = await pool.submit({ file, algorithms: ['sha256'] as AlgorithmId[] }).promise;
  check(
    'cancel/then-succeed',
    outcome.results.sha256 === EXPECTED.sha256,
    `got ${outcome.results.sha256 ?? 'undefined'}`,
  );

  pool.terminate();
}

/* -- 5. warmUp() must settle -------------------------------------------------- */
async function testWarmUp() {
  const pool = new HashWorkerPool(3);
  const settled = await Promise.race([
    pool.warmUp().then(() => 'settled'),
    new Promise((resolve) => setTimeout(() => resolve('timeout'), 15000)),
  ]);
  const stats = pool.getStats();
  check('warmUp/settles', settled === 'settled', `warmUp=${settled}, workers=${stats.workers}`);
  pool.terminate();
}

/* ----------------------------------------------------------------------------- */
const failures: string[] = [];

try {
  await testSingle();
} catch (error) {
  check('single', false, `threw: ${error instanceof Error ? error.message : String(error)}`);
}
try {
  await testConcurrent();
} catch (error) {
  check('concurrent', false, `threw: ${error instanceof Error ? error.message : String(error)}`);
}
try {
  await testCancelBeforeDispatch();
} catch (error) {
  check('cancel/pre-dispatch', false, `threw: ${error instanceof Error ? error.message : String(error)}`);
}
try {
  await testCancelThenSucceed();
} catch (error) {
  check('cancel/then-succeed', false, `threw: ${error instanceof Error ? error.message : String(error)}`);
}
try {
  await testWarmUp();
} catch (error) {
  check('warmUp/settles', false, `threw: ${error instanceof Error ? error.message : String(error)}`);
}

const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass);

const payload = {
  total: results.length,
  passed,
  failedCount: failed.length,
  failures: failed.map((f) => `${f.name}: ${f.detail}`),
  results,
};

const pre = document.getElementById('out');
if (pre) pre.textContent = JSON.stringify(payload, null, 2);
document.title = failed.length === 0 ? `E2E-OK-${passed}` : `E2E-FAIL-${failed.length}`;
