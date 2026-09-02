/**
 * Founder console closeout invariants (Prompt 23C final).
 *
 * These protect the two things a founder cannot verify by eye: that internal
 * pages never reach customer traffic reporting, and that the console never
 * invents a number it does not actually have.
 */
import { describe, expect, it } from "vitest";

import { filterTopPublicPages, isPublicAnalyticsPath, TRAFFIC_LIMITATIONS } from "./traffic";
import {
  renterAiFunnel,
  hostAiFunnel,
  aiReliability,
  guestAiOutcomes,
  aiSectionIsEmpty,
} from "./ai-funnels";
import { buildAttention, isAllClear, topSeverity } from "./attention";
import {
  DATE_RANGE_LABEL,
  SELECTABLE_DATE_RANGES,
  rangeSupportsComparison,
  resolveDateRange,
  previousEquivalentRange,
} from "./dashboard";

describe("public vs internal traffic classification", () => {
  it("treats customer-facing pages as public", () => {
    for (const path of [
      "/",
      "/how-it-works",
      "/trust",
      "/find-storage",
      "/list-space",
      "/search",
      "/spaces/abc-123",
      "/spacefit/stuff",
      "/spacefit/space",
      "/storage-policy",
      "/privacy",
    ]) {
      expect(isPublicAnalyticsPath(path), path).toBe(true);
    }
  });

  it("never treats the founder console or account areas as public", () => {
    for (const path of [
      "/admin",
      "/admin/dashboard",
      "/admin/support/123",
      "/login",
      "/signup",
      "/forgot-password",
      "/reset-password",
      "/profile",
      "/notifications",
      "/renter",
      "/renter/search",
      "/host",
      "/host/spaces/new",
      "/support/cases/9",
      "/api/public/stripe/webhook",
      "/design-system",
    ]) {
      expect(isPublicAnalyticsPath(path), path).toBe(false);
    }
  });

  it("is case-insensitive and rejects junk", () => {
    expect(isPublicAnalyticsPath("/Admin/Dashboard")).toBe(false);
    expect(isPublicAnalyticsPath("")).toBe(false);
    expect(isPublicAnalyticsPath(null)).toBe(false);
    expect(isPublicAnalyticsPath("admin/dashboard")).toBe(false);
  });

  it("keeps /admin/dashboard out of top public pages", () => {
    const rows = filterTopPublicPages([
      { path: "/admin/dashboard", page_views: 900 },
      { path: "/", page_views: 40 },
      { path: "/login", page_views: 500 },
      { path: "/spaces/abc", page_views: 12 },
    ]);
    expect(rows.map((r) => r.path)).toEqual(["/", "/spaces/abc"]);
  });

  it("orders deterministically and caps the list", () => {
    const rows = filterTopPublicPages(
      [
        { path: "/b", page_views: 5 },
        { path: "/a", page_views: 5 },
        { path: "/c", page_views: 9 },
      ],
      2,
    );
    expect(rows.map((r) => r.path)).toEqual(["/c", "/a"]);
  });

  it("survives a missing breakdown payload", () => {
    expect(filterTopPublicPages(undefined)).toEqual([]);
    expect(filterTopPublicPages(null)).toEqual([]);
  });

  it("states its own limitations to the founder", () => {
    expect(TRAFFIC_LIMITATIONS.length).toBeGreaterThanOrEqual(3);
    expect(TRAFFIC_LIMITATIONS.join(" ")).toMatch(/cannot be linked|excluded/i);
  });
});

