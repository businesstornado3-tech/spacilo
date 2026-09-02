/**
 * The homepage is the marketplace, with EarnRoom AI SpacePlanner™ layered on
 * top as the differentiator.
 *
 * These tests lock the three messages every visitor must receive (find storage
 * nearby, earn from unused space, see it fit before booking), the section
 * order, and the data-driven scene architecture.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  GARAGE_STORY,
  TRANSFORMATION_BEATS,
  buildPlan,
  placementReason,
  quantitiesToLines,
  sceneLines,
  sceneSpace,
} from "@/lib/spaceplanner";
import {
  DEMAND_BANDS,
  EARNING_EXAMPLES,
  SIZE_BANDS,
  estimateEarnings,
  formatEarningsRange,
} from "@/lib/home/earnings-estimate";

const homepage = readFileSync("src/routes/index.tsx", "utf8");
const hero = readFileSync("src/components/spaceplanner/HeroSection.tsx", "utf8");

describe("homepage structure", () => {
  const sections = [
    "HeroSection",
    "SpaceFitEntry",
    "MarketplaceEntry",
    "SpacePlannerDemo",
    "NearbySpaces",
    "MeetEarnRoomAI",
    "SpaceValueSection",
    "WhySpacePlanner",
    "FinalCta",
  ];

  it("renders the marketplace-first sections, in order", () => {
    const positions = sections.map((section) => homepage.indexOf(`<${section} />`));
    expect(positions.every((p) => p > -1)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("does not reintroduce the retired marketing sections", () => {
    for (const retired of [
      "StorageNearYou",
      "SpaceFitStory",
      "BrandStory",
      "HostAiSection",
      "HostControl",
      "TrustSection",
      "LaunchArea",
      "TwoSidedValue",
    ]) {
      expect(homepage).not.toContain(retired);
    }
  });
});

describe("hero delivers the three messages", () => {
  it("offers both marketplace journeys", () => {
    expect(hero).toContain("Find storage");
    expect(hero).toContain("List your space");
    expect(hero).toContain("/find-storage");
  });

  it("names the AI differentiator and the host earning opportunity", () => {
    expect(hero).toContain("SpacePlanner™");
    expect(hero).toContain("could earn");
    expect(hero).toContain("Earn passive income");
  });

  it("shows the transformation, not a static illustration", () => {
    expect(hero).toContain("HeroVisual");
    const visual = readFileSync("src/components/spaceplanner/HeroVisual.tsx", "utf8");
    expect(visual).toContain("HeroCinematic");

    // Marketing hero: a cinematic film, never the interactive twin or its UI.
    const film = readFileSync("src/components/home/HeroCinematic.tsx", "utf8");
    for (const control of ["Replay", "TwinViewer", "onSelect", "Add:", "confidence"]) {
      expect(film).not.toContain(control);
    }
  });

});

describe("host earnings estimator", () => {
  it("formats indicative ranges", () => {
    expect(formatEarningsRange({ min: 80, max: 250 })).toBe("£80–£250/month");
  });

  it("covers every space type with an ascending range", () => {
    expect(EARNING_EXAMPLES.map((e) => e.kind)).toEqual([
      "garage",
      "spare-room",
      "driveway",
      "loft",
    ]);
    for (const example of EARNING_EXAMPLES) {
      expect(example.range.min).toBeLessThan(example.range.max);
    }
  });

  it("is deterministic and scales with size and demand", () => {
    const base = estimateEarnings({ kind: "garage", size: "medium", demand: "town" });
    expect(estimateEarnings({ kind: "garage", size: "medium", demand: "town" })).toEqual(base);

    const bigger = estimateEarnings({ kind: "garage", size: "large", demand: "city" });
    expect(bigger.min).toBeGreaterThan(base.min);
    expect(bigger.max).toBeGreaterThan(base.max);

    const smaller = estimateEarnings({ kind: "garage", size: "small", demand: "rural" });
    expect(smaller.max).toBeLessThan(base.max);
  });

  it("never produces a zero or inverted range for any combination", () => {
    for (const example of EARNING_EXAMPLES) {
      for (const size of SIZE_BANDS) {
        for (const demand of DEMAND_BANDS) {
          const range = estimateEarnings({
            kind: example.kind,
            size: size.id,
            demand: demand.id,
          });
          expect(range.min).toBeGreaterThan(0);
          expect(range.max).toBeGreaterThan(range.min);
        }
      }
    }
  });
});

describe("scene architecture", () => {
  it("is data driven and produces a real plan", () => {
    const space = sceneSpace(GARAGE_STORY);
    const plan = buildPlan(sceneLines(GARAGE_STORY), space);

    expect(space.kind).toBe("garage");
    expect(plan.after.placements.length).toBeGreaterThan(0);
    // the optimised layout must free floor area, never consume more of it
    expect(plan.after.floorAreaUsed).toBeLessThan(plan.before.floorAreaUsed);
  });

  it("offers droppable objects that the catalogue knows", () => {
    const lines = quantitiesToLines(Object.fromEntries(GARAGE_STORY.addable.map((id) => [id, 1])));
    expect(lines).toHaveLength(GARAGE_STORY.addable.length);
  });

  it("narrates the pipeline and finishes organised", () => {
    expect(TRANSFORMATION_BEATS[0]!.organised).toBe(false);
    expect(TRANSFORMATION_BEATS.at(-1)!.organised).toBe(true);
    expect(TRANSFORMATION_BEATS.filter((beat) => beat.organised)).toHaveLength(1);
  });

  it("explains every placement in one or two short lines", () => {
    const space = sceneSpace(GARAGE_STORY);
    const plan = buildPlan(sceneLines(GARAGE_STORY), space);

    for (const placement of plan.after.placements) {
      const reason = placementReason(placement, space);
      expect(reason.length).toBeGreaterThan(20);
      expect(reason.length).toBeLessThan(140);
    }
  });
});
