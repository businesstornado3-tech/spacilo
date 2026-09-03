import { describe, expect, it } from "vitest";

import {
  MAX_REBUILD_DAYS,
  ROLLUP_ALL_EVENTS,
  UNIQUE_VISITOR_ROLLUP_NOTE,
  eventCounts,
  publicPageViews,
  rebuildChunks,
  refreshWindow,
  totalFor,
  type RollupRow,
} from "./rollups";

const rows: RollupRow[] = [
  { rollup_date: "2026-01-01", event_name: ROLLUP_ALL_EVENTS, total_events: 10, public_events: 8, unique_visitors: 4, sessions: 6, public_unique_visitors: 3, public_sessions: 5 },
  { rollup_date: "2026-01-01", event_name: "page_view", total_events: 6, public_events: 5, unique_visitors: 3, sessions: 4, public_unique_visitors: 2, public_sessions: 3 },
  { rollup_date: "2026-01-02", event_name: "page_view", total_events: 2, public_events: 2, unique_visitors: 2, sessions: 2, public_unique_visitors: 2, public_sessions: 2 },
  { rollup_date: "2026-01-02", event_name: "signup_started", total_events: 1, public_events: 1, unique_visitors: 1, sessions: 1, public_unique_visitors: 1, public_sessions: 1 },
];

describe("analytics rollup helpers", () => {
  it("splits long rebuilds into bounded, contiguous chunks", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const to = new Date("2026-03-15T00:00:00.000Z");
    const chunks = rebuildChunks({ from, to });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.from).toEqual(from);
    expect(chunks.at(-1)?.to).toEqual(to);
    expect(Math.max(...chunks.map((chunk) => chunk.to.getTime() - chunk.from.getTime()))).toBeLessThanOrEqual(MAX_REBUILD_DAYS * 86_400_000);
    expect(chunks.every((chunk, index) => index === 0 || chunk.from.getTime() === chunks[index - 1]!.to.getTime())).toBe(true);
  });

  it("returns no chunks for an empty or reversed window", () => {
    const date = new Date("2026-01-01T00:00:00.000Z");
    expect(rebuildChunks({ from: date, to: date })).toEqual([]);
    expect(rebuildChunks({ from: new Date(date.getTime() + 1), to: date })).toEqual([]);
  });

  it("bounds routine refreshes to one through ninety days", () => {
    const now = new Date("2026-01-31T12:00:00.000Z");
    expect(refreshWindow(0, now).from.getTime()).toBe(now.getTime() + 1 - 86_400_000);
    expect(refreshWindow(999, now).from.getTime()).toBe(now.getTime() + 1 - 90 * 86_400_000);
    expect(refreshWindow(7, now).to.getTime()).toBe(now.getTime() + 1);
  });

  it("aggregates event totals without double-counting the synthetic all-events row", () => {
    expect(totalFor(rows, "page_view")).toBe(8);
    expect(publicPageViews(rows)).toBe(7);
    expect(eventCounts(rows)).toEqual({ page_view: 8, signup_started: 1 });
    expect(eventCounts(rows)[ROLLUP_ALL_EVENTS]).toBeUndefined();
  });

  it("documents the daily-unique limitation instead of implying exact period uniques", () => {
    expect(UNIQUE_VISITOR_ROLLUP_NOTE).toContain("sum of daily unique visitors");
  });
});
