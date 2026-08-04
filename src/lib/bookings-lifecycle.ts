/**
 * Booking lifecycle (Prompt 14).
 *
 * DATABASE STATUSES (authoritative, `booking_status`):
 *   pending_payment → confirmed → active → completed
 *                          ↘ cancelled ↙
 *
 * DERIVED STATES (never stored — computed from status + authoritative dates):
 *   awaiting_payment   status = pending_payment
 *   upcoming           status = confirmed AND today < start date
 *   ready_to_start     status = confirmed AND today >= start date
 *                      (Prompt 15 will attach handover evidence here; until
 *                      then we say "ready to start", never "active")
 *   active             status = active AND today < end date
 *   completion_due     status = active AND today >= end date
 *   completed          status = completed
 *   cancelled          status = cancelled
 *
 * Nothing here mutates anything. Every real transition goes through a
 * server-side RPC that re-checks ownership, payment and dates under a row
 * lock. This module mirrors those rules so the UI can explain itself.
 */
import type { Booking } from "@/lib/bookings";

export type LifecycleState =
  | "awaiting_payment"
  | "upcoming"
  | "ready_to_start"
  | "awaiting_handover_confirmation"
  | "active"
  | "completion_due"
  | "awaiting_collection_confirmation"
  | "completed"
  | "cancellation_under_review"
  | "cancelled";

/** Calendar date (UTC) — never a browser-local instant. */
export const toCalendarDate = (value: Date | string): string =>
  typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);

/**
 * The handover fields are optional so older fixtures and partial selects still
 * type-check; a missing timestamp simply means "not confirmed".
 */
export type LifecycleBooking = Pick<Booking, "status" | "start_date" | "end_date"> &
  Partial<
    Pick<
      Booking,
      | "activated_at"
      | "renter_handover_confirmed_at"
      | "host_handover_confirmed_at"
      | "renter_collection_confirmed_at"
      | "host_collection_confirmed_at"
    >
  >;

/** Two-party confirmation: neither side alone moves the booking on. */
export type HandoverStep = "handover" | "collection";

export interface HandoverProgress {
  renterConfirmed: boolean;
  hostConfirmed: boolean;
  /** Exactly one side has confirmed, so the other side is holding it up. */
  awaitingOther: boolean;
  bothConfirmed: boolean;
}

export function handoverProgress(
  booking: LifecycleBooking,
  step: HandoverStep,
): HandoverProgress {
  const renterConfirmed = Boolean(
    step === "handover"
      ? booking.renter_handover_confirmed_at
      : booking.renter_collection_confirmed_at,
  );
  const hostConfirmed = Boolean(
    step === "handover"
      ? booking.host_handover_confirmed_at
      : booking.host_collection_confirmed_at,
  );
  return {
    renterConfirmed,
    hostConfirmed,
    awaitingOther: renterConfirmed !== hostConfirmed,
    bothConfirmed: renterConfirmed && hostConfirmed,
  };
}

/** Has this viewer already confirmed their half of the step? */
export function viewerConfirmed(
  booking: LifecycleBooking,
  step: HandoverStep,
  audience: "renter" | "host",
): boolean {
  const progress = handoverProgress(booking, step);
  return audience === "renter" ? progress.renterConfirmed : progress.hostConfirmed;
}

export function lifecycleState(booking: LifecycleBooking, now: Date = new Date()): LifecycleState {
  const today = toCalendarDate(now);
  switch (booking.status) {
    case "cancelled":
      // Cancelled after the belongings went in: money and collection still
      // need sorting out, so we never present it as simply "cancelled".
      return booking.activated_at ? "cancellation_under_review" : "cancelled";
    case "completed":
      return "completed";
    case "pending_payment":
      return "awaiting_payment";
    case "active": {
      if (handoverProgress(booking, "collection").awaitingOther) {
        return "awaiting_collection_confirmation";
      }
      return today >= toCalendarDate(booking.end_date) ? "completion_due" : "active";
    }
    case "confirmed": {
      if (handoverProgress(booking, "handover").awaitingOther) {
        return "awaiting_handover_confirmation";
      }
      return today >= toCalendarDate(booking.start_date) ? "ready_to_start" : "upcoming";
    }
    default:
      return "awaiting_payment";
  }
}

type Tone = "neutral" | "warning" | "success" | "info";

export const LIFECYCLE_META: Record<
  LifecycleState,
  { label: string; tone: Tone; renterNote: string; hostNote: string }
