/**
 * Manifest parser smoke test:  npx tsx scripts/verify-manifest.ts
 *
 * Covers the four layouts people actually paste at you, plus comment/signature
 * handling and the CSV/manifest writers.
 */

import { parseManifest, buildManifest, buildCsv } from '../src/lib/manifest-parser';
import { cleanExpectedHash, inspectExpectedHash } from '../src/lib/compare';

const H32 = 'd41d8cd98f00b204e9800998ecf8427e';
const H64 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    (ok ? 'PASS  ' : 'FAIL  ') + label + (ok ? '' : `  got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`),
  );
}

// 1. GNU coreutils (sha256sum) — two spaces, ./ prefix, binary marker.
const gnu = `${H64}  ./dist/app.apk\n${H64} *release/other.zip\n# a comment\n`;
const gnuParsed = parseManifest(gnu);
check('gnu: entry count', gnuParsed.entries.length, 2);
check('gnu: first filename', gnuParsed.entries[0].filename, 'dist/app.apk');
check('gnu: binary marker stripped', gnuParsed.entries[1].filename, 'release/other.zip');
check('gnu: basename', gnuParsed.entries[1].basename, 'other.zip');
check('gnu: algorithm', gnuParsed.algorithm, 'sha256');
check('gnu: skipped (comment + blank)', gnuParsed.skipped, 2);

// 2. BSD / OpenSSL style.
const bsd = `SHA256 (dist/app.apk) = ${H64}\nMD5 (legacy.iso) = ${H32}\n`;
const bsdParsed = parseManifest(bsd);
check('bsd: entry count', bsdParsed.entries.length, 2);
check('bsd: filename', bsdParsed.entries[0].filename, 'dist/app.apk');
check('bsd: md5 detected', bsdParsed.entries[1].algorithm, 'md5');
check('bsd: mixed algorithms -> null', bsdParsed.algorithm, null);

// 3. Colon and CSV separated.
check('colon: filename', parseManifest(`dist/app.apk: ${H64}`).entries[0]?.filename, 'dist/app.apk');
check('csv: filename', parseManifest(`dist/app.apk,${H64}`).entries[0]?.filename, 'dist/app.apk');

// 4. Windows paths + GPG signature block.
const win = `-----BEGIN PGP SIGNED MESSAGE-----\n${H64}  .\\dist\\app.apk\n-----END PGP SIGNATURE-----`;
const winParsed = parseManifest(win);
check('windows: path normalised', winParsed.entries[0]?.filename, 'dist/app.apk');
check('windows: signature lines skipped', winParsed.skipped, 2);

// 5. Garbage lines are reported, not thrown.
const bad = parseManifest('not a checksum\n');
check('errors: reported', bad.errors.length, 1);
check('errors: entries empty', bad.entries.length, 0);

// 6. Pasted digest cleanup.
check('clean: sha256: prefix', cleanExpectedHash(`sha256:${H64}`), H64);
check('clean: uppercase', cleanExpectedHash(H64.toUpperCase()), H64);
check('clean: whitespace', cleanExpectedHash(`  ${H64}  `), H64);
check('clean: trailing filename', cleanExpectedHash(`${H64}  ./dist/app.apk`), H64);
check('clean: quotes', cleanExpectedHash(`"${H64}"`), H64);
// A 32-char digest is a perfectly valid MD5, so it stays usable — but it carries an
// advisory because it cannot be the SHA-256 the caller asked for.
const mismatch = inspectExpectedHash(H32, 'sha256');
check('inspect: md5 still usable', mismatch.valid, true);
check('inspect: md5 detected', mismatch.detected, 'md5');
check('inspect: advisory present', Boolean(mismatch.reason), true);
check('inspect: junk rejected', inspectExpectedHash('zzzz', 'sha256').valid, false);

// 7. Writers round-trip.
const manifest = buildManifest([{ filename: 'dist/app.apk', hash: H64 }], 'sha256');
check('buildManifest: gnu format', manifest.includes(`${H64}  dist/app.apk`), true);
const csv = buildCsv([{ a: '1', b: 'x,y' }], [{ key: 'a', header: 'A' }, { key: 'b', header: 'B' }]);
check('buildCsv: quotes commas', csv.trim().split('\n')[1], '1,"x,y"');

console.log(failures === 0 ? '\nAll manifest checks passed.' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
