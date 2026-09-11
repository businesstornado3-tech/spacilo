import { describe, expect, it } from "vitest";

import {
  PAID_PRESETS,
  PAID_QUALITIES,
  PROVIDER_MAX_SEGMENT_SECONDS,
  paidConfirmationMessage,
  paidPresetCostLine,
  paidPresetCostPence,
  paidPresetSpecLine,
} from "./paid-presets";

describe("paid video presets", () => {
  it("keeps the original 10-second option, unchanged", () => {
    const preset = PAID_PRESETS.SHORT;
    expect(preset.seconds).toBe(10);
    expect(preset.resolution).toBe("720p");
    expect(preset.aspect).toBe("9:16");
    expect(preset.width).toBe(720);
    expect(preset.height).toBe(1280);
    expect(preset.segments).toBe(1);
  });

  it("prices the short film from the existing calculation, matching the recorded 120 pence", () => {
    expect(paidPresetCostPence("SHORT")).toBe(120);
    expect(paidPresetCostLine("SHORT")).toBe("Estimated cost: £1.20");
  });

  it("adds a 30-second standard film at £3.60", () => {
    expect(PAID_PRESETS.STANDARD.seconds).toBe(30);
    expect(PAID_PRESETS.STANDARD.resolution).toBe("720p");
    expect(PAID_PRESETS.STANDARD.width).toBe(720);
    expect(PAID_PRESETS.STANDARD.height).toBe(1280);
    expect(paidPresetCostPence("STANDARD")).toBe(360);
    expect(paidPresetCostLine("STANDARD")).toBe("Estimated cost: £3.60");
  });

  it("adds a 30-second highest-quality film at £7.20", () => {
    expect(PAID_PRESETS.HIGHEST.seconds).toBe(30);
    expect(PAID_PRESETS.HIGHEST.resolution).toBe("1080p");
    expect(PAID_PRESETS.HIGHEST.width).toBe(1080);
    expect(PAID_PRESETS.HIGHEST.height).toBe(1920);
    expect(paidPresetCostPence("HIGHEST")).toBe(720);
    expect(paidPresetCostPence("HIGHEST")!).toBeGreaterThan(paidPresetCostPence("STANDARD")!);
  });

  it("splits the longer films into parts the service will actually film", () => {
    for (const quality of PAID_QUALITIES) {
      const preset = PAID_PRESETS[quality];
      expect(preset.segments).toBe(Math.ceil(preset.seconds / PROVIDER_MAX_SEGMENT_SECONDS));
      expect(preset.seconds / preset.segments).toBeLessThanOrEqual(PROVIDER_MAX_SEGMENT_SECONDS);
    }
  });

  it("states duration, resolution and cost, and never presents the estimate as a charge", () => {
    expect(paidPresetSpecLine("SHORT")).toBe("10 seconds · 720 × 1280 · 9:16");
    expect(paidPresetSpecLine("STANDARD")).toBe("30 seconds · 720 × 1280 · 9:16");
    expect(paidPresetSpecLine("HIGHEST")).toBe("30 seconds · 1080 × 1920 · 9:16");
    for (const quality of PAID_QUALITIES) {
      expect(paidConfirmationMessage(quality)).toMatch(/estimate, not a confirmed charge/i);
    }
    expect(paidConfirmationMessage("STANDARD")).toContain("£3.60");
    expect(paidConfirmationMessage("HIGHEST")).toContain("£7.20");
    expect(paidConfirmationMessage("STANDARD")).toMatch(/3 continuous parts/);
  });
});
