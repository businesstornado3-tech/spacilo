/**
 * Guest SpaceFit — session references.
 *
 * The reference handed to the browser is 32 bytes of CSPRNG output. Only its
 * SHA-256 hash is stored, so a leaked database row cannot be replayed, and an
 * attacker cannot enumerate other visitors' scans.
 */
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "crypto";

/** Length of the base64url reference produced by `createGuestToken`. */
export const GUEST_TOKEN_BYTES = 32;

export function createGuestToken(): string {
  return randomBytes(GUEST_TOKEN_BYTES).toString("base64url");
}

export function hashGuestToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

/** Shape check before the hash is ever looked up. */
export function isPlausibleGuestToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{40,64}$/.test(token.trim());
}

/** Constant-time comparison for anything we compare against a secret. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Network-level throttling key. The raw IP is never stored — only a salted
 * hash, which is enough to rate limit but not to identify a visitor.
 */
export function hashClientIp(ip: string | null | undefined, salt: string): string | null {
  if (!ip) return null;
  return createHash("sha256").update(`${salt}:${ip.trim()}`).digest("hex").slice(0, 40);
}

/** Server-generated filename. Client filenames are never trusted or stored. */
export function guestObjectPath(sessionId: string, mimeType: string): string {
  const extension =
    mimeType === "image/png"
      ? "png"
      : mimeType === "image/webp"
        ? "webp"
        : mimeType === "image/heic" || mimeType === "image/heif"
          ? "heic"
          : "jpg";
  return `${sessionId}/${randomUUID()}.${extension}`;
}
