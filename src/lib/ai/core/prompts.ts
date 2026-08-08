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

  /* ---------------------------------- Phase 6B applied intelligence */
  {
    id: "suitability.assess",
    version: "1.0.0",
    purpose: "Judge whether a space suits a renter's belongings and explain why.",
    capability: "suitability",
    providerKind: "llm",
    temperature: 0.2,
    maxTokens: 900,
    responseSchema: "suitability.assessment",
    template:
      "You are Spacilo's suitability analyst. Compare these belongings with this space, considering volume, " +
      "footprint, ceiling height, door width, obstacles, shelving, the access route, host restrictions, fragile " +
      "items, heavy items and climate needs. Give a score out of 100, a confidence, the reasons behind it and " +
      "practical improvements. Never say a space is guaranteed safe or fully insured. " +
      "Belongings: {{inventory}}\nSpace: {{space}}",
    fallbackPromptId: "suitability.assess.simple",
  },
  {
    id: "suitability.assess.simple",
    version: "1.0.0",
    purpose: "Volume-only fallback when the detailed suitability output fails validation.",
    capability: "suitability",
    providerKind: "llm",
    temperature: 0,
    maxTokens: 400,
    responseSchema: "suitability.assessment",
    template: "Will {{inventory}} fit in {{space}}? Answer with a score out of 100 and one reason. JSON only.",
  },
  {
    id: "ranking.listings",
    version: "1.0.0",
    purpose: "Rank a shortlist of listings for one renter's needs.",
    capability: "ranking",
    providerKind: "llm",
    temperature: 0.2,
    maxTokens: 1200,
    responseSchema: "ranking.entries",
    template:
      "Rank these storage listings for this renter. Weigh compatibility, distance, host quality, response rate, " +
      "reviews, security, availability, price, access hours, booking history and stated preferences. Give each a " +
      "score out of 100 and the reasons. Listings: {{listings}}\nRenter: {{renter}}",
  },
  {
    id: "pricing.host.guidance",
    version: "1.0.0",
    purpose: "Suggest daily, weekly and monthly rates plus occupancy for a host.",
    capability: "host-pricing",
    providerKind: "llm",
    temperature: 0.2,
    maxTokens: 800,
    responseSchema: "pricing.guidance",
    template:
      "Suggest daily, weekly and monthly rates in GBP for this UK space, plus expected occupancy and annual " +
      "earnings. Consider location, nearby listings, local and seasonal demand, size, type, amenities, access, " +
      "security and host quality. This is guidance, not a valuation. Space: {{space}}\nMarket: {{market}}",
  },
  {
    id: "listing.quality.review",
    version: "1.0.0",
    purpose: "Review a draft listing and suggest improvements.",
    capability: "listing-quality",
    providerKind: "llm",
    temperature: 0.3,
    maxTokens: 900,
    responseSchema: "listing.quality",
    template:
      "Review this UK storage listing. Score it out of 100 and list what is missing across title, description, " +
      "photos, dimensions, amenities, accessibility, pricing, trust and search visibility. Be specific and kind. " +
      "Listing: {{listing}}",
  },
  {
    id: "listing.description.write",
    version: "1.0.0",
    purpose: "Draft listing descriptions in several tones for the host to edit.",
    capability: "description",
    providerKind: "llm",
    temperature: 0.6,
    maxTokens: 1000,
    responseSchema: "listing.descriptions",
    template:
      "Write storage listing descriptions in UK English in these tones: professional, friendly, premium, short and " +
      "detailed. Describe only the facts supplied. Never promise safety, insurance or guarantees. Space: {{space}}",
  },
  {
    id: "search.nl.parse",
    version: "1.0.0",
    purpose: "Turn a natural-language storage search into structured filters.",
    capability: "nl-search",
    providerKind: "llm",
    temperature: 0.1,
    maxTokens: 500,
    responseSchema: "search.filters",
    template:
      "Convert this UK storage search into filters: intent, item types, estimated volume in cubic metres, space " +
      "types, location text, access needs, security needs, climate needs and duration. Unknown fields stay empty. " +
      "Query: {{query}}",
  },
  {
    id: "booking.assistant.advice",
    version: "1.0.0",
    purpose: "Give contextual moving and loading advice for a specific booking.",
    capability: "booking-assistant",
    providerKind: "llm",
    temperature: 0.3,
    maxTokens: 900,
    responseSchema: "booking.advice",
    template:
      "Give practical UK moving advice for this booking: why the space suits the items, packing order, vehicle " +
      "size, fragile and heavy item handling, access notes and a rough unloading time. Advice only, no guarantees. " +
      "Booking: {{booking}}",
  },
  {
    id: "trust.summary.build",
    version: "1.0.0",
    purpose: "Summarise verifiable listing facts as short trust points.",
    capability: "trust-summary",
    providerKind: "llm",
    temperature: 0.1,
    maxTokens: 400,
    responseSchema: "trust.summary",
    template:
      "Summarise this listing's verified facts as short trust points of at most five words each. Use only facts " +
      "supplied. Never claim anything is guaranteed safe or fully insured. Listing: {{listing}}",
  },
  {
    id: "inventory.assistant.review",
    version: "1.0.0",
    purpose: "Spot commonly forgotten items and estimate the gap.",
    capability: "inventory-assistant",
    providerKind: "llm",
    temperature: 0.3,
    maxTokens: 700,
    responseSchema: "inventory.assistance",
    template:
      "Review this UK household inventory. Suggest commonly forgotten items for this kind of move, estimate the " +
      "extra volume and weight, and rate packing complexity. Suggestions are optional. Inventory: {{inventory}}",
  },
  {
    id: "seasonal.context",
    version: "1.0.0",
    purpose: "Surface the storage themes that matter at this time of year.",
    capability: "seasonal",
    providerKind: "llm",
    temperature: 0.3,
    maxTokens: 500,
    responseSchema: "seasonal.themes",
    template:
      "For the UK in {{month}}, list the storage themes that are relevant right now with a short reason each. " +
      "Audience: {{audience}}",
  },
  {
    id: "notifications.rank",
    version: "1.0.0",
    purpose: "Choose which insights are worth notifying a person about.",
    capability: "notifications",
    providerKind: "llm",
    temperature: 0.2,
    maxTokens: 600,
    responseSchema: "notifications.digest",
    template:
      "From these candidate insights, keep only the ones genuinely useful to the person and rank them. Suppress " +
      "anything repetitive or trivial. Candidates: {{candidates}}",
  },
  {
    id: "host.insights.build",
    version: "1.0.0",
    purpose: "Generate host dashboard insights from listing and booking data.",
    capability: "host-insights",
    providerKind: "llm",
    temperature: 0.3,
    maxTokens: 900,
    responseSchema: "host.insights",
    template:
      "Write host insights covering pricing opportunities, demand, occupancy, listing health, conversion, the " +
      "features renters search for, suggested improvements and an income forecast. Facts only. Host: {{host}}",
  },
  {
    id: "fraud.signals.score",
    version: "1.0.0",
    purpose: "Score internal fraud signals for review by staff.",
    capability: "fraud",
    providerKind: "llm",
    temperature: 0,
    maxTokens: 600,
    responseSchema: "fraud.signals",
    template:
      "Score these internal marketplace signals for review priority. Report observations only; never assert that " +
      "anyone has committed a crime. Signals: {{signals}}",
  },
  {
    id: "message.assist.suggest",
    version: "1.0.0",
    purpose: "Draft optional reply suggestions a user must approve.",
    capability: "message-assist",
    providerKind: "llm",
    temperature: 0.5,
    maxTokens: 600,
    responseSchema: "message.suggestions",
    template:
      "Draft up to three short reply options in polite UK English for this conversation. Suggestions only — the " +
      "person always edits and sends. Conversation: {{conversation}}",
  },
  {
    id: "help.search.match",
    version: "1.0.0",
    purpose: "Match a plain question to the right help articles.",
    capability: "help-search",
    providerKind: "embedding",
    temperature: 0,
    maxTokens: 256,
    responseSchema: "help.matches",
    template: "{{question}}",
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
