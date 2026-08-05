/**
 * Prompt 24 conversion invariants. These are contract tests against the real
 * generated route tree and the real SEO route rules — not helper assumptions —
 * so a homepage CTA can never point at a route that does not exist, at a
 * private route, or at a page a crawler is told to ignore.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { isPrivateRoute } from "@/lib/seo/routes";

const HOMEPAGE_FILES = [
  "src/routes/index.tsx",
  "src/components/home/Hero.tsx",
  "src/components/home/StorageNearYou.tsx",
  "src/components/home/SpaceFitStory.tsx",
  "src/components/home/HowItWorks.tsx",
  "src/components/home/BrandStory.tsx",
  "src/components/home/HostCallout.tsx",
  "src/components/home/HostAiSection.tsx",
  "src/components/home/HostControl.tsx",
  "src/components/home/TrustSection.tsx",
  "src/components/home/LaunchArea.tsx",
  "src/components/home/FinalCta.tsx",
];

const read = (file: string) => readFileSync(file, "utf8");
const homepage = HOMEPAGE_FILES.map(read).join("\n");
const routeTree = readFileSync("src/routeTree.gen.ts", "utf8");

/** Every `to="/..."` literal used anywhere on the homepage. */
const homepageTargets = [...homepage.matchAll(/to="(\/[^"]*)"/g)].map((m) => m[1]!);

/** Routes the generated tree actually knows about. */
const knownRoutes = new Set(
  [...routeTree.matchAll(/^\s*'(\/[^']*)':\s*typeof/gm)].map((m) => m[1]!),
);

describe("homepage route contract", () => {
  it("extracts the homepage CTA targets it is meant to guard", () => {
    expect(homepageTargets.length).toBeGreaterThan(4);
  });

  it("has a non-empty generated route table to check against", () => {
    expect(knownRoutes.size).toBeGreaterThan(10);
    expect(knownRoutes.has("/")).toBe(true);
  });

  it("points every homepage CTA at a route that exists", () => {
    for (const target of homepageTargets) {
      expect(knownRoutes.has(target), `unknown route: ${target}`).toBe(true);
    }
  });

  it("never sends a signed-out visitor straight into a private route", () => {
    for (const target of homepageTargets) {
      expect(isPrivateRoute(target), `private route linked publicly: ${target}`).toBe(false);
    }
  });

  it("reaches search, trust, how-it-works and both entry pages", () => {
    for (const expected of ["/search", "/trust", "/how-it-works", "/find-storage", "/list-space"]) {
      expect(homepageTargets).toContain(expected);
    }
  });
});

describe("homepage payload discipline", () => {
  it("pulls in no admin, founder-dashboard or analytics-console code", () => {
    expect(homepage).not.toMatch(/@\/components\/admin|@\/lib\/admin|AdminShell/);
  });

  it("pulls in no authenticated data hooks on the public landing page", () => {
    expect(homepage).not.toMatch(/useBookings|usePayments|useInventory|useMySpaces/);
  });

  it("uses the shared analytics tracker and no second analytics module", () => {
    const trackers = HOMEPAGE_FILES.map(read).filter((f) => f.includes("analytics"));
    for (const file of trackers) {
      expect(file).toContain('from "@/lib/analytics/tracker"');
    }
  });

  it("gives every tracked homepage CTA a distinct contextual source", () => {
    const sources = [...homepage.matchAll(/from="(homepage[^"]*)"/g)].map((m) => m[1]!);
    expect(sources.length).toBeGreaterThan(1);
    expect(new Set(sources).size).toBe(sources.length);
  });
});

describe("homepage honesty", () => {
  it("does not promise a specific host income", () => {
    expect(homepage).not.toMatch(/earn up to/i);
    expect(homepage).not.toMatch(/£\d+\s*(?:per|a|\/)\s*month/i);
  });

  it("keeps Spacilo AI language bounded", () => {
    expect(homepage).toMatch(/estimate|may fit|potentially/i);
    expect(homepage).not.toMatch(/exact fit|perfect fit|always fits/i);
  });

  it("describes only trust controls the product actually has", () => {
    const trust = read("src/components/home/TrustSection.tsx");
    expect(trust).not.toMatch(/when implemented|not yet live/i);
    expect(trust).toContain("Stripe");
  });

  it("still tells visitors a request is not a booking", () => {
    expect(homepage).toContain(
      "Sending a request doesn't book the space or take payment. The host still needs to respond.",
    );
  });
});
