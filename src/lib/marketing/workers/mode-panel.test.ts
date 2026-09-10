import { describe, expect, it } from "vitest";

import {
  generateButtonLabel,
  generationSummary,
  simpleModeCards,
  validateModeSelection,
  PAID_GENERATION_CONFIRMATION,
  type SimpleModeCard,
} from "./mode-panel";
import { withHostedPaidCloud } from "./hosted";
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
    paidProviderConfigured: false,
    installerAvailable: false,
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

  it("makes Browser Preview selectable in one click and marks it ACTIVE once chosen", () => {
    const card = find(cards(), "BROWSER");
    expect(card.available).toBe(true);
    expect(card.actionLabel).toBe("Use Browser Preview");
    expect(find(cards({ selected: "BROWSER" }), "BROWSER").status).toBe("ACTIVE");
  });

  it("describes Browser Mode honestly as a free preview, not production video", () => {
    const card = find(cards(), "BROWSER");
    expect(card.title).toBe("Browser Preview");
    expect(card.costLine).toBe("£0");
    expect(card.limitation).toBe("Not intended for publication-quality cinematic video.");
    const words = `${card.title} ${card.description} ${card.limitation}`.toLowerCase();
    for (const banned of ["cinematic AI", "photorealistic", "production-quality", "high-quality"]) {
      expect(words).not.toContain(banned.toLowerCase());
    }
  });

  it("explains simply when the browser cannot render", () => {
    const card = find(cards({ browserSupported: false }), "BROWSER");
    expect(card.available).toBe(false);
    expect(card.blockedMessage).toContain("isn't available in this browser");
  });

  it("says the installer has not been published when no installer exists", () => {
    const card = find(cards({ installerAvailable: false }), "LOCAL");
    expect(card.status).toBe("INSTALLER NOT AVAILABLE");
    expect(card.available).toBe(false);
    expect(card.action).toBe("NONE");
    expect(card.statusNote).toBe(
      "The EarnRoom Video Worker installer has not been published yet.",
    );
  });

  it("offers a real download only once an installer exists", () => {
    const card = find(cards({ installerAvailable: true }), "LOCAL");
    expect(card.status).toBe("NOT INSTALLED");
    expect(card.action).toBe("INSTALL");
    expect(card.actionLabel).toBe("Download & Install");
  });

  it("asks the founder to start an offline computer worker rather than pretending", () => {
    const card = find(cards({ workers: [worker("BROWSER"), worker("LOCAL", "OFFLINE")] }), "LOCAL");
    expect(card.status).toBe("OFFLINE");
    expect(card.actionLabel).toBe("Check Connection");
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
    expect(ready.status).toBe("READY");
    expect(ready.available).toBe(true);

    const busy = find(
      cards({ workers: [worker("BROWSER"), worker("FREE_CLOUD", "BUSY")] }),
      "FREE_CLOUD",
    );
    expect(busy.status).toBe("BUSY");

    const gone = find(cards(), "FREE_CLOUD");
    expect(gone.status).toBe("NOT AVAILABLE");
    expect(gone.statusNote).toBe("No free cloud video worker is currently connected.");
  });

  it("keeps Paid Cloud off by default", () => {
    const card = find(cards({ paidProviderConfigured: true }), "PAID_CLOUD");
    expect(card.status).toBe("DISABLED");
    expect(card.available).toBe(false);
    expect(card.statusNote).toBe("Paid generation is switched off.");
    expect(card.actionLabel).toBe("Enable Paid Cloud");
    expect(validateModeSelection(cards(), "PAID_CLOUD").ok).toBe(false);
  });

  it("is READY when Paid Cloud is enabled and the hosted provider is configured", () => {
    const list = cards({ paidComputeEnabled: true, paidProviderConfigured: true });
    const card = find(list, "PAID_CLOUD");
    expect(card.status).toBe("ENABLED — READY");
    expect(card.available).toBe(true);
    expect(validateModeSelection(list, "PAID_CLOUD").ok).toBe(true);
  });

  it("needs no worker registry row for the hosted paid route", () => {
    const list = cards({ paidComputeEnabled: true, paidProviderConfigured: true });
    // Only the browser worker exists — there is no PAID_CLOUD registry row.
    expect(find(list, "PAID_CLOUD").available).toBe(true);
  });

  it("says configuration is required when the provider is not configured", () => {
    const list = cards({ paidComputeEnabled: true, paidProviderConfigured: false });
    const card = find(list, "PAID_CLOUD");
    expect(card.status).toBe("ENABLED — CONFIGURATION REQUIRED");
    expect(card.available).toBe(false);
    expect(card.blockedMessage).toBe(
      "Paid Cloud is enabled, but the video provider is not configured.",
    );
    expect(card.blockedMessage).not.toContain("worker");
  });

  it("says temporarily unavailable when a registered paid worker is down", () => {
    const list = cards({
      workers: [worker("BROWSER"), worker("PAID_CLOUD", "OFFLINE")],
      paidComputeEnabled: true,
      paidProviderConfigured: true,
    });
    const card = find(list, "PAID_CLOUD");
    expect(card.status).toBe("ENABLED — TEMPORARILY UNAVAILABLE");
    expect(card.available).toBe(false);
  });

  it("never falls back to a paid route when a free one is unavailable", () => {
    const list = cards({
      workers: [],
      paidComputeEnabled: true,
      paidProviderConfigured: true,
      browserSupported: false,
      selected: "FREE_CLOUD",
    });
    const gate = validateModeSelection(list, "FREE_CLOUD");
    expect(gate.ok).toBe(false);
    expect(gate.message).toContain("Free Cloud is currently unavailable");
    // The chosen mode is still Free Cloud — nothing was switched silently.
    expect(find(list, "PAID_CLOUD").selected).toBe(false);
  });

  it("labels the generate button after the chosen mode", () => {
    expect(generateButtonLabel("BROWSER")).toBe("Generate Preview");
    expect(generateButtonLabel("LOCAL")).toBe("Generate with Computer");
    expect(generateButtonLabel("FREE_CLOUD")).toBe("Generate with Free Cloud");
    expect(generateButtonLabel("PAID_CLOUD")).toBe("Generate Paid Video");
  });

  it("keeps a per-video paid confirmation message", () => {
    expect(PAID_GENERATION_CONFIRMATION).toContain("may incur usage charges");
  });

  it("summarises the selected mode and its cost protection", () => {
    const free = generationSummary({
      cards: cards({ selected: "BROWSER" }),
      selected: "BROWSER",
      paidComputeEnabled: false,
    });
    expect(free.modeLine).toBe("Selected generation mode: Browser Preview");
    expect(free.costLine).toBe("Cost protection: £0");

    const paid = generationSummary({
      cards: cards({
        paidComputeEnabled: true,
        paidProviderConfigured: true,
        selected: "PAID_CLOUD",
      }),
      selected: "PAID_CLOUD",
      paidComputeEnabled: true,
    });
    expect(paid.modeLine).toBe("Selected generation mode: Paid Cloud");
    expect(paid.paidLine).toBe("Paid Cloud: ENABLED");
    expect(paid.costLine).toBe("Cost protection: Confirmation required");
  });

  it("refuses to generate when no mode has been chosen", () => {
    expect(validateModeSelection(cards(), null).ok).toBe(false);
  });
});

describe("hosted paid video route", () => {
  it("adds no paid route when the provider is not configured", () => {
    const list = withHostedPaidCloud([worker("BROWSER")], { providerConfigured: false });
    expect(list.some((entry) => entry.mode === "PAID_CLOUD")).toBe(false);
  });

  it("adds a chargeable paid route with no registry row when configured", () => {
    const list = withHostedPaidCloud([worker("BROWSER")], {
      providerConfigured: true,
      provider: "EarnRoom video service",
    });
    const paid = list.find((entry) => entry.mode === "PAID_CLOUD")!;
    expect(paid.id).toBeNull();
    expect(paid.chargeable).toBe(true);
    expect(paid.status).toBe("IDLE");
  });

  it("never replaces a registered paid worker", () => {
    const registered = worker("PAID_CLOUD");
    const list = withHostedPaidCloud([registered], { providerConfigured: true });
    expect(list.filter((entry) => entry.mode === "PAID_CLOUD")).toHaveLength(1);
    expect(list[0]!.id).toBe("PAID_CLOUD-1");
  });
});
