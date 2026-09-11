import { describe, expect, it } from "vitest";

import { CARD_ORDER, connectGuidance, founderCard, founderCards } from "./founder-view";
import type { WorkerDescriptor, WorkerMode } from "./types";

function worker(overrides: Partial<WorkerDescriptor> & { mode: WorkerMode }): WorkerDescriptor {
  return {
    id: "worker-1",
    label: "Test worker",
    status: "IDLE",
    detail: "",
    capability: "HIGH",
    hardware: null,
    provider: null,
    installedModels: [],
    enabled: true,
    chargeable: false,
    queued: 0,
    lastHeartbeatAt: null,
    ...overrides,
  };
}

describe("founder video route cards", () => {
  it("offers the four routes in founder order", () => {
    expect(CARD_ORDER).toEqual(["BROWSER", "LOCAL", "FREE_CLOUD", "PAID_CLOUD"]);
  });

  it("marks a browser route ready and free when it has reported in", () => {
    const card = founderCard({
      mode: "BROWSER",
      worker: worker({ mode: "BROWSER" }),
      paidComputeEnabled: false,
    });
    expect(card.status).toBe("READY");
    expect(card.selectable).toBe(true);
    expect(card.costLine).toContain("£0");
    expect(card.output).toBe("Animated video");
  });

  it("never claims a local worker is connected before it checks in", () => {
    const card = founderCard({ mode: "LOCAL", worker: null, paidComputeEnabled: false });
    expect(card.status).toBe("NOT CONNECTED");
    expect(card.selectable).toBe(false);
    expect(card.actionLabel).toBe("Set up my computer");
    expect(card.blockedMessage).toContain("EarnRoom Video Worker on your computer");
  });

  it("never claims a free cloud worker exists before it checks in", () => {
    const card = founderCard({ mode: "FREE_CLOUD", worker: null, paidComputeEnabled: false });
    expect(card.status).toBe("NOT CONNECTED");
    expect(card.selectable).toBe(false);
    expect(card.blockedMessage).toContain("No free cloud worker is connected");
  });

  it("keeps paid cloud disabled and unselectable by default", () => {
    const card = founderCard({
      mode: "PAID_CLOUD",
      worker: worker({ mode: "PAID_CLOUD", chargeable: true }),
      paidComputeEnabled: false,
    });
    expect(card.status).toBe("DISABLED");
    expect(card.selectable).toBe(false);
    expect(card.actionLabel).toBe("Enable paid cloud");
  });

  it("labels a paid cost as an estimate, never a charge", () => {
    const card = founderCard({
      mode: "PAID_CLOUD",
      worker: worker({ mode: "PAID_CLOUD", chargeable: true }),
      paidComputeEnabled: true,
    });
    expect(card.status).toBe("ENABLED");
    expect(card.costLine.toLowerCase()).toContain("estimate");
    expect(card.costLine.toLowerCase()).not.toContain("charged");
  });

  it("reports limited hardware honestly instead of promising cinematic output", () => {
    const card = founderCard({
      mode: "LOCAL",
      worker: worker({ mode: "LOCAL", capability: "LIMITED" }),
      paidComputeEnabled: false,
    });
    expect(card.status).toBe("LIMITED");
    expect(card.selectable).toBe(true);
    expect(card.capabilityNote).toContain("does not meet the recommended hardware");
  });

  it("blocks a busy worker rather than routing elsewhere", () => {
    const card = founderCard({
      mode: "LOCAL",
      worker: worker({ mode: "LOCAL", status: "BUSY" }),
      paidComputeEnabled: false,
    });
    expect(card.status).toBe("BUSY");
    expect(card.selectable).toBe(false);
    expect(card.blockedMessage).toContain("busy");
  });

  it("says the free allowance is unavailable when the quota is used up", () => {
    const card = founderCard({
      mode: "FREE_CLOUD",
      worker: worker({ mode: "FREE_CLOUD", status: "QUOTA_EXHAUSTED" }),
      paidComputeEnabled: false,
    });
    expect(card.selectable).toBe(false);
    expect(card.blockedMessage).toBe("Free cloud allowance is currently unavailable.");
  });

  it("treats an offline worker as not connected and keeps its own detail", () => {
    const card = founderCard({
      mode: "LOCAL",
      worker: worker({
        mode: "LOCAL",
        status: "OFFLINE",
        detail: "Last check-in was 2 hours ago.",
      }),
      paidComputeEnabled: false,
    });
    expect(card.status).toBe("NOT CONNECTED");
    expect(card.blockedMessage).toBe("Last check-in was 2 hours ago.");
  });

  it("prefers a ready worker over a silent one for the same mode", () => {
    const cards = founderCards({
      workers: [
        worker({ mode: "LOCAL", id: "a", status: "OFFLINE" }),
        worker({ mode: "LOCAL", id: "b", status: "IDLE" }),
        worker({ mode: "BROWSER", id: null }),
      ],
      paidComputeEnabled: false,
    });
    const local = cards.find((card) => card.mode === "LOCAL")!;
    expect(local.status).toBe("READY");
    expect(cards).toHaveLength(4);
    expect(cards.find((card) => card.mode === "FREE_CLOUD")!.status).toBe("NOT CONNECTED");
  });

  it("uses the real cost line when one is supplied", () => {
    const card = founderCard({
      mode: "FREE_CLOUD",
      worker: worker({ mode: "FREE_CLOUD" }),
      paidComputeEnabled: false,
      costLine: "£0 while within the worker's free allowance.",
    });
    expect(card.costLine).toBe("£0 while within the worker's free allowance.");
  });

  it("gives connect guidance per route", () => {
    expect(connectGuidance("LOCAL")).toContain("My computer isn't connected yet.");
    expect(connectGuidance("PAID_CLOUD")).toContain("Paid generation is disabled.");
  });
});
