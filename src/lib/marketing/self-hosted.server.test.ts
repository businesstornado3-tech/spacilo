import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createSelfHostedJob, pollSelfHostedJob, workerHealth } from "./self-hosted.server";
import { buildBrandOverlay } from "./branding";
import { probeMp4, validateMedia } from "./media-probe";
import { selfHostedTier, workerConfig } from "./worker-config";
import { generationCost, estimatedGpuMinutes } from "./usage";

const overlay = buildBrandOverlay({
  platform: "tiktok",
  aspect: "9:16",
  seconds: 8,
  tagline: "Earn from the space you already have",
  cta: "See spare space near you",
});

const request = {
  prompt: "A calm UK garage being tidied",
  aspect: "9:16" as const,
  seconds: 8,
  resolution: "360p",
  fps: 16,
  seed: 42,
  overlay,
};

const original = { ...process.env };

beforeEach(() => {
  delete process.env["VIDEO_WORKER_URL"];
  delete process.env["VIDEO_WORKER_TOKEN"];
});
afterEach(() => {
  process.env["VIDEO_WORKER_URL"] = original["VIDEO_WORKER_URL"];
  process.env["VIDEO_WORKER_TOKEN"] = original["VIDEO_WORKER_TOKEN"];
});

function configure() {
  process.env["VIDEO_WORKER_URL"] = "https://worker.internal";
  process.env["VIDEO_WORKER_TOKEN"] = "test-token";
}

describe("self-hosted worker client", () => {
  it("is honest when nothing is configured, and never invents a video", async () => {
    const health = await workerHealth(async () => new Response("{}"));
    expect(health.status).toBe("OFFLINE");
    expect(health.detail).toMatch(/not configured/i);

    const job = await createSelfHostedJob(request);
    expect(job).toMatchObject({ ok: false, status: "SELF_HOSTED_UNAVAILABLE" });
  });

  it("reports worker health without leaking the token to the caller", async () => {
    configure();
    let seenAuth: string | null = null;
    const health = await workerHealth(async (_url, init) => {
      seenAuth = new Headers(init?.headers).get("Authorization");
      return new Response(
        JSON.stringify({ status: "BUSY", running: 1, queued: 2, capacity: 1, model: "wan2.2" }),
        { headers: { "content-type": "application/json" } },
      );
    });
    expect(seenAuth).toBe("Bearer test-token");
    expect(health.status).toBe("BUSY");
    expect(health.running).toBe(1);
    expect(JSON.stringify(health)).not.toContain("test-token");
  });

  it("submits a job with the branding overlay and returns the worker's job id", async () => {
    configure();
    let body: Record<string, unknown> = {};
    const job = await createSelfHostedJob(request, async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ jobId: "job-1", state: "QUEUED" }), {
        headers: { "content-type": "application/json" },
      });
    });
    expect(job).toMatchObject({ ok: true, jobId: "job-1", seed: 42 });
    expect(body["overlay"]).toBeTruthy();
    expect(body["fps"]).toBe(16);
  });

  it("surfaces a worker failure instead of pretending success", async () => {
    configure();
    const poll = await pollSelfHostedJob(
      "job-1",
      async () =>
        new Response(JSON.stringify({ state: "FAILED", reason: "out of memory" }), {
          headers: { "content-type": "application/json" },
        }),
    );
    expect(poll).toEqual({ ok: false, reason: "out of memory" });
  });

  it("downloads the finished file only once the worker reports READY", async () => {
    configure();
    const progress = await pollSelfHostedJob(
      "job-1",
      async () =>
        new Response(JSON.stringify({ state: "GENERATING", progress: 40 }), {
          headers: { "content-type": "application/json" },
        }),
    );
    expect(progress).toMatchObject({ ok: true, done: false, progress: 40 });

    const bytes = new Uint8Array(4096).buffer;
    const done = await pollSelfHostedJob("job-1", async (url) =>
      String(url).endsWith("/output")
        ? new Response(bytes, { headers: { "content-type": "video/mp4" } })
        : new Response(JSON.stringify({ state: "READY" }), {
            headers: { "content-type": "application/json" },
          }),
    );
    expect(done).toMatchObject({ ok: true, done: true, contentType: "video/mp4" });
  });
});

