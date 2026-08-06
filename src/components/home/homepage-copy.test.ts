/**
 * Guards the Prompt 24–26 homepage hierarchy: the marketplace proposition
 * leads, the REAL Spacilo AI launcher is the signature hero interaction, the
 * postcode search follows it, later sections educate rather than repeat, and
 * we make no unsupported trust, earnings or payment claims.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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
];

const read = (file: string) => readFileSync(file, "utf8");
const copy = FILES.map(read).join("\n");

const hero = read("src/components/home/Hero.tsx");
const entry = read("src/components/home/SpaceFitEntry.tsx");
const story = read("src/components/home/SpaceFitStory.tsx");
const hostAi = read("src/components/home/HostAiSection.tsx");
const page = read("src/routes/index.tsx");

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

  it("keeps the postcode search in the hero", () => {
    expect(hero).toContain("SearchControls");
  });
});

describe("hero Spacilo AI launcher", () => {
  it("drops the generic hero Find storage / Start earning buttons", () => {
    expect(hero).not.toContain('<Link to="/find-storage">');
    expect(hero).not.toContain("HostEntryButton");
    expect(hero).not.toContain('label="Start earning"');
    // "Find storage" survives only as the search submit label.
    expect(hero.match(/Find storage/g)).toHaveLength(1);
    expect(hero).toContain('submitLabel="Find storage"');
  });

  it("puts the real Spacilo AI launcher between the proposition and the search", () => {
    const proposition = hero.indexOf("Find trusted neighbourhood storage");
    const launcher = hero.indexOf("<SpaceFitEntry");
    const search = hero.indexOf("<SearchControls");
    expect(proposition).toBeGreaterThan(-1);
    expect(launcher).toBeGreaterThan(proposition);
    expect(search).toBeGreaterThan(launcher);
  });

  it("offers both scan actions with their founder-approved framing", () => {
    expect(entry).toContain("Your stuff. Your space. Just show us.");
    expect(entry).toContain("Scan my stuff");
    expect(entry).toContain("Scan my space");
    expect(entry).toContain("How much space do I really need?");
    expect(entry).toContain("What could my unused space earn?");
  });

  it("never simulates Spacilo AI on the homepage", () => {
    expect(copy + entry).not.toMatch(/DEMO_STATES|Illustrative Spacilo AI example/);
    expect(copy + entry).not.toMatch(/getUserMedia|LiveScanner|useLiveScan|<video/);
  });

  it("loads no AI, camera or admin internals into the homepage bundle", () => {
    expect(copy + entry).not.toMatch(/spacefit-vision|gemini|useSpaceFitVision/i);
    expect(copy + entry).not.toMatch(/@\/components\/admin|@\/lib\/admin/);
  });
});

describe("CTA repetition rule", () => {
  it("introduces the renter scan journey once at the top, with one secondary echo", () => {
    const uses = copy.match(/<ScanStuffButton/g) ?? [];
    expect(uses).toHaveLength(2);
    expect(hero).toContain("<SpaceFitEntry");
    expect(story).toContain("<ScanStuffButton");
  });

  it("introduces the host scan journey once at the top, with one secondary echo", () => {
    const uses = copy.match(/<ScanSpaceButton/g) ?? [];
    expect(uses).toHaveLength(1);
    expect(hostAi).toContain("<ScanSpaceButton");
  });

  it("keeps literal scan wording to the launcher only", () => {
    expect(copy).not.toContain("Scan my stuff");
    expect(copy).not.toContain("Scan my space");
    expect(story).toContain("Try Spacilo AI");
    expect(hostAi).toContain("Measure my space with Spacilo AI");
  });

  it("routes host CTAs through the shared host entry helper", () => {
    expect(read("src/components/home/HostCallout.tsx")).toContain("HostEntryButton");
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
  ];

  it("renders marketplace value before Spacilo AI education", () => {
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
    expect(copy).toContain("Make it pay.");
    expect(copy).toContain("No tape measure required.");
  });

  it("keeps the local launch and trust destinations reachable", () => {
    expect(copy).toContain("Hello, Portsmouth.");
    expect(copy).toContain('to="/trust"');
    expect(copy).toContain("Explore Trust &amp; Safety");
  });

  it("ends on Portsmouth — the final green CTA banner is gone", () => {
    expect(copy).not.toContain("Make room for what matters.");
    expect(() => read("src/components/home/FinalCta.tsx")).toThrow();
    expect(page.trim().endsWith("}")).toBe(true);
    const sections = page.slice(page.indexOf("<MarketingLayout>"));
    expect(sections.lastIndexOf("<LaunchArea />")).toBeGreaterThan(
      sections.lastIndexOf("<TrustSection />"),
    );
    expect(sections).not.toMatch(/<LaunchArea \/>[\s\S]*<[A-Z]\w+ \/>/);
  });

  it("gives the homepage marketplace-led metadata and a self-referencing canonical", () => {
    expect(page).toContain("Neighbourhood Storage Near You");
    expect(page).toContain("publicRouteMeta");
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

  it("lets signed-out visitors reach Spacilo AI without a login wall", () => {
    expect(scanStuffTarget(false).to).toBe("/spacefit/stuff");
    expect(scanSpaceTarget(false).to).toBe("/spacefit/space");
  });

  it("keeps the signed-in host scan path aligned with the single host entry helper", () => {
    expect(scanSpaceTarget(true)).toEqual(hostEntryTarget(true));
  });

  it("links scan buttons with typed router links, never raw anchors", () => {
    expect(entry).toContain('<Link to="/renter/inventory/photos">');
    expect(entry).toContain('<Link to="/host/spaces/new">');
    expect(entry).not.toMatch(/<a href=/);
  });

  it("tracks scan intent for both sides with canonical events only", () => {
    expect(entry).toContain('cta: "scan_stuff"');
    expect(entry).toContain('cta: "scan_space"');
    expect(entry).toContain('from "@/lib/analytics/tracker"');
    expect(entry).not.toMatch(/base64|photo|image|dataUrl/i);
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
