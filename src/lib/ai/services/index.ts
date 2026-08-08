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
import type {
  DetectedInventory,
  DetectedSpace,
  PackingResult,
  PricingEstimate,
  Recommendation,
} from "@/lib/intelligence/contracts";

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

export const aiServices = {
  vision: visionAi,
  inventory: inventoryAi,
  planner: plannerAi,
  recommendations: recommendationAi,
  pricing: pricingAi,
  search: searchAi,
  assistant: assistantAi,
};