describe("worker configuration and cost", () => {
  it("needs both an address and a token before it counts as configured", () => {
    expect(workerConfig({ VIDEO_WORKER_URL: "https://x" }).configured).toBe(false);
    expect(
      workerConfig({ VIDEO_WORKER_URL: "https://x", VIDEO_WORKER_TOKEN: "t" }).configured,
    ).toBe(true);
  });

  it("uses a cheap draft tier and a full-quality final tier", () => {
    expect(selfHostedTier("draft")).toMatchObject({ resolution: "360p" });
    expect(selfHostedTier("final")).toMatchObject({ resolution: "720p" });
  });

  it("charges nothing for the API on the self-hosted route", () => {
    const cost = generationCost({
      provider: "SELF_HOSTED",
      resolution: "720p",
      seconds: 8,
      infrastructurePencePerGpuMinute: 6,
      gpuMinutes: estimatedGpuMinutes({
        seconds: 8,
        secondsPerOutputSecond: 30,
        resolution: "720p",
      }),
    });
    expect(cost.apiPence).toBe(0);
    expect(cost.apiLabel).toContain("£0");
    expect(cost.infrastructurePence).toBeGreaterThan(0);
  });

  it("shows a real charge for the paid route", () => {
    const cost = generationCost({ provider: "PAID_HOSTED", resolution: "720p", seconds: 8 });
    expect(cost.apiPence).toBe(96);
  });

  it("does not guess infrastructure cost when the GPU price is unknown", () => {
    const cost = generationCost({ provider: "SELF_HOSTED", resolution: "720p", seconds: 8 });
    expect(cost.infrastructurePence).toBeNull();
    expect(cost.infrastructureLabel).toMatch(/unknown/i);
  });
});

describe("finished media is checked, not assumed", () => {
  it("rejects anything that is not a playable video", () => {
    const junk = new Uint8Array([1, 2, 3, 4]).buffer;
    expect(probeMp4(junk).ok).toBe(false);
    expect(validateMedia(junk, { aspect: "9:16", seconds: 8 }).passed).toBe(false);
  });
});

describe("worker failure states", () => {
  it("reports a rejected token as an authentication failure, not merely offline", async () => {
    configure();
    const health = await workerHealth(async () => new Response("nope", { status: 401 }));
    expect(health.status).toBe("AUTH_FAILED");
    expect(health.detail).toMatch(/access token/i);
  });

  it("treats an unreachable worker as offline and never reaches for the paid provider", async () => {
    configure();
    const health = await workerHealth(async () => {
      throw new Error("connect ECONNREFUSED");
    });
    expect(health.status).toBe("OFFLINE");
    const job = await createSelfHostedJob(request, async () => {
      throw new Error("connect ECONNREFUSED");
    });
    expect(job).toMatchObject({ ok: false, status: "SELF_HOSTED_UNAVAILABLE" });
    expect(JSON.stringify(job)).not.toMatch(/paid|gateway/i);
  });

  it("surfaces a cancelled job as a failure with the worker's own reason", async () => {
    configure();
    const poll = await pollSelfHostedJob(
      "wan-1",
      async () =>
        new Response(JSON.stringify({ state: "CANCELLED" }), {
          headers: { "content-type": "application/json" },
        }),
    );
    expect(poll).toMatchObject({ ok: false });
    expect((poll as { reason: string }).reason).toMatch(/cancelled/i);
  });

  it("does not offer a video when the finished file cannot be downloaded", async () => {
    configure();
    const poll = await pollSelfHostedJob("wan-2", async (url) =>
      String(url).endsWith("/output")
        ? new Response("", { status: 500 })
        : new Response(JSON.stringify({ state: "READY" }), {
            headers: { "content-type": "application/json" },
          }),
    );
    expect(poll).toMatchObject({ ok: false });
  });
});
