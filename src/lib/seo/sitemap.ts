/**
 * XML sitemap construction.
 *
 * Pure string building only — the route supplies the listing rows, so this
 * stays trivially testable and never reaches for the network itself.
 *
 * Rules enforced here:
 *  - only genuinely public, indexable URLs are ever emitted;
 *  - a listing is only included if it passes the location quality gate
 *    (we know at least an approximate area or postcode district), because a
 *    listing with no usable location is not a useful search result;
 *  - no exact address or full postcode ever appears in a sitemap URL.
 */
import { PUBLIC_ROUTES, isPrivateRoute } from "@/lib/seo/routes";
import { canonicalUrl } from "@/lib/seo/meta";

export type SitemapListing = {
  id: string;
  updated_at?: string | null;
  approximate_area?: string | null;
  postcode_district?: string | null;
};

/** A listing is sitemap-worthy only when it has a usable approximate location. */
export function hasUsableLocation(listing: SitemapListing): boolean {
  return Boolean(listing.approximate_area?.trim() || listing.postcode_district?.trim());
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

type UrlEntry = { loc: string; lastmod?: string | undefined; changefreq?: string; priority?: string };

function urlXml({ loc, lastmod, changefreq, priority }: UrlEntry): string {
  return [
    "  <url>",
    `    <loc>${escapeXml(loc)}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
    changefreq ? `    <changefreq>${changefreq}</changefreq>` : null,
    priority ? `    <priority>${priority}</priority>` : null,
    "  </url>",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Builds the complete sitemap XML document. */
export function buildSitemapXml(listings: readonly SitemapListing[] = [], now: Date = new Date()): string {
  const today = now.toISOString().slice(0, 10);

  const staticEntries = PUBLIC_ROUTES.filter((route) => !isPrivateRoute(route.path)).map((route) =>
    urlXml({
      loc: canonicalUrl(route.path),
      lastmod: today,
      changefreq: route.path === "/" ? "daily" : "weekly",
      priority: route.path === "/" ? "1.0" : "0.7",
    }),
  );

  const listingEntries = listings.filter(hasUsableLocation).map((listing) =>
    urlXml({
      loc: canonicalUrl(`/spaces/${listing.id}`),
      lastmod: isoDate(listing.updated_at) ?? today,
      changefreq: "weekly",
      priority: "0.6",
    }),
  );

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...staticEntries,
    ...listingEntries,
    "</urlset>",
    "",
  ].join("\n");
}
