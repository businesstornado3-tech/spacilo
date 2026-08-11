/**
 * Phase 6AP — canonical object IDs are the primary verifier identity.
 *
 * The verifier now answers "<ID> | wording". A different wording behind a valid
 * ID is the SAME object, never a hallucination. "UNKNOWN | wording" stays
 * object-level: it is excluded, not fatal. Every existing protection —
 * inventions, quantity, TV/TV-stand, support mismatch, unplaced — is unchanged.
 */
import { describe, expect, it } from "vitest";

import { coverageOf, verdictFor } from "@/routes/api/spaceplanner-visualise";

import {
  categoriseVerification,
  classifyReported,
  declaredUnknown,
  splitObservation,
  type ExpectedSupport,
  type WhitelistEntry,
} from "./verification";

const inventory: WhitelistEntry[] = [
  { id: "OBJ-001", label: "Television", quantity: 1 },
  { id: "OBJ-002", label: "TV stand", quantity: 1 },
  { id: "OBJ-003", label: "Blue suitcase", quantity: 1 },
  { id: "OBJ-004", label: "Grey suitcase", quantity: 1 },
  { id: "OBJ-005", label: "Small plastic bottle with blue cap", quantity: 1 },
];

const allIds = inventory.map((entry) => entry.id);

function report(objects: string[], extra: Partial<Parameters<typeof categoriseVerification>[0]> = {}) {
  return categoriseVerification({
    items: inventory,
    features: [],
    reply: { present: allIds, unexpected: [], objects },
    ...extra,
  });
}

function confirmedFor(objects: string[], id: string) {
  return report(objects).observations.find((entry) => entry.matchedId === id);
}

