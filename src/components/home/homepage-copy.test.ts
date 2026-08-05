/**
 * Guards the homepage promise hierarchy: Spacilo AI is the primary USP, both
 * marketplace sides are visible in the first viewport, every CTA routes to a
 * real flow, and we still make no unsupported trust or payment claims.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DEMO_STATES } from "@/components/home/SpaceFitDemo";
import { hostEntryTarget } from "@/lib/host-entry";
import { scanSpaceTarget, scanStuffTarget } from "@/lib/spacefit-entry";

const FILES = [
  "src/routes/index.tsx",
  "src/components/home/Hero.tsx",
  "src/components/home/SpaceFitEntry.tsx",
  "src/components/home/SpaceFitDemo.tsx",
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
const demo = read("src/components/home/SpaceFitDemo.tsx");

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

  it("leads with the required two-sided headline", () => {
    expect(hero).toContain("Space nearby.");
    expect(hero).toContain("Income at home.");
  });

  it("drops the previous headline", () => {
    expect(hero).not.toContain("Make space for what matters.");
  });

  it("gives both halves of the headline equal treatment inside the single h1", () => {
    const h1 = hero.slice(hero.indexOf("<h1"), hero.indexOf("</h1>"));
    const renter = h1.indexOf("Space nearby.");
    const host = h1.indexOf("Income at home.");
    expect(renter).toBeGreaterThan(-1);
    expect(host).toBeGreaterThan(renter);
    // identical wrapper treatment for both lines
    expect((h1.match(/<span className="block">/g) ?? []).length).toBe(2);
  });

  it("explains the marketplace directly under the headline", () => {
    expect(hero).toContain(
      "Find trusted neighbourhood storage — or earn from the space you're not using.",
    );
  });

  it("removes the redundant technology eyebrow above the headline", () => {
    expect(hero).not.toMatch(/Neighbourhood storage, powered by Spacilo AI/i);
  });

  it("introduces Spacilo AI with its own promise line", () => {
    expect(hero).toContain("SpaceFitAiMark");
    expect(hero).toContain("Your stuff. Your space. Just show us.");
  });

  it("pairs each scan action with its curiosity question", () => {
    expect(hero).toContain("How much space do I really need?");
    expect(hero).toContain("What could my unused space earn?");
  });

  it("does not lead with no-account-needed marketing", () => {
    expect(hero).not.toMatch(/no account needed/i);
    expect(hero).not.toMatch(/no sign-?up required/i);
  });

  it("keeps manual search and a manual host path in the hero", () => {
    expect(hero).toContain("SearchControls");
    expect(hero).toContain("HostEntryButton");
  });

  it("names Spacilo AI above the fold", () => {
    expect(hero).toContain("Spacilo AI");
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

  it("sends signed-out renters to the guest SpaceFit preview", () => {
    expect(scanStuffTarget(false)).toEqual({ to: "/spacefit/stuff" });
  });

  it("sends signed-in hosts to the listing wizard that contains the space scanner", () => {
    expect(scanSpaceTarget(true)).toEqual({ to: "/host/spaces/new" });
  });

  it("sends signed-out hosts to the guest space preview", () => {
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
    expect(page).toContain("Spacilo AI");
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

  it("labels the host earnings state as illustrative and never guaranteed", () => {
    const host = DEMO_STATES.find((s) => s.mode === "host")!;
    expect(host.resultValue).toMatch(/£/);
    expect(host.footnote).toMatch(/illustrative/i);
    expect(host.footnote).not.toMatch(/guarantee/i);
    expect(host.resultLabel).toMatch(/potential/i);
  });

  it("labels the renter score as an illustrative example, not the visitor's result", () => {
    const renter = DEMO_STATES.find((s) => s.mode === "renter")!;
    expect(renter.footnote).toMatch(/illustrative/i);
    expect(renter.footnote).toMatch(/not your result/i);
  });

  it("shows a stable both-benefit state when motion is reduced", () => {
    expect(demo).toContain("usePrefersReducedMotion");
    expect(demo).toContain("For renters");
    expect(demo).toContain("For hosts");
  });

  it("never navigates on its own — state changes only swap content", () => {
    expect(demo).not.toMatch(/navigate\(|<Link|href=/);
  });
});