describe("EarnRoom AI funnels", () => {
  const counts = {
    spacefit_stuff_started: 100,
    spacefit_stuff_completed: 60,
    storage_search_started: 30,
    storage_request_created: 10,
    spacefit_space_started: 40,
    spacefit_space_completed: 20,
    host_listing_started: 12,
    host_listing_published: 6,
    live_scan_started: 130,
    live_scan_completed: 70,
    guest_scan_result_viewed: 15,
    guest_scan_claimed: 4,
  };

  it("reports renter and host journeys separately", () => {
    const renter = renterAiFunnel(counts);
    const host = hostAiFunnel(counts);
    expect(renter[0]?.value).toBe(100);
    expect(host[0]?.value).toBe(40);
    expect(renter[1]?.ofStart).toBe(60);
    expect(host[1]?.ofStart).toBe(50);
  });

  it("declares uninstrumented stages instead of showing zero", () => {
    const gap = renterAiFunnel(counts).find((s) => s.event === null);
    expect(gap?.value).toBeNull();
    expect(gap?.ofStart).toBeNull();
  });

  it("keeps shared Live Scan counts out of either journey", () => {
    const shared = aiReliability(counts);
    expect(shared.map((r) => r.event)).toContain("live_scan_started");
    expect(renterAiFunnel(counts).some((s) => s.event === "live_scan_started")).toBe(false);
    expect(hostAiFunnel(counts).some((s) => s.event === "live_scan_started")).toBe(false);
  });

  it("does not divide by zero on an empty period", () => {
    const renter = renterAiFunnel({});
    expect(renter.every((s) => s.ofStart === null || s.ofStart === 0)).toBe(true);
    expect(aiSectionIsEmpty([renter, hostAiFunnel({})], [aiReliability({}), guestAiOutcomes({})])).toBe(true);
  });

  it("knows when there is something to show", () => {
    expect(
      aiSectionIsEmpty([renterAiFunnel(counts), hostAiFunnel(counts)], [aiReliability(counts), guestAiOutcomes(counts)]),
    ).toBe(false);
  });
});

describe("needs attention", () => {
  it("lists only conditions that are actually present", () => {
    const items = buildAttention({ open_disputes: 0, open_support_cases: 2, draft_spaces: 5 });
    expect(items.map((i) => i.key)).toEqual(["open_support_cases", "draft_spaces"]);
  });

  it("ranks critical conditions first", () => {
    const items = buildAttention({ draft_spaces: 50, open_disputes: 1, refunds_pending: 3 });
    expect(items[0]?.key).toBe("open_disputes");
    expect(topSeverity(items)).toBe("critical");
  });

  it("reports an all-clear rather than filler", () => {
    const items = buildAttention({});
    expect(isAllClear(items)).toBe(true);
    expect(topSeverity(items)).toBeNull();
  });

  it("treats missing counts as absent, not as alerts", () => {
    expect(buildAttention(null)).toEqual([]);
    expect(buildAttention({ open_disputes: Number.NaN })).toEqual([]);
  });
});

describe("date ranges", () => {
  const now = new Date("2026-03-15T12:00:00Z");

  it("offers today, 7d, 30d, 90d, this month, last month and all time", () => {
    expect(SELECTABLE_DATE_RANGES).toEqual(["today", "7d", "30d", "90d", "this_month", "last_month", "all_time"]);
    for (const key of SELECTABLE_DATE_RANGES) expect(DATE_RANGE_LABEL[key]).toBeTruthy();
  });

  it("makes 90 days inclusive of today", () => {
    const range = resolveDateRange("90d", now);
    const days = (range.to.getTime() - range.from.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(90);
  });

  it("covers exactly the previous calendar month", () => {
    const range = resolveDateRange("last_month", now);
    expect(range.from.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("rolls last month back across a year boundary", () => {
    const range = resolveDateRange("last_month", new Date("2026-01-10T12:00:00Z"));
    expect(range.from.toISOString()).toBe("2025-12-01T00:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("runs all time from launch to the end of today", () => {
    const range = resolveDateRange("all_time", now);
    expect(range.from.toISOString()).toBe("2025-01-01T00:00:00.000Z");
    expect(range.to.getTime()).toBeGreaterThan(now.getTime());
  });

  it("refuses to compare all time against a fabricated prior period", () => {
    expect(rangeSupportsComparison("all_time")).toBe(false);
    for (const key of SELECTABLE_DATE_RANGES.filter((k) => k !== "all_time")) {
      expect(rangeSupportsComparison(key)).toBe(true);
    }
  });

  it("still derives an equal-length prior window for comparable ranges", () => {
    const range = resolveDateRange("90d", now);
    const prev = previousEquivalentRange(range);
    expect(prev.to.getTime()).toBe(range.from.getTime());
    expect(prev.to.getTime() - prev.from.getTime()).toBe(range.to.getTime() - range.from.getTime());
  });
});
