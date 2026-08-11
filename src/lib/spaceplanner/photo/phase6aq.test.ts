/**
 * Phase 6AQ — THE FINAL PREVIEW GATE.
 *
 * The verifier is frozen. What changed is only whether one or two problematic
 * objects may suppress an otherwise usable photographic arrangement. The rule:
 * while at least one belonging is confirmed in the picture, the picture is
 * shown and the problem objects are reported beside it.
 */
import { describe, expect, it } from "vitest";

import type { Coverage } from "@/routes/api/spaceplanner-visualise";
import { verdictFor } from "@/routes/api/spaceplanner-visualise";

function coverage(partial: Partial<Coverage>): Coverage {
  return {
    expected: 10,
    present: 10,
    missing: [],
    unexpected: [],
    featureNotes: [],
    supportIssues: [],
    complete: true,
    faithful: true,
    usable: true,
    unconfirmed: [],
    confirmedCount: 10,
    unconfirmedCount: 0,
    forbiddenCount: 0,
    excluded: [],
    excludedCount: 0,
    supportMismatchCount: 0,
    categories: {} as Coverage["categories"],
    ...partial,
  };
}

/** The exact display condition the product now uses. */
function imageShown(cover: Coverage | null): boolean {
  const verdict = verdictFor(cover);
  if (!cover || verdict === "unverified") return false;
  return (cover.confirmedCount ?? 0) > 0;
}

describe("Phase 6AQ — the final preview gate", () => {
  it("1 — 10 of 10 confirmed shows the image", () => {
    const cover = coverage({});
    expect(verdictFor(cover)).toBe("verified");
    expect(imageShown(cover)).toBe(true);
  });

  it("2 — one unconfirmed object still shows the image", () => {
    const cover = coverage({
      complete: false,
      confirmedCount: 9,
      unconfirmedCount: 1,
      unconfirmed: ["grey box"],
    });
    expect(verdictFor(cover)).toBe("partial");
    expect(imageShown(cover)).toBe(true);
  });

  it("3 — two unconfirmed objects still show the image", () => {
    const cover = coverage({
      complete: false,
      confirmedCount: 8,
      unconfirmedCount: 2,
      unconfirmed: ["grey box", "bottle"],
    });
    expect(imageShown(cover)).toBe(true);
  });

  it("4 — a support mismatch does not hide the image", () => {
    const cover = coverage({
      complete: false,
      confirmedCount: 9,
      supportIssues: ["Television is on the floor"],
      supportMismatchCount: 1,
      excluded: ["Television"],
      excludedCount: 1,
    });
    expect(verdictFor(cover)).toBe("partial");
    expect(imageShown(cover)).toBe(true);
  });

  it("5 — unplaced belongings do not hide the image", () => {
    const cover = coverage({ complete: false, present: 8, confirmedCount: 8 });
    expect(imageShown(cover)).toBe(true);
  });

  it("6 — a single confirmed object among nine unconfirmed still shows", () => {
    const cover = coverage({
      complete: false,
      confirmedCount: 1,
      unconfirmedCount: 9,
      unconfirmed: Array.from({ length: 9 }, (_, index) => `object ${index}`),
    });
    expect(verdictFor(cover)).toBe("partial");
    expect(imageShown(cover)).toBe(true);
  });

  it("7 — a single object that cannot be confirmed shows no photograph", () => {
    const cover = coverage({
      expected: 1,
      present: 0,
      complete: false,
      usable: false,
      confirmedCount: 0,
      unconfirmedCount: 1,
      unconfirmed: ["something"],
    });
    expect(imageShown(cover)).toBe(false);
    expect(verdictFor(cover)).toBe("incomplete");
  });

  it("8 — nothing confirmed out of ten shows no photograph", () => {
    const cover = coverage({
      present: 0,
      complete: false,
      usable: false,
      confirmedCount: 0,
      unconfirmedCount: 10,
    });
    expect(imageShown(cover)).toBe(false);
  });

  it("9 — a wording mismatch on one object still shows the image", () => {
    const cover = coverage({
      complete: false,
      confirmedCount: 9,
      unconfirmedCount: 1,
      unconfirmed: ["UNKNOWN | dark case"],
    });
    expect(imageShown(cover)).toBe(true);
  });

  it("10 — one genuine unknown leaves the confirmed arrangement visible", () => {
    const cover = coverage({
      complete: false,
      faithful: false,
      usable: false,
      confirmedCount: 9,
      forbiddenCount: 1,
      unexpected: ["red sofa"],
    });
    expect(verdictFor(cover)).toBe("partial");
    expect(imageShown(cover)).toBe(true);
  });

  it("an unfaithful render with nothing confirmed is still rejected", () => {
    const cover = coverage({
      present: 0,
      complete: false,
      faithful: false,
      usable: false,
      confirmedCount: 0,
      forbiddenCount: 1,
      unexpected: ["red sofa"],
    });
    expect(verdictFor(cover)).toBe("unfaithful");
    expect(imageShown(cover)).toBe(false);
  });

  it("a missing coverage report is never promoted to a preview", () => {
    expect(verdictFor(null)).toBe("unverified");
    expect(imageShown(null)).toBe(false);
  });
});
