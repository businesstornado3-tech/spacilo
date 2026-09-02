/**
 * Prompt 23C closeout — founder/admin dashboard reporting invariants.
 *
 * These are pure-function tests. They exist so the numbers a founder makes
 * decisions on cannot silently drift: UK reporting days (including DST),
 * honest comparison labels, zero/unavailable states, money formatting from
 * pence, and funnel conversions that refuse to invent attribution.
 */
import { describe, expect, it } from "vitest";

import {
  DATE_RANGE_LABEL,
  REPORTING_TIMEZONE,
  buildCsvReport,
  buildFunnel,
  csvEscape,
  deltaLabel,
  formatCount,
  formatDelta,
  formatPence,
  formatRate,
  isAllZero,
  previousEquivalentRange,
  resolveDateRange,
  safeRate,
  toCsv,
} from "./dashboard";

describe("reporting ranges", () => {
  it("reports in UK time", () => {
    expect(REPORTING_TIMEZONE).toBe("Europe/London");
  });

  it("uses London midnight for 'today' in winter (UTC == local)", () => {
    const range = resolveDateRange("today", new Date("2026-01-15T14:00:00Z"));
    expect(range.from.toISOString()).toBe("2026-01-15T00:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-01-16T00:00:00.000Z");
  });

  it("uses London midnight for 'today' in British Summer Time", () => {
    const range = resolveDateRange("today", new Date("2026-07-15T14:00:00Z"));
    // BST is UTC+1, so the UK day starts at 23:00 UTC the previous day.
    expect(range.from.toISOString()).toBe("2026-07-14T23:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-07-15T23:00:00.000Z");
  });

  it("handles an event just after London midnight during BST", () => {
    const range = resolveDateRange("today", new Date("2026-07-15T00:30:00Z"));
    expect(range.from.toISOString()).toBe("2026-07-14T23:00:00.000Z");
  });

  it("spans a whole clock-change day without losing or doubling it", () => {
    // 29 March 2026: UK clocks go forward. The day is 23 hours long.
    const range = resolveDateRange("today", new Date("2026-03-29T12:00:00Z"));
    const hours = (range.to.getTime() - range.from.getTime()) / 3_600_000;
    expect(hours).toBe(23);
  });

  it("makes 7d and 30d inclusive of today", () => {
    const seven = resolveDateRange("7d", new Date("2026-01-15T14:00:00Z"));
    expect(seven.from.toISOString()).toBe("2026-01-09T00:00:00.000Z");
    expect(seven.to.toISOString()).toBe("2026-01-16T00:00:00.000Z");

    const thirty = resolveDateRange("30d", new Date("2026-01-31T14:00:00Z"));
    expect(thirty.from.toISOString()).toBe("2026-01-02T00:00:00.000Z");
  });

  it("starts 'this month' on the first of the month", () => {
    const range = resolveDateRange("this_month", new Date("2026-07-15T14:00:00Z"));
    expect(range.from.toISOString()).toBe("2026-06-30T23:00:00.000Z");
  });

  it("requires explicit dates for a custom range", () => {
    expect(() => resolveDateRange("custom", new Date())).toThrow();
  });

  it("compares against an equal-length preceding window", () => {
    const range = resolveDateRange("7d", new Date("2026-01-15T14:00:00Z"));
    const previous = previousEquivalentRange(range);
    expect(previous.to.getTime()).toBe(range.from.getTime());
    expect(previous.to.getTime() - previous.from.getTime()).toBe(
      range.to.getTime() - range.from.getTime(),
    );
  });

  it("labels every range option", () => {
    for (const key of ["today", "7d", "30d", "this_month", "custom"] as const) {
      expect(DATE_RANGE_LABEL[key]).toBeTruthy();
    }
  });
});

