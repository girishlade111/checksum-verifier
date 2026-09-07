/**
 * Supported hashing algorithms.
 *
 * Everything is computed with `hash-wasm` (WebAssembly), which is 3-10x faster than
 * the WebCrypto + JS fallbacks and, more importantly, gives us a *streaming* API so
 * multi-gigabyte files never have to be loaded into memory.
 */
export type AlgorithmId = 'md5' | 'sha1' | 'sha256' | 'sha512';

export interface AlgorithmMeta {
  id: AlgorithmId;
  label: string;
  /** Length of the hex digest, used to auto-detect algorithms from pasted hashes. */
  hexLength: number;
  /** Short security note shown in the UI. */
  note: string;
  /** Whether the algorithm is still considered collision resistant. */
  secure: boolean;
}

export const ALGORITHMS: AlgorithmMeta[] = [
  {
    id: 'md5',
    label: 'MD5',
    hexLength: 32,
    note: 'Fastest, but broken for security. Fine for transfer corruption checks.',
    secure: false,
  },
  {
    id: 'sha1',
    label: 'SHA-1',
    hexLength: 40,
    note: 'Deprecated — collisions are practical. Legacy manifests only.',
    secure: false,
  },
  {
    id: 'sha256',
    label: 'SHA-256',
    hexLength: 64,
    note: 'The modern default. Used by SHA256SUMS, Docker, npm, APT.',
    secure: true,
  },
  {
    id: 'sha512',
    label: 'SHA-512',
    hexLength: 128,
    note: 'Strongest of the set. Common for large ISO / release artifacts.',
    secure: true,
  },
];

export const ALGORITHM_MAP: Record<AlgorithmId, AlgorithmMeta> = ALGORITHMS.reduce(
  (acc, meta) => {
    acc[meta.id] = meta;
    return acc;
  },
  {} as Record<AlgorithmId, AlgorithmMeta>,
);

export const ALL_ALGORITHM_IDS: AlgorithmId[] = ALGORITHMS.map((a) => a.id);

export function isAlgorithmId(value: unknown): value is AlgorithmId {
  return (
    typeof value === 'string' &&
    (value === 'md5' || value === 'sha1' || value === 'sha256' || value === 'sha512')
  );
}

/**
 * Infers the algorithm from a hex digest length.
 * Returns `null` when the digest length is unknown (CRC32 and friends are not supported).
 */
export function detectAlgorithm(hash: string): AlgorithmId | null {
  const cleaned = hash.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(cleaned)) return null;
  switch (cleaned.length) {
    case 32:
      return 'md5';
    case 40:
      return 'sha1';
    case 64:
      return 'sha256';
    case 128:
      return 'sha512';
    default:
      return null;
  }
}

export function isValidHexHash(hash: string, algorithm?: AlgorithmId) {
  const cleaned = hash.trim().toLowerCase();
  if (!cleaned) return false;
  if (!/^[0-9a-f]+$/.test(cleaned)) return false;
  if (algorithm && cleaned.length !== ALGORITHM_MAP[algorithm].hexLength) return false;
  return true;
}
