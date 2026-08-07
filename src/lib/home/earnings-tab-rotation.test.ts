import { describe, expect, it } from "vitest";

import {
  EARNINGS_DEFAULT_TAB,
  EARNINGS_ROTATION_MS,
  EARNINGS_TAB_ORDER,
  EARNINGS_TRANSITION_MS,
  nextEarningsTab,
  shouldRotateEarnings,
} from "./earnings-tab-rotation";

const base = { inView: true, documentHidden: false, reducedMotion: false, userEngaged: false };

describe("earnings tab rotation", () => {
  it("leads with the quick estimate", () => {
    expect(EARNINGS_DEFAULT_TAB).toBe("quick");
    expect(EARNINGS_TAB_ORDER).toEqual(["quick", "scan"]);
  });

  it("loops between the two routes", () => {
    expect(nextEarningsTab("quick")).toBe("scan");
    expect(nextEarningsTab("scan")).toBe("quick");
  });

  it("dwells around six seconds and transitions in the premium band", () => {
    expect(EARNINGS_ROTATION_MS).toBe(6000);
    expect(EARNINGS_TRANSITION_MS).toBeGreaterThanOrEqual(250);
    expect(EARNINGS_TRANSITION_MS).toBeLessThanOrEqual(350);
  });

  it("rotates only when on screen, visible, motion-friendly and untouched", () => {
    expect(shouldRotateEarnings(base)).toBe(true);
    expect(shouldRotateEarnings({ ...base, inView: false })).toBe(false);
    expect(shouldRotateEarnings({ ...base, documentHidden: true })).toBe(false);
    expect(shouldRotateEarnings({ ...base, reducedMotion: true })).toBe(false);
    expect(shouldRotateEarnings({ ...base, userEngaged: true })).toBe(false);
  });
});
