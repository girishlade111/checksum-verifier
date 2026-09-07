import { ALGORITHM_MAP, detectAlgorithm, type AlgorithmId } from './algorithms';

/**
 * Real-world "expected hash" values are messy. People paste:
 *   `SHA256: 3a7b…`, `sha256:3a7b…`, `"3a7b…"`, `*3a7b…`, `3a7b…  (from README)`,
 * or a digest with stray newlines from a copied terminal.
 *
 * This strips everything that is not the digest itself.
 */
export function cleanExpectedHash(input: string): string {
  if (!input) return '';

  let value = input.trim();

  // Take the first whitespace-delimited token — handles "3a7b…  ./file.zip" pastes.
  const firstToken = value.split(/\s+/)[0] ?? '';
  if (/^[0-9a-fA-F]{8,128}$/.test(firstToken)) {
    value = firstToken;
  } else {
    value = value.replace(/\s+/g, '');
  }

  // `sha256:…`, `SHA-512=…`, `md5(…)=…`
  value = value.replace(/^(?:sha|md5)[- ]?(\d{1,3})?\s*[=:]/i, '');
  value = value.replace(/^[=:]/, '');

  // Surrounding quotes and GNU binary-mode markers.
  value = value.replace(/^["'`*]+/, '').replace(/["'`*]+$/, '');

  return value.toLowerCase();
}

/** Prefix the manifest format expects, e.g. `sha256:`. Mostly cosmetic. */
export function withPrefix(hash: string, algorithm: AlgorithmId): string {
  return `${algorithm}:${hash.toLowerCase()}`;
}

/**
 * Length-aware equality. `timingSafeEqual` is not exposed to the browser, and the
 * digests are public anyway, so this is a clarity helper rather than a security control.
 */
export function hashesEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (left.length !== right.length) return false;
  return left === right;
}

export interface ExpectedHashInfo {
  value: string;
  /** Algorithm inferred from the digest itself, if the length is recognisable. */
  detected: AlgorithmId | null;
  /** True when the string is a usable hex digest. False blocks the Verify button. */
  valid: boolean;
  /**
   * Advisory text. Present in two cases:
   *  - `valid === false`  -> the reason it was rejected (show as an error).
   *  - `valid === true`   -> a softer note, e.g. "this looks like MD5, not SHA-256"
   *                          (show as a warning; auto-detect usually resolves it).
   */
  reason?: string;
}

export function inspectExpectedHash(input: string, fallback?: AlgorithmId | null): ExpectedHashInfo {
  const value = cleanExpectedHash(input);

  if (!value) {
    return { value, detected: fallback ?? null, valid: false };
  }
  if (!/^[0-9a-f]+$/.test(value)) {
    return {
      value,
      detected: fallback ?? null,
      valid: false,
      reason: 'Contains characters that are not hexadecimal.',
    };
  }

  const detected = detectAlgorithm(value);
  if (!detected) {
    const lengths = Object.values(ALGORITHM_MAP)
      .map((meta) => meta.hexLength)
      .join(' / ');
    return {
      value,
      detected: fallback ?? null,
      valid: false,
      reason: `Digest is ${value.length} characters — expected ${lengths}.`,
    };
  }

  if (fallback && detected !== fallback) {
    return {
      value,
      detected,
      valid: true,
      reason: `Looks like ${ALGORITHM_MAP[detected].label}, not ${ALGORITHM_MAP[fallback].label}.`,
    };
  }

  return { value, detected, valid: true };
}
