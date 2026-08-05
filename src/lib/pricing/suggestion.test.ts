/**
 * Host pricing guidance and earnings projections. Guidance must stay bounded,
 * transparent about its factors, and honest that it isn't market data.
 */
import { describe, expect, it } from "vitest";

import {
  BASE_RATE_PENCE_PER_M3,
  DEFAULT_BASE_RATE_PENCE_PER_M3,
  EARNINGS_HORIZONS_MONTHS,
  EARNINGS_NOTE,
  MAX_SUGGESTED_MONTHLY_PENCE,
  MIN_SUGGESTED_MONTHLY_PENCE,
  projectEarnings,
  suggestPrice,
  type PriceSuggestionInput,
} from "./suggestion";

function input(partial: Partial<PriceSuggestionInput> = {}): PriceSuggestionInput {
  return {
    usableVolumeM3: 10,
    spaceType: "garage",
    accessType: "by_arrangement",
    moistureCondition: "unknown",
    temperatureCondition: "unknown",
    features: [],
    ...partial,
  };
}

describe("suggestPrice", () => {
  it("stamps the pricing algorithm version", () => {
    expect(suggestPrice(input()).algorithm).toBe("spacefit-price-v1");
  });

  it("declines to guide without a usable volume", () => {
    const s = suggestPrice(input({ usableVolumeM3: null }));
    expect(s.suggestedMonthlyPence).toBeNull();
    expect(s.notes.join(" ")).toContain("Add your measurements");
  });

  it("declines to guide on a zero volume", () => {
    expect(suggestPrice(input({ usableVolumeM3: 0 })).suggestedMonthlyPence).toBeNull();
  });

  it("falls back to the default base rate for unknown space types", () => {
    expect(suggestPrice(input({ spaceType: "spaceship" })).baseRatePencePerM3).toBe(
      DEFAULT_BASE_RATE_PENCE_PER_M3,
    );
  });

  it("uses the per-space-type base rate when known", () => {
    expect(suggestPrice(input({ spaceType: "garage" })).baseRatePencePerM3).toBe(
      BASE_RATE_PENCE_PER_M3["garage"],
    );
  });

  it("scales with usable volume", () => {
    const small = suggestPrice(input({ usableVolumeM3: 5 })).suggestedMonthlyPence!;
    const large = suggestPrice(input({ usableVolumeM3: 25 })).suggestedMonthlyPence!;
    expect(large).toBeGreaterThan(small);
  });

  it("never suggests below the minimum starting price", () => {
    const s = suggestPrice(input({ usableVolumeM3: 0.1 }));
    expect(s.suggestedMonthlyPence).toBe(MIN_SUGGESTED_MONTHLY_PENCE);
    expect(s.notes.join(" ")).toContain("minimum starting price");
  });

  it("never suggests above the maximum", () => {
    expect(suggestPrice(input({ usableVolumeM3: 100_000 })).suggestedMonthlyPence).toBe(
      MAX_SUGGESTED_MONTHLY_PENCE,
    );
  });

  it("rewards a confirmed dry space and explains why", () => {
    const dry = suggestPrice(input({ moistureCondition: "dry" }));
    expect(dry.suggestedMonthlyPence!).toBeGreaterThan(suggestPrice(input()).suggestedMonthlyPence!);
    expect(dry.factors.map((f) => f.label)).toContain("Confirmed dry");
  });

  it("rewards normal indoor temperature", () => {
    expect(
      suggestPrice(input({ temperatureCondition: "normal_indoor" })).factors.map((f) => f.label),
    ).toContain("Normal indoor temperature");
  });

  it("rewards independent access more than daytime access", () => {
    const independent = suggestPrice(input({ accessType: "independent" })).suggestedMonthlyPence!;
    const daytime = suggestPrice(input({ accessType: "daytime" })).suggestedMonthlyPence!;
    expect(independent).toBeGreaterThan(daytime);
  });

  it("rewards security features", () => {
    expect(suggestPrice(input({ features: ["cctv"] })).factors.map((f) => f.label)).toContain(
      "Security features",
    );
  });

  it("rewards ground-floor access", () => {
    expect(suggestPrice(input({ features: ["ground_floor"] })).factors.map((f) => f.label)).toContain(
      "Ground floor",
    );
  });

  it("brackets the suggestion with a low and high guide", () => {
    const s = suggestPrice(input());
    expect(s.lowMonthlyPence!).toBeLessThan(s.suggestedMonthlyPence!);
    expect(s.highMonthlyPence!).toBeGreaterThan(s.suggestedMonthlyPence!);
  });

  it("prices shorter commitments at a premium per month", () => {
    const s = suggestPrice(input());
    expect(s.suggestedWeeklyPence! * 4.3).toBeGreaterThan(s.suggestedMonthlyPence!);
    expect(s.suggestedDailyPence! * 30).toBeGreaterThan(s.suggestedMonthlyPence!);
  });

  it("rounds guidance to the nearest 50p", () => {
    const s = suggestPrice(input({ usableVolumeM3: 7.3 }));
    expect(s.suggestedMonthlyPence! % 50).toBe(0);
  });

  it("is deterministic", () => {
    expect(suggestPrice(input())).toEqual(suggestPrice(input()));
  });

  it("never presents guidance as market data", () => {
    expect(suggestPrice(input()).notes.join(" ")).toContain("not market data");
  });
});

describe("projectEarnings", () => {
  it("returns nothing without a price", () => {
    expect(projectEarnings(null)).toHaveLength(0);
    expect(projectEarnings(0)).toHaveLength(0);
  });

  it("projects every published horizon", () => {
    expect(projectEarnings(5000).map((p) => p.months)).toEqual([...EARNINGS_HORIZONS_MONTHS]);
  });

  it("gives the host the full storage price at full occupancy", () => {
    const twelve = projectEarnings(5000).find((p) => p.months === 12)!;
    expect(twelve.hostEarningsPence).toBe(60_000);
  });

  it("adds the service fee to what the renter pays, not to the host's deduction", () => {
    const month = projectEarnings(5000)[0]!;
    expect(month.renterPaysPence).toBe(month.hostEarningsPence + month.serviceFeePence);
    expect(month.serviceFeePence).toBeGreaterThan(0);
  });

  it("applies occupancy proportionally", () => {
    const half = projectEarnings(5000, 50).find((p) => p.months === 12)!;
    expect(half.hostEarningsPence).toBe(30_000);
  });

  it("clamps occupancy to 0–100", () => {
    expect(projectEarnings(5000, 400)[0]!.occupancyPercent).toBe(100);
    expect(projectEarnings(5000, -20)[0]!.occupancyPercent).toBe(0);
  });

  it("earns nothing at zero occupancy", () => {
    expect(projectEarnings(5000, 0)[0]!.hostEarningsPence).toBe(0);
  });

  it("never promises income", () => {
    expect(EARNINGS_NOTE.toLowerCase()).toContain("not a promise");
  });
});
