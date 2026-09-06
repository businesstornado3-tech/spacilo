import { describe, expect, it } from "vitest";

import {
  EVALUATED_VIDEO_MODELS,
  SELECTED_VIDEO_MODEL_ID,
  licenceRecord,
  mayBeProductionDefault,
  selectedVideoModel,
  videoModel,
} from "./video-model";

describe("open-weight video model selection", () => {
  it("defaults to a model whose licence permits UK commercial marketing", () => {
    const model = selectedVideoModel();
    expect(model.id).toBe(SELECTED_VIDEO_MODEL_ID);
    expect(model.licence.commercialUse).toBe("PERMITTED");
    expect(model.licence.productionDefaultEligible).toBe(true);
    expect(model.licence.geographicRestrictions).toBe("NONE");
  });

  it("keeps restricted licences out of the production default", () => {
    for (const model of EVALUATED_VIDEO_MODELS) {
      if (model.licence.productionDefaultEligible) continue;
      expect(mayBeProductionDefault(model.id)).toBe(false);
    }
    expect(EVALUATED_VIDEO_MODELS.some((model) => !model.licence.productionDefaultEligible)).toBe(
      true,
    );
  });

  it("records the licence with a verification date for every model", () => {
    for (const model of EVALUATED_VIDEO_MODELS) {
      const record = licenceRecord(model.id)!;
      expect(record.licence.length).toBeGreaterThan(2);
      expect(record.licenceUrl).toMatch(/^https:\/\//);
      expect(record.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("returns nothing for an unknown model rather than guessing", () => {
    expect(videoModel("not-a-model")).toBeNull();
    expect(licenceRecord("not-a-model")).toBeNull();
    expect(mayBeProductionDefault("not-a-model")).toBe(false);
  });
});
