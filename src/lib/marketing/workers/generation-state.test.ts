import { describe, expect, it } from "vitest";

import {
  EMPTY_GENERATION_STATE,
  activeAttempt,
  activeMessage,
  clearMode,
  failAttempt,
  isRunning,
  modeStatusLine,
  startAttempt,
  succeedAttempt,
} from "./generation-state";
import { simpleModeCards, validateModeSelection } from "./mode-panel";

const scope = { campaignId: "c1", assetId: "a1" };
const NO_ADDRESS = "My computer has no address set, so no job can be sent to it.";

function computerFailed() {
  const started = startAttempt(EMPTY_GENERATION_STATE, { ...scope, mode: "LOCAL", attemptId: "1" });
  return failAttempt(started, "LOCAL", "1", { message: NO_ADDRESS, errorCode: "NO_ADDRESS" });
}

describe("generation mode isolation", () => {
  it("keeps a computer failure inside the computer mode", () => {
    const state = computerFailed();
    expect(activeMessage(state, "LOCAL", scope)).toBe(NO_ADDRESS);
    expect(activeMessage(state, "BROWSER", scope)).toBeNull();
    expect(activeMessage(state, "FREE_CLOUD", scope)).toBeNull();
    expect(activeMessage(state, "PAID_CLOUD", scope)).toBeNull();
  });

  it("lets the browser start after the computer failed, with its own message", () => {
    let state = computerFailed();
    state = startAttempt(state, { ...scope, mode: "BROWSER", attemptId: "2", stage: "Drawing" });
    expect(isRunning(state, "BROWSER", scope)).toBe(true);
    expect(activeMessage(state, "BROWSER", scope)).toBeNull();
    state = succeedAttempt(state, "BROWSER", "2", "Your video is ready.");
    expect(activeMessage(state, "BROWSER", scope)).toBe("Your video is ready.");
    // The computer's own failure is still true, and still only its own.
    expect(activeMessage(state, "LOCAL", scope)).toBe(NO_ADDRESS);
  });

  it("never carries a message from one mode into another", () => {
    let state = startAttempt(EMPTY_GENERATION_STATE, {
      ...scope,
      mode: "BROWSER",
      attemptId: "3",
    });
    state = failAttempt(state, "BROWSER", "3", { message: "The browser could not draw it." });
    expect(activeMessage(state, "PAID_CLOUD", scope)).toBeNull();
    state = startAttempt(state, { ...scope, mode: "PAID_CLOUD", attemptId: "4" });
    state = failAttempt(state, "PAID_CLOUD", "4", { message: "Paid Cloud refused." });
    expect(activeMessage(state, "LOCAL", scope)).toBeNull();
    expect(activeMessage(state, "BROWSER", scope)).toBe("The browser could not draw it.");
  });

  it("clears one mode without touching the others", () => {
    let state = computerFailed();
    state = startAttempt(state, { ...scope, mode: "BROWSER", attemptId: "5" });
    state = clearMode(state, "LOCAL");
    expect(activeAttempt(state, "LOCAL", scope)).toBeNull();
    expect(activeAttempt(state, "BROWSER", scope)).not.toBeNull();
  });

  it("ties every attempt to its campaign, asset, mode and attempt id", () => {
    const state = startAttempt(EMPTY_GENERATION_STATE, {
      ...scope,
      mode: "BROWSER",
      attemptId: "6",
      jobId: null,
    });
    const attempt = activeAttempt(state, "BROWSER", scope)!;
    expect(attempt).toMatchObject({
      campaignId: "c1",
      assetId: "a1",
      mode: "BROWSER",
      attemptId: "6",
      jobId: null,
      status: "RUNNING",
    });
    expect(activeAttempt(state, "BROWSER", { campaignId: "other" })).toBeNull();
    expect(activeAttempt(state, "BROWSER", { campaignId: "c1", assetId: "a2" })).toBeNull();
  });

  it("ignores a late reply from a superseded attempt", () => {
    let state = startAttempt(EMPTY_GENERATION_STATE, { ...scope, mode: "LOCAL", attemptId: "7" });
    state = startAttempt(state, { ...scope, mode: "LOCAL", attemptId: "8" });
    state = failAttempt(state, "LOCAL", "7", { message: "old failure" });
    expect(activeMessage(state, "LOCAL", scope)).toBeNull();
  });

  it("says which route is in use, per mode", () => {
    expect(modeStatusLine("BROWSER")).toContain("Browser Local");
    expect(modeStatusLine("LOCAL")).toBe("Using My computer.");
    expect(modeStatusLine("FREE_CLOUD")).toBe("Using Free Cloud.");
    expect(modeStatusLine("PAID_CLOUD")).toBe("Using Paid Cloud.");
  });
});

describe("an unavailable route never disables the browser", () => {
  it("keeps Browser selectable while Computer is offline and Free Cloud absent", () => {
    const cards = simpleModeCards({
      workers: [],
      paidComputeEnabled: false,
      selected: "BROWSER",
      browserSupported: true,
      paidProviderConfigured: false,
      installerAvailable: true,
    });
    const browser = cards.find((card) => card.mode === "BROWSER")!;
    const computer = cards.find((card) => card.mode === "LOCAL")!;
    const free = cards.find((card) => card.mode === "FREE_CLOUD")!;
    expect(browser.available).toBe(true);
    expect(computer.available).toBe(false);
    expect(free.available).toBe(false);
    expect(validateModeSelection(cards, "BROWSER").ok).toBe(true);
  });
});
