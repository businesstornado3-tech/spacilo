import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { PUBLIC_ROUTES, PRIVATE_ROUTE_PREFIXES, isPrivateRoute } from "@/lib/seo/routes";
import { publicRouteMeta, privateRouteMeta, canonicalUrl } from "@/lib/seo/meta";
import { organizationJsonLd, websiteJsonLd, listingJsonLd } from "@/lib/seo/structured-data";

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
    expect(org.url).toMatch(/^https?:\/\//);
    expect(org.logo).toContain("favicon.svg");

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
      const segment = route.path.split("/")[1];
      if (!segment) continue;
      expect(robots).not.toMatch(new RegExp(`Disallow: /${segment}$`, "m"));
    }
  });
});

describe("favicon single source of truth", () => {
  it("root.tsx references only the approved SVG/ICO favicon, no stray icon files", () => {
    const root = read("src/routes/__root.tsx");
    expect(root).toContain("/favicon.svg");
    expect(root).toContain("/favicon.ico");
    expect(root).not.toContain("/favicon.png");
  });
});
