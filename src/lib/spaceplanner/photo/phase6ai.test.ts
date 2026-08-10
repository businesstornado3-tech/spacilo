/**
 * Phase 6AI — identity resolution between the inventory and the verifier's
 * own wording. The live regression: "Black bagpack" reported as a belonging
 * the user does not own, when the black backpack is in the locked inventory.
 *
 * Legitimate re-description → MATCHED. Genuinely new object → UNEXPECTED.
 */
import { describe, expect, it } from "vitest";
import { categoriseVerification, genericCandidates } from "./verification";

const FEATURES = [{ id: "FEATURE-001", label: "window" }];

function check(
  items: { id: string; label: string; quantity?: number }[],
  objects: string[],
  present = items.map((item) => item.id),
) {
  return categoriseVerification({
    items,
    features: FEATURES,
    reply: { present, unexpected: [], objects },
  });
}

const BACKPACK = { id: "ITEM-005", label: "Black backpack", quantity: 1 };
const LAPTOP_BAG = { id: "ITEM-006", label: "Black laptop bag", quantity: 1 };

describe("Phase 6AI — black backpack identity", () => {
  it("TEST 1 — exact description matches", () => {
    const result = check([BACKPACK], ["black backpack"]);
    expect(result.userInventory.unexpected).toHaveLength(0);
    expect(result.verified).toBe(true);
  });

  it("TEST 2 — a generic 'black bag' resolves to the only compatible bag", () => {
    const result = check([BACKPACK], ["black bag"]);
    expect(result.userInventory.unexpected).toHaveLength(0);
    expect(result.verified).toBe(true);
  });

  it("TEST 3 — a bare 'backpack' matches the black backpack", () => {
    const result = check([BACKPACK], ["backpack"]);
    expect(result.userInventory.unexpected).toHaveLength(0);
  });

  it("TEST 4 / TEST 13 — the live 'Black bagpack' typo matches", () => {
    const result = check([BACKPACK], ["Black bagpack"]);
    expect(result.userInventory.unexpected).toHaveLength(0);
    expect(result.verified).toBe(true);
    const decision = result.identityDecisions.find((entry) => entry.observed === "Black bagpack");
    expect(decision?.decision).toBe("matched");
    expect(decision?.matchedId).toBe("ITEM-005");
    expect(decision?.reason).toBeTruthy();
  });

  it("TEST 5 — a red backpack is still an invention", () => {
    const result = check([BACKPACK], ["black backpack", "red backpack"]);
    expect(result.userInventory.unexpected.join(" ").toLowerCase()).toContain("red");
    expect(result.verified).toBe(false);
  });

  it("TEST 6 — two black backpacks against one allowance still fails", () => {
    const result = check([BACKPACK], ["2x black backpack"]);
    expect(result.verified).toBe(false);
    expect(result.userInventory.unexpected.join(" ")).toContain("Black backpack");
  });

  it("TEST 7 — a backpack and a laptop bag both match their own allowance", () => {
    const result = check([BACKPACK, LAPTOP_BAG], ["black backpack", "black laptop bag"]);
    expect(result.userInventory.unexpected).toHaveLength(0);
    expect(result.quantityShortfalls).toHaveLength(0);
    expect(result.verified).toBe(true);
  });

  it("TEST 8 — two ambiguous 'black bag' sightings are not blindly accepted", () => {
    const result = check([BACKPACK, LAPTOP_BAG], ["2x black bag"]);
    expect(result.verified).toBe(false);
    const decision = result.identityDecisions.find((entry) => entry.observed === "2x black bag");
    expect(decision?.decision).toBe("ambiguous");
  });
});

describe("Phase 6AI — existing separations survive", () => {
  const TV = { id: "ITEM-001", label: "TV", quantity: 1 };
  const STAND = { id: "ITEM-002", label: "TV stand", quantity: 1 };

  it("TEST 9 — TV and TV stand both match", () => {
    const result = check([TV, STAND], ["TV", "TV stand"]);
    expect(result.userInventory.unexpected).toHaveLength(0);
    expect(result.verified).toBe(true);
  });

  it("TEST 10 — a second TV is rejected", () => {
    const result = check([TV, STAND], ["TV", "TV", "TV stand"]);
    expect(result.verified).toBe(false);
    expect(result.userInventory.unexpected.join(" ").toLowerCase()).toContain("tv");
  });

  it("TEST 11 — 'bottle' matches the only water bottle", () => {
    const result = check([{ id: "ITEM-010", label: "Water bottle", quantity: 1 }], ["bottle"]);
    expect(result.userInventory.unexpected).toHaveLength(0);
    expect(result.verified).toBe(true);
  });

  it("TEST 12 — water bottle and milk bottle stay distinct", () => {
    const items = [
      { id: "ITEM-010", label: "Water bottle", quantity: 1 },
      { id: "ITEM-011", label: "Milk bottle", quantity: 1 },
    ];
    const result = check(items, ["water bottle", "milk bottle"]);
    expect(result.userInventory.unexpected).toHaveLength(0);
    expect(result.verified).toBe(true);
    expect(genericCandidates("bottle", items)).toHaveLength(2);
  });

  it("keeps grey and blue suitcases apart", () => {
    const items = [
      { id: "ITEM-020", label: "Grey suitcase", quantity: 1 },
      { id: "ITEM-021", label: "Blue suitcase", quantity: 1 },
    ];
    const result = check(items, ["grey suitcase", "green suitcase"]);
    expect(result.verified).toBe(false);
  });

  it("does not let a backpack satisfy the laptop bag allowance", () => {
    expect(genericCandidates("backpack", [LAPTOP_BAG])).toHaveLength(0);
  });
});
