/**
 * Milestone 1 + 12 — the Spacilo AI Copilot.
 *
 * The copilot is an intent router over the Intelligence Platform, not a
 * language model. It answers a question by finding the facts that answer it
 * and quoting them. When the platform holds no such fact, the copilot says so
 * rather than inventing one — `unanswered` exists precisely so that saying
 * "I do not know" is a first-class outcome.
 *
 * FUTURE HOOK: an LLM can be layered on top of `answer()` to phrase the same
 * evidence more naturally. It must be given the evidence, never the question
 * alone, so the "no invented answers" rule survives the upgrade.
 */
import type { InventoryLine } from "@/lib/spaceplanner/types";

import type {
  CopilotAnswer,
  CopilotTopic,
  HostInsight,
  ListingAssessment,
  SmartSuggestion,
} from "./contracts";

export interface CopilotContext {
  lines: InventoryLine[];
  assessment: ListingAssessment | null;
  suggestions?: SmartSuggestion[];
  hostInsights?: HostInsight[];
  /** Every listing the renter is considering, for comparison questions. */
  assessments?: ListingAssessment[];
}

const TOPIC_KEYWORDS: Array<{ topic: CopilotTopic; words: string[] }> = [
  { topic: "pricing", words: ["price", "cost", "pricing", "£", "cheap", "expensive", "budget", "month"] },
  { topic: "compatibility", words: ["fit", "compatible", "compatibility", "will everything", "enough room", "big enough"] },
  { topic: "packing", words: ["pack", "packing", "stack", "load", "order", "arrange"] },
  { topic: "suitability", words: ["suitable", "suit", "safe for", "electronics", "fragile", "damp", "business"] },
  { topic: "host", words: ["host", "improve", "shelving", "lighting", "earn", "income", "accept"] },
  { topic: "listings", words: ["listing", "compare", "which space", "better", "options", "alternative"] },
  { topic: "storage", words: ["space", "volume", "size", "capacity", "room", "access", "door", "walkway"] },
  { topic: "inventory", words: ["inventory", "items", "belongings", "stuff", "how many", "what do i"] },
  { topic: "recommendations", words: ["recommend", "advice", "should i", "suggest", "what next"] },
];

export function classifyQuestion(question: string): CopilotTopic {
  const text = question.toLowerCase();
  for (const entry of TOPIC_KEYWORDS) {
    if (entry.words.some((word) => text.includes(word))) return entry.topic;
  }
  return "unknown";
}

function unanswered(question: string, topic: CopilotTopic, why: string): CopilotAnswer {
  return {
    topic,
    question,
    answer: `I do not have enough in this plan to answer that yet. ${why}`,
    evidence: [],
    confidence: 0,
    followUps: ["Will everything fit?", "How much space is left?", "What should I do first?"],
    unanswered: true,
  };
}

const FOLLOW_UPS: Record<CopilotTopic, string[]> = {
  inventory: ["Will everything fit?", "What is the bulkiest item?", "What should I pack last?"],
  storage: ["How much space is left?", "Is access easy?", "Will everything fit?"],
  suitability: ["Is this suitable for electronics?", "Is it safe for fragile items?"],
  pricing: ["Is this good value?", "Which space is cheapest?"],
  compatibility: ["What is stopping a perfect fit?", "What if I remove the largest item?"],
  packing: ["What order should I load in?", "Should I use shelving?"],
  host: ["How can I earn more?", "Should I accept this booking?"],
  listings: ["Which space is best overall?", "Which is best value?"],
  recommendations: ["What should I do first?", "What are the risks?"],
  unknown: ["Will everything fit?", "How much space is left?", "Which space is best overall?"],
};

/* --------------------------------------------------------------- answers */

function answerInventory(question: string, context: CopilotContext): CopilotAnswer {
  const { lines } = context;
  if (lines.length === 0) {
    return unanswered(question, "inventory", "Add some belongings and I will work from those.");
  }
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const bulkiest = [...lines].sort(
    (a, b) =>
      b.item.width * b.item.depth * b.item.height - a.item.width * a.item.depth * a.item.height,
  )[0];
  const fragile = lines.filter((line) => line.item.fragile).length;
  const heavy = lines.filter((line) => line.item.weight === "heavy").length;

  return {
    topic: "inventory",
    question,
    answer: `You have ${count} item${count === 1 ? "" : "s"} across ${lines.length} line${lines.length === 1 ? "" : "s"}. The bulkiest is the ${bulkiest ? bulkiest.item.name.toLowerCase() : "largest item"}.`,
    evidence: [
      `${count} item(s) counted from your inventory.`,
      `${fragile} fragile line(s), ${heavy} heavy line(s).`,
    ],
    confidence: 0.9,
    followUps: FOLLOW_UPS.inventory,
    unanswered: false,
  };
}

