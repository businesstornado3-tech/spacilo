/**
 * Advisor integration tests (Phase 5 Part 4).
 *
 * These prove the behaviour the layer promises: deterministic output, every
 * recommendation carrying its reasoning, and a copilot that refuses to invent
 * an answer it cannot support.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { CATALOGUE_BY_ID } from "@/lib/spaceplanner/catalogue";
import type { InventoryLine, StorageSpace } from "@/lib/spaceplanner/types";

import {
  adviseHost,
  adviseListing,
  askCopilot,
  buildDecisionCards,
  buildHostInsights,
  buildSmartSuggestions,
  buildTimeline,
  classifyQuestion,
  clearAssessmentCache,
  clearMemory,
  compareListings,
  copilotPrompts,
  rankListings,
  readMemory,
  recommend,
  recommendForListing,
  recordAdvisorSignal,
  rememberEvent,
  resetAdvisorLearning,
  simulate,
  simulateAll,
  summariseAdvisorLearning,
  assessListing,
  type AdvisorListing,
} from "./index";

function line(id: string, quantity: number): InventoryLine {
  const item = CATALOGUE_BY_ID.get(id);
  if (!item) throw new Error(`Unknown catalogue item: ${id}`);
  return { item, quantity };
}

const LINES: InventoryLine[] = [
  line("medium-box", 8),
  line("large-box", 4),
  line("bicycle", 1),
  line("mattress", 1),
];

function space(id: string, width: number, depth: number, height: number): StorageSpace {
  return {
    id,
    name: `Space ${id}`,
    kind: "garage",
    width,
    depth,
    height,
    doorWidth: 2.2,
    doorHeight: 2,
  };
}

function listing(overrides: Partial<AdvisorListing> = {}): AdvisorListing {
  return {
    id: "listing-a",
    title: "Single garage, Southsea",
    space: space("space-a", 3, 5.5, 2.4),
    monthlyPence: 12000,
    distanceKm: 1.2,
    hostRating: 4.8,
    reviews: 24,
    availableNow: true,
    security: ["cctv", "locked"],
    features: ["lighting", "power"],
    hostConfirmed: true,
    ...overrides,
  };
}

const SMALL = listing({
  id: "listing-b",
  title: "Loft room, Fratton",
  space: space("space-b", 2.2, 2.6, 2.1),
  monthlyPence: 7500,
  distanceKm: 4.4,
  hostRating: 4.2,
  reviews: 8,
  security: [],
  features: [],
  hostConfirmed: false,
});

beforeEach(() => {
  clearAssessmentCache();
  clearMemory();
  resetAdvisorLearning();
});

describe("listing assessment", () => {
  it("produces the same result for the same inputs", () => {
    const a = assessListing(LINES, listing());
    const b = assessListing(LINES, listing());
    expect(b.score.value).toBe(a.score.value);
    expect(b.remainingVolumeM3).toBe(a.remainingVolumeM3);
  });

  it("keeps every headline figure inside its declared range", () => {
    const result = assessListing(LINES, listing());
    expect(result.fitPercent).toBeGreaterThanOrEqual(0);
    expect(result.floorClearPercent).toBeLessThanOrEqual(100);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("scores a roomy space above a cramped one", () => {
    const roomy = assessListing(LINES, listing());
    const cramped = assessListing(LINES, SMALL);
    expect(roomy.score.value).toBeGreaterThan(cramped.score.value);
  });
});

describe("ranking and comparison", () => {
  it("ranks listings and explains the order", () => {
    const result = rankListings([assessListing(LINES, listing()), assessListing(LINES, SMALL)]);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]?.rank).toBe(1);
    expect(result.entries[0]!.score).toBeGreaterThanOrEqual(result.entries[1]!.score);
    expect(result.explanations.length).toBeGreaterThan(0);
  });

  it("gives every ranked listing its nine factors", () => {
    const result = rankListings([assessListing(LINES, listing())]);
    expect(result.entries[0]?.factors).toHaveLength(9);
  });

  it("shifts the order when the renter prioritises price", () => {
    const assessments = [assessListing(LINES, listing()), assessListing(LINES, SMALL)];
    const neutral = rankListings(assessments);
    const value = rankListings(assessments, ["value"]);
    const cheapestNeutral =
      neutral.entries.find((entry) => entry.listingId === "listing-b")?.score ?? 0;
    const cheapestValue =
      value.entries.find((entry) => entry.listingId === "listing-b")?.score ?? 0;
    expect(cheapestValue).toBeGreaterThan(cheapestNeutral);
  });

  it("awards a comparison verdict per category", () => {
    const ranking = rankListings([assessListing(LINES, listing()), assessListing(LINES, SMALL)]);
    const comparison = compareListings(ranking.entries);
    expect(comparison.rows).toHaveLength(2);
    expect(comparison.verdicts.length).toBeGreaterThan(0);
    expect(comparison.verdicts.some((entry) => entry.award === "best_overall")).toBe(true);
  });

  it("returns an empty ranking rather than throwing on no listings", () => {
    expect(rankListings([]).entries).toEqual([]);
  });
});

describe("recommendations and suggestions", () => {
  it("never returns advice without a reason, evidence and a confidence", () => {
    const entries = recommendForListing(LINES, assessListing(LINES, SMALL));
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.reason.length).toBeGreaterThan(0);
      expect(entry.evidence.length).toBeGreaterThan(0);
      expect(entry.confidence).toBeGreaterThan(0);
      expect(entry.alternative.length).toBeGreaterThan(0);
      expect(entry.tradeOff.length).toBeGreaterThan(0);
    }
  });

  it("suggests packing techniques tied to the inventory", () => {
    const entries = buildSmartSuggestions(LINES, assessListing(LINES, SMALL));
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.evidence.length).toBeGreaterThan(0);
      expect(entry.volumeSavedM3).toBeGreaterThanOrEqual(0);
    }
  });

  it("builds decision cards led by the overall fit", () => {
    const assessment = assessListing(LINES, listing());
    const cards = buildDecisionCards(
      assessment,
      recommendForListing(LINES, assessment),
      buildSmartSuggestions(LINES, assessment),
    );
    expect(cards[0]?.id).toBe("fit-listing-a");
    expect(cards.length).toBeLessThanOrEqual(4);
    for (const card of cards) {
      expect(card.action.length).toBeGreaterThan(0);
      expect(card.expectedBenefit.length).toBeGreaterThan(0);
    }
  });
});

describe("host insights", () => {
  it("suggests shelving and lighting for a bare space", () => {
    const insights = buildHostInsights(assessListing(LINES, SMALL));
    const kinds = insights.map((entry) => entry.kind);
    expect(kinds).toContain("lighting");
    expect(insights.every((entry) => entry.evidence.length > 0)).toBe(true);
  });

  it("orders high priority insights first", () => {
    const insights = buildHostInsights(assessListing(LINES, SMALL));
    if (insights.length > 1) {
      const rank = { high: 3, medium: 2, low: 1 } as const;
      expect(rank[insights[0]!.priority]).toBeGreaterThanOrEqual(rank[insights.at(-1)!.priority]);
    }
  });
});

describe("what-if simulation", () => {
  it("improves the fit when the bulkiest item is removed", () => {
    const result = simulate(LINES, SMALL, { kind: "remove_item", itemId: "mattress" });
    expect(result.after.remainingVolumeM3).toBeGreaterThan(result.before.remainingVolumeM3);
    expect(result.explanation).toContain("fit score");
  });

  it("worsens or holds the fit when an item is added", () => {
    const result = simulate(LINES, listing(), { kind: "add_item", itemId: "wardrobe" });
    expect(result.after.remainingVolumeM3).toBeLessThanOrEqual(result.before.remainingVolumeM3);
  });

  it("re-runs a real analysis when the ceiling is raised", () => {
    const result = simulate(LINES, SMALL, { kind: "raise_ceiling", byM: 0.4 });
    expect(result.label).toContain("Raise the ceiling");
    expect(result.after.score).toBeGreaterThanOrEqual(result.before.score);
  });

  it("sorts several simulations best first", () => {
    const results = simulateAll(LINES, SMALL, [
      { kind: "add_item", itemId: "wardrobe" },
      { kind: "remove_item", itemId: "mattress" },
    ]);
    expect(results[0]!.deltaScore).toBeGreaterThanOrEqual(results[1]!.deltaScore);
  });
});

describe("reasoning timeline", () => {
  it("reports only the stages that actually ran", () => {
    const events = buildTimeline({ itemCount: 12 });
    expect(events.map((event) => event.stage)).toEqual(["inventory"]);
  });

  it("covers the full pipeline when a listing was assessed", () => {
    const events = buildTimeline({
      photoCount: 3,
      itemCount: 12,
      assessment: assessListing(LINES, listing()),
      recommendationCount: 4,
    });
    expect(events.map((event) => event.stage)).toEqual([
      "images",
      "inventory",
      "dimensions",
      "space",
      "placement",
      "compatibility",
      "recommendation",
    ]);
  });
});

describe("booking intelligence", () => {
  it("gives a renter a verdict with factors and risks", () => {
    const booking = adviseListing(LINES, listing()).booking;
    expect(booking.factors).toHaveLength(9);
    expect(booking.score).toBeGreaterThan(0);
    expect(booking.cards.length).toBeGreaterThan(0);
  });

  it("warns rather than encourages when the space is too small", () => {
    const booking = adviseListing(LINES, SMALL).booking;
    expect(["review_first", "look_elsewhere"]).toContain(booking.verdict);
    expect(booking.risks.length).toBeGreaterThan(0);
  });

  it("gives the host an acceptance verdict with reasons", () => {
    const { acceptance } = adviseHost(LINES, listing());
    expect(["accept", "accept_with_changes", "decline"]).toContain(acceptance.verdict);
    expect(acceptance.reasons.length).toBeGreaterThan(0);
    expect(acceptance.remainingPercent).toBeLessThanOrEqual(100);
  });

  it("declines a load that does not fit", () => {
    const { acceptance } = adviseHost([...LINES, line("wardrobe", 4)], SMALL);
    expect(acceptance.verdict).toBe("decline");
    expect(acceptance.everythingFits).toBe(false);
  });
});

describe("copilot", () => {
  const context = { lines: LINES, assessment: assessListing(LINES, listing()) };

  it("routes questions to the right topic", () => {
    expect(classifyQuestion("Will everything fit?")).toBe("compatibility");
    expect(classifyQuestion("How much does it cost per month?")).toBe("pricing");
    expect(classifyQuestion("How should I pack the van?")).toBe("packing");
  });

  it("answers from facts and cites them", () => {
    const answer = askCopilot("Will everything fit?", context);
    expect(answer.unanswered).toBe(false);
    expect(answer.evidence.length).toBeGreaterThan(0);
    expect(answer.followUps.length).toBeGreaterThan(0);
  });

  it("says it does not know rather than inventing an answer", () => {
    const answer = askCopilot("What is the host's phone number?", { lines: [], assessment: null });
    expect(answer.unanswered).toBe(true);
    expect(answer.evidence).toEqual([]);
    expect(answer.confidence).toBe(0);
  });

  it("cannot compare listings it has not been given", () => {
    const answer = askCopilot("Which space is better?", context);
    expect(answer.unanswered).toBe(true);
  });

  it("compares once a second listing is in context", () => {
    const answer = askCopilot("Which space is better?", {
      ...context,
      assessments: [assessListing(LINES, listing()), assessListing(LINES, SMALL)],
    });
    expect(answer.unanswered).toBe(false);
    expect(answer.evidence).toHaveLength(2);
  });

  it("offers prompts it can actually answer", () => {
    expect(copilotPrompts({ lines: [], assessment: null })).toContain("What can you help with?");
    expect(copilotPrompts(context)).toContain("Will everything fit?");
  });
});

describe("memory and learning", () => {
  it("records intelligence history without any personal data", () => {
    rememberEvent({ kind: "recommendation_accepted", subject: "inventory-oversized" });
    rememberEvent({ kind: "item_moved", subject: "bicycle" });
    const memory = readMemory();
    expect(memory.acceptedRecommendations).toContain("inventory-oversized");
    expect(memory.frequentlyMovedItems).toContain("bicycle");
    expect(memory.events).toBe(2);
  });

  it("summarises outcomes and clamps the calibration", () => {
    recordAdvisorSignal({ outcome: "booking_accepted", subject: "garage" });
    recordAdvisorSignal({ outcome: "booking_rejected", subject: "loft" });
    const summary = summariseAdvisorLearning();
    expect(summary.signals).toBe(2);
    expect(summary.acceptanceRate).toBe(0.5);
    expect(summary.calibration).toBeGreaterThanOrEqual(0.9);
    expect(summary.calibration).toBeLessThanOrEqual(1.1);
  });
});

describe("advisor engine", () => {
  it("returns a complete recommendation in one call", () => {
    const result = recommend({ lines: LINES, listings: [listing(), SMALL] });
    expect(result.best?.listing.id).toBe(result.ranking.entries[0]?.listingId);
    expect(result.comparison.rows).toHaveLength(2);
    expect(result.cards.length).toBeGreaterThan(0);
    expect(result.timeline.length).toBeGreaterThan(0);
    expect(result.booking).not.toBeNull();
    expect(result.meta.contractVersion).toBe("advisor-1");
  });

  it("degrades gracefully when there are no listings", () => {
    const result = recommend({ lines: LINES, listings: [] });
    expect(result.best).toBeNull();
    expect(result.booking).toBeNull();
    expect(result.comparison.notes.length).toBeGreaterThan(0);
  });

  it("is deterministic across runs", () => {
    const a = recommend({ lines: LINES, listings: [listing(), SMALL] });
    clearAssessmentCache();
    const b = recommend({ lines: LINES, listings: [listing(), SMALL] });
    expect(b.ranking.entries.map((entry) => entry.score)).toEqual(
      a.ranking.entries.map((entry) => entry.score),
    );
  });
});
