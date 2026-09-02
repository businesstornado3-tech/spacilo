/**
 * Provider interfaces.
 *
 * These are the only contracts a vendor integration has to satisfy. A future
 * OpenAI, Gemini, Azure or Rekognition provider implements the same methods,
 * registers itself, and every screen in EarnRoom keeps working unchanged —
 * because no component ever names a provider.
 *
 * Requests carry an optional AbortSignal so any long-running analysis can be
 * cancelled by the surface that started it.
 */
import type {
  CompatibilityResult,
  DetectedInventory,
  DetectedSpace,
  DimensionEstimate,
  InventoryLine,
  IntelligenceCapability,
  LearningSignal,
  LearningSummary,
  PackingResult,
  PricingEstimate,
  Recommendation,
  SpaceEstimate,
  StorageSpace,
  VisionPhoto,
} from "./contracts";

export interface ProviderRequest {
  signal?: AbortSignal;
}

export interface ProviderIdentity {
  readonly id: string;
  readonly label: string;
  readonly model: string;
  /** What this provider can actually do. Components gate on this list. */
  readonly capabilities: readonly IntelligenceCapability[];
  /** True when the implementation calls out to a real service. */
  readonly remote: boolean;
}

export interface VisionProvider extends ProviderIdentity {
  analyseBelongings(photos: VisionPhoto[], request?: ProviderRequest): Promise<DetectedInventory>;
}

export interface SpaceAnalysisProvider extends ProviderIdentity {
  analyseSpace(
    photos: VisionPhoto[],
    spaceType?: string,
    request?: ProviderRequest,
  ): Promise<DetectedSpace>;
}

export interface DimensionProvider extends ProviderIdentity {
  estimateDimensions(
    input: { photos: VisionPhoto[]; spaceType?: string },
    request?: ProviderRequest,
  ): Promise<SpaceEstimate>;
  estimateOne(id: string, photos: VisionPhoto[]): Promise<DimensionEstimate>;
}

export interface PackingProvider extends ProviderIdentity {
  pack(
    lines: InventoryLine[],
    space: StorageSpace,
    request?: ProviderRequest,
  ): Promise<PackingResult>;
}

export interface RecommendationProvider extends ProviderIdentity {
  recommend(result: PackingResult, request?: ProviderRequest): Promise<Recommendation[]>;
}

export interface PricingProvider extends ProviderIdentity {
  estimatePrice(
    input: { spaceType: string; volumeM3: number; postcode?: string; access?: string },
    request?: ProviderRequest,
  ): Promise<PricingEstimate>;
}

export interface BookingProvider extends ProviderIdentity {
  assessCompatibility(result: PackingResult, request?: ProviderRequest): Promise<CompatibilityResult>;
}

export interface LearningProvider extends ProviderIdentity {
  record(signal: LearningSignal): void;
  summarise(): LearningSummary;
}

/** Every provider slot the platform knows about. */
export interface ProviderSet {
  vision: VisionProvider;
  spaceAnalysis: SpaceAnalysisProvider;
  dimensions: DimensionProvider;
  packing: PackingProvider;
  recommendations: RecommendationProvider;
  pricing: PricingProvider;
  booking: BookingProvider;
  learning: LearningProvider;
}

export type ProviderSlot = keyof ProviderSet;

export const PROVIDER_SLOTS: ProviderSlot[] = [
  "vision",
  "spaceAnalysis",
  "dimensions",
  "packing",
  "recommendations",
  "pricing",
  "booking",
  "learning",
];
