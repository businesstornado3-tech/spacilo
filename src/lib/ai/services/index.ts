/**
 * Feature services.
 *
 * These are the only functions the rest of Spacilo calls. Each one names a
 * capability and a prompt, hands the request to the orchestrator, and returns
 * a structured response. No component may reach a provider or a prompt.
 */
import { executeAi, enqueueAi, streamAi, type AiRequest } from "../core/orchestrator";
import { assertMediaAllowed, sanitiseText } from "../core/security";
import { AiError } from "../core/errors";
import type { AiResponse } from "../core/types";
import type { AiJob } from "../core/queue";
import type {
  AssistantInput,
  AssistantOutput,
  InventoryInput,
  InventorySummary,
  PlannerInput,
  PricingInput,
  RecommendationInput,
  SearchInput,
  SearchOutput,
  SpaceInput,
  VisionInput,
} from "../providers/local";
import { analyseVision, type VisionAnalysisRequest } from "../vision/analyse";
import { recordVisionCorrection } from "../vision/feedback";
import { visionMetrics } from "../vision/metrics";
import type { VisionAnalysis } from "../vision/types";
import type {
  DetectedInventory,
  DetectedSpace,
  PackingResult,
  PricingEstimate,
  Recommendation,
} from "@/lib/intelligence/contracts";
import type {
  RankingInput,
  RankingOutput,
  SuitabilityAssessment,
  SuitabilityInput,
} from "../providers/suitability";
import type {
  DescriptionInput,
  DescriptionOutput,
  HostInsightsInput,
  HostInsightsOutput,
  HostPricingGuidance,
  HostPricingInput,
  ListingQualityInput,
  ListingQualityReview,
} from "../providers/host";
import type {
  HelpSearchInput,
  HelpSearchOutput,
  NlSearchInput,
  NlSearchOutput,
  SeasonalInput,
  SeasonalOutput,
  TrustSummaryInput,
  TrustSummaryOutput,
} from "../providers/discovery";
import type {
  BookingAdvice,
  BookingAdviceInput,
  InventoryAssistance,
  InventoryAssistantInput,
  MessageAssistInput,
  MessageAssistOutput,
  NotificationDigest,
  NotificationDigestInput,
} from "../providers/guidance";
import type { FraudInput, FraudOutput } from "../providers/fraud";

type Options = Pick<AiRequest<unknown>, "signal" | "userKey" | "ip" | "priority" | "skipCache" | "onProgress">;

/* ---------------------------------------------------------- vision AI */

function guardPhotos(input: VisionInput | SpaceInput): void {
  if (input.photos.length === 0) throw new AiError("invalid_input", "no photos");
  assertMediaAllowed(
    input.photos.map((photo) => ({
      mimeType: photo.mimeType ?? "image/jpeg",
      ...(typeof photo.sizeBytes === "number" ? { bytes: photo.sizeBytes } : {}),
    })),
  );
}

export const visionAi = {
  /** Recognises belongings in renter photos. */
  analyseBelongings(input: VisionInput, options: Options = {}): Promise<AiResponse<DetectedInventory>> {
    guardPhotos(input);
    return executeAi<VisionInput, DetectedInventory>({
      capability: "vision",
      promptId: "vision.inventory.detect",
      input,
      ...options,
    });
  },
  /** Same work, queued, for large batches. */
  queueBelongings(input: VisionInput, options: Options = {}): AiJob<AiResponse<DetectedInventory>> {
    guardPhotos(input);
    return enqueueAi<VisionInput, DetectedInventory>(
      { capability: "vision", promptId: "vision.inventory.detect", input, ...options },
      "Recognising your belongings",
    );
  },
  /** Estimates host space geometry. */
  analyseSpace(input: SpaceInput, options: Options = {}): Promise<AiResponse<DetectedSpace>> {
    guardPhotos(input);
    return executeAi<SpaceInput, DetectedSpace>({
      capability: "space-analysis",
      promptId: "vision.space.scan",
      input,
      ...options,
    });
  },
  queueSpace(input: SpaceInput, options: Options = {}): AiJob<AiResponse<DetectedSpace>> {
    guardPhotos(input);
    return enqueueAi<SpaceInput, DetectedSpace>(
      { capability: "space-analysis", promptId: "vision.space.scan", input, ...options },
      "Scanning your space",
    );
  },

  /**
   * Full Phase 6C detail — instances, OCR, materials, damage and the scene
   * spatial map. The screens above still use `analyseBelongings`; this is for
   * callers that need the richer record rather than the narrowed contract.
   */
  analyseDetailed(request: VisionAnalysisRequest): Promise<VisionAnalysis> {
    return analyseVision(request);
  },

  /** Captures an anonymised class-level correction signal. */
  recordCorrection: recordVisionCorrection,

  /** Operational counters for the vision stack. */
  metrics: visionMetrics,
};

