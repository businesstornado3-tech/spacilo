/**
 * Central analytics event taxonomy.
 *
 * One name per semantic moment. Adding a name here is the only supported way
 * to introduce an event — the tracker refuses anything not in this list, so
 * the founder dashboard never has to guess what a string meant.
 *
 * Privacy rule (enforced by `sanitiseProps` in `tracker.ts`): an event carries
 * counts, categories, statuses and short enum-like strings only. Never photos,
 * camera frames, message bodies, addresses, postcodes, payment details,
 * declarations or free-text the user typed.
 */

export const ANALYTICS_EVENTS = [
  // ---- traffic
  "page_view",
  "cta_clicked",

  // ---- accounts
  "signup_started",
  "signup_completed",
  "login_completed",

  // ---- Spacilo AI: renter ("scan my stuff")
  "spacefit_stuff_started",
  "spacefit_stuff_completed",

  // ---- Spacilo AI: host ("scan my space")
  "spacefit_space_started",
  "spacefit_space_completed",

  // ---- capture method
  "live_scan_started",
  "live_scan_completed",
  "scan_photo_fallback_used",
  "scan_manual_fallback_used",

  // ---- guest preview
  "guest_scan_result_viewed",
  "guest_scan_claimed",

  // ---- marketplace
  "storage_search_started",
  "listing_viewed",
  "enquiry_started",
  "enquiry_sent",
  "storage_request_started",
  "storage_request_created",
  "booking_created",

  // ---- supply
  "host_listing_started",
  "host_listing_published",
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

const EVENT_SET = new Set<string>(ANALYTICS_EVENTS);

export function isAnalyticsEvent(name: string): name is AnalyticsEvent {
  return EVENT_SET.has(name);
}

/** Values an event property may hold. Anything else is dropped. */
export type AnalyticsPropValue = string | number | boolean | null;
export type AnalyticsProps = Record<string, AnalyticsPropValue>;

/** Property keys that must never be recorded, whatever a caller passes. */
export const FORBIDDEN_PROP_KEYS = [
  "address",
  "address_line1",
  "address_line2",
  "postcode",
  "email",
  "phone",
  "name",
  "first_name",
  "last_name",
  "display_name",
  "message",
  "body",
  "note",
  "notes",
  "photo",
  "photos",
  "image",
  "images",
  "frame",
  "frames",
  "data_url",
  "base64",
  "card",
  "payment_method",
  "declaration",
  "declarations",
  "free_text",
  "query",
  "search_term",
] as const;

const FORBIDDEN = new Set<string>(FORBIDDEN_PROP_KEYS);

/** Longest string a property value may be — enough for a status, not for prose. */
export const MAX_PROP_STRING_LENGTH = 64;
/** Most properties a single event may carry. */
export const MAX_PROPS = 8;

export function isForbiddenPropKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (FORBIDDEN.has(lower)) return true;
  return FORBIDDEN_PROP_KEYS.some((f) => lower.endsWith(`_${f}`));
}

/**
 * Strips anything sensitive, oversized or non-scalar. Runs before every send
 * and is unit-tested directly, so the boundary cannot drift.
 */
export function sanitiseProps(props: AnalyticsProps | undefined): AnalyticsProps {
  if (!props) return {};
  const out: AnalyticsProps = {};
  let count = 0;
  for (const [key, value] of Object.entries(props)) {
    if (count >= MAX_PROPS) break;
    if (isForbiddenPropKey(key)) continue;
    if (value === null || typeof value === "boolean") {
      out[key] = value;
    } else if (typeof value === "number") {
      if (!Number.isFinite(value)) continue;
      out[key] = value;
    } else if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) continue;
      // Anything longer than a status/category is treated as free text.
      if (trimmed.length > MAX_PROP_STRING_LENGTH) continue;
      out[key] = trimmed;
    } else {
      continue;
    }
    count += 1;
  }
  return out;
}

/**
 * Collapses dynamic segments so the "top pages" report groups sensibly and no
 * identifier or query parameter is ever stored.
 *
 *   /spaces/8f1c-...  -> /spaces/:id
 *   /search?q=PO1     -> /search
 */
export function normalisePath(rawPath: string): string {
  const withoutQuery = rawPath.split("?")[0]?.split("#")[0] ?? "/";
  const trimmed =
    withoutQuery.length > 1 ? withoutQuery.replace(/\/+$/, "") || "/" : withoutQuery || "/";

  const segments = trimmed.split("/").filter(Boolean).map((segment) => {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) return ":id";
    if (/^\d+$/.test(segment)) return ":id";
    if (segment.length >= 20 && /[0-9]/.test(segment) && /[a-z]/i.test(segment)) return ":id";
    return segment.toLowerCase();
  });

  const path = segments.length ? `/${segments.join("/")}` : "/";
  return path.length > 200 ? path.slice(0, 200) : path;
}

/** Referrer host only — never the full referring URL. */
export function referrerHost(referrer: string, currentHost: string): string | null {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    if (!host || host === currentHost.toLowerCase()) return null;
    return host.slice(0, 120);
  } catch {
    return null;
  }
}