describe("Phase 6AP — the verifier response contract", () => {
  it("splits '<ID> | description' into identity and wording", () => {
    expect(splitObservation("OBJ-005 | small bottle")).toEqual({
      idPart: "OBJ-005",
      unknown: false,
      description: "small bottle",
    });
    expect(declaredUnknown("UNKNOWN | black chair")).toBe(true);
    expect(declaredUnknown("OBJ-001 | TV")).toBe(false);
  });

  it("1 — 'OBJ-001 | TV' resolves to the television", () => {
    expect(classifyReported("OBJ-001 | TV", { items: inventory, features: [] })).toBe("user_item");
    expect(confirmedFor(["OBJ-001 | TV"], "OBJ-001")?.classification).toBe("confirmed");
  });

  it("2 — 'OBJ-001 | television' resolves to the television", () => {
    expect(confirmedFor(["OBJ-001 | television"], "OBJ-001")?.classification).toBe("confirmed");
  });

  it("3 — 'OBJ-005 | small bottle' resolves to the canonical bottle", () => {
    const observation = confirmedFor(["OBJ-005 | small bottle"], "OBJ-005");
    expect(observation?.classification).toBe("confirmed");
    expect(observation?.reason).toBe("canonical_id_match");
  });

  it("4 — 'OBJ-005 | blue cap bottle' resolves to the canonical bottle", () => {
    expect(confirmedFor(["OBJ-005 | blue cap bottle"], "OBJ-005")?.classification).toBe("confirmed");
  });

  it("5 — a misspelt 'bagpack' still reaches the backpack by wording", () => {
    const items: WhitelistEntry[] = [{ id: "OBJ-010", label: "Black backpack", quantity: 1 }];
    expect(classifyReported("bagpack", { items, features: [] })).toBe("user_item");
  });

  it("6 — generic 'bottle' with one unique bottle resolves to it", () => {
    const one: WhitelistEntry[] = [{ id: "OBJ-005", label: "Water bottle", quantity: 1 }];
    expect(classifyReported("bottle", { items: one, features: [] })).toBe("user_item");
  });

  it("7 — generic 'bottle' with two bottles stays unconfirmed, never forbidden", () => {
    const two: WhitelistEntry[] = [
      { id: "OBJ-005", label: "Small plastic bottle with blue cap", quantity: 1 },
      { id: "OBJ-006", label: "Large water bottle", quantity: 1 },
    ];
    const result = categoriseVerification({
      items: two,
      features: [],
      reply: { present: ["OBJ-005", "OBJ-006"], unexpected: [], objects: ["a bottle"] },
    });
    expect(result.forbiddenCount).toBe(0);
    expect(result.usable).toBe(true);
  });

  it("8 — the television never consumes the TV stand allowance", () => {
    const result = report(["OBJ-001 | TV", "OBJ-002 | TV stand"]);
    expect(result.forbiddenCount).toBe(0);
    expect(result.usable).toBe(true);
    expect(result.observations.filter((entry) => entry.classification === "confirmed").length).toBe(2);
  });

  it("9 — the blue and grey suitcases are confirmed independently", () => {
    const result = report(["OBJ-003 | blue case", "OBJ-004 | grey case"]);
    expect(result.forbiddenCount).toBe(0);
    const ids = result.observations.map((entry) => entry.matchedId);
    expect(ids).toContain("OBJ-003");
    expect(ids).toContain("OBJ-004");
  });

  it("10 — one UNKNOWN object does not hide a valid image", () => {
    const cover = coverageOf(
      inventory,
      [],
      {
        present: allIds,
        unexpected: [],
        objects: [
          "OBJ-001 | TV",
          "OBJ-002 | TV stand",
          "OBJ-003 | blue case",
          "OBJ-004 | grey case",
          "UNKNOWN | bottle",
        ],
      },
      [],
      [],
    );
    expect(cover.usable).toBe(true);
    expect(verdictFor(cover)).not.toBe("unfaithful");
  });

  it("11 — one support mismatch does not hide a valid image", () => {
    const supports: ExpectedSupport[] = [
      {
        itemId: "OBJ-001",
        itemLabel: "Television",
        baseId: "OBJ-002",
        baseLabel: "TV stand",
      },
    ];
    const cover = coverageOf(
      inventory,
      [],
      {
        present: allIds,
        unexpected: [],
        objects: ["OBJ-001 | TV"],
        supports: [{ item: "OBJ-001", restingOn: "floor" }],
      },
      [],
      supports,
    );
    expect(cover.supportMismatchCount).toBe(1);
    expect(cover.usable).toBe(true);
  });

  it("12 — one unplaced object does not hide a valid image", () => {
    const result = report(["OBJ-001 | TV"], {
      unplaced: [{ id: "OBJ-005", label: "Small plastic bottle with blue cap", quantity: 1, reason: "no space left" }],
      reply: {
        present: ["OBJ-001"],
        unexpected: ["small plastic bottle with blue cap"],
        objects: ["OBJ-001 | TV"],
      },
    });
    expect(result.usable).toBe(true);
    expect(result.userInventory.unexpected).toEqual([]);
  });

  it("13 — a genuinely invented object still triggers hallucination protection", () => {
    const result = report(["OBJ-001 | TV", "UNKNOWN | black office chair"]);
    expect(result.forbiddenCount).toBeGreaterThan(0);
    expect(result.usable).toBe(false);
  });

  it("14 — quantity excess still triggers quantity protection", () => {
    const result = report(["OBJ-003 | blue suitcase", "OBJ-003 | blue suitcase", "blue suitcase"]);
    expect(result.forbiddenCount).toBeGreaterThan(0);
    expect(result.usable).toBe(false);
  });

  it("15 — a canonical ID beats a wording difference", () => {
    const result = report(["OBJ-005 | tiny flask"]);
    const observation = result.observations.find((entry) => entry.matchedId === "OBJ-005");
    expect(observation?.classification).toBe("confirmed");
    expect(result.forbiddenCount).toBe(0);
  });

  it("16 — a malformed or missing ID falls back to the existing matching", () => {
    expect(classifyReported("OBJ-999 | television", { items: inventory, features: [] })).toBe("user_item");
    expect(classifyReported("television", { items: inventory, features: [] })).toBe("user_item");
  });

  it("17 — UNKNOWN alone is not a hallucination when a belonging could account for it", () => {
    const result = report(["OBJ-001 | TV", "UNKNOWN | bottle"]);
    expect(result.forbiddenCount).toBe(0);
    expect(result.usable).toBe(true);
  });
});
