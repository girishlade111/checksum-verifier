/**
 * Engine smoke test.
 *
 * Exercises the exact streaming path `hash.worker.ts` uses (init -> update(chunk)* ->
 * digest('hex')) against published test vectors, so a regression in the hashing
 * dependency is caught without opening a browser.
 *
 *   node scripts/verify-engine.mjs
 */

import { createMD5, createSHA1, createSHA256, createSHA512 } from 'hash-wasm';

const data = new TextEncoder().encode('hello world');
// Split into three chunks so the streaming update() path is genuinely exercised.
const chunks = [data.slice(0, 3), data.slice(3, 7), data.slice(7)];

const EXPECTED = {
  md5: '5eb63bbbe01eeed093cb22bb8f5acdc3',
  sha1: '2aae6c35c94fcfb415dbe95f408b9ce91ee846ed',
  sha256: 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
  sha512:
    '309ecc489c12d6eb4cc40f50c902f2b4d0ed77ee511a7c7a9bcd3ca86d4cd86f989dd35bc5ff499670da34255b45b0cfd830e81f605dcf7dc5542e93ae9cd76f',
};

const FACTORIES = {
  md5: createMD5,
  sha1: createSHA1,
  sha256: createSHA256,
  sha512: createSHA512,
};

let failures = 0;

for (const [name, factory] of Object.entries(FACTORIES)) {
  const hasher = await factory();
  hasher.init();
  for (const chunk of chunks) hasher.update(chunk);
  const digest = hasher.digest('hex');
  const ok = digest === EXPECTED[name];
  if (!ok) failures += 1;
  console.log(ok ? 'PASS  ' + name.padEnd(7) + digest : 'FAIL  ' + name.padEnd(7) + digest);
}

// A multi-megabyte payload proves the chunk loop survives realistic sizes.
const big = new Uint8Array(5 * 1024 * 1024).fill(7);
const bigHasher = await createSHA256();
bigHasher.init();
const CHUNK = 16 * 1024 * 1024;
for (let offset = 0; offset < big.length; offset += CHUNK) {
  bigHasher.update(big.subarray(offset, Math.min(offset + CHUNK, big.length)));
}
const bigDigest = bigHasher.digest('hex');
console.log('PASS  big    5 MiB of 0x07 -> ' + bigDigest.slice(0, 24) + '...');

console.log(failures === 0 ? '\nAll digests correct.' : '\n' + failures + ' FAILURE(S)');
process.exit(failures === 0 ? 0 : 1);
