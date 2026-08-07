/**
 * Provider registry — the Spacilo Intelligence Platform itself.
 *
 * The registry is the only place in the codebase that knows which engine is
 * active. Swapping the mock vision provider for OpenAI, Gemini, Azure AI
 * Vision or Rekognition is a single `registerProvider` call at start-up; no
 * component, hook or route changes, because none of them can name a provider.
 *
 * Providers never carry credentials. A remote provider is a thin client that
 * calls a Spacilo server function, which holds the key server-side.
 */
import type { IntelligenceCapability } from "./contracts";
import { emitIntelligenceEvent } from "./events";
import { logIntelligence } from "./logging";
import { recordOutcome } from "./health";
import { mockBookingProvider } from "./mock/booking";
import { mockDimensionProvider } from "./mock/dimensions";
import { mockLearningProvider } from "./mock/learning";
import { mockPackingProvider } from "./mock/packing";
import { mockPricingProvider } from "./mock/pricing";
import { mockRecommendationProvider } from "./mock/recommendations";
import { mockSpaceAnalysisProvider, mockVisionProvider } from "./mock/vision";
import { PROVIDER_SLOTS, type ProviderSet, type ProviderSlot } from "./providers";

const defaults: ProviderSet = {
  vision: mockVisionProvider,
  spaceAnalysis: mockSpaceAnalysisProvider,
  dimensions: mockDimensionProvider,
  packing: mockPackingProvider,
  recommendations: mockRecommendationProvider,
  pricing: mockPricingProvider,
  booking: mockBookingProvider,
  learning: mockLearningProvider,
};

let active: ProviderSet = { ...defaults };

export function getProvider<K extends ProviderSlot>(slot: K): ProviderSet[K] {
  return active[slot];
}

export function registerProvider<K extends ProviderSlot>(slot: K, provider: ProviderSet[K]): void {
  active = { ...active, [slot]: provider };
  logIntelligence({
    level: "info",
    message: "provider registered",
    capability: capabilityForSlot(slot),
    provider: provider.id,
  });
}

/** Restores the built-in deterministic providers. Used by tests and demos. */
export function resetProviders(): void {
  active = { ...defaults };
}

export function activeProviders(): ProviderSet {
  return { ...active };
}

const SLOT_CAPABILITY: Record<ProviderSlot, IntelligenceCapability> = {
  vision: "vision",
  spaceAnalysis: "space-analysis",
  dimensions: "dimensions",
  packing: "packing",
  recommendations: "recommendations",
  pricing: "pricing",
  booking: "booking",
  learning: "learning",
};

export function capabilityForSlot(slot: ProviderSlot): IntelligenceCapability {
  return SLOT_CAPABILITY[slot];
}

/** Everything the active set of providers can currently do. */
export function platformCapabilities(): IntelligenceCapability[] {
  const set = new Set<IntelligenceCapability>();
  for (const slot of PROVIDER_SLOTS) {
    for (const capability of active[slot].capabilities) set.add(capability);
  }
  return [...set];
}

export function supports(capability: IntelligenceCapability): boolean {
  return platformCapabilities().includes(capability);
}

/**
 * Runs one piece of provider work with the platform's cross-cutting concerns
 * attached: timing, health, logging and events. Providers stay focused on
 * their own job; nothing else has to remember to instrument itself.
 */
export async function runCapability<T>(
  slot: ProviderSlot,
  work: () => Promise<T>,
  options: {
    event: Parameters<typeof emitIntelligenceEvent>[0]["name"];
    confidence?: (result: T) => number;
    detail?: (result: T) => Record<string, number | string | boolean>;
  },
): Promise<T> {
  const capability = capabilityForSlot(slot);
  const provider = active[slot].id;
  const startedAt = Date.now();

  logIntelligence({ level: "info", message: `${capability} started`, capability, provider });

  try {
    const result = await work();
    const durationMs = Date.now() - startedAt;
    recordOutcome(slot, provider, true, durationMs);
    logIntelligence({
      level: "info",
      message: `${capability} completed`,
      capability,
      provider,
      detail: { durationMs },
    });
    emitIntelligenceEvent({
      name: options.event,
      capability,
      provider,
      at: Date.now(),
      durationMs,
      confidence: options.confidence?.(result),
      detail: options.detail?.(result),
    });
    return result;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    recordOutcome(slot, provider, false, durationMs);
    const { toIntelligenceError } = await import("./errors");
    const standard = toIntelligenceError(error);
    logIntelligence({
      level: "error",
      message: `${capability} failed`,
      capability,
      provider,
      detail: { code: standard.code, durationMs },
    });
    emitIntelligenceEvent({
      name: "IntelligenceFailed",
      capability,
      provider,
      at: Date.now(),
      durationMs,
      errorCode: standard.code,
    });
    throw standard;
  }
}
