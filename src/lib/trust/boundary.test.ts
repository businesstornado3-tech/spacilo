/**
 * Prompt 23, items 14–19: the transaction boundary.
 *
 * These tests pin the rules the browser must not be able to bend: prices come
 * from the server, a changed price forces explicit re-review, and the
 * responsiveness figure is a bounded aggregate over a defined window.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  PRICE_REVIEW_COPY,
  commitDecision,
  isPriceChangedError,
  parseRequestPriceState,
  priceChangeDetail,
} from "@/lib/pricing/commitment";
import {
  RESPONSE_GRACE_HOURS,
  RESPONSE_MIN_SAMPLE,
  RESPONSE_WINDOW_DAYS,
  aggregateResponses,
  isPublishable,
  isQualifying,
  withinWindow,
} from "@/lib/trust/responsiveness";

const read = (path: string) => readFileSync(path, "utf8");

const serverPriced = {
  state: "unchanged",
  currency: "GBP",
  reviewedStorageAmountPence: 12000,
  reviewedTotalAmountPence: 13200,
  currentStorageAmountPence: 12000,
  currentServiceFeePence: 1200,
  currentTotalAmountPence: 13200,
  serviceFeeRateBps: 1000,
  serviceFeeMinimumPence: 200,
  durationDays: 30,
  pricingVersion: "2026-01",
  cancellationPolicyVersion: "v3",
  priceReviewedAt: "2026-02-01T10:00:00Z",
};

describe("price state parsing", () => {
  it("keeps every amount as the integer pence the server sent", () => {
    const price = parseRequestPriceState(serverPriced);
    expect(price.currentTotalAmountPence).toBe(13200);
    expect(price.currentServiceFeePence).toBe(1200);
    expect(price.currency).toBe("GBP");
    expect(price.pricingVersion).toBe("2026-01");
  });

  it("rejects non-integer or fabricated amounts rather than rendering them", () => {
    const price = parseRequestPriceState({
      ...serverPriced,
      currentTotalAmountPence: 132.5,
      currentStorageAmountPence: "1",
    });
    expect(price.currentTotalAmountPence).toBeNull();
    expect(price.currentStorageAmountPence).toBeNull();
  });

  it("degrades an unknown state to unavailable instead of guessing", () => {
    expect(parseRequestPriceState({ state: "who knows" }).state).toBe("unavailable");
    expect(parseRequestPriceState(null).state).toBe("unavailable");
    expect(parseRequestPriceState(undefined).state).toBe("unavailable");
  });
});

describe("commit gate", () => {
  it("allows commitment only when the server says the price is unchanged", () => {
    expect(commitDecision(parseRequestPriceState(serverPriced))).toEqual({ kind: "commit" });
  });

  it("blocks and asks for re-review when the price went up", () => {
    const price = parseRequestPriceState({
      ...serverPriced,
      state: "price_changed",
      currentStorageAmountPence: 13000,
      currentTotalAmountPence: 14300,
    });
    expect(commitDecision(price)).toEqual({ kind: "re_review", direction: "higher" });
  });

  it("also blocks when the price went DOWN — no silent change in either direction", () => {
    const price = parseRequestPriceState({
      ...serverPriced,
      state: "price_changed",
      currentStorageAmountPence: 9000,
      currentTotalAmountPence: 9900,
    });
    expect(commitDecision(price)).toEqual({ kind: "re_review", direction: "lower" });
  });

  it("blocks commitment when the listing can no longer be priced", () => {
    expect(commitDecision(parseRequestPriceState({ state: "gone" }))).toEqual({
      kind: "blocked",
      reason: "unavailable",
    });
  });

  it("never claims money has been taken while the price is under review", () => {
    expect(PRICE_REVIEW_COPY.higher).toContain("Nothing has been charged");
    expect(PRICE_REVIEW_COPY.lower).toContain("Nothing has been charged");
    expect(PRICE_REVIEW_COPY.unavailable).toContain("Nothing has been charged");
  });
});

describe("server refusal handling", () => {
  it("recognises the server's PRICE_CHANGED refusal", () => {
    expect(isPriceChangedError({ message: "PRICE_CHANGED: request repriced" })).toBe(true);
    expect(isPriceChangedError({ message: "insufficient funds" })).toBe(false);
    expect(isPriceChangedError(null)).toBe(false);
  });

  it("reads the bounded new price out of the refusal detail", () => {
    const detail = priceChangeDetail({
      message: "PRICE_CHANGED",
      details: JSON.stringify({ ...serverPriced, state: "price_changed" }),
    });
    expect(detail?.state).toBe("price_changed");
    expect(detail?.currentTotalAmountPence).toBe(13200);
  });

  it("survives a refusal with no parsable detail", () => {
    expect(priceChangeDetail({ message: "PRICE_CHANGED", details: "not json" })).toBeNull();
  });
});

describe("the browser cannot state a price", () => {
  const api = read("src/lib/storage-requests-api.ts");
  const gate = read("src/components/payments/PriceReviewGate.tsx");
  const route = read("src/routes/_authenticated.renter.requests.$requestId.booking.tsx");

  it("sends only the request id when pricing or acknowledging", () => {
    const calls = api.slice(api.indexOf("stow_request_price_state"));
    expect(calls).toContain("p_request_id");
    expect(calls).not.toMatch(/p_(amount|total|price|fee)/);
  });

  it("does not compute totals or fees in the review gate", () => {
    expect(gate).not.toMatch(/[-+*/]\s*(price|fee|amount)/i);
    expect(gate).not.toContain("supabase");
  });

  it("disables the commit action until the gate clears", () => {
    expect(route).toContain("PriceReviewGate");
    expect(route).toContain('decision.kind !== "commit"');
    expect(route).toContain("priceChangeDetail");
  });

  it("no longer compares prices client-side from a listing row", () => {
    expect(route).not.toContain("PriceChangeNotice");
    expect(route).not.toContain("monthly_price_snapshot");
  });
});

