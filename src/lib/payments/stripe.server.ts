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

/** Async signature verification — WebCrypto has no synchronous HMAC. */
export async function verifiedStripeEvent(
  rawBody: string,
  signature: string | null,
): Promise<Stripe.Event> {
  if (!signature) throw new Error("Missing Stripe signature header");
  const stripe = stripeClient();
  return stripe.webhooks.constructEventAsync(
    rawBody,
    signature,
    webhookSecret(),
    undefined,
    Stripe.createSubtleCryptoProvider(),
  );
}

/**
 * Redirect origin. Server-controlled only: an explicitly configured
 * APP_ORIGIN wins, otherwise the request's own origin is accepted only when it
 * matches an allowed host pattern. A client-supplied URL is never trusted.
 */
const ALLOWED_HOST_PATTERNS = [
  /^localhost(:\d+)?$/,
  /^127\.0\.0\.1(:\d+)?$/,
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
    "APP_ORIGIN is not configured and the request origin is not an allowed Spacilo host",
  );
}

export const checkoutSuccessUrl = (origin: string, bookingId: string) =>
  `${origin}/renter/payments/return?bookingId=${encodeURIComponent(bookingId)}`;

export const checkoutCancelUrl = (origin: string, bookingId: string) =>
  `${origin}/renter/bookings/${encodeURIComponent(bookingId)}?checkout=cancelled`;
