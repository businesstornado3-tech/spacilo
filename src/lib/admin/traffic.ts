/**
 * Public/internal route classification for founder traffic reporting.
 *
 * The authoritative boundary is the Postgres function
 * `analytics_is_public_path(text)`, which the admin dashboard RPCs apply when
 * they aggregate. This module mirrors that rule exactly so the console can
 * (a) be unit-tested without a database and (b) never render an internal route
 * in "Top public pages" even if an older aggregate row reaches it.
 *
 * Keep the two in step: any change here must be mirrored in the SQL function.
 */

/** Exact internal paths that are operational or authentication surfaces. */
const INTERNAL_EXACT = new Set([
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth",
  "/notifications",
  "/profile",
  "/support",
  "/admin",
  "/design-system",
]);

/** Path prefixes that are internal: the founder console, APIs, account areas. */
const INTERNAL_PREFIXES = ["/admin/", "/api/", "/lovable/", "/renter/", "/host/", "/profile/", "/support/"];

/** Signed-in area roots that are not public marketing pages. */
const INTERNAL_ROOTS = new Set(["/renter", "/host"]);

/**
 * True only for genuinely customer-facing pages: the home page, marketing
 * pages, public listing/discovery pages and the public Spacilo AI entries.
 */
export function isPublicAnalyticsPath(path: string | null | undefined): boolean {
  if (!path) return false;
  const p = path.trim().toLowerCase();
  if (!p.startsWith("/")) return false;
  if (INTERNAL_EXACT.has(p) || INTERNAL_ROOTS.has(p)) return false;
  if (INTERNAL_PREFIXES.some((prefix) => p.startsWith(prefix))) return false;
  return true;
}

export interface TopPageRow {
  path: string;
  page_views: number;
  visitors?: number;
}

/**
 * Defence in depth for the "Top public pages" table: drop anything internal,
 * then sort deterministically (views desc, then path asc so equal counts never
 * reorder between renders).
 */
export function filterTopPublicPages(rows: TopPageRow[] | null | undefined, limit = 8): TopPageRow[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && isPublicAnalyticsPath(row.path))
    .slice()
    .sort((a, b) => (b.page_views ?? 0) - (a.page_views ?? 0) || a.path.localeCompare(b.path))
    .slice(0, limit);
}

/**
 * Honest description of what the founder traffic numbers can and cannot show.
 * Rendered in the console so nobody reads more into the figures than is there.
 */
export const TRAFFIC_LIMITATIONS = [
  "Anonymous browsing before sign-up cannot be linked to the account that is eventually created, so visitor → account is never shown as a conversion rate.",
  "Founder and support activity is excluded only once signed in; a signed-out visit from a founder device is indistinguishable from any other visitor.",
  "Internal pages (the founder console, sign-in and account areas) are excluded from every public traffic figure, so they are also absent from visitors, sessions and page views.",
  "Browsers sending Do Not Track or Global Privacy Control are not measured at all.",
] as const;
