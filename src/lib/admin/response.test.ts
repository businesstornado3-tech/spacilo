import { describe, expect, it } from "vitest";

import { normalizeAdminBreakdowns } from "./response";
import { filterTopPublicPages } from "./traffic";
import { buildAttention, isAllClear } from "./attention";
import { aiSectionIsEmpty, guestAiOutcomes, hostAiFunnel, aiReliability, renterAiFunnel } from "./ai-funnels";
import { rangeSupportsComparison, resolveDateRange } from "./dashboard";

describe("founder dashboard RPC response integration", () => {
  it("normalizes the live Postgres device object that caused the route crash", () => {
    const data = normalizeAdminBreakdowns({ devices: { mobile: 8, desktop: 3, tablet: 1 } });
    expect(data.devices).toEqual([
      { source: "mobile", sessions: 8 },
      { source: "desktop", sessions: 3 },
      { source: "tablet", sessions: 1 },
    ]);
    expect(() => data.devices.slice(0, 2).map((row) => row.source)).not.toThrow();
  });

  it("renders a realistic populated breakdown shape", () => {
    const data = normalizeAdminBreakdowns({
      devices: { mobile: 12, desktop: 7 },
      top_pages: [{ path: "/", page_views: 20, visitors: 11 }],
      event_counts: { spacefit_stuff_started: 4, spacefit_space_started: 2 },
      attention: { open_support_cases: 1 },
    });
    expect(filterTopPublicPages(data.topPages)).toHaveLength(1);
    expect(renterAiFunnel(data.eventCounts)[0]?.value).toBe(4);
    expect(hostAiFunnel(data.eventCounts)[0]?.value).toBe(2);
    expect(buildAttention(data.attentionCounts)[0]?.key).toBe("open_support_cases");
  });

  it("accepts zero and empty production data without fabricating activity", () => {
    const data = normalizeAdminBreakdowns({ devices: {}, top_pages: [], event_counts: {}, attention: {} });
    expect(data.devices).toEqual([]);
    expect(filterTopPublicPages(data.topPages)).toEqual([]);
    expect(isAllClear(buildAttention(data.attentionCounts))).toBe(true);
    expect(
      aiSectionIsEmpty(
        [renterAiFunnel(data.eventCounts), hostAiFunnel(data.eventCounts)],
        [aiReliability(data.eventCounts), guestAiOutcomes(data.eventCounts)],
      ),
    ).toBe(true);
  });

  it("keeps missing AI stages explicitly uninstrumented", () => {
    const renter = renterAiFunnel({});
    const host = hostAiFunnel({});
    expect(renter.find((stage) => stage.event === null)?.value).toBeNull();
    expect(host.find((stage) => stage.event === null)?.value).toBeNull();
  });

  it("handles absent optional fields and malformed rows without throwing", () => {
    expect(() => normalizeAdminBreakdowns(null)).not.toThrow();
    expect(normalizeAdminBreakdowns({ devices: null, top_pages: [null, {}] })).toEqual({
      eventCounts: {}, attentionCounts: {}, devices: [], topPages: [],
    });
  });

  it("supports current-period comparison absence and all-time selection", () => {
    expect(rangeSupportsComparison("30d")).toBe(true);
    expect(rangeSupportsComparison("all_time")).toBe(false);
    const allTime = resolveDateRange("all_time", new Date("2026-08-05T12:00:00Z"));
    expect(allTime.from.toISOString()).toBe("2025-01-01T00:00:00.000Z");
    expect(allTime.to.getTime()).toBeGreaterThan(allTime.from.getTime());
  });
});