/**
 * Checksum manifest parsing.
 *
 * Supports the formats you actually meet in the wild:
 *
 *   GNU coreutils (`sha256sum`):   `3a7b…f1  ./dist/app.apk`   (two spaces, `*` = binary mode)
 *   BSD / OpenSSL (`shasum -c`):   `SHA256 (./dist/app.apk) = 3a7b…f1`
 *   Colon separated:               `./dist/app.apk: 3a7b…f1`
 *   CSV-ish:                       `./dist/app.apk,3a7b…f1`
 *   Bare hash (single file):       `3a7b…f1`
 */

import { detectAlgorithm, type AlgorithmId } from './algorithms';
import { baseName } from './format';

export interface ManifestEntry {
  /** Lower-cased hex digest. */
  hash: string;
  /** Path exactly as written in the manifest. */
  filename: string;
  /** Basename used for matching against dropped files. */
  basename: string;
  /** Inferred from the digest length; `null` when unrecognised. */
  algorithm: AlgorithmId | null;
  line: number;
  raw: string;
}

export interface ManifestParseResult {
  entries: ManifestEntry[];
  /** Single algorithm shared by every entry, when it can be determined. */
  algorithm: AlgorithmId | null;
  /** Non-fatal per-line problems (bad hash chars, missing filename, …). */
  errors: string[];
  /** Lines that were comments, blank, or unmatched. */
  skipped: number;
  /** Total number of lines inspected. */
  lines: number;
}

export type ManifestFormat = 'gnu' | 'bsd' | 'colon' | 'csv' | 'bare' | 'unknown';

const HEX = '([0-9a-fA-F]{8,128})';
const GNU_RE = new RegExp(`^${HEX}\\s+\\*?["']?(.*?)["']?\\s*$`);
const BSD_RE = new RegExp(`^(?:SHA|MD5)[- ]?\\d*\\s*\\((.*?)\\)\\s*=\\s*${HEX}\\s*$`, 'i');
const COLON_RE = new RegExp(`^(.*?)\\s*:\\s*${HEX}\\s*$`);
const CSV_RE = new RegExp(`^(.*?)\\s*,\\s*${HEX}\\s*$`);
const BARE_RE = new RegExp(`^${HEX}\\s*$`);

function cleanPath(rawPath: string): string {
  let value = rawPath.trim();
  // Strip a single layer of quotes.
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  // `./dist/app.apk`, `.\\dist\\app.apk` -> `dist/app.apk`
  value = value.replace(/\\/g, '/');
  value = value.replace(/^\.\//, '');
  value = value.replace(/^\/+/, '');
  // A `*` prefix marks binary mode in GNU manifests.
  value = value.replace(/^\*/, '');
  return value.trim();
}

export function detectManifestFormat(text: string): ManifestFormat {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';') || line.startsWith('//')) continue;
    if (BSD_RE.test(line)) return 'bsd';
    if (GNU_RE.test(line) && line.includes(' ')) return 'gnu';
    if (COLON_RE.test(line)) return 'colon';
    if (CSV_RE.test(line)) return 'csv';
    if (BARE_RE.test(line)) return 'bare';
  }
  return 'unknown';
}

export function parseManifest(
  text: string,
  options: { defaultAlgorithm?: AlgorithmId } = {},
): ManifestParseResult {
  const entries: ManifestEntry[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/);
  let skipped = 0;
  const seenAlgorithms = new Set<AlgorithmId>();

  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.trim();

    if (!line) {
      skipped += 1;
      return;
    }
    if (line.startsWith('#') || line.startsWith(';') || line.startsWith('//')) {
      skipped += 1;
      return;
    }
    // Ignore GPG signature blocks produced by `sha256sum --sign`.
    if (line.startsWith('-----BEGIN') || line.startsWith('-----END')) {
      skipped += 1;
      return;
    }

    let hash: string | null = null;
    let filename = '';

    const bsd = BSD_RE.exec(line);
    const gnu = !bsd ? GNU_RE.exec(line) : null;
    const colon = !bsd && !gnu ? COLON_RE.exec(line) : null;
    const csv = !bsd && !gnu && !colon ? CSV_RE.exec(line) : null;
    const bare = !bsd && !gnu && !colon && !csv ? BARE_RE.exec(line) : null;

    if (bsd) {
      filename = bsd[1];
      hash = bsd[2];
    } else if (gnu) {
      hash = gnu[1];
      filename = gnu[2];
    } else if (colon) {
      filename = colon[1];
      hash = colon[2];
    } else if (csv) {
      filename = csv[1];
      hash = csv[2];
    } else if (bare) {
      hash = bare[1];
      filename = '';
    }

    if (!hash) {
      errors.push(`Line ${lineNumber}: no hex digest found`);
      skipped += 1;
      return;
    }

    const normalisedHash = hash.trim().toLowerCase();
    if (!/^[0-9a-f]+$/.test(normalisedHash)) {
      errors.push(`Line ${lineNumber}: digest contains non-hex characters`);
      skipped += 1;
      return;
    }

    const cleaned = cleanPath(filename);
    if (!cleaned) {
      errors.push(`Line ${lineNumber}: digest without a filename`);
      skipped += 1;
      return;
    }

    const algorithm = detectAlgorithm(normalisedHash) ?? options.defaultAlgorithm ?? null;
    if (algorithm) seenAlgorithms.add(algorithm);

    entries.push({
      hash: normalisedHash,
      filename: cleaned,
      basename: baseName(cleaned),
      algorithm,
      line: lineNumber,
      raw: rawLine,
    });
  });

  return {
    entries,
    algorithm: seenAlgorithms.size === 1 ? [...seenAlgorithms][0] : null,
    errors,
    skipped,
    lines: lines.length,
  };
}

/** Generates a GNU style manifest (`<hash>  <filename>`), ready to be fed back into `sha256sum -c`. */
export function buildManifest(
  rows: Array<{ filename: string; hash: string }>,
  algorithm: AlgorithmId,
): string {
  const header = `# Generated by Checksum Verifier — ${algorithm.toUpperCase()}\n`;
  const body = rows
    .filter((row) => Boolean(row.hash))
    .map((row) => `${row.hash.toLowerCase()}  ${row.filename}`)
    .join('\n');
  return `${header}${body}\n`;
}

/** Escapes a value for a CSV cell. */
function csvCell(value: string) {
  const safe = value ?? '';
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function buildCsv(
  rows: Array<Record<string, string | number | null | undefined>>,
  columns: Array<{ key: string; header: string }>,
): string {
  const head = columns.map((column) => csvCell(column.header)).join(',');
  const body = rows
    .map((row) =>
      columns
        .map((column) => {
          const value = row[column.key];
          return csvCell(value === null || value === undefined ? '' : String(value));
        })
        .join(','),
    )
    .join('\n');
  return `${head}\n${body}\n`;
}

export function downloadTextFile(filename: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next tick so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
