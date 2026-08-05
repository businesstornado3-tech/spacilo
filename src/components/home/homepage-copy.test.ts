/**
 * Guards the homepage promise hierarchy: SpaceFit AI is the primary USP, both
 * marketplace sides are visible in the first viewport, every CTA routes to a
 * real flow, and we still make no unsupported trust or payment claims.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { hostEntryTarget } from "@/lib/host-entry";
import { scanSpaceTarget, scanStuffTarget } from "@/lib/spacefit-entry";

const FILES = [
  "src/routes/index.tsx",
  "src/components/home/Hero.tsx",
  "src/components/home/SpaceFitEntry.tsx",
  "src/components/home/SpaceFitStory.tsx",
  "src/components/home/TwoSidedValue.tsx",
  "src/components/home/WhyStow.tsx",
  "src/components/home/HowItWorks.tsx",
  "src/components/home/HostCallout.tsx",
  "src/components/home/HostEntryButton.tsx",
  "src/components/home/LaunchArea.tsx",
];

const read = (file: string) => readFileSync(file, "utf8");
const copy = FILES.map(read).join("\n");

const hero = read("src/components/home/Hero.tsx");
const entry = read("src/components/home/SpaceFitEntry.tsx");
const story = read("src/components/home/SpaceFitStory.tsx");
const page = read("src/routes/index.tsx");

const BANNED = [
  /insured/i,
  /guaranteed/i,
  /fully protected/i,
  /background check/i,
  /book instantly/i,
  /instant booking/i,
  /secure payments/i,
  /cheapest/i,
  /thousands of/i,
];

describe("homepage copy", () => {
  it("makes no unsupported trust, insurance or payment claims", () => {
    for (const pattern of BANNED) {
      expect(copy).not.toMatch(pattern);
    }
  });

  it("leads with the required headline", () => {
    expect(hero).toContain("Make space for what matters.");
  });

  it("states both sides of the marketplace in the hero", () => {
    expect(hero).toContain("Storage that fits. Space that earns.");
  });

  it("names SpaceFit AI above the fold", () => {
    expect(hero).toContain("SpaceFit AI");
    expect(hero).toContain("SpaceFitEntry");
  });

  it("still explains both sides further down the page", () => {
    expect(copy).toContain("I need space");
    expect(copy).toContain("I have space");
    expect(copy).toContain("Your unused space could be earning.");
    expect(copy).toContain("Only pay for the space you need");
  });

  it("stops the renter journey at a request, never a booking or payment", () => {
    expect(copy).toContain("Send a request");
    expect(copy).toContain(
      "Sending a request doesn't book the space or take payment. The host still needs to respond.",
    );
  });

  it("routes every host CTA through the shared host entry helper", () => {
    const hostCtas = [
      "src/components/home/Hero.tsx",
      "src/components/home/TwoSidedValue.tsx",
      "src/components/home/HostCallout.tsx",
    ].map(read);
    for (const file of hostCtas) expect(file).toContain("HostEntryButton");
    expect(read("src/components/home/HostEntryButton.tsx")).toContain("hostEntryTarget");
    expect(hostEntryTarget(false)).toEqual({ to: "/signup", search: { mode: "host" } });
    expect(hostEntryTarget(true)).toEqual({ to: "/host/spaces/new" });
  });
});

describe("SpaceFit homepage entry points", () => {
  it("offers both scan paths", () => {
    expect(entry).toContain("Scan my stuff");
    expect(entry).toContain("Scan my space");
  });

  it("frames SpaceFit for both renters and hosts", () => {
    expect(entry).toContain("I have stuff to store");
    expect(entry).toContain("I have space to spare");
  });

  it("sends signed-in renters to the real photo scan flow", () => {
    expect(scanStuffTarget(true)).toEqual({ to: "/renter/inventory/photos" });
  });

  it("sends signed-out renters through signup in renter mode", () => {
    expect(scanStuffTarget(false)).toEqual({ to: "/signup", search: { mode: "renter" } });
  });

  it("sends signed-in hosts to the listing wizard that contains the space scanner", () => {
    expect(scanSpaceTarget(true)).toEqual({ to: "/host/spaces/new" });
  });

  it("sends signed-out hosts through signup in host mode", () => {
    expect(scanSpaceTarget(false)).toEqual({ to: "/signup", search: { mode: "host" } });
  });

  it("reuses the single host entry helper for the host scan path", () => {
    expect(scanSpaceTarget(true)).toEqual(hostEntryTarget(true));
    expect(scanSpaceTarget(false)).toEqual(hostEntryTarget(false));
  });

  it("links scan buttons with typed router links, never raw anchors", () => {
    expect(entry).toContain('<Link to="/renter/inventory/photos">');
    expect(entry).toContain('<Link to="/host/spaces/new">');
    expect(entry).not.toMatch(/<a href=/);
  });

  it("tracks scan intent for both sides", () => {
    expect(entry).toContain("get_spacefit_selected");
  });

  it("presents AI output as a reviewable estimate", () => {
    expect(entry).toContain("review and correct");
  });
});

describe("SpaceFit story section", () => {
  it("tells the scan → understand → match → fit story", () => {
    for (const step of ["Scan", "Understand", "Match", "Fit"]) {
      expect(story).toContain(`title: "${step}"`);
    }
  });

  it("covers both audiences", () => {
    expect(story).toContain("If you need storage");
    expect(story).toContain("If you have space");
  });

  it("carries the SpaceFit estimate disclaimer", () => {
    expect(story).toContain("SPACEFIT_DISCLAIMER");
  });

  it("reuses the shared SpaceFit visual identity", () => {
    expect(story).toContain("SpaceFitAiMark");
    expect(story).toContain("AnimatedSpaceFitScore");
  });

  it("reuses the shared scan buttons rather than new routing", () => {
    expect(story).toContain("ScanStuffButton");
    expect(story).toContain("ScanSpaceButton");
  });
});

describe("homepage structure", () => {
  it("places SpaceFit immediately after the hero", () => {
    expect(page.indexOf("<SpaceFitStory />")).toBeGreaterThan(page.indexOf("<Hero />"));
    expect(page.indexOf("<SpaceFitStory />")).toBeLessThan(page.indexOf("<StorageNearYou />"));
  });

  it("shows real marketplace supply before the deeper explanation sections", () => {
    expect(page.indexOf("<StorageNearYou />")).toBeLessThan(page.indexOf("<WhyStow />"));
  });

  it("keeps trust and pilot-area context at the end", () => {
    expect(page.indexOf("<LaunchArea />")).toBeGreaterThan(page.indexOf("<HostCallout />"));
  });

  it("keeps the existing postcode search on the homepage", () => {
    expect(hero).toContain("SearchControls");
  });

  it("has a single h1", () => {
    const h1s = FILES.map(read)
      .join("\n")
      .match(/<h1/g);
    expect(h1s).toHaveLength(1);
  });

  it("gives the homepage SpaceFit-led metadata", () => {
    expect(page).toContain("SpaceFit AI");
  });
});