> = {
  awaiting_payment: {
    label: "Awaiting payment",
    tone: "warning",
    renterNote: "Pay to confirm this booking. Nothing is reserved until payment completes.",
    hostNote: "The renter still needs to pay. Nothing is reserved yet and no action is needed.",
  },
  upcoming: {
    label: "Upcoming",
    tone: "info",
    renterNote: "This booking is paid and confirmed. Storage starts on the start date.",
    hostNote: "This booking is paid and confirmed. Get the space ready for the start date.",
  },
  ready_to_start: {
    label: "Ready to start",
    tone: "info",
    renterNote:
      "Your storage period has begun. Confirm with the host when your belongings are in the space.",
    hostNote:
      "The storage period has begun. Confirm once the renter's belongings are in your space.",
  },
  active: {
    label: "Active",
    tone: "success",
    renterNote: "Your belongings are in storage. The space is reserved until the end date.",
    hostNote: "Storage is under way. This booking is using your space until the end date.",
  },
  completion_due: {
    label: "Ready to finish",
    tone: "warning",
    renterNote: "The storage period has ended. Confirm collection to finish this booking.",
    hostNote: "The storage period has ended. Confirm once the renter has collected everything.",
  },
  awaiting_handover_confirmation: {
    label: "Awaiting confirmation",
    tone: "warning",
    renterNote:
      "One of you has confirmed the handover. Storage starts once the other side confirms too.",
    hostNote:
      "One of you has confirmed the handover. Storage starts once the other side confirms too.",
  },
  awaiting_collection_confirmation: {
    label: "Awaiting confirmation",
    tone: "warning",
    renterNote:
      "One of you has confirmed collection. The booking finishes once the other side confirms too.",
    hostNote:
      "One of you has confirmed collection. The booking finishes once the other side confirms too.",
  },
  completed: {
    label: "Completed",
    tone: "neutral",
    renterNote: "This booking has finished. Your records stay here for reference.",
    hostNote: "This booking has finished and the space is free again.",
  },
  cancellation_under_review: {
    label: "Cancellation under review",
    tone: "warning",
    renterNote:
      "Storage had already started when this booking was cancelled, so we're reviewing the refund and collection arrangements with you and the host.",
    hostNote:
      "Storage had already started when this booking was cancelled, so we're reviewing the refund and collection arrangements with you and the renter.",
  },
  cancelled: {
    label: "Cancelled",
    tone: "neutral",
    renterNote: "This booking was cancelled.",
    hostNote: "This booking was cancelled.",
  },
};

export const lifecycleMeta = (state: LifecycleState) => LIFECYCLE_META[state];

/* ---------------------------------------------------------------- grouping */

export type LifecycleGroup = "action" | "upcoming" | "active" | "completed" | "cancelled";

export const GROUP_ORDER: LifecycleGroup[] = [
  "action",
  "active",
  "upcoming",
  "completed",
  "cancelled",
];

