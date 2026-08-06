/**
 * Availability presentation for a public listing (Prompt 26B).
 *
 * Facts only: a date is unavailable because a confirmed booking covers it, or
 * because it sits outside the window the host published. Nothing here reserves
 * anything, and an empty calendar is never presented as a guarantee — the
 * authoritative check still happens when a request becomes a booking.
 */

export interface UnavailableRange {
  start_date: string;
  end_date: string;
  reason: string;
}

export const REASON_LABEL: Record<string, string> = {
  booked: "Booked",
  not_yet_available: "Not yet available",
  after_availability: "Outside the host's window",
};

export const reasonLabel = (reason: string): string => REASON_LABEL[reason] ?? "Unavailable";

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
export const parseDay = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

export function addDays(value: string, days: number): string {
  return iso(new Date(parseDay(value).getTime() + days * DAY));
}

export function isUnavailable(day: string, ranges: UnavailableRange[]): UnavailableRange | null {
  const t = parseDay(day).getTime();
  return (
    ranges.find((r) => t >= parseDay(r.start_date).getTime() && t <= parseDay(r.end_date).getTime()) ??
    null
  );
}

/** Any overlap between a requested stay and an unavailable range. */
export function overlapsUnavailable(
  start: string,
  end: string,
  ranges: UnavailableRange[],
): boolean {
  const s = parseDay(start).getTime();
  const e = parseDay(end).getTime();
  return ranges.some(
    (r) => parseDay(r.start_date).getTime() <= e && parseDay(r.end_date).getTime() >= s,
  );
}

/**
 * The first day, from `from`, not covered by any unavailable range. Bounded to
 * a year so a permanently blocked listing returns null rather than looping.
 */
export function nextAvailableDay(
  ranges: UnavailableRange[],
  from: string,
  horizonDays = 365,
): string | null {
  let day = from;
  for (let i = 0; i <= horizonDays; i += 1) {
    if (!isUnavailable(day, ranges)) return day;
    day = addDays(day, 1);
  }
  return null;
}

export function availabilitySummary(ranges: UnavailableRange[], today: string): string {
  const next = nextAvailableDay(ranges, today);
  if (next === today) {
    return ranges.length
      ? "Available now, with some dates already taken."
      : "Available now. Dates are confirmed when the host accepts your request.";
  }
  if (!next) return "No availability in the next year. Ask the host about future dates.";
  const label = parseDay(next).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return `Estimated next available from ${label}.`;
}

/** Calendar cells for one month, Monday first, with padding for alignment. */
export interface CalendarDay {
  date: string | null;
  unavailable: boolean;
  reason: string | null;
  past: boolean;
}

export function monthGrid(
  year: number,
  month: number,
  ranges: UnavailableRange[],
  today: string,
): CalendarDay[] {
  const first = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // Monday-first
  const cells: CalendarDay[] = [];
  for (let i = 0; i < lead; i += 1) {
    cells.push({ date: null, unavailable: false, reason: null, past: false });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = iso(new Date(Date.UTC(year, month, day)));
    const hit = isUnavailable(date, ranges);
    cells.push({
      date,
      unavailable: Boolean(hit),
      reason: hit?.reason ?? null,
      past: parseDay(date).getTime() < parseDay(today).getTime(),
    });
  }
  return cells;
}

export const monthLabel = (year: number, month: number): string =>
  new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

/**
 * Future-ready hook point for calendar sync. No external calendar is read or
 * written in V1 — this simply describes where imported ranges would join.
 */
export function mergeExternalRanges(
  own: UnavailableRange[],
  imported: UnavailableRange[] = [],
): UnavailableRange[] {
  return [...own, ...imported].sort((a, b) => a.start_date.localeCompare(b.start_date));
}
