/**
 * Phase 11 radar invariants.
 *
 * These protect the promises a founder cannot verify by eye: the radar only
 * ever reads EarnRoom's own production behaviour, it never carries a contact
 * handle, it never claims supply, and repeated runs collapse onto one need
 * rather than inflating the numbers.
 */
import { describe, expect, it, beforeEach } from "vitest";

import { resetGrowthConfig, setGrowthConfig } from "./config";
import { resetConnectors } from "./connectors";
import {
  analyticsRowToSignal,
  buildGrowthPipeline,
  mergeGrowthOpportunities,
  type GrowthAnalyticsRow,
} from "./pipeline";
import type { SourceSignal } from "./types";

function row(patch: Partial<GrowthAnalyticsRow> = {}): GrowthAnalyticsRow {
  return {
    id: 1,
    event_name: "storage_search_started",
    path: "/search",
    props: {},
    occurred_at: "2026-01-01T00:00:00.000Z",
    environment: "production",
    is_bot: false,
    ...patch,
  };
}

function signal(patch: Partial<SourceSignal> = {}): SourceSignal {
  return {
    id: "analytics:1",
    connectorId: "first_party",
    text: "find storage near me",
    observedAt: Date.parse("2026-01-01T00:00:00.000Z"),
    occurrences: 1,
    contact: null,
    ...patch,
  };
}

beforeEach(() => {
  resetGrowthConfig();
  resetConnectors();
});

describe("first-party observation intake", () => {
  it("accepts a production, non-bot, known journey event", () => {
    const result = analyticsRowToSignal(row());
    expect(result?.connectorId).toBe("first_party");
    expect(result?.text).toContain("storage");
  });

  it("never carries a contact handle, so outreach is impossible on this path", () => {
    expect(analyticsRowToSignal(row())?.contact).toBeNull();
  });

  it("ignores preview, development and bot traffic", () => {
    expect(analyticsRowToSignal(row({ environment: "preview" }))).toBeNull();
    expect(analyticsRowToSignal(row({ environment: "development" }))).toBeNull();
    expect(analyticsRowToSignal(row({ is_bot: true }))).toBeNull();
  });

  it("ignores an event that is not in the radar allowlist", () => {
    expect(analyticsRowToSignal(row({ event_name: "message_sent" }))).toBeNull();
    expect(analyticsRowToSignal(row({ event_name: "not_a_real_event" }))).toBeNull();
  });

  it("drops sensitive or free-text properties rather than storing them", () => {
    const result = analyticsRowToSignal(
      row({ props: { postcode: "PO1 1AA", email: "a@b.c", query: "sofa", count: 3, mode: "grid" } }),
    );
    expect(result?.metadata).toMatchObject({ count: 3, mode: "grid" });
    expect(Object.keys(result?.metadata ?? {})).not.toContain("postcode");
    expect(Object.keys(result?.metadata ?? {})).not.toContain("email");
    expect(Object.keys(result?.metadata ?? {})).not.toContain("query");
  });
});

describe("radar analysis", () => {
  it("produces an evidence-backed, scored opportunity", () => {
    const result = buildGrowthPipeline(signal());
    expect(result.opportunity).not.toBeNull();
    expect(result.opportunity?.evidence.length).toBeGreaterThan(0);
    expect(result.opportunity?.scores.opportunity).toBeGreaterThanOrEqual(0);
    expect(result.opportunity?.scores.opportunity).toBeLessThanOrEqual(100);
  });

  it("never claims availability from a behavioural event", () => {
    const result = buildGrowthPipeline(signal());
    expect(result.opportunity?.supply.mayClaimAvailability).toBe(false);
    expect(result.opportunity?.supply.level).toBe("LEVEL_1_NO_SUPPLY");
  });

  it("never decides to send anything, because outbound is off by default", () => {
    const result = buildGrowthPipeline(signal());
    expect(result.campaign).toBeNull();
    expect(["CAPTURE_ONLY", "RETAIN_FOR_INSIGHT"]).toContain(result.opportunity?.decision.value);
  });

  it("refuses to analyse a blocked connector and records why", () => {
    const result = buildGrowthPipeline(signal({ connectorId: "gumtree" }));
    expect(result.opportunity).toBeNull();
    expect(result.dropped?.stage).toBe("connector");
    expect(result.audit[0]?.action).toBe("action_blocked");
  });

  it("drops an observation it cannot understand instead of guessing", () => {
    const result = buildGrowthPipeline(signal({ text: "qqqq zzzz" }));
    expect(result.opportunity).toBeNull();
    expect(result.dropped?.stage).toBe("understanding");
  });

  it("writes an audit trail for every accepted observation", () => {
    const actions = buildGrowthPipeline(signal()).audit.map((event) => event.action);
    expect(actions).toContain("signal_ingested");
    expect(actions).toContain("opportunity_created");
    expect(actions).toContain("policy_evaluated");
  });

  it("gives every audit event a stable key, so a repeat run cannot duplicate it", () => {
    const first = buildGrowthPipeline(signal()).audit.map((event) => event.id);
    const second = buildGrowthPipeline(signal()).audit.map((event) => event.id);
    expect(first).toEqual(second);
    expect(new Set(first).size).toBe(first.length);
  });

  it("separates host intent from renter intent", () => {
    const host = buildGrowthPipeline(signal({ text: "earn from unused space" }));
    expect(host.opportunity?.audience.primary).toBe("HOST");
    expect(host.opportunity?.supply.ctaMode).toBe("host_acquisition");
  });
});

describe("aggregation", () => {
  it("collapses repeats of the same need onto one opportunity", () => {
    const results = [
      buildGrowthPipeline(signal({ id: "analytics:1" })),
      buildGrowthPipeline(signal({ id: "analytics:2" })),
    ];
    const merged = mergeGrowthOpportunities(results);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.frequency).toBe(2);
  });

  it("honours the emergency stop by never escalating to a send decision", () => {
    setGrowthConfig({ emergencyStop: true });
    const result = buildGrowthPipeline(signal());
    expect(result.opportunity?.decision.value).not.toBe("CAMPAIGN_NOW");
  });
});
