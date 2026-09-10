import { describe, expect, it } from "vitest";

import {
  CREATIVE_TREATMENTS,
  isTooSimilar,
  selectCreativeTreatment,
  treatmentDirectives,
} from "./creative";

describe("creative treatments", () => {
  it("offers many genuinely distinct treatments", () => {
    expect(CREATIVE_TREATMENTS.length).toBeGreaterThanOrEqual(20);
    const ids = new Set(CREATIVE_TREATMENTS.map((entry) => entry.id));
    const settings = new Set(CREATIVE_TREATMENTS.map((entry) => entry.setting));
    expect(ids.size).toBe(CREATIVE_TREATMENTS.length);
    expect(settings.size).toBe(CREATIVE_TREATMENTS.length);
    for (const treatment of CREATIVE_TREATMENTS) {
      expect(treatment.beats.length).toBe(4);
      expect(treatment.hook.length).toBeGreaterThan(8);
    }
  });

  it("is deterministic for the same campaign", () => {
    const seed = "storage-portsmouth|2026-02-01";
    const first = selectCreativeTreatment({ seed });
    const second = selectCreativeTreatment({ seed });
    expect(first.treatment.id).toBe(second.treatment.id);
  });

  it("does not repeat a recently used treatment", () => {
    const seed = "storage-portsmouth|2026-02-02";
    const plain = selectCreativeTreatment({ seed }).treatment;
    const avoided = selectCreativeTreatment({
      seed,
      history: [{ treatmentId: plain.id, family: plain.family }],
    });
    expect(avoided.treatment.id).not.toBe(plain.id);
    expect(avoided.summary.avoided).toContain(plain.id);
  });

  it("treats a third campaign in the same family as too similar", () => {
    const candidate = CREATIVE_TREATMENTS[0]!;
    expect(
      isTooSimilar(candidate, [
        { treatmentId: "other-a", family: candidate.family },
        { treatmentId: "other-b", family: candidate.family },
      ]),
    ).toBe(true);
  });

  it("still chooses something when every treatment has been used", () => {
    const history = CREATIVE_TREATMENTS.map((entry) => ({
      treatmentId: entry.id,
      family: entry.family,
    }));
    const chosen = selectCreativeTreatment({ seed: "exhausted", history });
    expect(chosen.treatment.id).toBeTruthy();
  });

  it("turns a treatment into concrete filming directives", () => {
    const lines = treatmentDirectives(CREATIVE_TREATMENTS[0]!);
    expect(lines.length).toBeGreaterThan(4);
    expect(lines.join(" ")).toContain(CREATIVE_TREATMENTS[0]!.setting);
  });
});
