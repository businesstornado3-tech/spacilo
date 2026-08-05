/**
 * The booking journey (Prompt 23).
 *
 * A renter should never have to guess what happens next, what they've
 * committed to, or when money moves. This module turns an authoritative
 * status into plain sentences. It decides nothing — the server owns every
 * transition, and each step's wording is fixed so the same status always
 * reads the same way.
 */

export type JourneyStage =
  | "browsing"
  | "requested"
  | "accepted"
  | "booked"
  | "paid"
  | "storing"
  | "finished";

export interface JourneyStep {
  stage: JourneyStage;
  title: string;
  detail: string;
  /** True once this step has definitely happened. */
  done: boolean;
  current: boolean;
  /** Whether money moves at this step. */
  payment: boolean;
}

const ORDER: JourneyStage[] = [
  "browsing",
  "requested",
  "accepted",
  "booked",
  "paid",
  "storing",
  "finished",
];

const COPY: Record<JourneyStage, { title: string; detail: string; payment: boolean }> = {
  browsing: {
    title: "Choose a space",
    detail: "Nothing is reserved and nothing is charged while you're looking.",
    payment: false,
  },
  requested: {
    title: "Send a request",
    detail: "The host has 48 hours to reply. You aren't charged for sending a request.",
    payment: false,
  },
  accepted: {
    title: "Host accepts",
    detail: "The details are locked to what the host accepted. Still no payment.",
    payment: false,
  },
  booked: {
    title: "Create the booking",
    detail: "The booking sits as awaiting payment until you pay.",
    payment: false,
  },
  paid: {
    title: "Pay for the first period",
    detail: "Payment is taken here. You'll see the storage price and service fee before you pay.",
    payment: true,
  },
  storing: {
    title: "Hand over and store",
    detail: "You and the host record the handover with photos on the day.",
    payment: false,
  },
  finished: {
    title: "Collect your belongings",
    detail: "Collection is recorded by both sides, then reviews open.",
    payment: false,
  },
};

/** Map any authoritative status string onto the journey. */
export function stageFromStatus(status: string | null | undefined): JourneyStage {
  switch (status) {
    case "pending":
      return "requested";
    case "accepted":
      return "accepted";
    case "awaiting_payment":
      return "booked";
    case "confirmed":
    case "paid":
      return "paid";
    case "active":
    case "in_storage":
      return "storing";
    case "completed":
      return "finished";
    default:
      return "browsing";
  }
}

export function journeySteps(stage: JourneyStage): JourneyStep[] {
  const index = ORDER.indexOf(stage);
  return ORDER.map((value, position) => ({
    stage: value,
    ...COPY[value],
    done: position < index,
    current: position === index,
  }));
}

/** The single sentence that answers "what happens next?". */
export function nextStepCopy(stage: JourneyStage): string {
  const index = ORDER.indexOf(stage);
  const next = ORDER[index + 1];
  if (!next) return "Nothing left to do — this booking is finished.";
  return `${COPY[next].title}: ${COPY[next].detail}`;
}

/** Explicit answer to "have I committed to anything yet?". */
export function commitmentCopy(stage: JourneyStage): string {
  switch (stage) {
    case "browsing":
    case "requested":
      return "You haven't committed to anything and no money has been taken.";
    case "accepted":
      return "The host has agreed to these details. You still haven't paid or committed.";
    case "booked":
      return "Your booking is held as awaiting payment. Nothing has been charged yet.";
    case "paid":
      return "You've paid for the first storage period. Cancellation terms now apply.";
    case "storing":
      return "Storage is under way. Ending early is handled separately from cancelling.";
    case "finished":
      return "This booking is complete.";
  }
}