/* ------------------------------------------------------- inventory AI */

export const inventoryAi = {
  summarise(input: InventoryInput, options: Options = {}): Promise<AiResponse<InventorySummary>> {
    return executeAi<InventoryInput, InventorySummary>({
      capability: "inventory",
      promptId: "inventory.summarise",
      input,
      ...options,
    });
  },
};

/* ---------------------------------------------------- space planner AI */

export const plannerAi = {
  plan(input: PlannerInput, options: Options = {}): Promise<AiResponse<PackingResult>> {
    return executeAi<PlannerInput, PackingResult>({
      capability: "planner",
      promptId: "planner.optimise",
      input,
      ...options,
    });
  },
  queuePlan(input: PlannerInput, options: Options = {}): AiJob<AiResponse<PackingResult>> {
    return enqueueAi<PlannerInput, PackingResult>(
      { capability: "planner", promptId: "planner.optimise", input, ...options },
      "Planning the layout",
    );
  },
};

/* -------------------------------------------------- recommendation AI */

export const recommendationAi = {
  suggest(input: RecommendationInput, options: Options = {}): Promise<AiResponse<Recommendation[]>> {
    return executeAi<RecommendationInput, Recommendation[]>({
      capability: "recommendations",
      promptId: "recommendations.storage",
      input,
      ...options,
    });
  },
};

/* ---------------------------------------------------------- pricing AI */

export const pricingAi = {
  estimate(input: PricingInput, options: Options = {}): Promise<AiResponse<PricingEstimate>> {
    return executeAi<PricingInput, PricingEstimate>({
      capability: "pricing",
      promptId: "pricing.estimate",
      input,
      ...options,
    });
  },
};

/* ----------------------------------------------------------- search AI */

export const searchAi = {
  rank(input: SearchInput, options: Options = {}): Promise<AiResponse<SearchOutput>> {
    const { text } = sanitiseText(input.query);
    return executeAi<SearchInput, SearchOutput>({
      capability: "search",
      promptId: "search.embed",
      input: { ...input, query: text },
      ...options,
    });
  },
};

/* -------------------------------------------------------- assistant AI */

export const assistantAi = {
  ask(input: AssistantInput, options: Options = {}): Promise<AiResponse<AssistantOutput>> {
    const { text } = sanitiseText(input.question);
    return executeAi<AssistantInput, AssistantOutput>({
      capability: "assistant",
      promptId: "assistant.answer",
      input: { ...input, question: text },
      ...options,
    });
  },
  /** Progressive answer for chat-style surfaces. */
  stream(input: AssistantInput, options: Options = {}) {
    const { text } = sanitiseText(input.question);
    return streamAi<AssistantInput, AssistantOutput>({
      capability: "assistant",
      promptId: "assistant.answer",
      input: { ...input, question: text },
      ...options,
    });
  },
};

/* --------------------------------------------------- suitability + rank */

export const suitabilityAi = {
  assess(input: SuitabilityInput, options: Options = {}): Promise<AiResponse<SuitabilityAssessment>> {
    return executeAi<SuitabilityInput, SuitabilityAssessment>({
      capability: "suitability",
      promptId: "suitability.assess",
      input,
      ...options,
    });
  },
};

export const rankingAi = {
  rankListings(input: RankingInput, options: Options = {}): Promise<AiResponse<RankingOutput>> {
    return executeAi<RankingInput, RankingOutput>({
      capability: "ranking",
      promptId: "ranking.listings",
      input,
      ...options,
    });
  },
};

/* --------------------------------------------------------------- host AI */

