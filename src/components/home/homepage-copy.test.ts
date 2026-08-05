/**
 * Guards the Prompt 24 homepage hierarchy: Spacilo is a marketplace first and
 * Spacilo AI second, each scan journey gets exactly ONE deliberate
 * introduction, every CTA routes to a real flow, and we make no unsupported
 * trust, earnings or payment claims.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DEMO_STATES } from "@/components/home/SpaceFitDemo";
import { hostEntryTarget } from "@/lib/host-entry";
import { scanSpaceTarget, scanStuffTarget } from "@/lib/spacefit-entry";

const FILES = [
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
const copy = FILES.map(read).join("\n");

const hero = read("src/components/home/Hero.tsx");
const entry = read("src/components/home/SpaceFitEntry.tsx");
const story = read("src/components/home/SpaceFitStory.tsx");
const hostAi = read("src/components/home/HostAiSection.tsx");
const page = read("src/routes/index.tsx");
const demo = read("src/components/home/SpaceFitDemo.tsx");

const BANNED = [
  /insured/i,
  /guaranteed/i,
  /fully protected/i,
  /background check/i,
  /book instantly/i,
  /instant booking/i,
  /cheapest/i,
  /thousands of/i,
  /earn £\d/i,
];

describe("homepage copy", () => {
  it("makes no unsupported trust, insurance, earnings or payment claims", () => {
    for (const pattern of BANNED) {
      expect(copy).not.toMatch(pattern);
    }
  });

  it("leads with the required two-sided headline", () => {
    expect(hero).toContain("Space nearby.");
    expect(hero).toContain("Income at home.");
  });

  it("gives both halves of the headline equal treatment inside the single h1", () => {
    const h1 = hero.slice(hero.indexOf("<h1"), hero.indexOf("</h1>"));
    const renter = h1.indexOf("Space nearby.");
    const host = h1.indexOf("Income at home.");
    expect(renter).toBeGreaterThan(-1);
    expect(host).toBeGreaterThan(renter);
    expect((h1.match(/<span className="block">/g) ?? []).length).toBe(2);
  });

  it("explains the marketplace directly under the headline", () => {
    expect(hero).toContain(
      "Find trusted neighbourhood storage — or earn from the space you're not using.",
    );
  });

  it("gives the hero one renter and one host marketplace CTA", () => {
    expect(hero).toContain("Find storage");
    expect(hero).toContain('label="Start earning"');
  });

  it("keeps the postcode search in the hero", () => {
    expect(hero).toContain("SearchControls");
  });
});

describe("CTA repetition rule", () => {
  it("keeps giant scan CTAs out of the hero", () => {
    expect(hero).not.toContain("ScanStuffButton");
    expect(hero).not.toContain("ScanSpaceButton");
  });

  it("introduces the renter scan journey exactly once on the page", () => {
    const uses = FILES.map(read)
      .join("\n")
      .match(/<ScanStuffButton/g);
    expect(uses).toHaveLength(1);
    expect(story).toContain("<ScanStuffButton");
  });

  it("introduces the host scan journey exactly once on the page", () => {
    const uses = FILES.map(read)
      .join("\n")
      .match(/<ScanSpaceButton/g);
    expect(uses).toHaveLength(1);
    expect(hostAi).toContain("<ScanSpaceButton");
  });

  it("uses contextual marketplace wording rather than scan wording for those CTAs", () => {
    expect(story).toContain("Try Spacilo AI");
    expect(hostAi).toContain("Measure my space with Spacilo AI");
    expect(copy).not.toContain("Scan my stuff");
    expect(copy).not.toContain("Scan my space");
  });

  it("routes every host CTA through the shared host entry helper", () => {
    for (const file of [hero, read("src/components/home/HostCallout.tsx")]) {
      expect(file).toContain("HostEntryButton");
    }
    expect(read("src/components/home/HostEntryButton.tsx")).toContain("hostEntryTarget");
    expect(hostEntryTarget(false)).toEqual({ to: "/signup", search: { mode: "host" } });
    expect(hostEntryTarget(true)).toEqual({ to: "/host/spaces/new" });
  });
});

describe("homepage structure", () => {
  const order = [
    "<Hero />",
    "<StorageNearYou />",
    "<SpaceFitStory />",
    "<HowItWorks />",
    "<BrandStory />",
    "<HostCallout />",
    "<HostAiSection />",
    "<HostControl />",
    "<TrustSection />",
    "<LaunchArea />",
    "<FinalCta />",
  ];

  it("renders marketplace value before Spacilo AI", () => {
    expect(page.indexOf("<StorageNearYou />")).toBeLessThan(page.indexOf("<SpaceFitStory />"));
  });

  it("establishes host commercial value before the host AI section", () => {
    expect(page.indexOf("<HostCallout />")).toBeLessThan(page.indexOf("<HostAiSection />"));
  });

  it("keeps the full section order", () => {
    const positions = order.map((section) => page.indexOf(section));
    expect(positions.every((p) => p > -1)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("has a single h1", () => {
    expect(copy.match(/<h1/g)).toHaveLength(1);
  });

  it("tells the marketplace brand story", () => {
    expect(copy).toContain("Space is everywhere.");
    expect(copy).toContain("It just isn't being shared.");
  });

  it("keeps the local launch and trust destinations reachable", () => {
    expect(copy).toContain("Hello, Portsmouth.");
    expect(copy).toContain('to="/trust"');
    expect(copy).toContain("Explore Trust &amp; Safety");
  });

  it("closes with two clearly separated paths", () => {
    const finalCta = read("src/components/home/FinalCta.tsx");
    expect(finalCta).toContain("Make room for what matters.");
    expect(finalCta).toContain("Need space?");
    expect(finalCta).toContain("Have space?");
  });

  it("gives the homepage marketplace-led metadata and a self-referencing canonical", () => {
    expect(page).toContain("Neighbourhood Storage Near You");
    expect(page).toContain('rel: "canonical"');
    expect(page).toContain('"@type": "WebSite"');
  });
});

describe("Spacilo AI entry points", () => {
  it("still exposes both real scan journeys", () => {
    expect(scanStuffTarget(true)).toEqual({ to: "/renter/inventory/photos" });
    expect(scanStuffTarget(false)).toEqual({ to: "/spacefit/stuff" });
    expect(scanSpaceTarget(true)).toEqual({ to: "/host/spaces/new" });
    expect(scanSpaceTarget(false)).toEqual({ to: "/spacefit/space" });
  });

  it("keeps the signed-in host scan path aligned with the single host entry helper", () => {
    expect(scanSpaceTarget(true)).toEqual(hostEntryTarget(true));
  });

  it("links scan buttons with typed router links, never raw anchors", () => {
    expect(entry).toContain('<Link to="/renter/inventory/photos">');
    expect(entry).toContain('<Link to="/host/spaces/new">');
    expect(entry).not.toMatch(/<a href=/);
  });

  it("tracks scan intent for both sides", () => {
    expect(entry).toContain('cta: "scan_stuff"');
    expect(entry).toContain('cta: "scan_space"');
  });

  it("presents AI output as a reviewable estimate", () => {
    expect(entry).toContain("review and correct");
    expect(story).toContain("SPACEFIT_DISCLAIMER");
    expect(story).toContain("You review, correct and confirm it.");
    expect(hostAi).toContain("you can enter dimensions by hand instead");
  });

  it("tells the renter photo → understand → estimate → match story", () => {
    for (const step of ["Photo", "Understand", "Estimate", "Match"]) {
      expect(story).toContain(`title: "${step}"`);
    }
  });
});

describe("hero SpaceFit demonstration", () => {
  it("is presentation only — no AI, scan session, upload or user data on render", () => {
    expect(demo).not.toMatch(/spacefit-vision|gemini|useSpaceFitVision|ai_gateway/i);
    expect(demo).not.toMatch(/createServerFn|useServerFn|supabase/i);
    expect(demo).not.toMatch(/fetch\(|scan_session|space_scan/i);
    expect(demo).not.toMatch(/useAuth|inventory-api|space-scan-api/);
  });

  it("carries both a renter and a host demonstration state", () => {
    const modes = DEMO_STATES.map((s) => s.mode);
    expect(modes).toContain("renter");
    expect(modes).toContain("host");
  });
});
