import { describe, expect, it } from "vitest";

import {
  generationSummary,
  simpleModeCards,
  validateModeSelection,
  type SimpleModeCard,
} from "./mode-panel";
import type { WorkerDescriptor, WorkerMode, WorkerRuntimeStatus } from "./types";

function worker(mode: WorkerMode, status: WorkerRuntimeStatus = "IDLE"): WorkerDescriptor {
  return {
    mode,
    id: mode === "BROWSER" ? null : `${mode}-1`,
    label: mode,
    status,
    detail: "",
    capability: "MEDIUM",
    hardware: null,
    provider: null,
    installedModels: [],
    enabled: true,
    chargeable: mode === "PAID_CLOUD",
    queued: 0,
    lastHeartbeatAt: null,
  };
}

const cards = (input: Partial<Parameters<typeof simpleModeCards>[0]> = {}): SimpleModeCard[] =>
  simpleModeCards({
    workers: [worker("BROWSER")],
    paidComputeEnabled: false,
    selected: null,
    browserSupported: true,
    ...input,
  });

const find = (list: SimpleModeCard[], mode: WorkerMode) => list.find((card) => card.mode === mode)!;

describe("simple video generation modes", () => {
  it("offers exactly the four founder modes", () => {
    expect(cards().map((card) => card.mode)).toEqual([
      "BROWSER",
      "LOCAL",
      "FREE_CLOUD",
      "PAID_CLOUD",
    ]);
  });

  it("makes Browser Mode selectable in one click and marks it ACTIVE once chosen", () => {
    expect(find(cards(), "BROWSER").available).toBe(true);
    expect(find(cards({ selected: "BROWSER" }), "BROWSER").status).toBe("ACTIVE");
  });

  it("explains simply when the browser cannot render", () => {
    const card = find(cards({ browserSupported: false }), "BROWSER");
    expect(card.available).toBe(false);
    expect(card.blockedMessage).toContain("isn't available in this browser");
  });

  it("offers installation when the computer worker has never connected", () => {
    const card = find(cards(), "LOCAL");
    expect(card.status).toBe("NOT INSTALLED");
    expect(card.action).toBe("INSTALL");
    expect(card.actionLabel).toBe("Install Computer Worker");
  });

  it("asks the founder to start an offline computer worker rather than pretending", () => {
    const card = find(cards({ workers: [worker("BROWSER"), worker("LOCAL", "OFFLINE")] }), "LOCAL");
    expect(card.status).toBe("OFFLINE");
    expect(card.actionLabel).toBe("Start Computer Worker");
    expect(card.blockedMessage).toContain("Start the EarnRoom Video Worker on your computer.");
  });

  it("selects Computer Mode when the worker is connected", () => {
    const list = cards({ workers: [worker("BROWSER"), worker("LOCAL")], selected: "LOCAL" });
    const card = find(list, "LOCAL");
    expect(card.status).toBe("ACTIVE");
    expect(card.available).toBe(true);
    expect(validateModeSelection(list, "LOCAL").ok).toBe(true);
  });

  it("reflects real free cloud availability instead of a permanent not connected", () => {
    const ready = find(cards({ workers: [worker("BROWSER"), worker("FREE_CLOUD")] }), "FREE_CLOUD");
    expect(ready.status).toBe("AVAILABLE");
    expect(ready.available).toBe(true);

    const busy = find(
      cards({ workers: [worker("BROWSER"), worker("FREE_CLOUD", "BUSY")] }),
      "FREE_CLOUD",
    );
    expect(busy.status).toBe("BUSY");

    const gone = find(cards(), "FREE_CLOUD");
    expect(gone.status).toBe("NOT AVAILABLE");
    expect(gone.statusNote).toBe("Free Cloud is currently unavailable.");
  });

  it("blocks Paid Cloud entirely while it is disabled", () => {
    const list = cards({ workers: [worker("BROWSER"), worker("PAID_CLOUD")] });
    const card = find(list, "PAID_CLOUD");
    expect(card.status).toBe("DISABLED");
    expect(card.available).toBe(false);
    expect(card.actionLabel).toBe("Enable Paid Cloud");
    const gate = validateModeSelection(list, "PAID_CLOUD");
    expect(gate.ok).toBe(false);
    expect(gate.message).toContain("Enable Paid Cloud");
  });

  it("allows Paid Cloud only once it is enabled and a paid worker is ready", () => {
    const list = cards({
      workers: [worker("BROWSER"), worker("PAID_CLOUD")],
      paidComputeEnabled: true,
      selected: "PAID_CLOUD",
    });
    const card = find(list, "PAID_CLOUD");
    expect(card.status).toBe("ACTIVE");
    expect(validateModeSelection(list, "PAID_CLOUD").ok).toBe(true);
  });

  it("never falls back to a paid route when a free one is unavailable", () => {
    const list = cards({
      workers: [worker("PAID_CLOUD")],
      paidComputeEnabled: true,
      browserSupported: false,
      selected: "FREE_CLOUD",
    });
    const gate = validateModeSelection(list, "FREE_CLOUD");
    expect(gate.ok).toBe(false);
    expect(gate.message).toContain("Free Cloud is currently unavailable");
    // The chosen mode is still Free Cloud — nothing was switched silently.
    expect(find(list, "PAID_CLOUD").selected).toBe(false);
  });

  it("summarises the cost protection for the chosen mode", () => {
    const free = generationSummary({
      cards: cards({ selected: "BROWSER" }),
      selected: "BROWSER",
      paidComputeEnabled: false,
    });
    expect(free.modeLine).toBe("Generation mode: Browser Mode");
    expect(free.costLine).toBe("Cost protection: £0");

    const paid = generationSummary({
      cards: cards({
        workers: [worker("BROWSER"), worker("PAID_CLOUD")],
        paidComputeEnabled: true,
        selected: "PAID_CLOUD",
      }),
      selected: "PAID_CLOUD",
      paidComputeEnabled: true,
    });
    expect(paid.paidLine).toBe("Paid Cloud: ENABLED");
    expect(paid.costLine).toBe("Cost protection: Confirmation required");
  });

  it("refuses to generate when no mode has been chosen", () => {
    expect(validateModeSelection(cards(), null).ok).toBe(false);
  });
});
