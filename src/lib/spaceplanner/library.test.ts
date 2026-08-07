import { describe, expect, it } from "vitest";

import {
  archivedInventories,
  byRecency,
  continuePlanning,
  duplicateName,
  formatVolume,
  formatWeight,
  fromQuantities,
  inventoryStatus,
  liveInventories,
  relativeTime,
  spaceFor,
  suggestedSpace,
  summarise,
  toLines,
  toQuantities,
  type SavedInventory,
} from "./library";

const make = (patch: Partial<SavedInventory> = {}): SavedInventory => ({
  id: "inv-1",
  name: "Garage clearout",
  description: "",
  lines: [{ itemId: "medium-box", quantity: 4 }],
  spaceId: "garage",
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-01T10:00:00.000Z",
  lastOpenedAt: "2026-08-01T10:00:00.000Z",
  archivedAt: null,
  lastScore: null,
  ...patch,
});

describe("inventory line conversion", () => {
  it("round-trips quantities and drops unknown or empty lines", () => {
    const quantities = { "medium-box": 3, "not-a-real-item": 2, "large-box": 0 };
    const lines = fromQuantities(quantities);
    expect(lines).toEqual([{ itemId: "medium-box", quantity: 3 }]);
    expect(toQuantities(lines)).toEqual({ "medium-box": 3 });
    expect(toLines(lines)).toHaveLength(1);
  });
});

describe("summaries", () => {
  it("estimates volume, storage allowance and weight from the catalogue", () => {
    const summary = summarise(make());
    expect(summary.itemCount).toBe(4);
    expect(summary.itemTypeCount).toBe(1);
    expect(summary.volume).toBeGreaterThan(0);
    expect(summary.estimatedStorageVolume).toBeGreaterThan(summary.volume);
    expect(summary.weightKg).toBeGreaterThan(0);
  });

  it("is a draft until a run has scored it, then ready", () => {
    expect(inventoryStatus(make())).toBe("draft");
    expect(inventoryStatus(make({ lastScore: 91 }))).toBe("ready");
    expect(inventoryStatus(make({ lines: [], lastScore: 91 }))).toBe("draft");
  });

  it("has an empty summary for an empty inventory", () => {
    const summary = summarise(make({ lines: [] }));
    expect(summary.itemCount).toBe(0);
    expect(summary.volume).toBe(0);
    expect(summary.weightKg).toBe(0);
  });
});

describe("space selection", () => {
  it("falls back to the garage for an unknown space id", () => {
    expect(spaceFor(make({ spaceId: "nowhere" })).id).toBe("garage");
  });

  it("suggests nothing for an empty inventory and a real space otherwise", () => {
    expect(suggestedSpace(make({ lines: [] }))).toBeNull();
    expect(suggestedSpace(make())?.id).toBeTruthy();
  });
});

describe("library ordering", () => {
  const older = make({ id: "a", lastOpenedAt: "2026-08-01T10:00:00.000Z" });
  const newer = make({ id: "b", lastOpenedAt: "2026-08-05T10:00:00.000Z" });
  const gone = make({ id: "c", archivedAt: "2026-08-03T10:00:00.000Z" });

  it("sorts most recently opened first", () => {
    expect([older, newer].sort(byRecency).map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("splits live from archived", () => {
    expect(liveInventories([older, newer, gone]).map((i) => i.id)).toEqual(["b", "a"]);
    expect(archivedInventories([older, newer, gone]).map((i) => i.id)).toEqual(["c"]);
  });

  it("continues the most recent live inventory", () => {
    expect(continuePlanning([older, newer, gone])?.id).toBe("b");
    expect(continuePlanning([gone])).toBeNull();
  });
});

describe("naming and formatting", () => {
  it("never collides a duplicate name", () => {
    expect(duplicateName("Loft", [])).toBe("Loft (copy)");
    expect(duplicateName("Loft", ["Loft (copy)"])).toBe("Loft (copy 2)");
    expect(duplicateName("Loft", ["Loft (copy)", "Loft (copy 2)"])).toBe("Loft (copy 3)");
  });

  it("formats UK-friendly volume and weight", () => {
    expect(formatVolume(4.25)).toBe("4.3m³");
    expect(formatWeight(420)).toBe("420kg");
    expect(formatWeight(1500)).toBe("1.5t");
  });

  it("describes recency in plain English", () => {
    const now = new Date("2026-08-07T12:00:00.000Z");
    expect(relativeTime("2026-08-07T11:59:40.000Z", now)).toBe("just now");
    expect(relativeTime("2026-08-07T11:30:00.000Z", now)).toBe("30 min ago");
    expect(relativeTime("2026-08-07T09:00:00.000Z", now)).toBe("3 hr ago");
    expect(relativeTime("2026-08-05T12:00:00.000Z", now)).toBe("2 days ago");
  });
});
