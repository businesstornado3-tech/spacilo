/**
 * Local provider adapters.
 *
 * These wrap EarnRoom's own deterministic engines behind the AI provider
 * contract, so the orchestrator is exercised on exactly the same path a remote
 * vendor will use in Phase 6B. Registering OpenAI, Gemini or anything else
 * later is a `registerAiProvider` call plus a config edit — no UI change.
 */
import {
  analyseBelongings,
  analyseSpace,
  estimatePrice,
  packInventory,
  recommendFor,
} from "@/lib/intelligence/pipeline";
import type {
  DetectedInventory,
  DetectedSpace,
  InventoryLine,
  PackingResult,
  PricingEstimate,
  Recommendation,
  StorageSpace,
  VisionPhoto,
} from "@/lib/intelligence/contracts";

import { explain, factor } from "../core/explain";
import { registerAiProvider } from "../core/provider-manager";
import type { AiProvider, AiStreamChunk } from "../core/types";

const ENGINE_MODEL = "earnroom-engine-1";

/* --------------------------------------------------------------- vision */

export interface VisionInput {
  photos: VisionPhoto[];
}

export const visionProvider: AiProvider<VisionInput, DetectedInventory> = {
  id: "earnroom-vision",
  kind: "vision",
  model: ENGINE_MODEL,
  remote: false,
  capabilities: ["vision"],
  async run(input, context) {
    context.onProgress?.(0.2);
    const result = await analyseBelongings(input.photos, context.signal);
    context.onProgress?.(1);
    const confidence = result.objects.length
      ? result.objects.reduce((sum, object) => sum + (object.confidence ?? 0.7), 0) /
        result.objects.length
      : 0.4;
    return {
      result,
      confidence,
      explanation: explain({
        reason: `Recognised ${result.itemCount} item${result.itemCount === 1 ? "" : "s"} from ${result.photoIds.length} photo${result.photoIds.length === 1 ? "" : "s"}.`,
        confidence,
        factors: [
          factor("Photos supplied", `${result.photoIds.length} analysed`, 0.5),
          factor("Estimated volume", `${result.volumeM3.toFixed(2)} m³`, 0.4),
        ],
      }),
    };
  },
};

export interface SpaceInput {
  photos: VisionPhoto[];
  spaceType?: string;
}

export const spaceProvider: AiProvider<SpaceInput, DetectedSpace> = {
  id: "earnroom-space",
  kind: "image-analysis",
  model: ENGINE_MODEL,
  remote: false,
  capabilities: ["space-analysis"],
  async run(input, context) {
    context.onProgress?.(0.3);
    const result = await analyseSpace(input.photos, input.spaceType, context.signal);
    context.onProgress?.(1);
    return {
      result,
      confidence: 0.7,
      explanation: explain({
        reason: `Estimated about ${result.usableVolumeM3.toFixed(1)} m³ of usable space.`,
        confidence: 0.7,
        factors: [
          factor("Footprint", `${result.widthM.toFixed(1)} m × ${result.depthM.toFixed(1)} m`, 0.6),
          factor("Ceiling height", `${result.ceilingHeightM.toFixed(1)} m`, 0.3),
        ],
      }),
    };
  },
};

/* ------------------------------------------------------------ inventory */

export interface InventoryInput {
  detected: DetectedInventory;
}

export interface InventorySummary {
  itemCount: number;
  volumeM3: number;
  weightKg: number;
  groups: Array<{ label: string; quantity: number }>;
}

