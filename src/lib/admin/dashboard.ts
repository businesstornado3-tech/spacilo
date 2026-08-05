/**
 * Founder/admin dashboard data helpers (Prompt 23C, Part D-F).
 *
 * Pure, React-free and Supabase-free so it can be unit-tested directly.
 * All aggregate numbers ultimately come from the SECURITY DEFINER RPCs
 * `admin_dashboard_kpis`, `admin_dashboard_trends` and
 * `admin_dashboard_breakdowns` — this module only shapes/labels/formats what
 * those functions already returned. It never derives money from client state.
 */

export const REPORTING_TIMEZONE = "Europe/London";

export type DateRangeKey = "today" | "7d" | "30d" | "this_month" | "custom";

export interface DateRange {
  from: Date;
  to: Date;
}

function londonPartsAt(date: Date) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: REPORTING_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts["year"]),
    month: Number(parts["month"]),
    day: Number(parts["day"]),
    hour: Number(parts["hour"]),
    minute: Number(parts["minute"]),
    second: Number(parts["second"]),
  };
}

function londonMidnightUtc(year: number, month: number, day: number): Date {
  let guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  for (let i = 0; i < 2; i++) {
    const seen = londonPartsAt(guess);
    const seenUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute, seen.second);
    const wantUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
    const diff = wantUtc - seenUtc;
    guess = new Date(guess.getTime() + diff);
  }
  return guess;
}

function addDays(year: number, month: number, day: number, delta: number) {
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + delta);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function resolveDateRange(
  key: DateRangeKey,
  now: Date = new Date(),
  custom?: { from: Date; to: Date },
): DateRange {
  if (key === "custom") {
    if (!custom) throw new Error("Custom range requires from/to");
    return { from: custom.from, to: custom.to };
  }

  const today = londonPartsAt(now);

  if (key === "today") {
    const start = londonMidnightUtc(today.year, today.month, today.day);
    const nextDay = addDays(today.year, today.month, today.day, 1);
    const end = londonMidnightUtc(nextDay.year, nextDay.month, nextDay.day);
    return { from: start, to: end };
  }

  if (key === "7d" || key === "30d") {
    const span = key === "7d" ? 7 : 30;
    const nextDay = addDays(today.year, today.month, today.day, 1);
    const end = londonMidnightUtc(nextDay.year, nextDay.month, nextDay.day);
    const startDay = addDays(today.year, today.month, today.day, 1 - span);
    const start = londonMidnightUtc(startDay.year, startDay.month, startDay.day);
    return { from: start, to: end };
  }

  const start = londonMidnightUtc(today.year, today.month, 1);
  const nextDay = addDays(today.year, today.month, today.day, 1);
  const end = londonMidnightUtc(nextDay.year, nextDay.month, nextDay.day);
  return { from: start, to: end };
}

export function previousEquivalentRange(range: DateRange): DateRange {
  const spanMs = range.to.getTime() - range.from.getTime();
  return { from: new Date(range.from.getTime() - spanMs), to: new Date(range.from.getTime()) };
}

export const DATE_RANGE_LABEL: Record<DateRangeKey, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  this_month: "This month",
  custom: "Custom range",
};

export type Delta =
  | { kind: "new" }
  | { kind: "no_prior_activity" }
  | { kind: "unavailable" }
  | { kind: "change"; percent: number; direction: "up" | "down" | "flat" };

export function formatDelta(current: number | null | undefined, previous: number | null | undefined): Delta {
  if (current === null || current === undefined || previous === null || previous === undefined) {
    return { kind: "unavailable" };
  }
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return { kind: "unavailable" };
  if (previous === 0) {
    return current > 0 ? { kind: "new" } : { kind: "no_prior_activity" };
  }
  const percent = ((current - previous) / previous) * 100;
  if (!Number.isFinite(percent)) return { kind: "unavailable" };
  const direction = percent > 0.05 ? "up" : percent < -0.05 ? "down" : "flat";
  return { kind: "change", percent, direction };
}

export function deltaLabel(delta: Delta): string {
  switch (delta.kind) {
    case "new":
      return "New";
    case "no_prior_activity":
      return "No prior activity";
    case "unavailable":
      return "—";
    case "change": {
      const rounded = Math.round(Math.abs(delta.percent));
      const sign = delta.direction === "down" ? "-" : delta.direction === "up" ? "+" : "";
      return `${sign}${rounded}% vs previous period`;
    }
  }
}

export function formatPence(pence: number | null | undefined): string {
  if (pence === null || pence === undefined || !Number.isFinite(pence)) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: pence % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(pence / 100);
}

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("en-GB").format(Math.round(value));
}

export function safeRate(numerator: number | null | undefined, denominator: number | null | undefined): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || !denominator) return null;
  return ((numerator as number) / (denominator as number)) * 100;
}

export function formatRate(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return "—";
  return `${Math.round(rate)}%`;
}

export interface FunnelStep {
  key: string;
  label: string;
  value: number;
  attributable: boolean;
}

export interface FunnelStepView extends FunnelStep {
  conversionFromPrevious: number | null;
  conversionFromFirst: number | null;
}

export function buildFunnel(steps: FunnelStep[]): FunnelStepView[] {
  const first = steps[0]?.value ?? 0;
  return steps.map((step, i) => {
    const prev = steps[i - 1];
    const attributableEdge = i > 0 && step.attributable && Boolean(prev?.attributable);
    return {
      ...step,
      conversionFromPrevious: attributableEdge ? safeRate(step.value, prev?.value) : null,
      conversionFromFirst: step.attributable && i > 0 ? safeRate(step.value, first) : null,
    };
  });
}

export function csvEscape(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export interface CsvReport {
  filename: string;
  rows: (string | number | null)[][];
}

export function toCsv(rows: (string | number | null)[][]): string {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
}

export function csvPreamble(reportName: string, range: DateRange): (string | number | null)[][] {
  return [
    [`Spacilo admin — ${reportName}`],
    [`Range (UTC)`, range.from.toISOString(), range.to.toISOString()],
    [`Timezone`, REPORTING_TIMEZONE],
    [],
  ];
}

export function buildCsvReport(
  reportName: string,
  range: DateRange,
  headings: string[],
  dataRows: (string | number | null)[][],
): CsvReport {
  const rows = [...csvPreamble(reportName, range), headings, ...dataRows];
  const stamp = range.from.toISOString().slice(0, 10);
  const filename = `spacilo-admin-${reportName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${stamp}.csv`;
  return { filename, rows };
}

export function isAllZero(values: Array<number | null | undefined>): boolean {
  return values.every((v) => !v || !Number.isFinite(v));
}
