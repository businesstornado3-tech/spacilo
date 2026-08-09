/**
 * Phase 6X — content fingerprints for analysis caching.
 *
 * A photograph re-uploaded from the same file produces a brand new blob and a
 * brand new object URL, so identity-based cache keys always missed and the
 * user paid for a fresh model call every time they retried. A fingerprint is
 * taken from the prepared image BYTES instead, so the same photograph is the
 * same photograph however it arrived.
 *
 * FNV-1a over a bounded sample of the payload: deterministic, allocation-free
 * and fast enough to run on the main thread for a 1MB base64 string. This is a
 * cache key, never a security or integrity check.
 */

/** How many characters are sampled from a payload, spread across the whole. */
const SAMPLE_CHARS = 4096;

/** Deterministic 32-bit FNV-1a of a string, as unsigned hex. */
export function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * A stable fingerprint of image content. Length is always included, so two
 * different payloads that happen to sample alike still differ.
 */
export function contentHash(base64: string): string {
  const length = base64.length;
  if (length === 0) return "empty";
  if (length <= SAMPLE_CHARS) return `${length.toString(36)}-${fnv1a(base64)}`;

  // Evenly spaced windows so a change anywhere in the image is likely to land
  // inside the sample, rather than only the first few kilobytes.
  const windows = 8;
  const windowSize = Math.floor(SAMPLE_CHARS / windows);
  const step = Math.floor(length / windows);
  let sample = "";
  for (let i = 0; i < windows; i += 1) {
    const start = i * step;
    sample += base64.slice(start, start + windowSize);
  }
  return `${length.toString(36)}-${fnv1a(sample)}`;
}

/** One prepared photograph, reduced to what a cache key may depend on. */
export interface PhotoFingerprintInput {
  id: string;
  base64: string;
  rotation?: number;
  /** Description of the marked region, when the user marked one. */
  region?: string;
}

/**
 * A cache key component for one photograph. Deliberately does NOT include the
 * photo id, the object URL or the upload instance: the same picture analysed
 * again must produce the same key.
 */
export function photoFingerprint(photo: PhotoFingerprintInput): string {
  return [contentHash(photo.base64), photo.rotation ?? 0, photo.region ?? ""].join(":");
}

/** A cache key for a whole analysis: content, orientation, region and config. */
export function analysisFingerprint(input: {
  task: string;
  mode: string;
  spaceType?: string;
  photos: PhotoFingerprintInput[];
}): string {
  const photos = input.photos.map(photoFingerprint).sort().join("|");
  return `${input.task}#${input.mode}#${input.spaceType ?? ""}#${photos}`;
}
