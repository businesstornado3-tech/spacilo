/**
 * Runtime boundary for the JSON returned by `admin_dashboard_breakdowns`.
 *
 * Postgres returns `devices` as an object keyed by device name, while the
 * dashboard renders rows. Keep that conversion here so malformed or optional
 * analytics data cannot throw during React render.
 */

export interface DeviceBreakdownRow {
  source: string;
  sessions: number;
}

export interface PublicPageRow {
  path: string;
  page_views: number;
  visitors?: number;
}

export interface AdminBreakdowns {
  eventCounts: Record<string, number>;
  attentionCounts: Record<string, number>;
  devices: DeviceBreakdownRow[];
  topPages: PublicPageRow[];
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function numberRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    const parsed = finiteNumber(raw);
    if (parsed !== null) result[key] = parsed;
  }
  return result;
}

function deviceRows(value: unknown): DeviceBreakdownRow[] {
  if (Array.isArray(value)) {
    return value.flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const source = (row as Record<string, unknown>)["source"];
      const sessions = finiteNumber((row as Record<string, unknown>)["sessions"]);
      return typeof source === "string" && sessions !== null ? [{ source, sessions }] : [];
    });
  }

  return Object.entries(numberRecord(value))
    .map(([source, sessions]) => ({ source, sessions }))
    .sort((a, b) => b.sessions - a.sessions || a.source.localeCompare(b.source));
}

function pageRows(value: unknown): PublicPageRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const record = row as Record<string, unknown>;
    const path = record["path"];
    const pageViews = finiteNumber(record["page_views"]);
    const visitors = finiteNumber(record["visitors"]);
    if (typeof path !== "string" || pageViews === null) return [];
    return [{ path, page_views: pageViews, ...(visitors === null ? {} : { visitors }) }];
  });
}

export function normalizeAdminBreakdowns(value: unknown): AdminBreakdowns {
  const payload =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return {
    eventCounts: numberRecord(payload["event_counts"]),
    attentionCounts: numberRecord(payload["attention"]),
    devices: deviceRows(payload["devices"]),
    topPages: pageRows(payload["top_pages"]),
  };
}