export const inventoryProvider: AiProvider<InventoryInput, InventorySummary> = {
  id: "earnroom-inventory",
  kind: "local",
  model: ENGINE_MODEL,
  remote: false,
  capabilities: ["inventory"],
  async run(input) {
    const counts = new Map<string, number>();
    for (const object of input.detected.objects) {
      const label = object.label ?? "Item";
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    const groups = [...counts.entries()]
      .map(([label, quantity]) => ({ label, quantity }))
      .sort((a, b) => b.quantity - a.quantity);
    return {
      result: {
        itemCount: input.detected.itemCount,
        volumeM3: input.detected.volumeM3,
        weightKg: input.detected.weightKg,
        groups,
      },
      confidence: 0.85,
      explanation: explain({
        reason: `Grouped ${input.detected.itemCount} items into ${groups.length} lines.`,
        confidence: 0.85,
        factors: [factor("Distinct labels", `${groups.length}`, 0.5)],
      }),
    };
  },
};

/* -------------------------------------------------------------- planner */

export interface PlannerInput {
  lines: InventoryLine[];
  space: StorageSpace;
}

export const plannerProvider: AiProvider<PlannerInput, PackingResult> = {
  id: "earnroom-planner",
  kind: "local",
  model: ENGINE_MODEL,
  remote: false,
  capabilities: ["planner"],
  async run(input, context) {
    context.onProgress?.(0.4);
    const result = await packInventory(input.lines, input.space, context.signal);
    context.onProgress?.(1);
    const confidence = result.score.value / 100;
    return {
      result,
      confidence,
      explanation: explain({
        reason: `Layout scored ${result.score.value} out of 100.`,
        confidence,
        factors: [factor("Score band", result.score.band, 0.6)],
      }),
    };
  },
};

/* ------------------------------------------------------ recommendations */

export interface RecommendationInput {
  packing: PackingResult;
}

export const recommendationProvider: AiProvider<RecommendationInput, Recommendation[]> = {
  id: "earnroom-recommendations",
  kind: "local",
  model: ENGINE_MODEL,
  remote: false,
  capabilities: ["recommendations"],
  async run(input, context) {
    const result = await recommendFor(input.packing, context.signal);
    const confidence = result.length
      ? result.reduce((sum, entry) => sum + entry.confidence, 0) / result.length
      : 0.6;
    return {
      result,
      confidence,
      explanation: explain({
        reason: `Wrote ${result.length} suggestion${result.length === 1 ? "" : "s"} for this plan.`,
        confidence,
        factors: result.slice(0, 3).map((entry) => factor(entry.action, entry.reason, entry.confidence)),
      }),
    };
  },
};

/* -------------------------------------------------------------- pricing */

export interface PricingInput {
  spaceType: string;
  volumeM3: number;
  postcode?: string;
  access?: string;
}

export const pricingProvider: AiProvider<PricingInput, PricingEstimate> = {
  id: "earnroom-pricing",
  kind: "local",
  model: ENGINE_MODEL,
  remote: false,
  capabilities: ["pricing"],
  async run(input, context) {
    const result = await estimatePrice(input, context.signal);
    return {
      result,
      confidence: 0.72,
      explanation: explain({
        reason: "A guide range based on size, type and access — not a valuation.",
        confidence: 0.72,
        factors: result.basis.map((basis) => factor("Basis", basis, 0.4)),
      }),
    };
  },
};

/* --------------------------------------------------------------- search */

export interface SearchInput {
  query: string;
  /** Optional corpus to rank. Absent means embedding only. */
  documents?: Array<{ id: string; text: string }>;
}

export interface SearchOutput {
  embedding: number[];
  matches: Array<{ id: string; score: number }>;
}

const EMBEDDING_DIMENSIONS = 64;

/** Deterministic bag-of-words embedding. Swapped for a vendor model in 6B. */
export function embedText(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  for (const token of text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
    let hash = 0;
    for (let index = 0; index < token.length; index += 1) {
      hash = (hash * 31 + token.charCodeAt(index)) >>> 0;
    }
    vector[hash % EMBEDDING_DIMENSIONS]! += 1;
  }
  const length = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / length);
}

export function cosine(a: number[], b: number[]): number {
  let total = 0;
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    total += (a[index] ?? 0) * (b[index] ?? 0);
  }
  return total;
}

export const searchProvider: AiProvider<SearchInput, SearchOutput> = {
  id: "earnroom-search",
  kind: "embedding",
  model: "earnroom-embed-64",
  remote: false,
  capabilities: ["search"],
  async run(input) {
    const embedding = embedText(input.query);
    const matches = (input.documents ?? [])
      .map((document) => ({ id: document.id, score: cosine(embedding, embedText(document.text)) }))
      .sort((a, b) => b.score - a.score);
    const top = matches[0]?.score ?? 0;
    return {
      result: { embedding, matches },
      confidence: matches.length ? Math.min(1, 0.4 + top) : 0.4,
      explanation: explain({
        reason: matches.length
          ? `Ranked ${matches.length} space${matches.length === 1 ? "" : "s"} against your search.`
          : "Turned your search into a comparable pattern.",
        confidence: matches.length ? Math.min(1, 0.4 + top) : 0.4,
        factors: [factor("Best match score", top.toFixed(2), 0.6)],
      }),
    };
  },
};

/* ------------------------------------------------------------ assistant */

export interface AssistantInput {
  question: string;
  context: string[];
}

export interface AssistantOutput {
  answer: string;
  sources: string[];
  answered: boolean;
}

function composeAnswer(input: AssistantInput): AssistantOutput {
  const words = input.question.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3);
  const scored = input.context
    .map((entry) => ({
      entry,
      score: words.filter((word) => entry.toLowerCase().includes(word)).length,
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (scored.length === 0) {
    return {
      answer:
        "I do not have enough information about that yet. A host can answer it directly through messages.",
      sources: [],
      answered: false,
    };
  }
  return {
    answer: scored.map((row) => row.entry).join(" "),
    sources: scored.map((row) => row.entry.slice(0, 60)),
    answered: true,
  };
}

export const assistantProvider: AiProvider<AssistantInput, AssistantOutput> = {
  id: "earnroom-assistant",
  kind: "llm",
  model: "earnroom-assistant-1",
  remote: false,
  capabilities: ["assistant"],
  async run(input) {
    const result = composeAnswer(input);
    return {
      result,
      confidence: result.answered ? 0.7 : 0.35,
      explanation: explain({
        reason: result.answered
          ? "Answered from the listing and policy details supplied."
          : "The supplied details do not cover this question.",
        confidence: result.answered ? 0.7 : 0.35,
        factors: result.sources.map((source) => factor("Source", source, 0.4)),
      }),
    };
  },
  async *stream(input): AsyncIterable<AiStreamChunk<AssistantOutput>> {
    const result = composeAnswer(input);
    const words = result.answer.split(" ");
    for (let index = 0; index < words.length; index += 6) {
      yield { delta: `${words.slice(index, index + 6).join(" ")} `, done: false };
    }
    yield { result, done: true };
  },
};

/** Registers every built-in engine. Called once at start-up. */
export function installLocalAiProviders(): void {
  registerAiProvider(visionProvider);
  registerAiProvider(spaceProvider);
  registerAiProvider(inventoryProvider);
  registerAiProvider(plannerProvider);
  registerAiProvider(recommendationProvider);
  registerAiProvider(pricingProvider);
  registerAiProvider(searchProvider);
  registerAiProvider(assistantProvider);
}
