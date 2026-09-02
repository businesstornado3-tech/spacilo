/**
 * Shared SEO head helpers: canonical site origin, and consistent
 * public/private meta + link builders used by every route's `head()`.
 */
import { brand } from "@/config/brand";

/**
 * Canonical published site origin. Override with SITE_URL (or the
 * TanStack/Vite-exposed VITE_SITE_URL) for staging/preview deploys so
 * canonicals never accidentally point at the wrong environment.
 */
export function siteOrigin(): string {
  const fromEnv =
    (typeof process !== "undefined" ? process.env?.["SITE_URL"] || process.env?.["VITE_SITE_URL"] : undefined) ||
    (typeof import.meta !== "undefined" ? (import.meta as { env?: Record<string, string> }).env?.["VITE_SITE_URL"] : undefined);
  const origin = fromEnv || "https://home-stash-link.lovable.app";
  return origin.replace(/\/+$/, "");
}

export function canonicalUrl(path: string): string {
  const normalized = path === "/" ? "" : path;
  return `${siteOrigin()}${normalized}`;
}

/** Optional search-engine verification meta tags, driven entirely by env. */
function verificationMeta() {
  const tags: Array<{ name: string; content: string }> = [];
  const google = process.env?.["GOOGLE_SITE_VERIFICATION"];
  const bing = process.env?.["BING_SITE_VERIFICATION"];
  if (google) tags.push({ name: "google-site-verification", content: google });
  if (bing) tags.push({ name: "msvalidate.01", content: bing });
  return tags;
}

type PublicMetaOptions = {
  /** Page-specific unique title, kept under 60 characters. */
  title: string;
  /** Page-specific unique description, kept under 160 characters. */
  description: string;
  /** Path used to build the canonical + og:url, e.g. "/how-it-works". */
  path: string;
  /** Absolute https image URL for social cards. Defaults to the site OG image. */
  image?: string;
  ogType?: "website" | "article" | "product";
};

/** Meta + links for a public, indexable route: title, description, canonical, OG/Twitter. */
export function publicRouteMeta({ title, description, path, image, ogType = "website" }: PublicMetaOptions) {
  const url = canonicalUrl(path);
  const ogImage = image ?? `${siteOrigin()}/og-image.png`;
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { name: "robots", content: "index, follow" },
      { property: "og:site_name", content: brand.name },
      { property: "og:type", content: ogType },
      { property: "og:url", content: url },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:image", content: ogImage },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: ogImage },
      ...verificationMeta(),
    ],
    links: [{ rel: "canonical", href: url }],
  };
}

/** Meta for a private/authenticated route: never indexed, never in the sitemap. */
export function privateRouteMeta(title?: string) {
  return {
    meta: [
      ...(title ? [{ title }] : []),
      { name: "robots", content: "noindex, nofollow" },
    ],
  };
}
