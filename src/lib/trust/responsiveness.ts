/**
 * Host responsiveness metric (Prompt 23, item 19).
 *
 * This module is the single written definition of the metric. The database
 * function `get_host_response_stats` computes the same thing server-side; the
 * functions here define and verify the rules the aggregate must obey, and the
 * UI never derives responsiveness from anything else.
 *
 * WINDOW           last 90 days, by request creation time
 * QUALIFYING       a storage request sent to the host that has either been
 *                  responded to, or has been waiting more than 48 hours
 *                  (so a request sent an hour ago is not counted as a miss)
 * RESPONSE         the host's own accept/decline action (`responded_at`);
 *                  system events (expiry, notifications) are never responses
 * RATE             responded / qualifying, both integers
 * TYPICAL TIME     median (percentile_cont 0.5) of responded durations
 * MINIMUM SAMPLE   3 qualifying requests; below that nothing is published
 */
export const RESPONSE_WINDOW_DAYS = 90;
export const RESPONSE_MIN_SAMPLE = 3;
/** A request younger than this with no reply is not yet a missed reply. */
export const RESPONSE_GRACE_HOURS = 48;

export interface ResponseEvent {
  /** When the renter's request reached the host. */
  createdAt: string;
  /** When the host themselves accepted or declined; null if never. */
  respondedAt: string | null;
  /** True for platform-generated activity that is not a host reply. */
  systemGenerated?: boolean;
}

const HOUR = 3_600_000;

function hoursBetween(from: string, to: string): number {
  return (new Date(to).getTime() - new Date(from).getTime()) / HOUR;
}

/** Inside the 90-day window, inclusive of the boundary itself. */
export function withinWindow(event: ResponseEvent, now: Date): boolean {
  const age = (now.getTime() - new Date(event.createdAt).getTime()) / HOUR;
  return age >= 0 && age <= RESPONSE_WINDOW_DAYS * 24;
}

/** Whether an event counts towards the denominator. */
export function isQualifying(event: ResponseEvent, now: Date): boolean {
  if (event.systemGenerated) return false;
  if (!withinWindow(event, now)) return false;
  if (event.respondedAt) return true;
  return (now.getTime() - new Date(event.createdAt).getTime()) / HOUR > RESPONSE_GRACE_HOURS;
}

/** A host reply, never a system event. */
export function isQualifyingResponse(event: ResponseEvent): boolean {
  return Boolean(event.respondedAt) && !event.systemGenerated;
}

export interface ResponseAggregate {
  sample_size: number;
  responded_count: number;
  median_response_hours: number | null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return Math.round(value * 10) / 10;
}

/**
 * Bounded aggregate — three numbers and nothing else. No message text, no
 * counterparty identity, no conversation ids, no individual timestamps.
 */
export function aggregateResponses(events: ResponseEvent[], now: Date): ResponseAggregate {
  const qualifying = events.filter((event) => isQualifying(event, now));
  const responded = qualifying.filter(isQualifyingResponse);
  return {
    sample_size: qualifying.length,
    responded_count: responded.length,
    median_response_hours: median(
      responded.map((event) => hoursBetween(event.createdAt, event.respondedAt!)),
    ),
  };
}

/** Published only once the sample is big enough. */
export function isPublishable(aggregate: ResponseAggregate): boolean {
  return aggregate.sample_size >= RESPONSE_MIN_SAMPLE;
}
