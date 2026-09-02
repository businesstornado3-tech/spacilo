/**
 * Friendly recovery copy.
 *
 * Every failure state answers three questions: what happened, why, and what
 * to do next. Nothing here decides behaviour — it only supplies wording, so
 * error handling stays exactly where it already lives.
 */

export type RecoveryKind =
  | "offline"
  | "network"
  | "upload"
  | "vision"
  | "planner"
  | "payment"
  | "session"
  | "unavailable"
  | "booking"
  | "server";

export interface RecoveryCopy {
  title: string;
  description: string;
  retryLabel: string;
}

export const RECOVERY_COPY: Record<RecoveryKind, RecoveryCopy> = {
  offline: {
    title: "You're offline",
    description:
      "Your device has lost its connection, so we can't load this right now. Reconnect and try again — nothing you entered has been lost.",
    retryLabel: "Try again",
  },
  network: {
    title: "We couldn't reach EarnRoom",
    description:
      "The connection dropped on the way. This is usually temporary — try again in a moment.",
    retryLabel: "Try again",
  },
  upload: {
    title: "That photo didn't upload",
    description:
      "The upload was interrupted or the file was too large. Try again, or pick a smaller photo taken on your phone.",
    retryLabel: "Retry upload",
  },
  vision: {
    title: "EarnRoom AI couldn't read those photos",
    description:
      "The images may be too dark or too close in. Retake them in good light with the whole space in frame, or add your items manually — the result is just as accurate.",
    retryLabel: "Try again",
  },
  planner: {
    title: "The plan didn't finish",
    description:
      "EarnRoom AI stopped part way through optimising your layout. Your inventory is safe — run the plan again.",
    retryLabel: "Run plan again",
  },
  payment: {
    title: "Your payment didn't go through",
    description:
      "No money has been taken. This is usually a card or bank check — try again, or use a different card.",
    retryLabel: "Try payment again",
  },
  session: {
    title: "You've been signed out",
    description: "Your session expired for security. Sign in again to pick up where you left off.",
    retryLabel: "Sign in",
  },
  unavailable: {
    title: "This space isn't available",
    description:
      "The host has paused or removed this listing. There are other spaces nearby that may suit you.",
    retryLabel: "Search nearby",
  },
  booking: {
    title: "We couldn't complete that booking",
    description:
      "Nothing has been confirmed and you haven't been charged. Check the dates and try again, or message the host.",
    retryLabel: "Try again",
  },
  server: {
    title: "Something went wrong on our side",
    description:
      "This one is us, not you. We've logged it — try again, and if it keeps happening you can contact support.",
    retryLabel: "Try again",
  },
};

export function recoveryCopy(kind: RecoveryKind): RecoveryCopy {
  return RECOVERY_COPY[kind];
}
