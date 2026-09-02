/**
 * Server-only Stripe wiring (Prompt 11).
 *
 * Never import this from a component or any client-reachable module scope —
 * it reads STRIPE_SECRET_KEY. It is loaded with `await import(...)` inside
 * server-function and server-route handlers.
 *
 * TEST vs LIVE is decided entirely by which secret key is configured. No code
 * path branches on a hard-coded mode, so moving to live mode is a credential
 * and webhook-endpoint change only.
 */
import Stripe from "stripe";

/** Cloudflare Workers-compatible client (fetch transport, WebCrypto). */
export function stripeClient(): Stripe {
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return new Stripe(key, {
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export function webhookSecret(): string {
  const secret = process.env["STRIPE_WEBHOOK_SECRET"];
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }
  return secret;
}

/**
 * Stripe requires a separate event destination for connected-account events
 * (`account.updated`) alongside the platform destination. Both destinations may
 * point at the SAME endpoint URL, but each has its OWN signing secret, so the
 * endpoint must be able to verify against either one.
 *
 * Verification itself is unchanged: raw body, Stripe SDK, WebCrypto HMAC,
 * constant-time comparison, timestamp tolerance. A request that matches no
 * configured secret is still rejected.
 */
export function webhookSecrets(): string[] {
  const candidates = [
    process.env["STRIPE_WEBHOOK_SECRET"],
    process.env["STRIPE_CONNECT_WEBHOOK_SECRET"],
  ].filter((value): value is string => Boolean(value && value.trim()));

  const unique = [...new Set(candidates.map((value) => value.trim()))];
  if (unique.length === 0) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }
  return unique;
}

/** Async signature verification — WebCrypto has no synchronous HMAC. */
export async function verifiedStripeEvent(
  rawBody: string,
  signature: string | null,
): Promise<Stripe.Event> {
  if (!signature) throw new Error("Missing Stripe signature header");
  const stripe = stripeClient();
  const provider = Stripe.createSubtleCryptoProvider();

  let lastError: unknown;
  for (const secret of webhookSecrets()) {
    try {
      return await stripe.webhooks.constructEventAsync(
        rawBody,
        signature,
        secret,
        undefined,
        provider,
      );
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Stripe signature verification failed");
}

/**
 * Redirect origin. Server-controlled only: an explicitly configured
 * APP_ORIGIN wins, otherwise the request's own origin is accepted only when it
 * matches an allowed host pattern. A client-supplied URL is never trusted.
 */
const ALLOWED_HOST_PATTERNS = [
  /^localhost(:\d+)?$/,
  /^127\.0\.0\.1(:\d+)?$/,
  // Production domain (apex and www) — Stripe redirects must land on it.
  /^earnroom\.co\.uk$/i,
  /^www\.earnroom\.co\.uk$/i,
  /^[a-z0-9-]+\.lovable\.app$/i,
  /^[a-z0-9-]+\.lovableproject\.com$/i,
];

export function resolveAppOrigin(requestUrl?: string): string {
  const configured = process.env["APP_ORIGIN"];
  if (configured) return configured.replace(/\/+$/, "");

  if (requestUrl) {
    const url = new URL(requestUrl);
    if (ALLOWED_HOST_PATTERNS.some((pattern) => pattern.test(url.host))) {
      return url.origin;
    }
  }

  throw new Error(
    "APP_ORIGIN is not configured and the request origin is not an allowed EarnRoom host",
  );
}

export const checkoutSuccessUrl = (origin: string, bookingId: string) =>
  `${origin}/renter/payments/return?bookingId=${encodeURIComponent(bookingId)}`;

export const checkoutCancelUrl = (origin: string, bookingId: string) =>
  `${origin}/renter/bookings/${encodeURIComponent(bookingId)}?checkout=cancelled`;
