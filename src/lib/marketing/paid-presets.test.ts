import { describe, expect, it } from "vitest";

import {
  PAID_PRESETS,
  paidConfirmationMessage,
  paidPresetCostLine,
  paidPresetCostPence,
  paidPresetSpecLine,
} from "./paid-presets";

describe("paid video presets", () => {
  it("standard reproduces the configuration behind the earlier real paid videos", () => {
    const preset = PAID_PRESETS.STANDARD;
    expect(preset.seconds).toBe(10);
    expect(preset.resolution).toBe("720p");
    expect(preset.aspect).toBe("9:16");
    expect(preset.width).toBe(720);
    expect(preset.height).toBe(1280);
  });

  it("prices standard from the existing calculation, matching the recorded 120 pence", () => {
    expect(paidPresetCostPence("STANDARD")).toBe(120);
    expect(paidPresetCostLine("STANDARD")).toBe("Estimated cost: £1.20");
  });

  it("keeps highest quality as a genuinely different, dearer configuration", () => {
    expect(PAID_PRESETS.HIGHEST.resolution).toBe("1080p");
    expect(paidPresetCostPence("HIGHEST")).toBe(240);
    expect(paidPresetCostPence("HIGHEST")!).toBeGreaterThan(paidPresetCostPence("STANDARD")!);
  });

  it("states the configuration and never presents the estimate as a charge", () => {
    expect(paidPresetSpecLine("STANDARD")).toBe("10 seconds · 720 × 1280 · 9:16");
    expect(paidConfirmationMessage("STANDARD")).toMatch(/estimate, not a confirmed charge/i);
    expect(paidConfirmationMessage("HIGHEST")).toContain("£2.40");
  });
});
