/**
 * Prompt library.
 *
 * Every prompt the platform can send lives here, versioned, with its model
 * settings and its expected response schema. Components never hold prompt text
 * — they name a prompt id and the orchestrator resolves the rest.
 */
import type { AiCapability, AiProviderKind } from "./types";

export interface PromptDefinition {
  id: string;
  version: string;
  purpose: string;
  capability: AiCapability;
  providerKind: AiProviderKind;
  temperature: number;
  maxTokens: number;
  /** Name of the schema in the response registry the output must satisfy. */
  responseSchema: string;
  /** Prompt body. `{{token}}` placeholders are filled by `renderPrompt`. */
  template: string;
  /** Simpler prompt used when the primary output fails validation. */
  fallbackPromptId?: string;
}

const PROMPTS: PromptDefinition[] = [
  {
    id: "vision.inventory.detect",
    version: "1.0.0",
    purpose: "Identify storable household objects in renter photos and estimate size.",
    capability: "vision",
    providerKind: "vision",
    temperature: 0.1,
    maxTokens: 1200,
    responseSchema: "vision.detections",
    template:
      "You are Spacilo's inventory observer. Look at the supplied photos and list the storable objects you can see. " +
      "For each object give a catalogue key from this list where possible: {{catalogueKeys}}. " +
      "Estimate width, depth and height in centimetres and give a confidence between 0 and 1. " +
      "Observe only. Do not judge legality, ownership or value. Return JSON only.",
    fallbackPromptId: "vision.inventory.detect.simple",
  },
  {
    id: "vision.inventory.detect.simple",
    version: "1.0.0",
    purpose: "Reduced-detail fallback when the detailed detection output fails validation.",
    capability: "vision",
    providerKind: "vision",
    temperature: 0,
    maxTokens: 600,
    responseSchema: "vision.detections",
    template:
      "List the storable objects visible in these photos with an approximate size in centimetres. Return JSON only.",
  },
  {
    id: "vision.space.scan",
    version: "1.0.0",
    purpose: "Estimate room geometry and obstacles from host space photos.",
    capability: "space-analysis",
    providerKind: "image-analysis",
    temperature: 0.1,
    maxTokens: 900,
    responseSchema: "space.scan",
    template:
      "You are Spacilo's space observer. From these photos of a {{spaceType}}, estimate usable width, depth and " +
      "ceiling height in metres, and note obstacles that reduce usable space. Every figure is an estimate, not a " +
      "measurement. Return JSON only.",
  },
  {
    id: "inventory.summarise",
    version: "1.0.0",
    purpose: "Turn confirmed detections into a tidy inventory with quantities.",
    capability: "inventory",
    providerKind: "llm",
    temperature: 0.2,
    maxTokens: 800,
    responseSchema: "inventory.lines",
    template:
      "Group these observed objects into inventory lines with quantities and a short plain-English label. " +
      "Use UK spelling. Return JSON only. Objects: {{objects}}",
  },
  {
    id: "planner.optimise",
    version: "1.0.0",
    purpose: "Explain a computed packing plan in plain English.",
    capability: "planner",
    providerKind: "llm",
    temperature: 0.3,
    maxTokens: 700,
    responseSchema: "planner.explanation",
    template:
      "Explain this storage layout to the person who owns the items, in two short paragraphs of UK English. " +
      "Mention access, stacking and anything fragile. Plan: {{plan}}",
  },
  {
    id: "recommendations.storage",
    version: "1.0.0",
    purpose: "Suggest practical improvements to a storage plan.",
    capability: "recommendations",
    providerKind: "llm",
    temperature: 0.3,
    maxTokens: 700,
    responseSchema: "recommendations.list",
    template:
      "Suggest up to five practical improvements to this storage plan. Each needs an action, a reason and the facts " +
      "behind it. Never promise safety or guarantee outcomes. Plan: {{plan}}",
  },
  {
    id: "pricing.estimate",
    version: "1.0.0",
    purpose: "Explain a computed price range to a host.",
    capability: "pricing",
    providerKind: "llm",
    temperature: 0.2,
    maxTokens: 500,
    responseSchema: "pricing.explanation",
    template:
      "Explain this monthly price range in GBP to a UK host in two sentences. It is a guide, not a valuation. " +
      "Inputs: {{inputs}}",
  },
  {
    id: "search.embed",
    version: "1.0.0",
    purpose: "Embed a storage search query for semantic matching.",
    capability: "search",
    providerKind: "embedding",
    temperature: 0,
    maxTokens: 256,
    responseSchema: "search.embedding",
    template: "{{query}}",
  },
  {
    id: "assistant.answer",
    version: "1.0.0",
    purpose: "Answer a storage question using only supplied Spacilo context.",
    capability: "assistant",
    providerKind: "llm",
    temperature: 0.4,
    maxTokens: 900,
    responseSchema: "assistant.answer",
    template:
      "You are Spacilo's storage assistant for UK users. Answer using only the context provided. If the context does " +
      "not cover it, say so plainly. Never claim anything is guaranteed safe or fully insured. " +
      "Context: {{context}}\nQuestion: {{question}}",
  },
];

const INDEX = new Map(PROMPTS.map((prompt) => [prompt.id, prompt]));

export function listPrompts(capability?: AiCapability): PromptDefinition[] {
  return PROMPTS.filter((prompt) => !capability || prompt.capability === capability);
}

export function getPrompt(id: string): PromptDefinition {
  const prompt = INDEX.get(id);
  if (!prompt) throw new Error(`Unknown prompt "${id}".`);
  return prompt;
}

export function fallbackPrompt(id: string): PromptDefinition | null {
  const prompt = getPrompt(id);
  return prompt.fallbackPromptId ? getPrompt(prompt.fallbackPromptId) : null;
}

/** Fills `{{token}}` placeholders. Unknown tokens become an empty string. */
export function renderPrompt(id: string, values: Record<string, string | number> = {}): string {
  return getPrompt(id).template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) =>
    values[key] === undefined ? "" : String(values[key]),
  );
}

/** Stable identity used in logs and stored results. */
export function promptStamp(id: string): { promptId: string; promptVersion: string } {
  const prompt = getPrompt(id);
  return { promptId: prompt.id, promptVersion: prompt.version };
}
