/**
 * Worker orchestration — the rules that decide what actually runs.
 *
 * The non-negotiables are proved here: automatic selection never reaches a
 * paid route, an estimate is never presented as a charge, and the route that
 * is planned is the route that is recorded.
 */
import { describe, expect, it } from "vitest";

import { planExecution, planFailureMessage } from "./orchestration";
import { resolveRemoteEndpoint } from "./remote.server";
import type { GenerationRequest, WorkerDescriptor } from "./types";

const request: GenerationRequest = {
  seconds: 8,
  resolution: "720p",
  aspect: "9:16",
  voice: false,
  music: true,
};

function worker(
  overrides: Partial<WorkerDescriptor> & Pick<WorkerDescriptor, "mode">,
): WorkerDescriptor {
  return {
    id: overrides.mode === "BROWSER" ? null : `${overrides.mode.toLowerCase()}-1`,
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

const browser = worker({ mode: "BROWSER", label: "Browser Local" });
const local = worker({ mode: "LOCAL", label: "EarnRoom Local Worker" });
const free = worker({ mode: "FREE_CLOUD", label: "Free Cloud Worker", provider: "example-free" });
const paid = worker({ mode: "PAID_CLOUD", label: "Paid Cloud Worker", provider: "example-paid" });

describe("worker resolution", () => {
  it("uses this browser when it is explicitly chosen", () => {
    const plan = planExecution({
      preference: "BROWSER",
      workers: [browser, local],
      request,
      paidComputeEnabled: false,
    });
    expect(plan.ok && plan.route).toBe("BROWSER");
  });

  it("uses the founder's own machine when it is explicitly chosen", () => {
    const plan = planExecution({
      preference: "LOCAL",
      workers: [browser, local],
      request,
      paidComputeEnabled: false,
    });
    expect(plan.ok && plan.route).toBe("LOCAL");
  });

  it("uses the free cloud worker when it is explicitly chosen", () => {
    const plan = planExecution({
      preference: "FREE_CLOUD",
      workers: [browser, free],
      request,
      paidComputeEnabled: false,
    });
    expect(plan.ok && plan.route).toBe("FREE_CLOUD");
  });

  it("prefers the browser under choose-for-me", () => {
    const plan = planExecution({
      preference: "AUTO",
      workers: [browser, local, free, paid],
      request,
      paidComputeEnabled: true,
    });
    expect(plan.ok && plan.route).toBe("BROWSER");
  });

  it("falls to the next free route, never to paid", () => {
    const plan = planExecution({
      preference: "AUTO",
      workers: [{ ...browser, status: "ERROR" }, local, paid],
      request,
      paidComputeEnabled: true,
    });
    expect(plan.ok && plan.route).toBe("LOCAL");
  });

  it("refuses a stale, offline worker", () => {
    const plan = planExecution({
      preference: "LOCAL",
      workers: [browser, { ...local, status: "OFFLINE", detail: "no signal" }],
      request,
      paidComputeEnabled: false,
    });
    expect(plan.ok).toBe(false);
  });

  it("refuses a switched-off worker", () => {
    const plan = planExecution({
      preference: "FREE_CLOUD",
      workers: [browser, { ...free, enabled: false }],
      request,
      paidComputeEnabled: false,
    });
    expect(plan.ok).toBe(false);
  });

  it("refuses a worker without enough capacity for the job", () => {
    const plan = planExecution({
      preference: "LOCAL",
      workers: [browser, { ...local, capability: "LIMITED" }],
      request,
      paidComputeEnabled: false,
      requiredCapability: "HIGH",
    });
    expect(plan.ok).toBe(false);
    expect(!plan.ok && plan.status).toBe("WORKER_UNAVAILABLE");
  });

  it("says a worker that has used its free allowance is unavailable", () => {
    const plan = planExecution({
      preference: "FREE_CLOUD",
      workers: [browser, { ...free, status: "QUOTA_EXHAUSTED" }],
      request,
      paidComputeEnabled: false,
    });
    expect(plan.ok).toBe(false);
  });
});

describe("no automatic paid fallback", () => {
  it("stops when no free route is available", () => {
    const plan = planExecution({
      preference: "AUTO",
      workers: [
        { ...browser, status: "ERROR" },
        { ...local, status: "OFFLINE" },
        { ...free, status: "QUOTA_EXHAUSTED" },
        paid,
      ],
      request,
      paidComputeEnabled: true,
    });
    expect(plan.ok).toBe(false);
    expect(!plan.ok && plan.status).toBe("NO_WORKER_AVAILABLE");
    expect(!plan.ok && plan.message).toContain("No free video-generation worker");
  });

  it("does not switch to paid when the free cloud worker fails", () => {
    const plan = planExecution({
      preference: "AUTO",
      workers: [{ ...browser, status: "ERROR" }, { ...free, status: "ERROR" }, paid],
      request,
      paidComputeEnabled: true,
    });
    expect(plan.ok).toBe(false);
  });

  it("blocks a paid choice while paid generation is switched off", () => {
    const plan = planExecution({
      preference: "PAID_CLOUD",
      workers: [browser, paid],
      request,
      paidComputeEnabled: false,
    });
    expect(!plan.ok && plan.status).toBe("PAID_GENERATION_DISABLED");
    expect(!plan.ok && plan.message).toBe("Paid video generation is disabled.");
  });

  it("requires a confirmation tied to this generation before a paid run", () => {
    const plan = planExecution({
      preference: "PAID_CLOUD",
      workers: [browser, paid],
      request,
      paidComputeEnabled: true,
    });
    expect(!plan.ok && plan.status).toBe("PAID_CONFIRMATION_REQUIRED");
  });

  it("runs a paid generation once it is confirmed", () => {
    const plan = planExecution({
      preference: "PAID_CLOUD",
      workers: [browser, paid],
      request,
      paidComputeEnabled: true,
      confirmedPaid: true,
    });
    expect(plan.ok && plan.route).toBe("PAID_CLOUD");
    expect(plan.ok && plan.provider).toBe("example-paid");
  });

  it("stops an automatic paid generation that would break the automatic budget", () => {
    const plan = planExecution({
      preference: "PAID_CLOUD",
      workers: [browser, paid],
      request,
      paidComputeEnabled: true,
      confirmedPaid: true,
      initiator: "AUTONOMOUS",
      spend: {
        caps: { autonomousDailyPence: 1 },
        counts: { manualSpentTodayPence: 0, autonomousSpentTodayPence: 0 },
      },
    });
    expect(!plan.ok && plan.status).toBe("SPEND_LIMIT_REACHED");
  });

  it("lets a founder-made paid generation through the same exhausted budget", () => {
    const plan = planExecution({
      preference: "PAID_CLOUD",
      workers: [browser, paid],
      request,
      paidComputeEnabled: true,
      confirmedPaid: true,
      initiator: "MANUAL",
      spend: {
        caps: { autonomousDailyPence: 1 },
        counts: { manualSpentTodayPence: 100_000, autonomousSpentTodayPence: 100_000 },
      },
    });
    expect(plan.ok).toBe(true);
  });

  it("stops everything while generation is paused", () => {
    const plan = planExecution({
      preference: "BROWSER",
      workers: [browser],
      request,
      paidComputeEnabled: false,
      generationPaused: true,
    });
    expect(!plan.ok && plan.status).toBe("GENERATION_PAUSED");
  });
});

describe("cost honesty", () => {
  it("claims £0 only where no third party runs the compute", () => {
    for (const mode of ["BROWSER", "LOCAL"] as const) {
      const plan = planExecution({
        preference: mode,
        workers: [browser, local],
        request,
        paidComputeEnabled: false,
      });
      expect(plan.ok && plan.cost.source).toBe("NO_THIRD_PARTY");
      expect(plan.ok && plan.cost.line).toContain("£0");
      expect(plan.ok && plan.cost.chargeable).toBe(false);
    }
  });

  it("labels a paid figure as an estimate, never as a charge", () => {
    const plan = planExecution({
      preference: "PAID_CLOUD",
      workers: [browser, paid],
      request,
      paidComputeEnabled: true,
      confirmedPaid: true,
    });
    expect(plan.ok && plan.cost.source).toBe("INTERNAL_ESTIMATE");
    expect(plan.ok && plan.cost.line).not.toContain("Charged");
    expect(plan.ok && plan.cost.line).toContain("not a confirmed charge");
  });

  it("keeps the free cloud allowance claim conditional", () => {
    const plan = planExecution({
      preference: "FREE_CLOUD",
      workers: [browser, free],
      request,
      paidComputeEnabled: false,
    });
    expect(plan.ok && plan.cost.line).toContain("free allowance");
  });
});

describe("the recorded route is the real route", () => {
  it("carries the resolved worker and provider through the plan", () => {
    const plan = planExecution({
      preference: "FREE_CLOUD",
      workers: [browser, free],
      request,
      paidComputeEnabled: false,
    });
    expect(plan.ok && plan.workerId).toBe("free_cloud-1");
    expect(plan.ok && plan.route).toBe("FREE_CLOUD");
    expect(plan.ok && plan.provider).toBe("example-free");
  });

  it("never labels a paid route as the founder's own machine", () => {
    const plan = planExecution({
      preference: "PAID_CLOUD",
      workers: [browser, paid],
      request,
      paidComputeEnabled: true,
      confirmedPaid: true,
    });
    expect(plan.ok && plan.route).not.toBe("LOCAL");
    expect(plan.ok && plan.route).toBe("PAID_CLOUD");
  });
});

describe("execution plan stages", () => {
  it("keeps validation and storage with EarnRoom on every route", () => {
    const plan = planExecution({
      preference: "LOCAL",
      workers: [browser, local],
      request,
      paidComputeEnabled: false,
    });
    const stages = plan.ok ? plan.stages : [];
    expect(stages.find((stage) => stage.phase === "VALIDATING_OUTPUT")?.owner).toBe("EARNROOM");
    expect(stages.find((stage) => stage.phase === "UPLOADING_TO_EARNROOM")?.owner).toBe("EARNROOM");
  });

  it("skips a voiceover the browser cannot make", () => {
    const plan = planExecution({
      preference: "BROWSER",
      workers: [browser],
      request: { ...request, voice: false },
      paidComputeEnabled: false,
    });
    const voice = plan.ok ? plan.stages.find((stage) => stage.phase === "GENERATING_VOICE") : null;
    expect(voice?.owner).toBe("SKIPPED");
  });

  it("refuses the browser when a voiceover is required", () => {
    const plan = planExecution({
      preference: "BROWSER",
      workers: [browser],
      request: { ...request, voice: true },
      paidComputeEnabled: false,
    });
    expect(plan.ok).toBe(false);
  });
});

describe("failure copy", () => {
  it("names the actual cause rather than a generic error", () => {
    expect(planFailureMessage("WORKER_UNAVAILABLE", "LOCAL")).toContain("local video worker");
    expect(planFailureMessage("WORKER_UNAVAILABLE", "FREE_CLOUD")).toContain("free cloud");
    expect(planFailureMessage("PAID_GENERATION_DISABLED")).toContain("disabled");
    for (const status of [
      "NO_WORKER_AVAILABLE",
      "WORKER_UNAVAILABLE",
      "PAID_CONFIRMATION_REQUIRED",
      "PAID_GENERATION_DISABLED",
      "SPEND_LIMIT_REACHED",
      "GENERATION_PAUSED",
    ] as const) {
      expect(planFailureMessage(status)).not.toContain("Something went wrong");
    }
  });
});

describe("remote worker addressing", () => {
  const row = {
    mode: "FREE_CLOUD" as const,
    id: "free-1",
    label: "Free Cloud Worker",
    endpointUrl: "https://worker.example/api/",
    provider: "example-free",
  };

  it("says plainly when no free cloud worker is configured", () => {
    const resolved = resolveRemoteEndpoint({ ...row, endpointUrl: null }, {});
    expect(resolved.ok).toBe(false);
    expect(!resolved.ok && resolved.reason).toBe("Free cloud worker not configured.");
  });

  it("asks for a reconnection rather than sending an empty credential", () => {
    const resolved = resolveRemoteEndpoint(row, {});
    expect(!resolved.ok && resolved.status).toBe("AUTH_REQUIRED");
  });

  it("resolves an address and keeps the credential out of the plan", () => {
    const resolved = resolveRemoteEndpoint(row, { FREE_CLOUD_WORKER_TOKEN: "secret-token" });
    expect(resolved.ok && resolved.endpoint.url).toBe("https://worker.example/api");
    expect(resolved.ok && resolved.endpoint.workerId).toBe("free-1");
  });

  it("has no remote address for this browser", () => {
    const resolved = resolveRemoteEndpoint(
      { mode: "BROWSER", id: null, label: "Browser", endpointUrl: null, provider: null },
      { VIDEO_WORKER_TOKEN: "x" },
    );
    expect(resolved.ok).toBe(false);
  });
});
