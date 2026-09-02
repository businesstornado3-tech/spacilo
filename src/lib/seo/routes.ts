/**
 * Single source of truth for which routes are search-indexable and which
 * must never be indexed.
 *
 * PUBLIC_ROUTES: real, reachable, genuinely useful pages that get a
 * canonical URL, a unique title/description, and are listed in the sitemap.
 *
 * PRIVATE_ROUTE_PREFIXES: authenticated/transactional areas. These get a
 * `noindex, nofollow` robots meta tag via `privateRouteMeta()`. Robots
 * directives are NOT a security control — every one of these routes must
 * also be protected server-side by real authorization.
 */

export type PublicRouteEntry = {
  /** Path as it appears in the URL, e.g. "/" or "/how-it-works". */
  path: string;
  /** Human label, used only for internal tooling/tests. */
  label: string;
};

/** Every public, indexable, static route in the app. */
export const PUBLIC_ROUTES: readonly PublicRouteEntry[] = [
  { path: "/", label: "Homepage" },
  { path: "/how-it-works", label: "How It Works" },
  { path: "/trust", label: "Trust & Safety" },
  { path: "/search", label: "Search Results" },
  { path: "/list-space", label: "List Your Space" },
  { path: "/get-started", label: "Get Started" },
  { path: "/storage-policy", label: "Storage Policy" },
  { path: "/privacy", label: "Privacy & Data" },
  { path: "/legal", label: "Legal" },
  { path: "/legal/terms", label: "Terms of service" },
  { path: "/legal/cookies", label: "Cookie policy" },
  { path: "/legal/refunds", label: "Refund policy" },
  { path: "/legal/cancellations", label: "Cancellation policy" },
  { path: "/legal/host-agreement", label: "Host agreement" },
  { path: "/legal/renter-agreement", label: "Renter agreement" },
  { path: "/legal/ai-disclaimer", label: "AI disclaimer" },
  { path: "/spacefit/stuff", label: "Scan My Stuff" },
  { path: "/spacefit/space", label: "Scan My Space" },
] as const;

/**
 * Dynamic public route pattern for individual published listings.
 * Actual indexable URLs are generated per-listing in the sitemap builder.
 */
export const PUBLIC_LISTING_ROUTE_PREFIX = "/spaces/";

/**
 * Path prefixes that must never be indexed: authenticated dashboards,
 * account/profile, messaging, booking/request workflows, private
 * EarnRoom AI results, admin, auth callbacks, and other transactional flows.
 */
export const PRIVATE_ROUTE_PREFIXES: readonly string[] = [
  "/renter",
  "/host",
  "/admin",
  "/profile",
  "/notifications",
  "/support",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/api",
] as const;

/**
 * Paths that are private at that EXACT url only. `/spacefit` is the
 * authenticated EarnRoom AI hub, but `/spacefit/stuff` and `/spacefit/space`
 * are public marketing demos, so a prefix rule would be wrong here.
 */
export const PRIVATE_EXACT_ROUTES: readonly string[] = ["/spacefit"] as const;

/** True if a given path is one of the always-public static routes. */
export function isPublicStaticRoute(path: string): boolean {
  return PUBLIC_ROUTES.some((r) => r.path === path);
}

/** True if a given path falls under a private/noindex prefix or exact rule. */
export function isPrivateRoute(path: string): boolean {
  if (PRIVATE_EXACT_ROUTES.includes(path)) return true;
  return PRIVATE_ROUTE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}
