/**
 * First-time onboarding hints.
 *
 * Deliberately tiny: a hint is one sentence attached to one surface, shown
 * once and never again. There are no tours, no overlays and no blocking
 * steps — a returning user must never be interrupted.
 *
 * State is a list of dismissed hint ids in first-party storage. Nothing here
 * touches the network, the database or any business logic.
 */

export const ONBOARDING_HINT_STORAGE_KEY = "earnroom.onboarding.v1";

export const ONBOARDING_HINTS = {
  home_search: "Tell us where you need space — EarnRoom AI ranks trusted spaces near you.",
  vision_upload: "Upload a photo and EarnRoom AI will understand your space.",
  planner: "Drag items in to see how everything fits before you book.",
  digital_twin: "Preview your storage in 3D before booking.",
  listing_create: "Add a few photos and measurements — we'll suggest a fair price.",
  booking: "Check the fit and the full price breakdown before you confirm.",
  host_dashboard: "Requests, bookings and earnings all live here.",
  renter_dashboard: "Start with your belongings — everything else follows from that.",
  earnings_estimator: "Estimate how much your unused space could earn.",
} as const satisfies Record<string, string>;

export type OnboardingHintId = keyof typeof ONBOARDING_HINTS;

const HINT_IDS = new Set(Object.keys(ONBOARDING_HINTS));

export function isOnboardingHintId(value: string): value is OnboardingHintId {
  return HINT_IDS.has(value);
}

/** Reads a stored payload defensively — corrupt storage must never throw. */
export function parseDismissed(raw: string | null): OnboardingHintId[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is OnboardingHintId => typeof v === "string" && isOnboardingHintId(v));
  } catch {
    return [];
  }
}

export function isHintDismissed(dismissed: readonly string[], id: OnboardingHintId): boolean {
  return dismissed.includes(id);
}

export function withDismissed(
  dismissed: readonly OnboardingHintId[],
  id: OnboardingHintId,
): OnboardingHintId[] {
  return dismissed.includes(id) ? [...dismissed] : [...dismissed, id];
}

/* ------------------------------------------------------------ storage I/O */

function store(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readDismissedHints(): OnboardingHintId[] {
  const s = store();
  if (!s) return [];
  try {
    return parseDismissed(s.getItem(ONBOARDING_HINT_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function dismissHint(id: OnboardingHintId): OnboardingHintId[] {
  const next = withDismissed(readDismissedHints(), id);
  const s = store();
  try {
    s?.setItem(ONBOARDING_HINT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* private mode — guidance is optional, never essential */
  }
  return next;
}
