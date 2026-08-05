/**
 * Detection stabilisation.
 *
 * Live overlays must be calm: noise disappears, real objects persist, and the
 * same object seen across many frames stays ONE provisional object.
 */
import { describe, expect, it } from "vitest";

import { DetectionStabiliser, intersectionOverUnion } from "@/lib/livescan/stabiliser";
import type { BoundingBox, RawDetection } from "@/lib/livescan/types";

const box = (x: number, y: number): BoundingBox => [x, y, 100, 100];
const det = (cls: string, score: number, bbox: BoundingBox): RawDetection => ({
  class: cls,
  score,
  bbox,
});

describe("intersectionOverUnion", () => {
  it("is 1 for identical boxes", () => {
    expect(intersectionOverUnion(box(0, 0), box(0, 0))).toBeCloseTo(1);
  });

  it("is 0 for disjoint boxes", () => {
    expect(intersectionOverUnion(box(0, 0), box(500, 500))).toBe(0);
  });

  it("is between 0 and 1 for partial overlap", () => {
    const value = intersectionOverUnion(box(0, 0), box(50, 0));
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(1);
  });
});

describe("DetectionStabiliser", () => {
  it("hides a detection seen on only one frame", () => {
    const stabiliser = new DetectionStabiliser();
    expect(stabiliser.update([det("bicycle", 0.9, box(0, 0))], 0)).toHaveLength(0);
  });

  it("shows a detection once it persists", () => {
    const stabiliser = new DetectionStabiliser();
    stabiliser.update([det("bicycle", 0.9, box(0, 0))], 0);
    const visible = stabiliser.update([det("bicycle", 0.9, box(2, 2))], 100);
    expect(visible).toHaveLength(1);
    expect(visible[0]!.label).toBe("Bicycle");
  });

  it("only confirms a detection after enough confident frames", () => {
    const stabiliser = new DetectionStabiliser();
    let visible = stabiliser.update([det("bicycle", 0.9, box(0, 0))], 0);
    visible = stabiliser.update([det("bicycle", 0.9, box(0, 0))], 100);
    expect(visible[0]!.confirmed).toBe(false);
    visible = stabiliser.update([det("bicycle", 0.9, box(0, 0))], 200);
    expect(visible[0]!.confirmed).toBe(true);
  });

  it("never confirms a persistently low-confidence detection", () => {
    const stabiliser = new DetectionStabiliser();
    let visible: ReturnType<DetectionStabiliser["update"]> = [];
    for (let frame = 0; frame < 6; frame += 1) {
      visible = stabiliser.update([det("bicycle", 0.45, box(0, 0))], frame * 100);
    }
    expect(visible).toHaveLength(1);
    expect(visible[0]!.confirmed).toBe(false);
  });

  it("drops detections below the minimum score entirely", () => {
    const stabiliser = new DetectionStabiliser();
    stabiliser.update([det("bicycle", 0.1, box(0, 0))], 0);
    expect(stabiliser.update([det("bicycle", 0.1, box(0, 0))], 100)).toHaveLength(0);
  });

  it("suppresses transient noise that never repeats", () => {
    const stabiliser = new DetectionStabiliser();
    stabiliser.update([det("chair", 0.8, box(0, 0))], 0);
    stabiliser.update([], 100);
    expect(stabiliser.update([], 2000)).toHaveLength(0);
  });

  it("survives a single missed frame", () => {
    const stabiliser = new DetectionStabiliser();
    stabiliser.update([det("chair", 0.8, box(0, 0))], 0);
    stabiliser.update([det("chair", 0.8, box(0, 0))], 100);
    expect(stabiliser.update([], 300)).toHaveLength(1);
  });

  it("counts fifty frames of one bicycle as one bicycle", () => {
    const stabiliser = new DetectionStabiliser();
    for (let frame = 0; frame < 50; frame += 1) {
      stabiliser.update([det("bicycle", 0.9, box(0, 0))], frame * 60);
    }
    expect(stabiliser.visible()).toHaveLength(1);
    expect(stabiliser.counts()).toEqual([{ label: "Bicycle", count: 1, category: "bicycles" }]);
  });

  it("represents several distinguishable objects at once", () => {
    const stabiliser = new DetectionStabiliser();
    const frame = [
      det("suitcase", 0.9, box(0, 0)),
      det("suitcase", 0.9, box(400, 0)),
      det("bicycle", 0.9, box(0, 400)),
    ];
    stabiliser.update(frame, 0);
    const visible = stabiliser.update(frame, 100);
    expect(visible).toHaveLength(3);
    expect(stabiliser.counts()).toEqual(
      expect.arrayContaining([
        { label: "Suitcase", count: 2, category: "bags" },
        { label: "Bicycle", count: 1, category: "bicycles" },
      ]),
    );
  });

  it("never emits an unmapped class", () => {
    const stabiliser = new DetectionStabiliser();
    stabiliser.update([det("giraffe", 0.99, box(0, 0))], 0);
    expect(stabiliser.update([det("giraffe", 0.99, box(0, 0))], 100)).toHaveLength(0);
  });

  it("caps the number of tracks", () => {
    const stabiliser = new DetectionStabiliser({ maxTracks: 2, showFrames: 1 });
    const visible = stabiliser.update(
      [
        det("chair", 0.9, box(0, 0)),
        det("chair", 0.9, box(300, 0)),
        det("chair", 0.9, box(600, 0)),
      ],
      0,
    );
    expect(visible).toHaveLength(2);
  });

  it("forgets everything on reset", () => {
    const stabiliser = new DetectionStabiliser();
    stabiliser.update([det("chair", 0.9, box(0, 0))], 0);
    stabiliser.update([det("chair", 0.9, box(0, 0))], 100);
    stabiliser.reset();
    expect(stabiliser.visible()).toHaveLength(0);
  });
});
