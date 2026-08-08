/**
 * Milestone 18 — Space Intelligence Engine tests.
 *
 * Deterministic throughout: the same space must always produce the same
 * analysis, and every derived figure must trace back to the geometry.
 */
import { describe, expect, it, beforeEach } from "vitest";

import { DEMO_SPACES, SPACE_BY_ID } from "@/lib/spaceplanner/spaces";
import type { StorageSpace } from "@/lib/spaceplanner/types";

import {
  analyseSpace,
  analysisKey,
  buildGeometry,
  buildHostWidgets,
  buildReports,
  checkCompatibility,
  clearSpaceAnalysisCache,
  explainPlacement,
  proposeObstacles,
  recordSpaceSignal,
  resetSpaceLearning,
  summariseSpaceLearning,
  ZONE_KINDS,
} from "./index";

const garage = SPACE_BY_ID.get("garage") as StorageSpace;
const loft = SPACE_BY_ID.get("loft") as StorageSpace;
const bedroom = SPACE_BY_ID.get("bedroom") as StorageSpace;
const at = 1_700_000_000_000;

const run = (space: StorageSpace, extra = {}) =>
  analyseSpace({ space, ...extra }, { generatedAt: at, useCache: false });

beforeEach(() => {
  clearSpaceAnalysisCache();
  resetSpaceLearning();
});

