/**
 * Regression guard for the `pump()` closure bug in src/lib/hash-pool.ts.
 *
 * Historical bug: the pool declared `let pooled` in *function* scope and captured it in
 * an async `.then()` created inside a `while` loop. `let` binds by reference, so when the
 * microtask ran, `pooled` already pointed at the next worker (or undefined). The guard
 * `if (pooled?.job?.jobId !== job.jobId) return;` then always short-circuited and
 * `postMessage` was never called — the job stayed in the `hashing` phase forever and no
 * result was ever produced.
 *
 * To reproduce this faithfully you MUST read the enclosing `let` variable from inside the
 * callback. Passing the worker in as a function *parameter* creates a fresh binding per
 * call and silently "fixes" the bug — which is exactly what the shipped fix does.
 *
 * Both pools below are complete standalone implementations that differ only in that one
 * line, so the comparison stays honest.
 */

const MAX_WORKERS = 3;

class FakeWorker {
  constructor(id) {
    this.id = id;
    this.sent = [];
  }
  postMessage(msg) {
    this.sent.push(msg);
  }
}

function makePool(broken) {
  const workers = [];
  const queue = [];
  let nextId = 1;

  function spawn() {
    const pooled = {
      id: nextId++,
      worker: new FakeWorker(nextId),
      ready: Promise.resolve(), // already compiled
      job: null,
    };
    workers.push(pooled);
    return pooled;
  }

  function freeWorker() {
    return workers.find((w) => w.job === null) ?? (workers.length < MAX_WORKERS ? spawn() : undefined);
  }

  function pump() {
    if (queue.length === 0) return;

    let pooled = freeWorker();

    while (pooled && queue.length > 0) {
      const job = queue.shift();

      if (broken) {
        // ---- shipped originally: captures the *binding* ----
        pooled.job = job;
        void pooled.ready.then(() => {
          if (pooled?.job?.jobId !== job.jobId) return;
          job.dispatched = true;
          pooled.worker.postMessage({ type: 'hash', ...job.request });
        });
      } else {
        // ---- fixed: captures the *value* ----
        const target = pooled;
        target.job = job;
        void target.ready.then(() => {
          if (target.job?.jobId !== job.jobId) return;
          job.dispatched = true;
          target.worker.postMessage({ type: 'hash', ...job.request });
        });
      }

      pooled = freeWorker();
    }
  }

  return {
    workers,
    pump,
    submit(request) {
      queue.push({ jobId: request.jobId, request, dispatched: false, cancelled: false });
      pump();
    },
  };
}

async function run(label, broken) {
  const pool = makePool(broken);
  for (const n of [1, 2, 3]) {
    pool.submit({ jobId: `job_${n}`, file: 'f', algorithms: ['sha256'] });
  }
  await new Promise((r) => setTimeout(r, 0));

  const sent = pool.workers.flatMap((w) => w.worker.sent.map((m) => m.jobId)).sort();
  console.log(label);
  console.log(`  workers spawned : ${pool.workers.length}`);
  console.log(`  dispatched      : ${sent.length ? sent.join(', ') : '(none)'}`);
  return sent;
}

const buggy = await run('BROKEN  (let captured by reference)', true);
const fixed = await run('FIXED   (const captured per iteration)', false);

console.log('');

let failed = false;

if (buggy.length !== 0) {
  console.error(`FAIL: expected the broken pattern to dispatch nothing, got ${buggy.length}.`);
  failed = true;
} else {
  console.log('PASS: broken pattern reproduces the hang — nothing is dispatched.');
}

if (fixed.length !== 3) {
  console.error(`FAIL: fixed pattern dispatched ${fixed.length}/3 jobs (expected 3).`);
  failed = true;
} else {
  console.log('PASS: fixed pattern dispatches all 3 jobs to their owning workers.');
}

process.exitCode = failed ? 1 : 0;
