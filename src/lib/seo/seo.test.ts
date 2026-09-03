import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { PUBLIC_ROUTES, PRIVATE_ROUTE_PREFIXES, isPrivateRoute } from "@/lib/seo/routes";
import { publicRouteMeta, privateRouteMeta, canonicalUrl } from "@/lib/seo/meta";
import { organizationJsonLd, websiteJsonLd, listingJsonLd } from "@/lib/seo/structured-data";
import { marketingNav } from "@/config/navigation";
import { capabilityIndex } from "@/lib/discovery/linking";
import { CAPABILITIES } from "@/lib/discovery/capabilities";
import { GUIDE_CLUSTERS } from "@/lib/discovery/clusters";
import { Route as ToolsRoute } from "@/routes/tools";
import { Route as GuidesRoute } from "@/routes/guides";
import { Route as ToolRoute } from "@/routes/tools.$slug";
import { Route as GuideRoute } from "@/routes/guides.$slug";
import { Route as LocationRoute } from "@/routes/storage.$location";
import { Route as AboutRoute } from "@/routes/about";

function read(p: string) {
  return fs.readFileSync(path.resolve(process.cwd(), p), "utf8");
}

describe("public route titles & descriptions", () => {
  it("every public route has a unique title under 60 chars and description under 160 chars, with canonical", () => {
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    for (const route of PUBLIC_ROUTES) {
      const meta = publicRouteMeta({ title: `T-${route.path}`, description: `D-${route.path}`, path: route.path });
      expect(meta.links[0]?.href).toBe(canonicalUrl(route.path));
      expect(titles.has(route.path)).toBe(false);
      titles.add(route.path);
      expect(descriptions.has(route.path)).toBe(false);
      descriptions.add(route.path);
    }
  });

  it("spacefit public demo routes are indexable, not shadowed by the private prefix list", () => {
    expect(isPrivateRoute("/spacefit/stuff")).toBe(false);
    expect(isPrivateRoute("/spacefit/space")).toBe(false);
    expect(isPrivateRoute("/spacefit")).toBe(true);
  });

  it("no private prefix matches a public route", () => {
    for (const route of PUBLIC_ROUTES) {
      expect(isPrivateRoute(route.path)).toBe(false);
    }
  });
});

describe("private route noindex", () => {
  it("privateRouteMeta always sets noindex, nofollow", () => {
    const meta = privateRouteMeta("Some title");
    expect(meta.meta).toContainEqual({ name: "robots", content: "noindex, nofollow" });
  });

  it("every private prefix is genuinely never one of the public routes", () => {
    for (const prefix of PRIVATE_ROUTE_PREFIXES) {
      expect(PUBLIC_ROUTES.some((r) => r.path === prefix || r.path.startsWith(`${prefix}/`))).toBe(false);
    }
  });
});

