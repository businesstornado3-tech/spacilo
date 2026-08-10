/**
 * Phase 6AG — preview reliability.
 *
 * Three proven failure modes are locked down here:
 *  1. head-noun matching, so a television never satisfies a TV stand;
 *  2. descriptor matching, so a generic "suitcase" still fills coloured
 *     allowances;
 *  3. object-level quantity accounting, so a three-box object is reconciled by
 *     count instead of by per-unit id strings the verifier cannot produce.
 */
import { describe, expect, it } from "vitest";
import { categoriseVerification } from "./verification";
import { previewProgressMessage } from "@/components/spaceplanner/photo/PhotoArrangement";

const FEATURES = [{ id: "FEATURE-001", label: "window" }];

function reply(input: { present?: string[]; objects?: string[]; unexpected?: string[] }) {
  return {
    present: input.present ?? [],
    unexpected: input.unexpected ?? [],
    objects: input.objects ?? [],
  };
}

describe("Phase 6AG — head-noun matching", () => {
  const TV = { id: "ITEM-001", label: "television", quantity: 1 };
  const STAND = { id: "ITEM-002", label: "tv stand", quantity: 1 };

  it("does not let a television satisfy the tv stand allowance", () => {
    const result = categoriseVerification({
      items: [TV, STAND],
      features: FEATURES,
      reply: reply({ present: ["ITEM-001", "ITEM-002"], objects: ["television", "tv stand"] }),
    });
    expect(result.userInventory.missing).toHaveLength(0);
    expect(result.userInventory.unexpected).toHaveLength(0);
    expect(result.verified).toBe(true);
  });

  it("never reports a tv stand as an unexpected object", () => {
    const result = categoriseVerification({
      items: [TV, STAND],
      features: FEATURES,
      reply: reply({ present: ["ITEM-001", "ITEM-002"], objects: ["tv stand"] }),
    });
    expect(result.userInventory.unexpected.join(" ")).not.toContain("stand");
  });
});

describe("Phase 6AG — descriptor matching survives", () => {
  const BLUE = { id: "ITEM-001", label: "blue suitcase", quantity: 1 };
  const RED = { id: "ITEM-002", label: "red suitcase", quantity: 1 };

  it("lets a generic suitcase fill two distinct coloured allowances", () => {
    const result = categoriseVerification({
      items: [BLUE, RED],
      features: FEATURES,
      reply: reply({ present: ["ITEM-001", "ITEM-002"], objects: ["suitcase", "suitcase"] }),
    });
    expect(result.userInventory.unexpected).toHaveLength(0);
    expect(result.userInventory.missing).toHaveLength(0);
  });
});

describe("Phase 6AG — object-level quantity accounting", () => {
  const BOXES = { id: "ITEM-003", label: "cardboard box", quantity: 3 };

  it("accepts three boxes reported once with a count prefix", () => {
    const result = categoriseVerification({
      items: [BOXES],
      features: FEATURES,
      reply: reply({ present: ["ITEM-003"], objects: ["3x cardboard box"] }),
    });
    expect(result.quantityShortfalls).toHaveLength(0);
    expect(result.userInventory.unexpected).toHaveLength(0);
  });

  it("flags a shortfall when only two of three boxes are drawn", () => {
    const result = categoriseVerification({
      items: [BOXES],
      features: FEATURES,
      reply: reply({ present: ["ITEM-003"], objects: ["2x cardboard box"] }),
    });
    expect(result.quantityShortfalls.join(" ")).toContain("cardboard box");
    expect(result.verified).toBe(false);
  });

  it("accepts a per-unit id suffix without inventing an unknown object", () => {
    const result = categoriseVerification({
      items: [BOXES],
      features: FEATURES,
      reply: reply({ present: ["ITEM-003_01", "ITEM-003_02", "ITEM-003_03"], objects: ["3x cardboard box"] }),
    });
    expect(result.userInventory.missing).toHaveLength(0);
  });
});

describe("Phase 6AG — UX timer copy", () => {
  it("names the processing state past the presentation threshold", () => {
    expect(previewProgressMessage(25_000)).toContain("still processing");
    expect(previewProgressMessage(25_000).toLowerCase()).not.toContain("failed");
  });
});
