/**
 * EarnRoom Intelligence Platform — foundation tests.
 *
 * These prove the two claims the platform is built on: the same input always
 * produces the same answer, and swapping a provider changes the answer without
 * changing a single caller.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { CATALOGUE_ITEMS } from "@/lib/spaceplanner/catalogue";
import { DEMO_SPACES } from "@/lib/spaceplanner/spaces";
import type { InventoryLine, StorageSpace, VisionPhoto } from "./contracts";
import { bandFor, combineConfidence } from "./confidence";
import { IntelligenceError, toIntelligenceError } from "./errors";
import { overallStatus, resetHealth } from "./health";
import { mockLearningProvider, resetLearning } from "./mock/learning";
import { assessCompatibility, packInventory, runPipeline } from "./pipeline";
import {
  activeProviders,
  platformCapabilities,
  registerProvider,
  resetProviders,
  supports,
} from "./registry";

const space: StorageSpace = DEMO_SPACES[0]!;
const lines: InventoryLine[] = [
  { item: CATALOGUE_ITEMS[0]!, quantity: 4 },
  { item: CATALOGUE_ITEMS[1]!, quantity: 1 },
];

const photo = (id: string): VisionPhoto => ({
  id,
  name: `${id}.jpg`,
  url: `blob:${id}`,
  sizeBytes: 120_000,
  mimeType: "image/jpeg",
  rotation: 0,
  addedAt: 0,
});

beforeEach(() => {
  resetProviders();
  resetHealth();
  resetLearning();
});

describe("registry", () => {
  it("exposes every capability the default providers offer", () => {
    const capabilities = platformCapabilities();
    for (const capability of ["vision", "packing", "recommendations", "pricing", "booking"] as const) {
      expect(capabilities).toContain(capability);
    }
    expect(supports("packing")).toBe(true);
  });

  it("swaps a provider without touching callers", async () => {
    const before = await packInventory(lines, space);
    registerProvider("packing", {
      ...activeProviders().packing,
      id: "test-packing",
      async pack() {
        return { ...before, meta: { ...before.meta, provider: "test-packing" } };
      },
    });
    const after = await packInventory(lines, space);
    expect(after.meta.provider).toBe("test-packing");
  });
});

describe("determinism", () => {
  it("produces the same plan for the same inputs", async () => {
    const a = await packInventory(lines, space);
    const b = await packInventory(lines, space);
    expect(b.score.value).toBe(a.score.value);
    expect(b.plan.after.placements.length).toBe(a.plan.after.placements.length);
  });

  it("runs the whole pipeline and reports overall confidence", async () => {
    const result = await runPipeline({ photos: [photo("p1"), photo("p2")], lines, space });
    expect(result.inventory?.objects.length).toBeGreaterThan(0);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.confidence.overall.value).toBeGreaterThan(0);
    expect(result.confidence.overall.percent).toBeLessThanOrEqual(100);
  });
});

describe("recommendations", () => {
  it("always carries a reason and evidence", async () => {
    const packing = await packInventory(lines, space);
    const compatibility = await assessCompatibility(packing);
    for (const recommendation of compatibility.recommendations) {
      expect(recommendation.reason.length).toBeGreaterThan(0);
      expect(recommendation.evidence.length).toBeGreaterThan(0);
      expect(recommendation.confidence).toBeGreaterThan(0);
    }
  });
});

describe("confidence", () => {
  it("bands consistently", () => {
    expect(bandFor(0.95)).toBe("high");
    expect(bandFor(0.8)).toBe("good");
    expect(bandFor(0.6)).toBe("moderate");
    expect(bandFor(0.2)).toBe("low");
  });

  it("weights vision above recommendations", () => {
    const visionLed = combineConfidence([
      { capability: "vision", value: 1 },
      { capability: "recommendations", value: 0 },
    ]);
    const recommendationLed = combineConfidence([
      { capability: "vision", value: 0 },
      { capability: "recommendations", value: 1 },
    ]);
    expect(visionLed.overall.value).toBeGreaterThan(recommendationLed.overall.value);
  });
});

describe("errors", () => {
  it("normalises unknown failures and keeps a fallback", () => {
    const error = toIntelligenceError(new Error("boom"));
    expect(error).toBeInstanceOf(IntelligenceError);
    expect(error.fallback.length).toBeGreaterThan(0);
  });
});

describe("health and learning", () => {
  it("reports ready before anything has run", () => {
    expect(overallStatus([])).toBe("ready");
  });

  it("calibrates within a narrow band", () => {
    for (let i = 0; i < 10; i += 1) {
      mockLearningProvider.record({ capability: "vision", subject: "box", outcome: "accepted" });
    }
    const summary = mockLearningProvider.summarise();
    expect(summary.acceptanceRate).toBe(1);
    expect(summary.calibration).toBeLessThanOrEqual(1.1);
    expect(summary.calibration).toBeGreaterThanOrEqual(0.9);
  });
});
