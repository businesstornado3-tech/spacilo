import { describe, expect, it } from "vitest";

import { admitJob, isTerminal, jobPriority, mayTransition, nextJob } from "./video-queue";
import type { WorkerLimits } from "./worker-config";

const limits: WorkerLimits = {
  maxConcurrentJobs: 1,
  maxJobsPerDay: 3,
  maxVideoSeconds: 10,
  maxQueueLength: 2,
  allowedResolutions: ["360p", "720p"],
};

const request = { seconds: 8, resolution: "720p" };

describe("video queue admission", () => {
  it("starts immediately when the worker is free", () => {
    expect(admitJob({ running: 0, queued: 0, startedToday: 0 }, limits, request)).toMatchObject({
      admit: true,
      state: "GENERATING",
    });
  });

  it("queues rather than dropping work when the worker is busy", () => {
    expect(admitJob({ running: 1, queued: 0, startedToday: 1 }, limits, request)).toMatchObject({
      admit: true,
      state: "QUEUED",
    });
  });

  it("refuses when the queue, the day or the length limit is reached", () => {
    expect(admitJob({ running: 1, queued: 2, startedToday: 1 }, limits, request).admit).toBe(false);
    expect(admitJob({ running: 0, queued: 0, startedToday: 3 }, limits, request).admit).toBe(false);
    expect(
      admitJob({ running: 0, queued: 0, startedToday: 0 }, limits, { seconds: 30, resolution: "720p" })
        .admit,
    ).toBe(false);
    expect(
      admitJob({ running: 0, queued: 0, startedToday: 0 }, limits, { seconds: 8, resolution: "1080p" })
        .admit,
    ).toBe(false);
  });
});

describe("video queue states", () => {
  it("knows which states are finished", () => {
    expect(isTerminal("READY")).toBe(true);
    expect(isTerminal("CANCELLED")).toBe(true);
    expect(isTerminal("GENERATING")).toBe(false);
  });

  it("only allows sensible transitions", () => {
    expect(mayTransition("QUEUED", "GENERATING")).toBe(true);
    expect(mayTransition("READY", "GENERATING")).toBe(false);
  });

  it("runs final quality before drafts, and older before newer", () => {
    const now = 1_000_000;
    expect(jobPriority({ tier: "final", createdAt: now, now })).toBeGreaterThan(
      jobPriority({ tier: "draft", createdAt: now, now }),
    );
    const picked = nextJob(
      [
        { tier: "draft" as const, createdAt: now - 60_000, state: "QUEUED", id: "d" },
        { tier: "final" as const, createdAt: now, state: "QUEUED", id: "f" },
        { tier: "final" as const, createdAt: now, state: "READY", id: "r" },
      ],
      now,
    );
    expect(picked?.id).toBe("f");
    expect(nextJob([], now)).toBeNull();
  });
});
