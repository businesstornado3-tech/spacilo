/**
 * Phase 6U — deterministic regression coverage for the gaps the Phase 6T
 * acceptance audit found: measured performance budgets, quantity-aware
 * hallucination rejection, and support-relationship fidelity.
 *
 * Nothing here calls a model. Every assertion is over pure functions.
 */
import { describe, expect, it } from "vitest";

import {
  categoriseVerification,
  observedCount,
  quantityCheck,
  type VerifierReply,
} from "@/lib/spaceplanner/photo/verification";
import {
  BELONGINGS_ANALYSIS_BUDGET_MS,
  EMPTY_TIMINGS,
  budgetReport,
  budgetVerdict,
  formatMs,
  measure,
  mergeTimings,
} from "@/lib/spaceplanner/photo/timings";

const TV = { id: "ITEM-001", label: "television" };
const STAND = { id: "ITEM-002", label: "tv stand" };
const SUITCASE = { id: "ITEM-003", label: "blue suitcase" };
const BOX_A = { id: "ITEM-004", label: "cardboard box" };
const BOX_B = { id: "ITEM-005", label: "cardboard box" };
const FEATURES = [{ id: "FEATURE-001", label: "up-and-over garage door" }];

function reply(partial: Partial<VerifierReply>): VerifierReply {
  return { present: [], unexpected: [], missingFeatures: [], objects: [], supports: [], ...partial };
}

describe("Phase 6U — measured performance budgets", () => {
  it("reports an unmeasured stage as unknown, never as a pass", () => {
    const report = budgetReport(EMPTY_TIMINGS);
    expect(report.belongings.state).toBe("unknown");
    expect(report.space.state).toBe("unknown");
    expect(report.plan.state).toBe("unknown");
    expect(report.allWithinBudget).toBe(false);
    expect(report.bottleneck).toBeNull();
  });

  it("marks a measured stage inside its 5s budget as within target", () => {
    const verdict = budgetVerdict(4200, BELONGINGS_ANALYSIS_BUDGET_MS);
    expect(verdict.state).toBe("within");
    expect(verdict.overBy).toBe(0);
  });

  it("records the overshoot rather than failing when a budget is missed", () => {
    const report = budgetReport(
      mergeTimings(EMPTY_TIMINGS, { inventoryReadyMs: 8200, spaceAnalysisMs: 3100 }),
    );
    expect(report.belongings.state).toBe("over");
    expect(report.belongings.overBy).toBe(3200);
    expect(report.space.state).toBe("within");
    expect(report.allWithinBudget).toBe(false);
  });

  it("attributes a miss to the slowest measured stage", () => {
    const report = budgetReport(
      mergeTimings(EMPTY_TIMINGS, { detectionMs: 900, spaceAnalysisMs: 7400, planMs: 120 }),
    );
    expect(report.bottleneck).toBe("space analysis");
  });

  it("treats plan time as optimiser plus manifest validation", () => {
    const report = budgetReport(
      mergeTimings(EMPTY_TIMINGS, { planMs: 3000, manifestValidationMs: 2600 }),
    );
    expect(report.plan.state).toBe("over");
    expect(report.plan.actualMs).toBe(5600);
  });

  it("populates a timing field only when its stage actually ran", () => {
    const run = measure(() => 41 + 1);
    expect(run.value).toBe(42);
    expect(run.ms).toBeGreaterThanOrEqual(0);
    const timings = mergeTimings(EMPTY_TIMINGS, { planMs: run.ms });
    expect(timings.planMs).not.toBeNull();
    expect(timings.renderMs).toBeNull();
    expect(formatMs(timings.renderMs)).toBe("—");
  });
});

