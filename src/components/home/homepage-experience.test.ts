/**
 * The homepage is the public SpacePlanner™ product experience.
 *
 * These tests lock the six-chapter structure and the demonstrate-don't-explain
 * rule: no reintroduction of the long marketing stack, and every scene stays
 * data-driven so the same definitions can power the authenticated planner.
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

const homepage = readFileSync("src/routes/index.tsx", "utf8");

describe("homepage structure", () => {
  const chapters = [
    "HeroSection",
    "AiTransformation",
    "SpacePlannerDemo",
    "WhySpacePlanner",
    "MarketplaceEntry",
    "FinalCta",
  ];

  it("renders exactly the six chapters, in order", () => {
    const positions = chapters.map((chapter) => homepage.indexOf(`<${chapter} />`));
    expect(positions.every((p) => p > -1)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("does not reintroduce the retired marketing sections", () => {
    for (const retired of [
      "StorageNearYou",
      "SpaceFitStory",
      "BrandStory",
      "HostCallout",
      "HostAiSection",
      "HostControl",
      "TrustSection",
      "LaunchArea",
    ]) {
      expect(homepage).not.toContain(retired);
    }
  });
});

describe("scene architecture", () => {
  it("is data driven and produces a real plan", () => {
    const space = sceneSpace(GARAGE_STORY);
    const plan = buildPlan(sceneLines(GARAGE_STORY), space);

    expect(space.kind).toBe("garage");
    expect(plan.after.placements.length).toBeGreaterThan(0);
    expect(plan.metrics.utilisation).toBeGreaterThanOrEqual(plan.metrics.utilisationBefore);
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
