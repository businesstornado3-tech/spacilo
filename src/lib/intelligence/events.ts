/**
 * Intelligence events.
 *
 * A tiny synchronous bus so surfaces, analytics and diagnostics can observe
 * intelligence work without any of them importing each other. Payloads carry
 * capability, timing and confidence — never photos, never personal data.
 */
import type { IntelligenceCapability } from "./contracts";
import type { IntelligenceErrorCode } from "./errors";

export type IntelligenceEventName =
  | "VisionCompleted"
  | "InventoryCreated"
  | "SpaceScanned"
  | "DimensionsEstimated"
  | "PlannerCompleted"
  | "RecommendationUpdated"
  | "PricingEstimated"
  | "BookingAnalysed"
  | "IntelligenceFailed";

export interface IntelligenceEvent {
  name: IntelligenceEventName;
  capability: IntelligenceCapability;
  provider: string;
  at: number;
  durationMs: number;
  confidence?: number;
  /** Non-identifying counts only, e.g. `{ objects: 6 }`. */
  detail?: Record<string, number | string | boolean>;
  errorCode?: IntelligenceErrorCode;
}

type Listener = (event: IntelligenceEvent) => void;

const listeners = new Set<Listener>();
const recent: IntelligenceEvent[] = [];
const MAX_RECENT = 50;

export function onIntelligenceEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitIntelligenceEvent(event: IntelligenceEvent): void {
  recent.push(event);
  if (recent.length > MAX_RECENT) recent.shift();
  for (const listener of [...listeners]) listener(event);
}

export function recentIntelligenceEvents(): IntelligenceEvent[] {
  return [...recent];
}

/** Test helper — clears listeners and history. */
export function resetIntelligenceEvents(): void {
  listeners.clear();
  recent.length = 0;
}