describe("Phase 6U — quantity-aware hallucination rejection", () => {
  it("counts units from a plural description", () => {
    expect(observedCount("2× cardboard box")).toBe(2);
    expect(observedCount("three cardboard boxes")).toBe(3);
    expect(observedCount("cardboard box")).toBe(1);
  });

  it("rejects a second suitcase the user does not own", () => {
    const result = categoriseVerification({
      items: [TV, SUITCASE],
      features: FEATURES,
      reply: reply({
        present: ["ITEM-001", "ITEM-003"],
        objects: ["television", "blue suitcase", "blue suitcase"],
      }),
    });
    expect(result.verified).toBe(false);
    expect(result.userInventory.unexpected).toContain("extra blue suitcase ×1");
    expect(result.quantities).toContainEqual({
      label: "blue suitcase",
      allowed: 1,
      observed: 2,
      excess: 1,
    });
  });

  it("does NOT treat a duplicate as valid just because the label matches", () => {
    const result = categoriseVerification({
      items: [BOX_A],
      features: FEATURES,
      reply: reply({ present: ["ITEM-004"], objects: ["cardboard box", "cardboard box"] }),
    });
    expect(result.verified).toBe(false);
  });

  it("accepts legitimate duplicate inventory at its real quantity", () => {
    const result = categoriseVerification({
      items: [BOX_A, BOX_B],
      features: FEATURES,
      reply: reply({
        present: ["ITEM-004", "ITEM-005"],
        objects: ["cardboard box", "cardboard box"],
      }),
    });
    expect(result.verified).toBe(true);
    expect(result.userInventory.unexpected).toEqual([]);
  });

  it("rejects a hallucinated pair of shoes that was never flagged as unexpected", () => {
    const result = categoriseVerification({
      items: [TV],
      features: FEATURES,
      reply: reply({ present: ["ITEM-001"], objects: ["television", "pair of shoes"] }),
    });
    expect(result.verified).toBe(false);
    expect(result.userInventory.unexpected).toContain("pair of shoes");
  });

  it("reports duplicated hallucinated shoes with their observed count", () => {
    const result = categoriseVerification({
      items: [TV],
      features: FEATURES,
      reply: reply({ present: ["ITEM-001"], objects: ["television", "2 pairs of shoes"] }),
    });
    expect(result.verified).toBe(false);
    expect(result.userInventory.unexpected.join(" ")).toContain("×2");
  });

  it("never counts a room feature against the inventory allowance", () => {
    const result = categoriseVerification({
      items: [TV],
      features: FEATURES,
      reply: reply({
        present: ["ITEM-001"],
        objects: ["television", "up-and-over garage door", "concrete floor"],
      }),
    });
    expect(result.verified).toBe(true);
  });

  it("exposes the allowance directly for a TV and its stand", () => {
    const check = quantityCheck(
      [TV, STAND],
      ["television", "tv stand"],
      { items: [TV, STAND], features: FEATURES },
    );
    expect(check.unexpected).toEqual([]);
    expect(check.checks.every((entry) => entry.excess === 0)).toBe(true);
  });
});

describe("Phase 6U — support fidelity", () => {
  it("flags an item the plan put on a stand but the render drew on the floor", () => {
    const result = categoriseVerification({
      items: [TV, STAND],
      features: FEATURES,
      reply: reply({
        present: ["ITEM-001", "ITEM-002"],
        objects: ["television", "tv stand"],
        supports: [{ item: "ITEM-001", restingOn: "floor" }],
      }),
      expectedSupports: [
        { itemId: "ITEM-001", itemLabel: "television", baseId: "ITEM-002", baseLabel: "tv stand" },
      ],
    });
    expect(result.supportIssues.length).toBeGreaterThan(0);
    expect(result.verified).toBe(false);
  });

  it("accepts a render that honours the planned support surface", () => {
    const result = categoriseVerification({
      items: [TV, STAND],
      features: FEATURES,
      reply: reply({
        present: ["ITEM-001", "ITEM-002"],
        objects: ["television", "tv stand"],
        supports: [{ item: "ITEM-001", restingOn: "ITEM-002" }],
      }),
      expectedSupports: [
        { itemId: "ITEM-001", itemLabel: "television", baseId: "ITEM-002", baseLabel: "tv stand" },
      ],
    });
    expect(result.supportIssues).toEqual([]);
    expect(result.verified).toBe(true);
  });
});
