/**
 * Phase 11 Stage 2 — analytics rollup contracts.
 *
 * The founder dashboard used to aggregate every raw `analytics_events` row on
 * each load, which does not survive millions of events. Daily rollups are now
 * the reporting surface; this module holds the *pure* logic around them so the
 * window maths, backfill chunking and totals can be tested without a database.
 *
 * Raw events are never deleted or replaced by this layer — a rollup is a
 * derived, rebuildable projection, and Phase 11 signal ingestion still reads
 * the raw stream.
 */

/** The synthetic event name carrying the all-events daily aggregate. */
export const ROLLUP_ALL_EVENTS = "__all__";

export type RollupRow = {
  rollup_date: string;
  event_name: string;
  total_events: number;
  public_events: number;
  unique_visitors: number;
  sessions: number;
  public_unique_visitors: number;
  public_sessions: number;
};

export type RollupWindow = { from: Date; to: Date };

/** A rebuild is always chunked, so a backfill can never run unbounded. */
export const MAX_REBUILD_DAYS = 31;

/**
 * Splits a historical window into bounded chunks. A long backfill therefore
 * becomes several short statements rather than one that times out.
 */
export function rebuildChunks(window: RollupWindow, maxDays = MAX_REBUILD_DAYS): RollupWindow[] {
  if (!(window.to.getTime() > window.from.getTime())) return [];
  const span = maxDays * 24 * 60 * 60 * 1000;
  const chunks: RollupWindow[] = [];
  let cursor = window.from.getTime();
  while (cursor < window.to.getTime()) {
    const next = Math.min(cursor + span, window.to.getTime());
    chunks.push({ from: new Date(cursor), to: new Date(next) });
    cursor = next;
  }
  return chunks;
}

/** The trailing window a routine refresh should rebuild (today included). */
export function refreshWindow(days: number, now = new Date()): RollupWindow {
  const bounded = Math.max(1, Math.min(90, Math.round(days)));
  const to = new Date(now.getTime() + 1);
  const from = new Date(to.getTime() - bounded * 24 * 60 * 60 * 1000);
  return { from, to };
}

/** Totals for one event name across a set of rollup rows. */
export function totalFor(rows: readonly RollupRow[], eventName: string): number {
  return rows.reduce((sum, row) => (row.event_name === eventName ? sum + row.total_events : sum), 0);
}

/** Public page views across a set of rollup rows. */
export function publicPageViews(rows: readonly RollupRow[]): number {
  return rows.reduce((sum, row) => (row.event_name === "page_view" ? sum + row.public_events : sum), 0);
}

/**
 * Event counts keyed by name, excluding the synthetic aggregate so a caller
 * can never double-count it.
 */
export function eventCounts(rows: readonly RollupRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    if (row.event_name === ROLLUP_ALL_EVENTS) continue;
    out[row.event_name] = (out[row.event_name] ?? 0) + row.total_events;
  }
  return out;
}

/**
 * Daily unique visitors cannot be summed across days without over-counting a
 * returning visitor, so a period figure is reported as the sum of daily
 * uniques and labelled as such wherever it is shown.
 */
export const UNIQUE_VISITOR_ROLLUP_NOTE =
  "Period visitor totals are the sum of daily unique visitors; someone returning on two days counts on both.";