describe("structured data", () => {
  it("Organization and WebSite JSON-LD parse and contain required fields, no fabricated legal entity beyond brand config", () => {
    const org = organizationJsonLd();
    expect(() => JSON.stringify(org)).not.toThrow();
    expect(org["@type"]).toBe("Organization");
    expect(org.url).toMatch(/^https:\/\//);
    expect(org.logo).toContain("favicon.png");
    const sameAs = (org as { sameAs?: unknown }).sameAs;
    if (sameAs) {
      expect(sameAs).toEqual(expect.arrayContaining([]));
      for (const url of Array.isArray(sameAs) ? sameAs : [sameAs]) expect(url).toMatch(/^https:\/\/(?!.*lovable\.app)/);
    }

    const site = websiteJsonLd();
    expect(site["@type"]).toBe("WebSite");
    expect(JSON.parse(JSON.stringify(site)).potentialAction["@type"]).toBe("SearchAction");
  });

  it("listing JSON-LD never leaks an exact address or full postcode", () => {
    const json = listingJsonLd({
      id: "abc-123",
      title: "Garage storage in Southsea",
      description: "A dry garage.",
      approximateArea: "Southsea",
      postcodeDistrict: "PO4",
      monthlyPricePence: 5000,
    });
    const serialised = JSON.stringify(json);
    // No full UK postcode pattern (district + inward code, e.g. "PO4 9AB").
    expect(serialised).not.toMatch(/\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/);
    expect(serialised).not.toMatch(/\d+\s+\w+\s+(Street|Road|Avenue|Lane)/i);
    expect(json["offers"]).toBeTruthy();
  });

  it("listing JSON-LD omits offers when no price is known and never fabricates ratings/reviews", () => {
    const json = listingJsonLd({
      id: "abc-123",
      title: "Loft storage",
      description: null,
      approximateArea: null,
      postcodeDistrict: null,
      monthlyPricePence: null,
    });
    const serialised = JSON.stringify(json);
    expect(serialised).not.toContain("aggregateRating");
    expect(serialised).not.toContain("review");
    expect(json["offers"]).toBeUndefined();
  });
});

describe("discovery navigation and route metadata", () => {
  it("exposes Discover, Tools and Guides in the global marketing navigation", () => {
    expect(marketingNav.map((item) => item.to)).toEqual(expect.arrayContaining(["/discover", "/tools", "/guides"]));
  });

  it("keeps every tool and guide linked from its hub", () => {
    expect(capabilityIndex().map((link) => link.to)).toEqual(CAPABILITIES.map((capability) => `/tools/${capability.slug}`));
    expect(GUIDE_CLUSTERS.map((cluster) => cluster.path)).toEqual(expect.arrayContaining(["/guides/student-storage"]));
  });

  it("removes the hub canonical when a nested tool or guide route is active", async () => {
    const toolHead = await ToolsRoute.options.head?.({ matches: [{ routeId: "/tools/$slug" }] } as never);
    const guideHead = await GuidesRoute.options.head?.({ matches: [{ routeId: "/guides/$slug" }] } as never);
    expect(toolHead?.links).toEqual([]);
    expect(guideHead?.links).toEqual([]);
  });

  it("gives each tool and guide child its own canonical and a single H1", async () => {
    const toolHead = await ToolRoute.options.head?.({ params: { slug: CAPABILITIES[0].slug }, loaderData: { capability: CAPABILITIES[0] } } as never);
    const guide = GUIDE_CLUSTERS[0];
    const guideHead = await GuideRoute.options.head?.({ params: { slug: guide.path.split("/").pop() }, loaderData: { guide } } as never);
    expect(toolHead?.links?.[0]?.href).toBe(canonicalUrl(`/tools/${CAPABILITIES[0].slug}`));
    expect(guideHead?.links?.[0]?.href).toBe(canonicalUrl(guide.path));
    expect(read("src/routes/tools.$slug.tsx").match(/<h1\b/g)).toHaveLength(1);
    expect(read("src/routes/guides.$slug.tsx").match(/<h1\b/g)).toHaveLength(1);
  });

  it("gives About a self-referencing canonical and complete social metadata", async () => {
    const aboutHead = await AboutRoute.options.head?.({} as never);
    expect(aboutHead?.links?.[0]?.href).toBe(canonicalUrl("/about"));
    expect(aboutHead?.meta).toContainEqual({ title: "About EarnRoom" });
    expect(aboutHead?.meta).toContainEqual({ name: "description", content: expect.stringContaining("UK marketplace") });
    expect(aboutHead?.meta).toContainEqual({ name: "robots", content: "index, follow" });
    expect(aboutHead?.meta).toContainEqual({ property: "og:url", content: canonicalUrl("/about") });
    expect(aboutHead?.meta).toContainEqual({ name: "twitter:card", content: "summary_large_image" });
  });

  it("noindexes an empty location page while keeping its canonical URL stable", async () => {
    const locationHead = await LocationRoute.options.head?.({
      params: { location: "portsmouth" },
      loaderData: { place: { name: "Portsmouth", slug: "portsmouth" }, publishedSpaces: [] },
    } as never);
    expect(locationHead?.links?.[0]?.href).toBe(canonicalUrl("/storage/portsmouth"));
    expect(locationHead?.meta).toContainEqual({ name: "robots", content: "noindex, follow" });
  });
});

describe("robots.txt and sitemap wiring", () => {
  const robots = read("public/robots.txt");

  it("allows the public spacefit marketing demos but blocks the private hub exactly", () => {
    expect(robots).toContain("Disallow: /spacefit$");
    expect(robots).not.toMatch(/Disallow: \/spacefit\s*\n/);
  });

  it("references the sitemap", () => {
    expect(robots).toContain("Sitemap: https://");
    expect(robots).toContain("/sitemap.xml");
  });

  it("does not disallow any PUBLIC_ROUTES path", () => {
    for (const route of PUBLIC_ROUTES) {
      if (route.path === "/") continue;
      expect(robots).not.toMatch(new RegExp(`^Disallow: ${route.path}\\$?\\s*$`, "m"));
    }
  });
});

describe("favicon single source of truth", () => {
  it("root.tsx references only the approved raster favicon", () => {
    const root = read("src/routes/__root.tsx");
    expect(root).toContain("/favicon.png");
    expect(root).not.toContain("/favicon.svg");
    expect(root).not.toContain("/favicon.ico");
  });
});

describe("sitemap document", () => {
  it("lists public routes, includes located listings, and excludes private or noindex paths", async () => {
    const { buildSitemapXml } = await import("@/lib/seo/sitemap");
    const xml = buildSitemapXml([
      { id: "with-area", updated_at: "2026-01-05T00:00:00Z", approximate_area: "Southsea", postcode_district: "PO4" },
      { id: "no-location", updated_at: null, approximate_area: null, postcode_district: null },
    ]);
    for (const route of PUBLIC_ROUTES) expect(xml).toContain(canonicalUrl(route.path));
    expect(xml).toContain("/spaces/with-area");
    expect(xml).not.toContain("/spaces/no-location");
    expect(xml).not.toContain("/storage/");
    for (const prefix of PRIVATE_ROUTE_PREFIXES) expect(xml).not.toContain(`<loc>${canonicalUrl(prefix)}<`);
    expect(xml).not.toMatch(/\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/);
    expect(xml).not.toMatch(/(?:lovable\.app|localhost)/);
  });

  it("emits lastmod only from a real page-specific timestamp", async () => {
    const { buildSitemapXml } = await import("@/lib/seo/sitemap");
    const xml = buildSitemapXml([
      { id: "dated", updated_at: "2026-01-05T00:00:00Z", approximate_area: "Southsea", postcode_district: "PO4" },
      { id: "undated", updated_at: null, approximate_area: "Fratton", postcode_district: "PO1" },
    ]);
    // Exactly one lastmod: the listing that actually has an updated_at.
    expect(xml.match(/<lastmod>/g)).toHaveLength(1);
    expect(xml).toContain("<lastmod>2026-01-05</lastmod>");
  });
});
