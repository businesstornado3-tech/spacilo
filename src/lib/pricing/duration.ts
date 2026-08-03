/**
 * Storage duration pricing — `storage-duration-v1` (Prompt 14).
 *
 * ONE deterministic algorithm decides what a stay costs. The database repeats
 * it exactly in `stow_storage_price_pence` / `stow_pricing_breakdown`, and the
 * database is authoritative: nothing the browser calculates is ever trusted or
 * charged. This module exists so the same numbers can be shown before a
 * request is sent, and so the rules are testable.
 *
 * DATE SEMANTICS
 *   start date is INCLUSIVE, end date is EXCLUSIVE.
 *   10 September → 13 September = 3 storage days.
 *   Dates are calendar dates (YYYY-MM-DD) compared as UTC midnight, so a
 *   browser timezone or a daylight-saving change can never alter a duration.
 *
 * MONEY
 *   Integer pence everywhere. No floats survive a calculation.
 */

export const PRICING_VERSION = "storage-duration-v1";

/** Canonical unit lengths used to derive missing rates and to price a stay. */
export const WEEK_DAYS = 7;
export const MONTH_DAYS = 30;

/** Longest stay the engine will price (10 years) — guards the DP array. */
export const MAX_DURATION_DAYS = 3660;

export interface HostRates {
  dailyPricePence: number | null;
  weeklyPricePence: number | null;
  monthlyPricePence: number | null;
}

export interface EffectiveRates {
  dailyPencePerDay: number;
  weeklyPence: number;
  monthlyPence: number;
}

const ceilDiv = (a: number, b: number) => Math.ceil(a / b);

/**
 * Calendar days between two ISO dates, end exclusive. Always >= 0 and always
 * timezone-independent.
 */
export function durationDays(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate.slice(0, 10)}T00:00:00.000Z`);
  const end = Date.parse(`${endDate.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) throw new Error("Invalid storage dates");
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

/**
 * Fills in whatever the host didn't configure, deterministically and rounding
 * UP so a derived rate never undercuts the rate the host actually set.
 * Returns null when the host has published no price at all.
 */
export function effectiveRates(rates: HostRates): EffectiveRates | null {
  const daily = positive(rates.dailyPricePence);
  const weekly = positive(rates.weeklyPricePence);
  const monthly = positive(rates.monthlyPricePence);
  if (daily === null && weekly === null && monthly === null) return null;

  const dailyPencePerDay =
    daily ??
    (weekly !== null ? ceilDiv(weekly, WEEK_DAYS) : ceilDiv(monthly as number, MONTH_DAYS));
  const weeklyPence =
    weekly ??
    (monthly !== null ? ceilDiv(monthly * WEEK_DAYS, MONTH_DAYS) : dailyPencePerDay * WEEK_DAYS);
  const monthlyPence =
    monthly ??
    (weekly !== null ? ceilDiv(weekly * MONTH_DAYS, WEEK_DAYS) : dailyPencePerDay * MONTH_DAYS);

  return { dailyPencePerDay, weeklyPence, monthlyPence };
}

function positive(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value)) throw new Error("Rates must be integer pence");
  return value > 0 ? value : null;
}

export interface PricingComponent {
  unit: "month" | "week" | "day";
  quantity: number;
  unitPricePence: number;
  amountPence: number;
}

export interface StoragePrice {
  version: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  rates: EffectiveRates;
  components: PricingComponent[];
  storageAmountPence: number;
}

/**
 * BEST APPLICABLE RATE.
 *
 * Exact dynamic programme over whole days:
 *
 *   cost[0] = 0
 *   cost[d] = min(
 *     cost[d - 1]            + daily rate,
 *     cost[max(0, d - 7)]    + weekly rate,
 *     cost[max(0, d - 30)]   + monthly rate
 *   )
 *
 * `max(0, …)` means a shorter stay is never charged more than simply buying
 * the larger unit that covers it, so 7 daily rates can never beat the weekly
 * rate and 5 weekly rates can never beat the monthly rate. The result is the
 * cheapest combination of the host's own rates for the exact duration — the
 * same inputs always produce the same number. No demand, timing, user or AI
 * input takes part.
 */
