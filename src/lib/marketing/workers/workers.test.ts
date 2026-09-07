/**
 * Video worker orchestration — decision tests.
 *
 * These prove the rules that protect the founder: no automatic paid
 * generation, no invented hardware, no estimate dressed up as a charge.
 */
import { describe, expect, it } from "vitest";

import { browserCapability, type BrowserProbe } from "./browser-capability";
import { checkSpend, costReport, DEFAULT_SPEND_CAPS } from "./cost";
import { capabilityClass, normaliseHardware } from "./hardware";
import { mayMoveTo } from "./lifecycle";
import { moodForObjective, selectMusic, selectVoice, mayUseAsset } from "./media";
import { selectWorker, NO_FREE_WORKER_MESSAGE } from "./selection";
import { applyWorkerPreferences, readWorkerPreferences } from "./settings";
import type { GenerationRequest, WorkerDescriptor } from "./types";

const request: GenerationRequest = {
  seconds: 8,
  resolution: "720p",
  aspect: "9:16",
  voice: false,
  music: true,
};

function worker(overrides: Partial<WorkerDescriptor> & Pick<WorkerDescriptor, "mode">): WorkerDescriptor {
  return {
    id: null,
    label: overrides.mode,
    status: "IDLE",
    detail: "Ready.",
    capability: "HIGH",
    hardware: null,
    provider: null,
    installedModels: [],
    enabled: true,
    chargeable: overrides.mode === "PAID_CLOUD",
    queued: 0,
    lastHeartbeatAt: null,
    ...overrides,
  };
}

describe("hardware capability", () => {
  it("never counts shared graphics memory as dedicated memory", () => {
    const profile = normaliseHardware({ dedicatedVramGb: 0, sharedGpuMemoryGb: 16, ramGb: 32 });
    expect(profile.dedicatedVramGb).toBeNull();
    expect(profile.sharedMemoryOnly).toBe(true);
    expect(profile.capability).toBe("LIMITED");
  });

  it("classifies deterministically by dedicated memory", () => {
    expect(capabilityClass({ dedicatedVramGb: 24, ramGb: 64, accelerator: null }).capability).toBe("VERY_HIGH");
    expect(capabilityClass({ dedicatedVramGb: 12, ramGb: 32, accelerator: null }).capability).toBe("HIGH");
    expect(capabilityClass({ dedicatedVramGb: 8, ramGb: 16, accelerator: null }).capability).toBe("MEDIUM");
    expect(capabilityClass({ dedicatedVramGb: 2, ramGb: 8, accelerator: null }).capability).toBe("LIMITED");
  });

  it("does not invent values it was not given", () => {
    const profile = normaliseHardware({});
    expect(profile.gpuModel).toBeNull();
    expect(profile.dedicatedVramGb).toBeNull();
  });
});

describe("browser capability", () => {
  const probe: BrowserProbe = {
    browser: "Chrome",
    webgpu: true,
    gpuAdapter: null,
    approximateMemoryGb: 8,
    hardwareConcurrency: 8,
    codecs: ["video/mp4; codecs=avc1.42001f"],
    webCodecs: true,
    offscreenCanvas: true,
    workers: true,
  };

  it("reports SUPPORTED for a capable browser and never claims graphics memory", () => {
    const result = browserCapability(probe);
    expect(result.status).toBe("SUPPORTED");
    expect(result.vramClaim).toBeNull();
  });

  it("reports LIMITED without acceleration", () => {
    expect(browserCapability({ ...probe, webgpu: false }).status).toBe("LIMITED");
  });

  it("reports UNSUPPORTED without in-page encoding", () => {
    expect(browserCapability({ ...probe, webCodecs: false }).status).toBe("UNSUPPORTED");
  });
});

