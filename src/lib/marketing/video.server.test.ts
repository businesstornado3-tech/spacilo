import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createVideoJob, pollVideoJob, videoProviderConfiguration } from "./video.server";

const KEY = "LOVABLE_API_KEY";
const original = process.env[KEY];

afterEach(() => {
  if (original === undefined) delete process.env[KEY];
  else process.env[KEY] = original;
  vi.restoreAllMocks();
});

describe("video generation service", () => {
  it("reports honestly when no provider credential is configured", async () => {
    delete process.env[KEY];
    const config = videoProviderConfiguration();
    expect(config.state).toBe("NOT_CONFIGURED");
    expect(config.detail).toMatch(/requires configuration/i);

    const job = await createVideoJob({
      prompt: "p",
      aspect: "9:16",
      seconds: 8,
      resolution: "360p",
    });
    expect(job.ok).toBe(false);
    if (!job.ok) expect(job.status).toBe("PROVIDER_NOT_CONFIGURED");
  });

  describe("with a configured provider", () => {
    beforeEach(() => {
      process.env[KEY] = "test-key";
    });

    it("creates a real job and returns the provider's job id", async () => {
      const fetchImpl = vi.fn(
        async () => new Response(JSON.stringify({ id: "video_abc" }), { status: 200 }),
      ) as unknown as typeof fetch;
      const job = await createVideoJob({
        prompt: "A 15-second film",
        aspect: "9:16",
        seconds: 15,
        resolution: "720p",
        fetchImpl,
      });
      expect(job.ok).toBe(true);
      if (job.ok) expect(job.jobId).toBe("video_abc");
    });

    it("never invents a job id when the service returns none", async () => {
      const fetchImpl = vi.fn(
        async () => new Response(JSON.stringify({}), { status: 200 }),
      ) as unknown as typeof fetch;
      const job = await createVideoJob({
        prompt: "p",
        aspect: "9:16",
        seconds: 8,
        resolution: "360p",
        fetchImpl,
      });
      expect(job.ok).toBe(false);
    });

    it("treats credit and rate limits as a limit, not a generic failure", async () => {
      const fetchImpl = vi.fn(
        async () => new Response(JSON.stringify({ message: "Out of credits" }), { status: 402 }),
      ) as unknown as typeof fetch;
      const job = await createVideoJob({
        prompt: "p",
        aspect: "9:16",
        seconds: 8,
        resolution: "360p",
        fetchImpl,
      });
      expect(job.ok).toBe(false);
      if (!job.ok) {
        expect(job.status).toBe("LIMIT_REACHED");
        expect(job.reason).toBe("Out of credits");
      }
    });

    it("keeps a job in progress until the service says it completed", async () => {
      const fetchImpl = vi.fn(
        async () =>
          new Response(JSON.stringify({ status: "in_progress", progress: 40 }), { status: 200 }),
      ) as unknown as typeof fetch;
      const poll = await pollVideoJob("video_abc", fetchImpl);
      expect(poll.ok).toBe(true);
      if (poll.ok) expect(poll.done).toBe(false);
    });

    it("surfaces a failed generation instead of reporting a video", async () => {
      const fetchImpl = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              status: "failed",
              error: { code: "moderation_blocked", message: "Blocked by safety filters." },
            }),
            { status: 200 },
          ),
      ) as unknown as typeof fetch;
      const poll = await pollVideoJob("video_abc", fetchImpl);
      expect(poll.ok).toBe(false);
      if (!poll.ok) expect(poll.reason).toMatch(/safety/i);
    });
  });
});