export function priceStorage(
  startDate: string,
  endDate: string,
  rates: HostRates,
): StoragePrice | null {
  const days = durationDays(startDate, endDate);
  if (days <= 0) return null;
  if (days > MAX_DURATION_DAYS) throw new Error("Storage period is too long to price");

  const effective = effectiveRates(rates);
  if (!effective) return null;

  const cost = new Array<number>(days + 1).fill(Number.POSITIVE_INFINITY);
  const choice = new Array<"month" | "week" | "day">(days + 1);
  cost[0] = 0;

  for (let d = 1; d <= days; d += 1) {
    let best = (cost[d - 1] as number) + effective.dailyPencePerDay;
    let bestUnit: "month" | "week" | "day" = "day";

    const weekBase = cost[Math.max(0, d - WEEK_DAYS)] as number;
    if (weekBase + effective.weeklyPence < best) {
      best = weekBase + effective.weeklyPence;
      bestUnit = "week";
    }
    const monthBase = cost[Math.max(0, d - MONTH_DAYS)] as number;
    if (monthBase + effective.monthlyPence < best) {
      best = monthBase + effective.monthlyPence;
      bestUnit = "month";
    }
    cost[d] = best;
    choice[d] = bestUnit;
  }

  // Backtrace into month/week/day counts for an auditable breakdown.
  const counts = { month: 0, week: 0, day: 0 };
  for (let d = days; d > 0; ) {
    const unit = choice[d] as "month" | "week" | "day";
    counts[unit] += 1;
    d = unit === "day" ? d - 1 : Math.max(0, d - (unit === "week" ? WEEK_DAYS : MONTH_DAYS));
  }

  const components: PricingComponent[] = [];
  if (counts.month > 0)
    components.push({
      unit: "month",
      quantity: counts.month,
      unitPricePence: effective.monthlyPence,
      amountPence: counts.month * effective.monthlyPence,
    });
  if (counts.week > 0)
    components.push({
      unit: "week",
      quantity: counts.week,
      unitPricePence: effective.weeklyPence,
      amountPence: counts.week * effective.weeklyPence,
    });
  if (counts.day > 0)
    components.push({
      unit: "day",
      quantity: counts.day,
      unitPricePence: effective.dailyPencePerDay,
      amountPence: counts.day * effective.dailyPencePerDay,
    });

  return {
    version: PRICING_VERSION,
    startDate: startDate.slice(0, 10),
    endDate: endDate.slice(0, 10),
    durationDays: days,
    rates: effective,
    components,
    storageAmountPence: cost[days] as number,
  };
}

/* ------------------------------------------------------------ minimum stay */

/** No host minimum means one day is enough. */
export const DEFAULT_MINIMUM_STAY_DAYS = 1;

export function minimumStayDays(space: { minimum_stay_days?: number | null }): number {
  const value = space.minimum_stay_days;
  return value && value > 0 ? value : DEFAULT_MINIMUM_STAY_DAYS;
}

export function meetsMinimumStay(days: number, minimum: number): boolean {
  return days >= Math.max(1, minimum);
}

export function minimumStayMessage(minimum: number): string {
  if (minimum <= 1) return "Storage is booked by the day, from one day upwards.";
  if (minimum % MONTH_DAYS === 0) {
    const months = minimum / MONTH_DAYS;
    return `This host asks for a minimum stay of ${months} month${months === 1 ? "" : "s"}.`;
  }
  if (minimum % WEEK_DAYS === 0) {
    const weeks = minimum / WEEK_DAYS;
    return `This host asks for a minimum stay of ${weeks} week${weeks === 1 ? "" : "s"}.`;
  }
  return `This host asks for a minimum stay of ${minimum} days.`;
}

/* ------------------------------------------------------------- formatting */

/** "3 days", "2 weeks", "1 month", "3 months and 4 days" — display only. */
export function formatDuration(days: number): string {
  if (days <= 0) return "no storage days";
  if (days < WEEK_DAYS) return plural(days, "day");
  if (days < MONTH_DAYS) {
    const weeks = Math.floor(days / WEEK_DAYS);
    const rest = days % WEEK_DAYS;
    return rest === 0 ? plural(weeks, "week") : `${plural(weeks, "week")} and ${plural(rest, "day")}`;
  }
  const months = Math.floor(days / MONTH_DAYS);
  const rest = days % MONTH_DAYS;
  if (rest === 0) return plural(months, "month");
  if (rest >= WEEK_DAYS) {
    const weeks = Math.floor(rest / WEEK_DAYS);
    return `${plural(months, "month")} and ${plural(weeks, "week")}`;
  }
  return `${plural(months, "month")} and ${plural(rest, "day")}`;
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

export const COMPONENT_LABEL: Record<PricingComponent["unit"], string> = {
  month: "month",
  week: "week",
  day: "day",
};

export function componentLabel(component: PricingComponent): string {
  const unit = COMPONENT_LABEL[component.unit];
  return `${component.quantity} × ${unit}${component.quantity === 1 ? "" : "s"}`;
}

/** Snapshot shape stored on requests and bookings so a price can be re-audited. */
export interface PricingSnapshot {
  daily_rate_snapshot: number | null;
  weekly_rate_snapshot: number | null;
  monthly_price_snapshot: number | null;
  minimum_stay_days_snapshot: number | null;
  duration_days_snapshot: number | null;
  pricing_version_snapshot: string | null;
  storage_amount_pence: number | null;
}

/**
 * Re-runs the engine against a stored snapshot. Used by tests and audits to
 * prove a later host price edit cannot change an existing booking's price.
 */
export function reprice(snapshot: PricingSnapshot, startDate: string, endDate: string) {
  return priceStorage(startDate, endDate, {
    dailyPricePence: snapshot.daily_rate_snapshot,
    weeklyPricePence: snapshot.weekly_rate_snapshot,
    monthlyPricePence: snapshot.monthly_price_snapshot,
  });
}