describe("worker selection", () => {
  it("prefers the browser when everything is available", () => {
    const result = selectWorker({
      preference: "AUTO",
      workers: [worker({ mode: "BROWSER" }), worker({ mode: "LOCAL" })],
      request,
      paidComputeEnabled: false,
    });
    expect(result.ok && result.worker.mode).toBe("BROWSER");
  });

  it("never reaches paid compute automatically", () => {
    const result = selectWorker({
      preference: "AUTO",
      workers: [worker({ mode: "PAID_CLOUD", enabled: true })],
      request,
      paidComputeEnabled: true,
      confirmedPaid: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe(NO_FREE_WORKER_MESSAGE);
  });

  it("refuses paid compute when it is switched off", () => {
    const result = selectWorker({
      preference: "PAID_CLOUD",
      workers: [worker({ mode: "PAID_CLOUD" })],
      request,
      paidComputeEnabled: false,
      confirmedPaid: true,
    });
    expect(result.ok).toBe(false);
  });

  it("requires explicit confirmation for a paid generation", () => {
    const result = selectWorker({
      preference: "PAID_CLOUD",
      workers: [worker({ mode: "PAID_CLOUD" })],
      request,
      paidComputeEnabled: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe("PAID_CONFIRMATION_REQUIRED");
  });

  it("says the free worker is out of allowance rather than upgrading", () => {
    const result = selectWorker({
      preference: "AUTO",
      workers: [worker({ mode: "FREE_CLOUD", status: "QUOTA_EXHAUSTED" }), worker({ mode: "PAID_CLOUD" })],
      request,
      paidComputeEnabled: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe(NO_FREE_WORKER_MESSAGE);
  });

  it("skips the browser when a voiceover is required", () => {
    const result = selectWorker({
      preference: "AUTO",
      workers: [worker({ mode: "BROWSER" }), worker({ mode: "LOCAL" })],
      request: { ...request, voice: true },
      paidComputeEnabled: false,
    });
    expect(result.ok && result.worker.mode).toBe("LOCAL");
  });

  it("does not substitute another worker for an explicit choice", () => {
    const result = selectWorker({
      preference: "LOCAL",
      workers: [worker({ mode: "BROWSER" }), worker({ mode: "LOCAL", status: "OFFLINE" })],
      request,
      paidComputeEnabled: false,
    });
    expect(result.ok).toBe(false);
  });
});

describe("cost transparency", () => {
  it("claims £0 only where no third party runs the compute", () => {
    const local = costReport({ mode: "LOCAL", resolution: "720p", seconds: 8 });
    expect(local.pence).toBe(0);
    expect(local.source).toBe("NO_THIRD_PARTY");
    expect(local.line).toContain("£0");
  });

  it("labels an internal estimate as an estimate", () => {
    const paid = costReport({ mode: "PAID_CLOUD", resolution: "720p", seconds: 8 });
    expect(paid.source).toBe("INTERNAL_ESTIMATE");
    expect(paid.line).toContain("not a confirmed charge");
  });

  it("labels a provider-reported charge as confirmed", () => {
    const paid = costReport({
      mode: "PAID_CLOUD",
      resolution: "720p",
      seconds: 8,
      confirmedPence: 180,
    });
    expect(paid.source).toBe("PROVIDER_CONFIRMED");
    expect(paid.pence).toBe(180);
  });

  it("keeps infrastructure cost apart from a provider fee", () => {
    const report = costReport({
      mode: "LOCAL",
      resolution: "720p",
      seconds: 8,
      infrastructurePencePerGpuMinute: 30,
      gpuMinutes: 4,
    });
    expect(report.pence).toBe(0);
    expect(report.infrastructurePence).toBe(120);
  });

  it("blocks a paid generation above the per-video cap", () => {
    const report = costReport({ mode: "PAID_CLOUD", resolution: "720p", seconds: 8, confirmedPence: 900 });
    const decision = checkSpend(report, { spentTodayPence: 0, spentThisCampaignPence: 0, spentThisMonthPence: 0 }, DEFAULT_SPEND_CAPS);
    expect(decision.allowed).toBe(false);
  });

  it("blocks a paid generation that would break the daily cap", () => {
    const report = costReport({ mode: "PAID_CLOUD", resolution: "720p", seconds: 8, confirmedPence: 150 });
    const decision = checkSpend(report, { spentTodayPence: 450, spentThisCampaignPence: 0, spentThisMonthPence: 0 }, DEFAULT_SPEND_CAPS);
    expect(decision.allowed).toBe(false);
  });

  it("never blocks a free generation", () => {
    const report = costReport({ mode: "BROWSER", resolution: "720p", seconds: 8 });
    expect(checkSpend(report, { spentTodayPence: 9999, spentThisCampaignPence: 9999, spentThisMonthPence: 9999 }, DEFAULT_SPEND_CAPS).allowed).toBe(true);
  });
});

describe("voice and audio", () => {
  it("uses a British English voice from the worker's own installation", () => {
    const result = selectVoice({ available: ["local-open-tts"], gender: "female" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.voice.locale).toBe("en-GB");
      expect(result.adapter.chargeable).toBe(false);
    }
  });

  it("fails honestly rather than silently paying for a voice", () => {
    const result = selectVoice({ available: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe("VOICE_UNAVAILABLE");
  });

  it("only uses music with a known licence", () => {
    expect(mayUseAsset({ id: "x", title: "Unknown", licenceClass: null, licence: null, source: null, attribution: null }).allowed).toBe(false);
  });

  it("selects an open-licensed bed and records its provenance", () => {
    const result = selectMusic({ mood: "reassuring", seconds: 20, available: ["bed-open-air"] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.track.licenceClass).toBe("OPEN_LICENSED_ASSET");
  });

  it("reports when no music is installed", () => {
    expect(selectMusic({ mood: "family", seconds: 10, available: [] }).ok).toBe(false);
  });

  it("maps objectives to a mood deterministically", () => {
    expect(moodForObjective("Host earnings in Portsmouth")).toBe("business");
    expect(moodForObjective("Moving home")).toBe("family");
  });
});

describe("job lifecycle", () => {
  it("allows the normal generation path", () => {
    expect(mayMoveTo("CREATED", "QUEUED")).toBe(true);
    expect(mayMoveTo("QUEUED", "WORKER_SELECTED")).toBe(true);
  });

  it("never publishes without leaving the approval path", () => {
    expect(mayMoveTo("READY_FOR_PREVIEW", "PUBLISHED")).toBe(false);
  });

  it("treats a published video as final", () => {
    expect(mayMoveTo("PUBLISHED", "QUEUED")).toBe(false);
  });
});

describe("founder settings", () => {
  it("defaults paid compute to off", () => {
    const prefs = readWorkerPreferences({});
    expect(prefs.paidComputeEnabled).toBe(false);
    expect(prefs.defaultWorker).toBe("AUTO");
  });

  it("refuses to leave a paid default armed when paid compute is off", () => {
    const prefs = readWorkerPreferences({ videoWorker: { defaultWorker: "PAID_CLOUD" } });
    expect(prefs.defaultWorker).toBe("AUTO");
  });

  it("drops the paid default when paid compute is switched off again", () => {
    const on = applyWorkerPreferences(readWorkerPreferences({}), {
      paidComputeEnabled: true,
      defaultWorker: "PAID_CLOUD",
    });
    expect(on.defaultWorker).toBe("PAID_CLOUD");
    const off = applyWorkerPreferences(on, { paidComputeEnabled: false });
    expect(off.defaultWorker).toBe("AUTO");
  });

  it("keeps limits inside sane bounds", () => {
    const prefs = readWorkerPreferences({ videoWorker: { usage: { maxVideosPerDay: 9999 } } });
    expect(prefs.usage.maxVideosPerDay).toBe(50);
  });
});
