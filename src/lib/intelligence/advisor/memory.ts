/**
 * Milestone 14 + 15 — intelligence memory and learning signals.
 *
 * Memory holds intelligence history only: which layouts were kept, which
 * recommendations were taken, which items keep moving. It cannot hold a
 * conversation, a name, an address or a message, because the contract has
 * nowhere to put one. Storage is in-memory with an optional localStorage
 * mirror; nothing leaves the device.
 */
export type MemoryEventKind =
  | "layout_preferred"
  | "recommendation_accepted"
  | "recommendation_rejected"
  | "item_moved"
  | "host_adjusted";

export interface MemoryEvent {
  kind: MemoryEventKind;
  /** Non-identifying subject: a catalogue id, a zone kind, a space kind. */
  subject: string;
  at: number;
}

export interface IntelligenceMemory {
  preferredLayouts: string[];
  acceptedRecommendations: string[];
  rejectedRecommendations: string[];
  frequentlyMovedItems: string[];
  hostAdjustments: string[];
  events: number;
}

export type AdvisorLearningOutcome =
  | "booking_accepted"
  | "booking_rejected"
  | "booking_cancelled"
  | "inventory_changed"
  | "recommendation_ignored"
  | "space_reorganised";

export interface AdvisorLearningSignal {
  outcome: AdvisorLearningOutcome;
  /** Space type or catalogue class only — never an id that identifies a person. */
  subject: string;
  /** Non-identifying magnitude, e.g. a score delta. */
  delta?: number;
  at: number;
}

export interface AdvisorLearningSummary {
  signals: number;
  acceptanceRate: number;
  /** Confidence multiplier, deliberately clamped to a narrow band. */
  calibration: number;
  byOutcome: Record<AdvisorLearningOutcome, number>;
}

const STORAGE_KEY = "earnroom.intelligence.memory.v1";
const MAX_EVENTS = 400;
const MAX_SIGNALS = 500;

const EMPTY_OUTCOMES: Record<AdvisorLearningOutcome, number> = {
  booking_accepted: 0,
  booking_rejected: 0,
  booking_cancelled: 0,
  inventory_changed: 0,
  recommendation_ignored: 0,
  space_reorganised: 0,
};

let events: MemoryEvent[] = [];
let signals: AdvisorLearningSignal[] = [];
let hydrated = false;

function persist(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {
    // Storage is a convenience; memory still works without it.
  }
}

function hydrate(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      events = parsed.filter(
        (entry): entry is MemoryEvent =>
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as MemoryEvent).kind === "string" &&
          typeof (entry as MemoryEvent).subject === "string",
      );
    }
  } catch {
    events = [];
  }
}

export function rememberEvent(event: Omit<MemoryEvent, "at"> & { at?: number }): void {
  hydrate();
  events = [...events.slice(-(MAX_EVENTS - 1)), { ...event, at: event.at ?? Date.now() }];
  persist();
}

function subjectsFor(kind: MemoryEventKind, limit = 8): string[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (event.kind !== kind) continue;
    counts.set(event.subject, (counts.get(event.subject) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([subject]) => subject);
}

export function readMemory(): IntelligenceMemory {
  hydrate();
  return {
    preferredLayouts: subjectsFor("layout_preferred"),
    acceptedRecommendations: subjectsFor("recommendation_accepted"),
    rejectedRecommendations: subjectsFor("recommendation_rejected"),
    frequentlyMovedItems: subjectsFor("item_moved"),
    hostAdjustments: subjectsFor("host_adjusted"),
    events: events.length,
  };
}

export function clearMemory(): void {
  events = [];
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignored
    }
  }
}

export function recordAdvisorSignal(
  signal: Omit<AdvisorLearningSignal, "at"> & { at?: number },
): void {
  signals = [
    ...signals.slice(-(MAX_SIGNALS - 1)),
    {
      outcome: signal.outcome,
      subject: signal.subject,
      ...(typeof signal.delta === "number" ? { delta: signal.delta } : {}),
      at: signal.at ?? Date.now(),
    },
  ];
}

export function summariseAdvisorLearning(): AdvisorLearningSummary {
  const byOutcome = { ...EMPTY_OUTCOMES };
  for (const signal of signals) byOutcome[signal.outcome] += 1;

  const decided = byOutcome.booking_accepted + byOutcome.booking_rejected;
  const acceptanceRate =
    decided === 0 ? 0 : Math.round((byOutcome.booking_accepted / decided) * 100) / 100;
  const calibration =
    decided === 0
      ? 1
      : Math.round(Math.min(1.1, Math.max(0.9, 0.9 + acceptanceRate * 0.2)) * 100) / 100;

  return { signals: signals.length, acceptanceRate, calibration, byOutcome };
}

export function resetAdvisorLearning(): void {
  signals = [];
}