function answerStorage(question: string, context: CopilotContext): CopilotAnswer {
  const assessment = context.assessment;
  if (!assessment) return unanswered(question, "storage", "Pick a space and I will analyse it.");
  const { analysis } = assessment;
  return {
    topic: "storage",
    question,
    answer: `This space has about ${analysis.usable.availableVolumeM3.toFixed(1)}m³ usable, with ${analysis.access.access} access through a ${analysis.access.doorWidthM.toFixed(2)}m opening. Around ${assessment.remainingVolumeM3.toFixed(1)}m³ would remain after your pack.`,
    evidence: [
      `Usable floor area ${analysis.usable.usableFloorAreaM2.toFixed(1)}m².`,
      `Walkway width about ${analysis.access.walkwayWidthM.toFixed(2)}m.`,
      `${assessment.floorClearPercent}% of the floor stays clear.`,
    ],
    confidence: assessment.confidence,
    followUps: FOLLOW_UPS.storage,
    unanswered: false,
  };
}

function answerSuitability(question: string, context: CopilotContext): CopilotAnswer {
  const assessment = context.assessment;
  if (!assessment) return unanswered(question, "suitability", "Pick a space first.");
  const text = question.toLowerCase();
  const match =
    assessment.analysis.suitability.find((entry) => text.includes(entry.use.replace("_", " "))) ??
    assessment.analysis.suitability[0];
  if (!match) return unanswered(question, "suitability", "No suitability ratings are available.");
  return {
    topic: "suitability",
    question,
    answer: `For ${match.label.toLowerCase()} this space rates ${match.rating} (${match.score}/100).`,
    evidence: [...match.reasons.slice(0, 2), ...match.cautions.slice(0, 1)],
    confidence: match.confidence,
    followUps: FOLLOW_UPS.suitability,
    unanswered: false,
  };
}

function answerPricing(question: string, context: CopilotContext): CopilotAnswer {
  const assessment = context.assessment;
  if (!assessment) return unanswered(question, "pricing", "Pick a space and I will use its price.");
  const monthly = assessment.listing.monthlyPence / 100;
  const perM3 = monthly / Math.max(0.1, assessment.analysis.usable.availableVolumeM3);
  return {
    topic: "pricing",
    question,
    answer: `${assessment.listing.title} is £${monthly.toFixed(0)} a month, which works out at roughly £${perM3.toFixed(2)} per usable m³.`,
    evidence: [
      `Asking price £${monthly.toFixed(0)} per month.`,
      `Usable volume about ${assessment.analysis.usable.availableVolumeM3.toFixed(1)}m³.`,
    ],
    confidence: 0.88,
    followUps: FOLLOW_UPS.pricing,
    unanswered: false,
  };
}

function answerCompatibility(question: string, context: CopilotContext): CopilotAnswer {
  const assessment = context.assessment;
  if (!assessment) return unanswered(question, "compatibility", "Pick a space to check against.");
  const failing = assessment.score.checks.filter((check) => check.state !== "passed");
  return {
    topic: "compatibility",
    question,
    answer:
      failing.length === 0
        ? `Yes — ${assessment.score.band.toLowerCase()} at ${assessment.score.value}/100, using about ${assessment.fitPercent}% of the usable volume.`
        : `${assessment.score.band} at ${assessment.score.value}/100. ${failing.length} check${failing.length === 1 ? " needs" : "s need"} attention first.`,
    evidence: [
      `Fit ${assessment.fitPercent}% of usable volume.`,
      ...failing.slice(0, 3).map((check) => `${check.label}: ${check.detail}.`),
    ],
    confidence: assessment.confidence,
    followUps: FOLLOW_UPS.compatibility,
    unanswered: false,
  };
}

function answerPacking(question: string, context: CopilotContext): CopilotAnswer {
  const assessment = context.assessment;
  const suggestions = context.suggestions ?? [];
  if (!assessment) return unanswered(question, "packing", "Pick a space to plan a pack for.");
  const first = suggestions[0];
  return {
    topic: "packing",
    question,
    answer: first
      ? `Packing looks ${assessment.score.complexity.toLowerCase()}. Start here: ${first.title.toLowerCase()} — ${first.detail}`
      : `Packing looks ${assessment.score.complexity.toLowerCase()}. Heavy items on the floor, fragile items higher, and keep the walkway clear.`,
    evidence: first
      ? first.evidence
      : [`Packing complexity assessed as ${assessment.score.complexity}.`],
    confidence: 0.8,
    followUps: FOLLOW_UPS.packing,
    unanswered: false,
  };
}

