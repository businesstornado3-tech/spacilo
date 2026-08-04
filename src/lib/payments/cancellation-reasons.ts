/**
 * Structured cancellation / early-termination reasons (Prompt 17).
 *
 * These are user-facing product categories only. They carry no financial
 * meaning: the refund is decided by the database, never by the reason chosen.
 * Nothing here is an internal moderation label.
 */

export interface CancellationReason {
  /** Stored in `booking_cancellations.category` — stable, never re-worded. */
  value: string;
  label: string;
}

export const RENTER_CANCELLATION_REASONS: readonly CancellationReason[] = [
  { value: "plans_changed", label: "Plans changed" },
  { value: "no_longer_needed", label: "I no longer need storage" },
  { value: "found_alternative", label: "I found another storage option" },
  { value: "handover_problem", label: "Problem arranging the handover" },
  { value: "space_concern", label: "Concern about the space" },
  { value: "host_concern", label: "Concern about the host" },
  { value: "details_incorrect", label: "Booking details are incorrect" },
  { value: "other", label: "Something else" },
] as const;

export const HOST_CANCELLATION_REASONS: readonly CancellationReason[] = [
  { value: "space_unavailable", label: "Space is no longer available" },
  { value: "cannot_accommodate", label: "Unable to accommodate the belongings" },
  { value: "handover_problem", label: "Problem arranging the handover" },
  { value: "safety_concern", label: "Safety or prohibited-item concern" },
  { value: "details_incorrect", label: "Booking details appear incorrect" },
  { value: "personal_circumstances", label: "Unexpected personal circumstances" },
  { value: "other", label: "Something else" },
] as const;

export function cancellationReasons(
  audience: "renter" | "host",
): readonly CancellationReason[] {
  return audience === "host" ? HOST_CANCELLATION_REASONS : RENTER_CANCELLATION_REASONS;
}

/** Turns a stored category back into words. Unknown values degrade politely. */
export function cancellationReasonLabel(category: string | null | undefined): string | null {
  const value = category?.trim();
  if (!value) return null;
  const match = [...RENTER_CANCELLATION_REASONS, ...HOST_CANCELLATION_REASONS].find(
    (reason) => reason.value === value,
  );
  return match?.label ?? null;
}

/** The database caps free-text detail; keep the UI honest about it. */
export const REASON_DETAIL_MAX = 1000;