describe("honest comparisons", () => {
  it("never invents a percentage from a zero baseline", () => {
    expect(formatDelta(12, 0)).toEqual({ kind: "new" });
    expect(formatDelta(0, 0)).toEqual({ kind: "no_prior_activity" });
  });

  it("marks missing data unavailable rather than zero", () => {
    expect(formatDelta(null, 10).kind).toBe("unavailable");
    expect(formatDelta(10, undefined).kind).toBe("unavailable");
    expect(formatDelta(Number.NaN, 10).kind).toBe("unavailable");
    expect(deltaLabel({ kind: "unavailable" })).toBe("—");
  });

  it("reports direction and magnitude for real changes", () => {
    const up = formatDelta(150, 100);
    expect(up).toMatchObject({ kind: "change", direction: "up" });
    expect(deltaLabel(up)).toBe("+50% vs previous period");

    const down = formatDelta(50, 100);
    expect(deltaLabel(down)).toBe("-50% vs previous period");

    expect(formatDelta(100, 100)).toMatchObject({ direction: "flat" });
  });
});

describe("value formatting", () => {
  it("formats money from pence, never from client-side maths", () => {
    expect(formatPence(0)).toBe("£0");
    expect(formatPence(125_000)).toBe("£1,250");
    expect(formatPence(1234)).toBe("£12.34");
  });

  it("shows an em dash when money is unknown", () => {
    expect(formatPence(null)).toBe("—");
    expect(formatPence(undefined)).toBe("—");
  });

  it("formats counts with UK grouping and treats missing as zero", () => {
    expect(formatCount(12_345)).toBe("12,345");
    expect(formatCount(null)).toBe("0");
  });

  it("refuses rates with no denominator", () => {
    expect(safeRate(5, 0)).toBeNull();
    expect(safeRate(5, null)).toBeNull();
    expect(formatRate(null)).toBe("—");
    expect(formatRate(safeRate(3, 10))).toBe("30%");
  });

  it("detects an entirely empty period", () => {
    expect(isAllZero([0, null, undefined])).toBe(true);
    expect(isAllZero([0, 1])).toBe(false);
  });
});

describe("funnel", () => {
  const steps = [
    { key: "visitors", label: "Visitors", value: 1000, attributable: true },
    { key: "scans", label: "Scans", value: 200, attributable: true },
    { key: "requests", label: "Requests", value: 50, attributable: false },
    { key: "bookings", label: "Bookings", value: 10, attributable: false },
  ];

  it("computes step and overall conversion where attribution is real", () => {
    const view = buildFunnel(steps);
    expect(view[1]?.conversionFromPrevious).toBe(20);
    expect(view[1]?.conversionFromFirst).toBe(20);
  });

  it("withholds conversion across an unattributable edge", () => {
    const view = buildFunnel(steps);
    expect(view[2]?.conversionFromPrevious).toBeNull();
    expect(view[3]?.conversionFromPrevious).toBeNull();
  });

  it("leaves the first step without a conversion figure", () => {
    const view = buildFunnel(steps);
    expect(view[0]?.conversionFromPrevious).toBeNull();
    expect(view[0]?.conversionFromFirst).toBeNull();
  });

  it("survives an all-zero period", () => {
    const view = buildFunnel(steps.map((s) => ({ ...s, value: 0 })));
    expect(view.every((s) => s.conversionFromPrevious === null)).toBe(true);
  });
});

describe("CSV export", () => {
  const range = resolveDateRange("7d", new Date("2026-01-15T14:00:00Z"));

  it("escapes separators, quotes and newlines", () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape(null)).toBe("");
  });

  it("stamps the range and timezone into every export", () => {
    const report = buildCsvReport("Marketplace", range, ["Metric", "Value"], [["Bookings", 3]]);
    const csv = toCsv(report.rows);
    expect(csv).toContain("Europe/London");
    expect(csv).toContain(range.from.toISOString());
    expect(csv).toContain("Bookings,3");
    expect(report.filename).toBe("earnroom-admin-marketplace-2026-01-09.csv");
  });
});
