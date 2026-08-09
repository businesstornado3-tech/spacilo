/**
 * Phase 6X — performance, render reliability and arrangement quality.
 *
 * These are the guarantees the phase exists to protect: the fast scan model
 * stays fast, the caches key on image content rather than upload identity,
 * nothing unstable is ever chosen as a support surface, supports the renderer
 * cannot draw are downgraded to adjacency rather than verified, and the
 * arrangement stays compact.
 */
import { describe, expect, it } from "vitest";
import { SCAN_MODEL, SPACE_MODEL, SCAN_SYSTEM } from "@/routes/api/vision-detect";
import { analysisFingerprint, contentHash, photoFingerprint } from "@/lib/vision/fingerprint";
import { canSupport, isRenderableSupport, isSafeSupportSurface } from "@/lib/spaceplanner/physical/relations";
import type { PlanningItem } from "@/lib/spaceplanner/physical/types";

function item(overrides: Partial<PlanningItem> & { id: string; label: string }): PlanningItem {
  return {
    widthCm: 60,
    depthCm: 40,
    heightCm: 40,
    quantity: 1,
    category: "boxes",
    weight: "medium",
    fragile: false,
    stackable: true,
    compressible: false,
    wallMounted: false,
    confidence: 0.9,
    ...overrides,
  } as PlanningItem;
}

describe("Phase 6X — fast belongings detection", () => {
  it("uses a fast multimodal model for both scans", () => {
    expect(SCAN_MODEL).toBe("google/gemini-3.6-flash");
    expect(SPACE_MODEL).toBe("google/gemini-3.6-flash");
  });

  it("asks for a compact schema with no reasoning fields", () => {
    expect(SCAN_SYSTEM).not.toContain("countBasis");
    expect(SCAN_SYSTEM).not.toContain('"evidence"');
    expect(SCAN_SYSTEM).not.toContain('"components"');
    expect(SCAN_SYSTEM).toContain("JSON");
  });

  it("still forbids invention and still demands per-axis dimensions", () => {
    expect(SCAN_SYSTEM).toMatch(/never invent/i);
    expect(SCAN_SYSTEM).toMatch(/never copied from another dimension/i);
  });
});

describe("Phase 6X — content-addressed analysis cache", () => {
  it("gives identical content the same fingerprint", () => {
    const base64 = "abcdefgh".repeat(1000);
    expect(contentHash(base64)).toBe(contentHash(base64));
  });

  it("distinguishes different content", () => {
    expect(contentHash("aaaa".repeat(500))).not.toBe(contentHash("aaab".repeat(500)));
  });

  it("ignores the upload identity of the photograph", () => {
    const base64 = "xyz".repeat(4000);
    expect(photoFingerprint({ id: "upload-1", base64 })).toBe(
      photoFingerprint({ id: "upload-2", base64 }),
    );
  });

  it("separates belongings and space analyses of the same photograph", () => {
    const photos = [{ id: "p", base64: "abc".repeat(2000) }];
    expect(analysisFingerprint({ task: "belongings", mode: "whole", photos })).not.toBe(
      analysisFingerprint({ task: "space", mode: "whole", photos }),
    );
  });

  it("invalidates when the marked region changes", () => {
    const base64 = "abc".repeat(2000);
    expect(photoFingerprint({ id: "p", base64, region: "left half" })).not.toBe(
      photoFingerprint({ id: "p", base64, region: "right half" }),
    );
  });
});

describe("Phase 6X — safe support surfaces", () => {
  const ceiling = 2.4;
  const top = { item: item({ id: "t", label: "Small speaker", weight: "light" }), w: 0.2, d: 0.2, heightM: 0.2 };

  it("rejects suitcases as a base", () => {
    expect(isSafeSupportSurface(item({ id: "s", label: "Large blue wheeled suitcase" }))).toBe(false);
  });

  it("rejects bags and soft goods as a base", () => {
    expect(isSafeSupportSurface(item({ id: "b", label: "Black backpack" }))).toBe(false);
    expect(isSafeSupportSurface(item({ id: "d", label: "Duvet bundle", compressible: true }))).toBe(false);
  });

  it("rejects an unidentified object as a base", () => {
    expect(
      isSafeSupportSurface(item({ id: "u", label: "Small dark tapered object", confidence: 0.4 })),
    ).toBe(false);
  });

  it("accepts a TV stand as a base", () => {
    expect(isSafeSupportSurface(item({ id: "st", label: "Black-framed TV stand" }))).toBe(true);
  });

  it("never stacks anything on a suitcase", () => {
    const base = { item: item({ id: "s", label: "Large suitcase" }), w: 0.8, d: 0.5, topHeightM: 0.3 };
    expect(canSupport(base, top, ceiling)).toBe(false);
  });

  it("does stack a small item on a table", () => {
    const base = { item: item({ id: "tb", label: "Wooden table" }), w: 1.2, d: 0.7, topHeightM: 0.75 };
    expect(canSupport(base, top, ceiling)).toBe(true);
  });
});

describe("Phase 6X — renderable supports", () => {
  it("verifies supports an image model reliably draws", () => {
    expect(isRenderableSupport("Black TV stand")).toBe(true);
    expect(isRenderableSupport("Wooden desk")).toBe(true);
    expect(isRenderableSupport("Metal shelving")).toBe(true);
  });

  it("downgrades supports that renders routinely get wrong", () => {
    expect(isRenderableSupport("Cardboard box")).toBe(false);
    expect(isRenderableSupport("Plastic storage crate")).toBe(false);
  });
});
