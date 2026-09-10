import { describe, expect, it, vi } from "vitest";

import { fetchYoutubeChannels, publishYoutubeVideo, youtubeAuthFailureDetail } from "./youtube";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

describe("fetchYoutubeChannels", () => {
  it("returns the channels YouTube actually reports", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        items: [{ id: "UC123", snippet: { title: "EarnRoom", customUrl: "@earnroom" } }],
      }),
    ) as unknown as typeof fetch;

    const result = await fetchYoutubeChannels(fetchImpl, "token");

    expect(result.ok).toBe(true);
    expect(result.channels).toEqual([{ id: "UC123", title: "EarnRoom", handle: "@earnroom" }]);
  });

  it("reports no channels rather than inventing one", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { items: [] }),
    ) as unknown as typeof fetch;

    const result = await fetchYoutubeChannels(fetchImpl, "token");

    expect(result.ok).toBe(false);
    expect(result.channels).toEqual([]);
    expect(result.detail).toContain("no channel");
  });

  it("explains a disabled YouTube Data API without asking for a reconnect", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(403, { error: { errors: [{ reason: "accessNotConfigured" }] } }),
    ) as unknown as typeof fetch;

    const result = await fetchYoutubeChannels(fetchImpl, "token");

    expect(result.ok).toBe(false);
    expect(result.detail).toContain("YouTube Data API");
  });

  it("asks for a reconnect when the authorisation is rejected", () => {
    expect(youtubeAuthFailureDetail(401, {})).toContain("Reconnect");
  });
});

describe("publishYoutubeVideo", () => {
  const base = {
    accessToken: "token",
    videoUrl: "https://signed.example/video.mp4",
    title: "A room in Leeds",
    description: "Earn from your spare room.",
    tags: ["earnroom"],
    privacyStatus: "unlisted" as const,
    now: 1_700_000_000_000,
  };

  it("sends the real file bytes and confirms only with a returned video id", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: any, init?: any) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.startsWith("https://signed.example")) {
        return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
      }
      if (url.includes("uploadType=resumable")) {
        return jsonResponse(200, {}, { location: "https://upload.example/session" });
      }
      expect(init?.method).toBe("PUT");
      return jsonResponse(200, { id: "vid_9" });
    }) as unknown as typeof fetch;

    const result = await publishYoutubeVideo({ ...base, fetchImpl });

    expect(result).toMatchObject({
      ok: true,
      platformPostId: "vid_9",
      platformUrl: "https://www.youtube.com/watch?v=vid_9",
    });
    expect(calls.some((call) => call.startsWith("PUT https://upload.example/session"))).toBe(true);
  });

  it("never confirms a publication when only the session was opened", async () => {
    const fetchImpl = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.startsWith("https://signed.example")) {
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      }
      if (url.includes("uploadType=resumable")) {
        return jsonResponse(200, {}, { location: "https://upload.example/session" });
      }
      return jsonResponse(200, {});
    }) as unknown as typeof fetch;

    const result = await publishYoutubeVideo({ ...base, fetchImpl });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ state: "PLATFORM_REJECTED" });
  });

  it("fails clearly when the rendered file cannot be read", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("", { status: 404 }),
    ) as unknown as typeof fetch;

    const result = await publishYoutubeVideo({ ...base, fetchImpl });

    expect(result).toMatchObject({ ok: false, state: "UPLOAD_FAILED", retryable: true });
  });

  it("reports an expired authorisation as needing reconnection", async () => {
    const fetchImpl = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.startsWith("https://signed.example")) {
        return new Response(new Uint8Array([1]), { status: 200 });
      }
      return jsonResponse(401, { error: { errors: [{ reason: "authError" }] } });
    }) as unknown as typeof fetch;

    const result = await publishYoutubeVideo({ ...base, fetchImpl });

    expect(result).toMatchObject({ ok: false, state: "AUTH_REQUIRED" });
  });
});
