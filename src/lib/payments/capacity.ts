/**
 * Volume-based availability (Prompt 11).
 *
 * The listing's physical capacity is never reduced. Availability is derived:
 *
 *   available = usable capacity
 *             - confirmed bookings overlapping the requested dates
 *             - live payment holds overlapping the requested dates
 *
 * The authoritative version of this lives in the database
 * (`space_available_volume_m3`), evaluated under a row lock so concurrent
 * checkouts cannot oversell. This module mirrors it so the rules are testable
 * and so the UI can explain a rejection.
 */

/** How long capacity is protected while a renter attempts payment. */
export const PAYMENT_HOLD_MINUTES = 30;

export const holdExpiryFrom = (start: Date): Date =>
  new Date(start.getTime() + PAYMENT_HOLD_MINUTES * 60_000);

export interface DateWindow {
  start: string;
  end: string;
}

/** Half-open overlap: touching windows (end === start) do not overlap. */
export function windowsOverlap(a: DateWindow, b: DateWindow): boolean {
  return a.start < b.end && a.end > b.start;
}

export interface ConfirmedReservation extends DateWindow {
  volumeM3: number;
}

export interface PaymentHold extends DateWindow {
  volumeM3: number;
  /** ISO timestamp; a hold at or past this instant no longer blocks capacity. */
  expiresAt: string | null;
  releasedAt?: string | null;
}

export function activeHoldVolume(
  holds: PaymentHold[],
  window: DateWindow,
  now: Date = new Date(),
): number {
  return holds
    .filter((hold) => !hold.releasedAt)
    .filter((hold) => hold.expiresAt !== null && new Date(hold.expiresAt).getTime() > now.getTime())
    .filter((hold) => windowsOverlap(hold, window))
    .reduce((total, hold) => total + hold.volumeM3, 0);
}

export function confirmedVolume(
  reservations: ConfirmedReservation[],
  window: DateWindow,
): number {
  return reservations
    .filter((row) => windowsOverlap(row, window))
    .reduce((total, row) => total + row.volumeM3, 0);
}

export interface AvailabilityInput {
  /** Physical usable capacity of the listing — never mutated by a booking. */
  usableVolumeM3: number;
  window: DateWindow;
  confirmed: ConfirmedReservation[];
  holds: PaymentHold[];
  now?: Date;
}

export function availableVolumeM3(input: AvailabilityInput): number {
  const now = input.now ?? new Date();
  return (
    input.usableVolumeM3 -
    confirmedVolume(input.confirmed, input.window) -
    activeHoldVolume(input.holds, input.window, now)
  );
}

export function hasCapacityFor(required: number, input: AvailabilityInput): boolean {
  // Tolerate float noise from m³ maths; the database check is authoritative.
  return availableVolumeM3(input) + 1e-9 >= required;
}

export const INSUFFICIENT_CAPACITY_MESSAGE =
  "This space no longer has enough availability for your requested dates.";