describe("host responsiveness is a bounded, defined aggregate", () => {
  const now = new Date("2026-03-01T12:00:00Z");
  const daysAgo = (d: number) =>
    new Date(now.getTime() - d * 24 * 3_600_000).toISOString();

  it("uses a 90-day window and a 48-hour grace period", () => {
    expect(RESPONSE_WINDOW_DAYS).toBe(90);
    expect(RESPONSE_GRACE_HOURS).toBe(48);
    expect(withinWindow({ createdAt: daysAgo(89), respondedAt: null }, now)).toBe(true);
    expect(withinWindow({ createdAt: daysAgo(91), respondedAt: null }, now)).toBe(false);
  });

  it("does not count a fresh unanswered request as a missed reply", () => {
    expect(isQualifying({ createdAt: daysAgo(1), respondedAt: null }, now)).toBe(false);
    expect(isQualifying({ createdAt: daysAgo(5), respondedAt: null }, now)).toBe(true);
  });

  it("ignores system-generated activity", () => {
    const events = [
      { createdAt: daysAgo(10), respondedAt: daysAgo(9), systemGenerated: true },
      { createdAt: daysAgo(10), respondedAt: daysAgo(9) },
    ];
    expect(aggregateResponses(events, now).sample_size).toBe(1);
  });

  it("reports rate and median over qualifying requests only", () => {
    const events = [
      { createdAt: daysAgo(10), respondedAt: daysAgo(9) }, // 24h
      { createdAt: daysAgo(20), respondedAt: daysAgo(19.5) }, // 12h
      { createdAt: daysAgo(30), respondedAt: daysAgo(29) }, // 24h
      { createdAt: daysAgo(40), respondedAt: null }, // missed
      { createdAt: daysAgo(200), respondedAt: null }, // out of window
      { createdAt: daysAgo(0.5), respondedAt: null }, // still in grace
    ];
    const aggregate = aggregateResponses(events, now);
    expect(aggregate.sample_size).toBe(4);
    expect(aggregate.responded_count).toBe(3);
    expect(aggregate.median_response_hours).toBe(24);
  });

  it("exposes nothing beyond three numbers", () => {
    const aggregate = aggregateResponses([{ createdAt: daysAgo(10), respondedAt: daysAgo(9) }], now);
    expect(Object.keys(aggregate).sort()).toEqual([
      "median_response_hours",
      "responded_count",
      "sample_size",
    ]);
  });

  it("stays unpublished below the minimum sample", () => {
    expect(RESPONSE_MIN_SAMPLE).toBe(3);
    expect(isPublishable({ sample_size: 2, responded_count: 2, median_response_hours: 1 })).toBe(
      false,
    );
    expect(isPublishable({ sample_size: 3, responded_count: 1, median_response_hours: 1 })).toBe(
      true,
    );
  });
});
