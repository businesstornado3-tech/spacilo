import { beforeEach, describe, expect, it } from "vitest";

import { channelUsable, consentSatisfied, resetChannels } from "./channels";
import { resetGrowthConfig, setGrowthConfig } from "./config";

beforeEach(() => {
  resetGrowthConfig();
  resetChannels();
});

describe("authorised channels", () => {
  it("keeps internal surfaces available without contacting anyone", () => {
    expect(channelUsable("earnroom_internal")).toBe(true);
    expect(consentSatisfied("earnroom_internal", "none")).toBe(true);
  });

  it("requires configuration and consent for outbound email", () => {
    expect(channelUsable("email")).toBe(false);
    expect(consentSatisfied("email", "granted")).toBe(true);
    expect(consentSatisfied("email", "none")).toBe(false);
  });

  it("pauses channels during the emergency stop", () => {
    setGrowthConfig({ emergencyStop: true });
    expect(channelUsable("earnroom_internal")).toBe(false);
  });
});
