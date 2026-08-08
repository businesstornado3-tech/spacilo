import { beforeAll, describe, expect, it } from "vitest";
import { installSpaciloAi } from "../bootstrap";
import { parseSearchQuery, buildTrustSummary, matchHelpArticles, seasonalThemes } from "../providers/discovery";
import { buildBookingAdvice, assistInventory, suggestReplies, buildNotificationDigest } from "../providers/guidance";
import { scoreFraudSignals } from "../providers/fraud";
import { aiServices } from "../services";

beforeAll(() => {
  installSpaciloAi();
});

describe("natural-language search", () => {
  it("extracts intent, location, volume and requirements", () => {
    const out = parseSearchQuery("I need secure storage for a sofa and 2 bikes near Portsmouth for 6 months under £120");
    expect(out.filters.locationText?.toLowerCase()).toContain("portsmouth");
    expect(out.filters.itemTypes).toContain("sofa");
    expect(out.filters.needsHighSecurity).toBe(true);
    expect(out.filters.durationMonths).toBe(6);
    expect(out.filters.maxMonthlyPrice).toBe(120);
    expect(out.filters.estimatedVolumeM3).toBeGreaterThan(0);
  });

  it("recognises a moving-house query", () => {
    expect(parseSearchQuery("somewhere to store everything while moving house").filters.intent).toBe("moving");
  });

  it("routes through the orchestrator", async () => {
    const response = await aiServices.discovery.parseSearch({ query: "student storage in Southsea" });
    expect(response.result.filters.intent).toBe("student");
    expect(response.explanation.reason).toBeTruthy();
  });
});

describe("trust summary", () => {
  it("uses only verifiable facts", () => {
    const out = buildTrustSummary({ verifiedHost: true, hostRating: 4.9, reviewCount: 12, accessHours: "anytime" });
    expect(out.points.map((point) => point.id)).toEqual(expect.arrayContaining(["verified", "rated", "access"]));
    expect(out.strength).toBeGreaterThan(50);
    expect(out.points.every((point) => !/guarantee|100%|fully insured/i.test(point.detail))).toBe(true);
  });
});

describe("seasonal + help", () => {
  it("returns Christmas themes in December", () => {
    expect(seasonalThemes({ month: 12 }).themes.some((theme) => theme.id === "christmas")).toBe(true);
  });

  it("flags when no help article is a confident match", () => {
    const out = matchHelpArticles({
      question: "zzzz qqqq unrelated gibberish",
      articles: [{ id: "a", title: "How payouts work", summary: "Host payouts and timing", path: "/help/payouts" }],
    });
    expect(out.noConfidentMatch).toBe(true);
  });
});

describe("booking guidance", () => {
  it("sizes the vehicle to the load", () => {
    expect(buildBookingAdvice({ inventoryVolumeM3: 0.9, itemCount: 6 }).vehicle.size).toBe("car");
    expect(buildBookingAdvice({ inventoryVolumeM3: 15, itemCount: 60 }).vehicle.size).toBe("luton_van");
  });

  it("adds step-specific access advice", () => {
    const advice = buildBookingAdvice({ inventoryVolumeM3: 4, itemCount: 20, accessRoute: "steps", heaviestItemKg: 45 });
    expect(advice.accessNotes.join(" ")).toMatch(/steps/i);
    expect(advice.estimatedUnloadingMinutes).toBeGreaterThan(40);
  });
});

describe("inventory assistant", () => {
  it("suggests commonly forgotten items without duplicating the list", () => {
    const out = assistInventory({ lines: [{ label: "Wardrobe", quantity: 1, volumeM3: 1.6 }], intent: "moving" });
    expect(out.suggestions.some((item) => item.label === "Wardrobe")).toBe(false);
    expect(out.suggestions.length).toBeGreaterThan(0);
  });
});

describe("message assist", () => {
  it("always requires approval and never invents facts", () => {
    const out = suggestReplies({ scenario: "booking_acceptance", role: "host", facts: { counterpartName: "Sam" } });
    expect(out.requiresApproval).toBe(true);
    expect(out.suggestions).toHaveLength(3);
    expect(out.suggestions[0]!.text).toContain("Sam");
  });
});

describe("notification digest", () => {
  it("caps volume but never suppresses time-critical items", () => {
    const digest = buildNotificationDigest({
      maxItems: 1,
      candidates: [
        { id: "1", kind: "price_reduced", title: "Price down", body: "-10%", usefulness: 0.9 },
        { id: "2", kind: "better_listing", title: "Better match", body: "closer", usefulness: 0.8 },
        { id: "3", kind: "booking_expiring", title: "Request expiring", body: "today", usefulness: 0.6, timeCritical: true },
      ],
    });
    expect(digest.deliver.some((entry) => entry.id === "3")).toBe(true);
    expect(digest.suppressed.length).toBeGreaterThan(0);
  });
});

describe("fraud signals", () => {
  it("clusters duplicate listings and scores for review, not verdicts", () => {
    const out = scoreFraudSignals({
      subjects: [
        {
          subjectId: "s1",
          subjectType: "listing",
          description: "Large secure dry garage with easy parking and level access for boxes and furniture",
          imageHashes: ["abc"],
          listingsCreatedLast24h: 5,
        },
        {
          subjectId: "s2",
          subjectType: "listing",
          description: "Large secure dry garage with easy parking and level access for boxes and furniture",
          imageHashes: ["abc"],
          listingsCreatedLast24h: 5,
        },
      ],
    });
    expect(out.clusters.length).toBeGreaterThan(0);
    expect(out.assessments[0]!.riskScore).toBeGreaterThan(35);
    expect(out.assessments[0]!.recommendedAction).not.toBe("none");
  });

  it("leaves an ordinary listing alone", () => {
    const out = scoreFraudSignals({
      subjects: [{ subjectId: "ok", subjectType: "listing", description: "A tidy single garage in a quiet street", accountAgeDays: 400 }],
    });
    expect(out.assessments[0]!.band).toBe("low");
  });
});