export const GROUP_LABEL: Record<LifecycleGroup, string> = {
  action: "Needs your attention",
  upcoming: "Upcoming",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** Each booking belongs to exactly one group — never two lists at once. */
export function lifecycleGroup(state: LifecycleState): LifecycleGroup {
  switch (state) {
    case "awaiting_payment":
      return "action";
    case "upcoming":
      return "upcoming";
    case "ready_to_start":
    case "awaiting_handover_confirmation":
    case "active":
    case "completion_due":
    case "awaiting_collection_confirmation":
      return "active";
    case "completed":
      return "completed";
    case "cancellation_under_review":
    case "cancelled":
      return "cancelled";
  }
}

export function groupBookings<T extends LifecycleBooking>(
  bookings: T[],
  now: Date = new Date(),
): Record<LifecycleGroup, T[]> {
  const groups: Record<LifecycleGroup, T[]> = {
    action: [],
    upcoming: [],
    active: [],
    completed: [],
    cancelled: [],
  };
  for (const booking of bookings) {
    groups[lifecycleGroup(lifecycleState(booking, now))].push(booking);
  }
  return groups;
}

/* -------------------------------------------------------------- activation */

export type ActivationRejection =
  | "not_a_participant"
  | "not_confirmed"
  | "not_paid"
  | "cancelled"
  | "completed"
  | "before_start_date"
  | "financially_blocked";

export interface ActivationFacts {
  booking: Pick<Booking, "status" | "start_date" | "end_date" | "renter_id" | "host_id">;
  viewerId: string | null | undefined;
  /** A succeeded payment exists for this booking. */
  paid: boolean;
  /** A dispute or other financial hold is open against this booking. */
  financiallyBlocked?: boolean;
  now?: Date;
}

export type CompletionRejection =
  | "not_a_participant"
  | "not_active"
  | "cancelled"
  | "before_end_date";

export interface GateResult {
  allowed: boolean;
  /** Already in the target state — a retry is a no-op, not an error. */
  alreadyDone?: boolean;
  reason?: ActivationRejection | CompletionRejection;
}

/**
 * May storage be marked as started? Mirrors `activate_booking`, which is the
 * authority. Either side of the booking may confirm the handover.
 */
export function activationGate(facts: ActivationFacts): GateResult {
  const { booking, viewerId } = facts;
  const now = facts.now ?? new Date();
  if (!viewerId || (booking.renter_id !== viewerId && booking.host_id !== viewerId)) {
    return { allowed: false, reason: "not_a_participant" };
  }
  if (booking.status === "active") return { allowed: false, alreadyDone: true };
  if (booking.status === "cancelled") return { allowed: false, reason: "cancelled" };
  if (booking.status === "completed") return { allowed: false, reason: "completed" };
  if (booking.status !== "confirmed") return { allowed: false, reason: "not_confirmed" };
  if (!facts.paid) return { allowed: false, reason: "not_paid" };
  if (facts.financiallyBlocked) return { allowed: false, reason: "financially_blocked" };
  if (toCalendarDate(now) < toCalendarDate(booking.start_date)) {
    return { allowed: false, reason: "before_start_date" };
  }
  return { allowed: true };
}

export const ACTIVATION_MESSAGE: Record<ActivationRejection, string> = {
  not_a_participant: "Only the renter or the host can confirm this booking has started.",
  not_confirmed: "This booking isn't confirmed yet, so storage can't start.",
  not_paid: "This booking hasn't been paid, so storage can't start.",
  cancelled: "This booking was cancelled and can't be started.",
  completed: "This booking has already finished.",
  before_start_date: "Storage can only start on or after the booking's start date.",
  financially_blocked:
    "There's an open payment query on this booking. We'll be in touch before storage starts.",
};

/* -------------------------------------------------------------- completion */

export interface CompletionFacts {
  booking: Pick<Booking, "status" | "end_date" | "renter_id" | "host_id">;
  viewerId: string | null | undefined;
  now?: Date;
}

/** Mirrors `complete_booking`. Completion never happens from a page load. */
export function completionGate(facts: CompletionFacts): GateResult {
  const { booking, viewerId } = facts;
  const now = facts.now ?? new Date();
  if (!viewerId || (booking.renter_id !== viewerId && booking.host_id !== viewerId)) {
    return { allowed: false, reason: "not_a_participant" };
  }
  if (booking.status === "completed") return { allowed: false, alreadyDone: true };
  if (booking.status === "cancelled") return { allowed: false, reason: "cancelled" };
  if (booking.status !== "active") return { allowed: false, reason: "not_active" };
  if (toCalendarDate(now) < toCalendarDate(booking.end_date)) {
    return { allowed: false, reason: "before_end_date" };
  }
  return { allowed: true };
}

export const COMPLETION_MESSAGE: Record<CompletionRejection, string> = {
  not_a_participant: "Only the renter or the host can finish this booking.",
  not_active: "This booking isn't in storage, so there's nothing to finish.",
  cancelled: "This booking was cancelled and can't be completed.",
  before_end_date: "You can finish this booking from its end date onwards.",
};

/* ------------------------------------------------------------ capacity view */

/** Statuses that hold space in the listing's availability calculation. */
export const CAPACITY_CONSUMING_STATUSES = ["confirmed", "active"] as const;

export const consumesCapacity = (booking: Pick<Booking, "status">): boolean =>
  (CAPACITY_CONSUMING_STATUSES as readonly string[]).includes(booking.status);

/* ------------------------------------------------------------- privacy view */

/**
 * Exact-address visibility across the lifecycle. The server repeats this — the
 * address is only ever selected for a booking that passes the same test.
 */
export function exactAddressVisible(
  booking: Pick<Booking, "status" | "renter_id">,
  viewerId: string | null | undefined,
  hasSucceededPayment: boolean,
): boolean {
  if (!viewerId || booking.renter_id !== viewerId) return false;
  if (!hasSucceededPayment) return false;
  return booking.status === "confirmed" || booking.status === "active";
}
