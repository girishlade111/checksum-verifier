/**
 * Single source of truth for product-level constants.
 * Kept tiny on purpose — everything else lives next to the code that uses it.
 */

export const APP_CONFIG = {
  name: 'Checksum Verifier',
  shortName: 'Checksum',
  tagline: 'File integrity studio',
  description:
    'Verify downloads against published digests with MD5, SHA-1, SHA-256 and SHA-512 — entirely on your device.',
  version: '1.0.0',
  /** Shown in the footer; hashing never touches the network. */
  privacyNote: '100% client-side · no uploads · no telemetry',
} as const;

export default APP_CONFIG;
