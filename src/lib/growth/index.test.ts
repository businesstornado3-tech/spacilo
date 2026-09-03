import { describe, expect, it } from "vitest";

import * as growth from "./index";

describe("growth public server-safe exports", () => {
  it("exports the phase modules through one canonical boundary", () => {
    expect(typeof growth.readSemantics).toBe("function");
    expect(typeof growth.evaluatePolicy).toBe("function");
    expect(typeof growth.buildCampaign).toBe("function");
    expect(typeof growth.rankOpportunities).toBe("function");
  });
});