function answerHost(question: string, context: CopilotContext): CopilotAnswer {
  const insights = context.hostInsights ?? [];
  const first = insights[0];
  if (!first) return unanswered(question, "host", "Analyse a space and I will suggest improvements.");
  return {
    topic: "host",
    question,
    answer: `${first.title} — ${first.detail}${first.upliftPence ? ` Estimated uplift around £${(first.upliftPence / 100).toFixed(0)} a month.` : ""}`,
    evidence: first.evidence,
    confidence: first.confidence,
    followUps: FOLLOW_UPS.host,
    unanswered: false,
  };
}

function answerListings(question: string, context: CopilotContext): CopilotAnswer {
  const all = context.assessments ?? [];
  if (all.length < 2) {
    return unanswered(question, "listings", "Add a second space and I will compare them.");
  }
  const sorted = [...all].sort((a, b) => b.score.value - a.score.value);
  const best = sorted[0];
  const next = sorted[1];
  if (!best || !next) return unanswered(question, "listings", "I need two spaces to compare.");
  return {
    topic: "listings",
    question,
    answer: `${best.listing.title} leads on fit at ${best.score.value}/100, ahead of ${next.listing.title} at ${next.score.value}/100.`,
    evidence: [
      `${best.listing.title}: £${(best.listing.monthlyPence / 100).toFixed(0)}/month, ${best.listing.distanceKm.toFixed(1)}km.`,
      `${next.listing.title}: £${(next.listing.monthlyPence / 100).toFixed(0)}/month, ${next.listing.distanceKm.toFixed(1)}km.`,
    ],
    confidence: Math.min(best.confidence, next.confidence),
    followUps: FOLLOW_UPS.listings,
    unanswered: false,
  };
}

function answerRecommendations(question: string, context: CopilotContext): CopilotAnswer {
  const assessment = context.assessment;
  if (!assessment) return unanswered(question, "recommendations", "Pick a space first.");
  const suggestion = (context.suggestions ?? [])[0];
  return {
    topic: "recommendations",
    question,
    answer: suggestion
      ? `${suggestion.title}. ${suggestion.detail}`
      : `${assessment.score.recommendation} — ${assessment.score.band.toLowerCase()} at ${assessment.score.value}/100.`,
    evidence: suggestion
      ? suggestion.evidence
      : assessment.score.checks.slice(0, 3).map((check) => `${check.label}: ${check.detail}.`),
    confidence: assessment.confidence,
    followUps: FOLLOW_UPS.recommendations,
    unanswered: false,
  };
}

/** The one entry point. Deterministic: the same question and context answer alike. */
export function askCopilot(question: string, context: CopilotContext): CopilotAnswer {
  const trimmed = question.trim();
  if (!trimmed) {
    return unanswered("", "unknown", "Ask me about the fit, the space, the price or what to do next.");
  }

  switch (classifyQuestion(trimmed)) {
    case "inventory":
      return answerInventory(trimmed, context);
    case "storage":
      return answerStorage(trimmed, context);
    case "suitability":
      return answerSuitability(trimmed, context);
    case "pricing":
      return answerPricing(trimmed, context);
    case "compatibility":
      return answerCompatibility(trimmed, context);
    case "packing":
      return answerPacking(trimmed, context);
    case "host":
      return answerHost(trimmed, context);
    case "listings":
      return answerListings(trimmed, context);
    case "recommendations":
      return answerRecommendations(trimmed, context);
    default:
      return unanswered(
        trimmed,
        "unknown",
        "I can answer on your inventory, the space, the fit, packing, pricing, listings and host improvements.",
      );
  }
}

/** Suggested openers, tailored to what the platform can actually answer now. */
export function copilotPrompts(context: CopilotContext): string[] {
  if (!context.assessment) return ["What can you help with?", "How does Spacilo AI work?"];
  const prompts = ["Will everything fit?", "How much space is left?", "What should I do first?"];
  if ((context.assessments ?? []).length > 1) prompts.push("Which space is best overall?");
  if ((context.hostInsights ?? []).length > 0) prompts.push("How can I earn more?");
  return prompts;
}