describe("space analysis", () => {
  it("is deterministic for the same space", () => {
    expect(run(garage)).toEqual(run(garage));
  });

  it("analyses every demo space without gaps", () => {
    for (const space of DEMO_SPACES) {
      const analysis = run(space);
      expect(analysis.zones.length).toBeGreaterThan(0);
      expect(analysis.suitability).toHaveLength(11);
      expect(analysis.usable.totalFloorAreaM2).toBeGreaterThan(0);
      expect(analysis.confidence).toBeGreaterThan(0);
      expect(analysis.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("builds a room model from the space dimensions", () => {
    const geometry = buildGeometry(garage);
    expect(geometry.floor.areaM2).toBeCloseTo(garage.width * garage.depth, 2);
    expect(geometry.walls).toHaveLength(4);
    expect(geometry.doors[0]?.widthM).toBe(garage.doorWidth);
  });

  it("treats a loft as pitched with reduced headroom", () => {
    const analysis = run(loft);
    expect(analysis.geometry.ceiling.pitched).toBe(true);
    expect(analysis.geometry.ceiling.minHeightM).toBeLessThan(loft.height);
    expect(analysis.geometry.ceiling.supportsOverhead).toBe(false);
  });
});

describe("obstacles", () => {
  it("proposes typical obstacles per space type", () => {
    expect(proposeObstacles(loft).some((entry) => entry.kind === "beam")).toBe(true);
    expect(proposeObstacles(garage).some((entry) => entry.kind === "shelving")).toBe(true);
  });

  it("never invents obstacles when the host confirmed their own", () => {
    const confirmed = [
      {
        id: "custom",
        kind: "pillar" as const,
        label: "Pillar",
        footprint: { x: 0, y: 0, w: 0.3, d: 0.3 },
        fromHeightM: 0,
        toHeightM: 2.3,
        removable: false,
        confidence: 1,
        reason: "Host confirmed.",
      },
    ];
    expect(proposeObstacles(garage, confirmed)).toEqual(confirmed);
  });
});

describe("zoning", () => {
  it("creates purposeful zones with capacity and restrictions", () => {
    const analysis = run(garage);
    for (const zone of analysis.zones) {
      expect(ZONE_KINDS).toContain(zone.kind);
      expect(zone.areaM2).toBeGreaterThanOrEqual(0);
      expect(zone.restrictions.length).toBeGreaterThan(0);
      expect(zone.reason.length).toBeGreaterThan(0);
      expect(zone.confidence).toBeGreaterThan(0);
    }
  });

  it("reserves an access route in a deep space", () => {
    const analysis = run(garage);
    expect(analysis.zones.some((zone) => zone.kind === "access")).toBe(true);
    expect(analysis.walkways.length).toBe(1);
  });

  it("offers a vehicle zone in a garage but not a bedroom", () => {
    expect(run(garage).zones.some((zone) => zone.kind === "vehicle")).toBe(true);
    expect(run(bedroom).zones.some((zone) => zone.kind === "vehicle")).toBe(false);
  });
});

describe("capacity", () => {
  it("keeps floor accounting consistent", () => {
    const { usable } = run(garage);
    expect(usable.usableFloorAreaM2 + usable.blockedAreaM2 + usable.walkableAreaM2).toBeCloseTo(
      usable.totalFloorAreaM2,
      1,
    );
  });

  it("reduces available volume when a space is already occupied", () => {
    const empty = run(garage).usable.availableVolumeM3;
    const busy = run(garage, { occupiedVolumeM3: 4 }).usable.availableVolumeM3;
    expect(busy).toBeLessThan(empty);
  });
});

describe("access", () => {
  it("rates a narrow doorway harder than a roller shutter", () => {
    const wide = run(garage).access;
    const narrow = run(bedroom).access;
    expect(wide.largestItemM.widthM).toBeGreaterThan(narrow.largestItemM.widthM);
    expect(["easy", "moderate"]).toContain(wide.access);
  });

  it("always describes a route", () => {
    expect(run(garage).access.route.length).toBeGreaterThanOrEqual(4);
  });
});

describe("suitability", () => {
  it("sorts best-suited uses first and rates a shed poorly for electronics", () => {
    const analysis = run(SPACE_BY_ID.get("shed") as StorageSpace);
    const scores = analysis.suitability.map((entry) => entry.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    const electronics = analysis.suitability.find((entry) => entry.use === "electronics");
    expect(electronics?.score).toBeLessThan(70);
  });

  it("rates a heated indoor room well for archive storage", () => {
    const analysis = run(bedroom, { features: ["heated", "locked"] });
    const archive = analysis.suitability.find((entry) => entry.use === "archive");
    expect(["ideal", "suitable"]).toContain(archive?.rating);
  });
});

describe("placement", () => {
  it("proposes placements with a reason, evidence and priority", () => {
    const analysis = run(garage);
    expect(analysis.placements.length).toBeGreaterThan(3);
    for (const placement of analysis.placements) {
      expect(placement.reason.length).toBeGreaterThan(10);
      expect(placement.evidence.length).toBeGreaterThan(0);
      expect(["high", "medium", "low"]).toContain(placement.priority);
    }
  });

  it("hangs a bike on a mountable wall", () => {
    const bike = run(garage).placements.find((entry) => entry.subject === "bicycle");
    expect(bike?.surface).toBe("wall");
    expect(explainPlacement(bike!)).toContain("Bicycle");
  });

  it("puts boxes on shelving when shelving exists", () => {
    const boxes = run(garage).placements.find((entry) => entry.subject === "boxes");
    expect(boxes?.surface).toBe("shelf");
  });
});

describe("optimisation and health", () => {
  it("scores within bounds and bands honestly", () => {
    const analysis = run(garage);
    expect(analysis.optimisation.aiScore).toBeGreaterThanOrEqual(0);
    expect(analysis.optimisation.aiScore).toBeLessThanOrEqual(100);
    expect(analysis.health.overall).toBeLessThanOrEqual(100);
    expect(["excellent", "good", "fair", "needs_work"]).toContain(analysis.health.band);
  });

  it("raises utilisation as the space fills", () => {
    expect(run(garage, { occupiedVolumeM3: 6 }).health.utilisation).toBeGreaterThan(
      run(garage).health.utilisation,
    );
  });
});

describe("host intelligence", () => {
  it("suggests lighting when none is declared and never repeats it once declared", () => {
    const without = run(garage).hostRecommendations;
    const withLight = run(garage, { features: ["lighting"] }).hostRecommendations;
    expect(without.some((entry) => entry.kind === "lighting")).toBe(true);
    expect(withLight.some((entry) => entry.kind === "lighting")).toBe(false);
  });

  it("only quotes an uplift when a price is known", () => {
    for (const entry of run(garage).hostRecommendations) {
      expect(entry.upliftPence).toBeNull();
    }
    const priced = run(garage, { monthlyPence: 8000 }).hostRecommendations;
    expect(priced.some((entry) => (entry.upliftPence ?? 0) > 0)).toBe(true);
  });
});

describe("booking compatibility", () => {
  it("flags risk when the renter needs more than the space offers", () => {
    const analysis = run(garage);
    const tight = checkCompatibility(analysis, { space: garage }, { requiredVolumeM3: 60 });
    const roomy = checkCompatibility(analysis, { space: garage }, { requiredVolumeM3: 2 });
    expect(tight.risk).toBe("high");
    expect(roomy.risk).toBe("low");
    expect(tight.packingComplexity).toBe("Involved");
  });

  it("rewards a host who confirmed measurements and declared features", () => {
    const bare = run(garage).compatibility.hostScore;
    const rich = run(garage, {
      hostConfirmed: true,
      features: ["lighting", "cctv", "power", "locked"],
    }).compatibility.hostScore;
    expect(rich).toBeGreaterThan(bare);
  });
});

describe("digital twin", () => {
  it("builds surfaces, zones and fixed objects with provenance", () => {
    const { twin } = run(garage, { hostConfirmed: true });
    expect(twin.metadata.generatedAt).toBe(at);
    expect(twin.measurements.source).toBe("host_confirmed");
    expect(twin.surfaces.some((surface) => surface.kind === "floor")).toBe(true);
    expect(twin.surfaces.filter((surface) => surface.kind === "wall")).toHaveLength(4);
    expect(twin.zones.length).toBe(run(garage, { hostConfirmed: true }).zones.length);
    expect(twin.history[0]?.change).toBe("twin_generated");
  });

  it("marks measurements as AI-proposed until a host confirms them", () => {
    expect(run(garage).twin.measurements.source).toBe("ai_proposed");
  });
});

describe("explainability", () => {
  it("explains every headline figure in plain English", () => {
    const analysis = run(garage);
    expect(analysis.explanations.length).toBeGreaterThan(8);
    expect(analysis.explanations.join(" ")).toContain("Usable floor");
    for (const line of analysis.explanations) expect(line.length).toBeGreaterThan(10);
  });

  it("never claims a space is safe or guaranteed", () => {
    const text = run(garage, { monthlyPence: 9000 })
      .explanations.concat(run(garage).hostRecommendations.map((entry) => entry.reason))
      .join(" ")
      .toLowerCase();
    for (const banned of ["100% safe", "guaranteed", "fully insured", "zero risk"]) {
      expect(text).not.toContain(banned);
    }
  });
});

describe("reports", () => {
  it("builds all six reports with lines", () => {
    const reports = buildReports(run(garage, { monthlyPence: 8000 }), 8000);
    expect(reports.map((report) => report.kind)).toEqual([
      "summary",
      "capacity",
      "accessibility",
      "efficiency",
      "revenue",
      "improvement",
    ]);
    for (const report of reports) expect(report.headline.length).toBeGreaterThan(10);
  });
});

describe("host dashboard widgets", () => {
  it("produces six widgets with bounded meters", () => {
    const widgets = buildHostWidgets(run(garage), { monthlyPence: 8000, occupiedVolumeM3: 3 });
    expect(widgets).toHaveLength(6);
    for (const widget of widgets) {
      if (widget.meter !== null) {
        expect(widget.meter).toBeGreaterThanOrEqual(0);
        expect(widget.meter).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("learning infrastructure", () => {
  it("summarises anonymous signals without storing identities", () => {
    recordSpaceSignal({ outcome: "layout_accepted", spaceKind: "garage", zone: "boxes", at });
    recordSpaceSignal({ outcome: "layout_accepted", spaceKind: "garage", zone: "boxes", at });
    recordSpaceSignal({ outcome: "layout_rejected", spaceKind: "loft", at });

    const summary = summariseSpaceLearning();
    expect(summary.signals).toBe(3);
    expect(summary.acceptanceRate).toBeCloseTo(0.67, 1);
    expect(summary.preferredZones[0]).toBe("boxes");
    expect(summary.calibration).toBeGreaterThanOrEqual(0.9);
    expect(summary.calibration).toBeLessThanOrEqual(1.1);
  });
});

describe("performance", () => {
  it("reuses a cached analysis for an identical input", () => {
    const first = analyseSpace({ space: garage });
    const second = analyseSpace({ space: garage });
    expect(second).toBe(first);
  });

  it("keys the cache on everything the analysis depends on", () => {
    expect(analysisKey({ space: garage })).not.toBe(
      analysisKey({ space: garage, features: ["lighting"] }),
    );
    expect(analyseSpace({ space: garage, features: ["lighting"] })).not.toBe(
      analyseSpace({ space: garage }),
    );
  });
});
