/**
 * Phase 6AS — belongings analysis reliability.
 *
 * Empty detections must never be cached, must never be reused, and must never
 * be presented as a successful identification.
 */
import { describe, expect, it, beforeEach } from "vitest";

import {
  clearDetectionCache,
  readDetectionCache,
  writeDetectionCache,
} from "@/lib/vision/detection-cache";
import type { DetectedObject } from "@/lib/vision/types";

function object(id: string): DetectedObject {
  return { id, label: "box", quantity: 1, confidence: 0.9 } as unknown as DetectedObject;
}

describe("phase 6AS — detection cache", () => {
  beforeEach(() => clearDetectionCache());

  it("TEST 1/10 — a valid non-empty result is cached and reused", () => {
    writeDetectionCache("k", [object("OBJ-1"), object("OBJ-2"), object("OBJ-3")]);
    expect(readDetectionCache("k")).toHaveLength(3);
  });

  it("TEST 2 — an empty result is not cached", () => {
    writeDetectionCache("k", []);
    expect(readDetectionCache("k")).toBeNull();
  });

  it("TEST 3 — an existing cached empty entry is invalid and dropped", () => {
    writeDetectionCache("k", [object("OBJ-1")]);
    writeDetectionCache("k", []);
    expect(readDetectionCache("k")).toBeNull();
  });

  it("TEST 7 — a retry after an empty result caches the valid result", () => {
    writeDetectionCache("k", []);
    expect(readDetectionCache("k")).toBeNull();
    writeDetectionCache("k", [object("OBJ-9")]);
    expect(readDetectionCache("k")?.[0]?.id).toBe("OBJ-9");
  });

  it("malformed entries are treated as a miss", () => {
    writeDetectionCache("k", [null as unknown as DetectedObject]);
    expect(readDetectionCache("k")).toBeNull();
  });
});