export const hostAi = {
  priceGuidance(input: HostPricingInput, options: Options = {}): Promise<AiResponse<HostPricingGuidance>> {
    return executeAi<HostPricingInput, HostPricingGuidance>({
      capability: "host-pricing",
      promptId: "pricing.host.guidance",
      input,
      ...options,
    });
  },
  reviewListing(input: ListingQualityInput, options: Options = {}): Promise<AiResponse<ListingQualityReview>> {
    return executeAi<ListingQualityInput, ListingQualityReview>({
      capability: "listing-quality",
      promptId: "listing.quality.review",
      input,
      ...options,
    });
  },
  writeDescription(input: DescriptionInput, options: Options = {}): Promise<AiResponse<DescriptionOutput>> {
    return executeAi<DescriptionInput, DescriptionOutput>({
      capability: "description",
      promptId: "listing.description.write",
      input,
      ...options,
    });
  },
  insights(input: HostInsightsInput, options: Options = {}): Promise<AiResponse<HostInsightsOutput>> {
    return executeAi<HostInsightsInput, HostInsightsOutput>({
      capability: "host-insights",
      promptId: "host.insights.build",
      input,
      ...options,
    });
  },
};

/* ---------------------------------------------------------- discovery AI */

export const discoveryAi = {
  /** Turns a plain-English query into marketplace filters. */
  parseSearch(input: NlSearchInput, options: Options = {}): Promise<AiResponse<NlSearchOutput>> {
    const { text } = sanitiseText(input.query);
    return executeAi<NlSearchInput, NlSearchOutput>({
      capability: "nl-search",
      promptId: "search.nl.parse",
      input: { ...input, query: text },
      ...options,
    });
  },
  seasonal(input: SeasonalInput = {}, options: Options = {}): Promise<AiResponse<SeasonalOutput>> {
    return executeAi<SeasonalInput, SeasonalOutput>({
      capability: "seasonal",
      promptId: "seasonal.context",
      input,
      ...options,
    });
  },
  trustSummary(input: TrustSummaryInput, options: Options = {}): Promise<AiResponse<TrustSummaryOutput>> {
    return executeAi<TrustSummaryInput, TrustSummaryOutput>({
      capability: "trust-summary",
      promptId: "trust.summary.build",
      input,
      ...options,
    });
  },
  helpSearch(input: HelpSearchInput, options: Options = {}): Promise<AiResponse<HelpSearchOutput>> {
    const { text } = sanitiseText(input.question);
    return executeAi<HelpSearchInput, HelpSearchOutput>({
      capability: "help-search",
      promptId: "help.search.match",
      input: { ...input, question: text },
      ...options,
    });
  },
};

/* ----------------------------------------------------------- guidance AI */

export const guidanceAi = {
  bookingAdvice(input: BookingAdviceInput, options: Options = {}): Promise<AiResponse<BookingAdvice>> {
    return executeAi<BookingAdviceInput, BookingAdvice>({
      capability: "booking-assistant",
      promptId: "booking.assistant.advice",
      input,
      ...options,
    });
  },
  reviewInventory(
    input: InventoryAssistantInput,
    options: Options = {},
  ): Promise<AiResponse<InventoryAssistance>> {
    return executeAi<InventoryAssistantInput, InventoryAssistance>({
      capability: "inventory-assistant",
      promptId: "inventory.assistant.review",
      input,
      ...options,
    });
  },
  /** Draft replies. Nothing sends without the person approving it. */
  suggestReplies(input: MessageAssistInput, options: Options = {}): Promise<AiResponse<MessageAssistOutput>> {
    return executeAi<MessageAssistInput, MessageAssistOutput>({
      capability: "message-assist",
      promptId: "message.assist.suggest",
      input,
      ...options,
    });
  },
  notifications(input: NotificationDigestInput, options: Options = {}): Promise<AiResponse<NotificationDigest>> {
    return executeAi<NotificationDigestInput, NotificationDigest>({
      capability: "notifications",
      promptId: "notifications.rank",
      input,
      ...options,
    });
  },
};

/* -------------------------------------------------------------- fraud AI */

/** Internal, staff-only. Observations for review — never a verdict, never shown to customers. */
export const fraudAi = {
  scoreSignals(input: FraudInput, options: Options = {}): Promise<AiResponse<FraudOutput>> {
    return executeAi<FraudInput, FraudOutput>({
      capability: "fraud",
      promptId: "fraud.signals.score",
      input,
      ...options,
    });
  },
};

export const aiServices = {
  vision: visionAi,
  inventory: inventoryAi,
  planner: plannerAi,
  recommendations: recommendationAi,
  pricing: pricingAi,
  search: searchAi,
  assistant: assistantAi,
  suitability: suitabilityAi,
  ranking: rankingAi,
  host: hostAi,
  discovery: discoveryAi,
  guidance: guidanceAi,
  fraud: fraudAi,
};

