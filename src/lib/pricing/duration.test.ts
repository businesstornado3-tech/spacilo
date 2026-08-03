/**
 * The pricing engine is a commercial promise: same dates + same rates = same
 * price, and a renter is never charged more than buying the bigger unit.
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_MINIMUM_STAY_DAYS,
  MONTH_DAYS,
  PRICING_VERSION,
  WEEK_DAYS,
  durationDays,
  effectiveRates,
  formatDuration,
  meetsMinimumStay,
  minimumStayDays,
  priceStorage,
} from "@/lib/pricing/duration";

const rates = { dailyPricePence: 500, weeklyPricePence: 2500, monthlyPricePence: 8000 };

describe("durationDays", () => {
  it("counts whole calendar days with an exclusive end", () => {
    expect(durationDays("2026-08-01", "2026-08-08")).toBe(7);
    expect(durationDays("2026-08-01", "2026-08-01")).toBe(0);
  });

  it("ignores the browser timezone", () => {
    expect(durationDays("2026-08-01T23:30:00Z", "2026-08-03T00:10:00Z")).toBe(2);
  });
});

describe("effectiveRates", () => {
  it("derives missing rates upwards so they never undercut the host", () => {
    const derived = effectiveRates({
      dailyPricePence: null,
      weeklyPricePence: null,
      monthlyPricePence: 8000,
    });
    expect(derived).not.toBeNull();
    expect((derived as NonNullable<typeof derived>).dailyPencePerDay).toBe(
      Math.ceil(8000 / MONTH_DAYS),
    );
  });

  it("returns null when the host has published no price at all", () => {
    expect(
      effectiveRates({ dailyPricePence: null, weeklyPricePence: null, monthlyPricePence: null }),
    ).toBeNull();
  });
});

describe("priceStorage", () => {
  it("is deterministic", () => {
    const a = priceStorage("2026-08-01", "2026-09-15", rates);
    const b = priceStorage("2026-08-01", "2026-09-15", rates);
    expect(a).toEqual(b);
    expect(a?.version).toBe(PRICING_VERSION);
  });

  it("uses the cheapest combination of the host's own rates", () => {
    const week = priceStorage("2026-08-01", `2026-08-0${1 + WEEK_DAYS}`, rates);
    // 7 daily nights would be 3500 — the weekly rate wins.
    expect(week?.storageAmountPence).toBe(2500);
  });

  it("never charges a short stay more than the larger unit that covers it", () => {
    const twentyNine = priceStorage("2026-08-01", "2026-08-30", rates);
    const thirty = priceStorage("2026-08-01", "2026-08-31", rates);
    expect(twentyNine?.storageAmountPence).toBeLessThanOrEqual(
      thirty?.storageAmountPence as number,
    );
    expect(thirty?.storageAmountPence).toBe(8000);
  });

  it("is monotonic — a longer stay never costs less", () => {
    let previous = 0;
    for (let days = 1; days <= 90; days += 1) {
      const end = new Date(Date.UTC(2026, 7, 1) + days * 86_400_000).toISOString().slice(0, 10);
      const price = priceStorage("2026-08-01", end, rates);
      expect(price).not.toBeNull();
      expect((price as NonNullable<typeof price>).storageAmountPence).toBeGreaterThanOrEqual(
        previous,
      );
      previous = (price as NonNullable<typeof price>).storageAmountPence;
    }
  });

  it("components always add up to the stored total", () => {
    const price = priceStorage("2026-08-01", "2026-11-04", rates);
    const sum = (price?.components ?? []).reduce((total, c) => total + c.amountPence, 0);
    expect(sum).toBe(price?.storageAmountPence);
  });

  it("returns null for a zero-length stay or an unpriced space", () => {
    expect(priceStorage("2026-08-01", "2026-08-01", rates)).toBeNull();
    expect(
      priceStorage("2026-08-01", "2026-08-10", {
        dailyPricePence: null,
        weeklyPricePence: null,
        monthlyPricePence: null,
      }),
    ).toBeNull();
  });
});

describe("minimum stay", () => {
  it("falls back to the default when the host set nothing", () => {
    expect(minimumStayDays({})).toBe(DEFAULT_MINIMUM_STAY_DAYS);
    expect(minimumStayDays({ minimum_stay_days: 14 })).toBe(14);
  });

  it("rejects stays below the host's minimum", () => {
    expect(meetsMinimumStay(13, 14)).toBe(false);
    expect(meetsMinimumStay(14, 14)).toBe(true);
  });
});

describe("formatDuration", () => {
  it("reads naturally in UK English", () => {
    expect(formatDuration(1)).toContain("1 day");
    expect(formatDuration(7)).toContain("week");
    expect(formatDuration(60)).toContain("month");
  });
});
