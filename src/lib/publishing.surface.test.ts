/**
 * Connection versus publishing capability, and the runtime-safe transport.
 *
 * These cover the exact defects found in the audit: a detached `fetch` that
 * never left the worker, silent transport failures, and Shorts being treated
 * as a second, disconnected account.
 */
import { describe, expect, it, vi } from "vitest";

import { instagramTransportDetail } from "@/lib/marketing/instagram-login";
import { metaTransportDetail } from "@/lib/marketing/meta";
import { platformStateFrom } from "@/lib/publishing.functions";
import { runtimeFetch } from "@/lib/marketing/runtime-fetch";

const connected = { connection: "CONNECTED", account_id: "abc", account_label: "EarnRoom" };

describe("runtime fetch", () => {
  it("calls the global fetch with the global scope as its receiver", async () => {
    const seen: unknown[] = [];
    const original = globalThis.fetch;
    const spy = vi.fn(function (this: unknown, input: unknown) {
      seen.push(this);
      return Promise.resolve(new Response("{}"));
    });
    globalThis.fetch = spy as unknown as typeof fetch;
    try {
      await runtimeFetch("https://example.test/");
      expect(spy).toHaveBeenCalledTimes(1);
      expect(seen[0]).toBe(globalThis);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("still works when passed around as a bare value, like an adapter does", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(function (this: unknown) {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
      return Promise.resolve(new Response("{}"));
    }) as unknown as typeof fetch;
    try {
      const injected: typeof fetch = runtimeFetch;
      await expect(injected("https://example.test/")).resolves.toBeInstanceOf(Response);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("transport diagnostics", () => {
  it("names the stage and keeps the real runtime reason for Instagram", () => {
    const detail = instagramTransportDetail(
      "CREATE_REEL_CONTAINER",
      new TypeError("Illegal invocation: function called with incorrect `this` reference"),
    );
    expect(detail).toContain("CREATE_REEL_CONTAINER");
    expect(detail).toContain("Illegal invocation");
    expect(detail).toContain("never received it");
  });

  it("names the stage and keeps the real runtime reason for Meta", () => {
    const detail = metaTransportDetail("FACEBOOK_PAGE_VIDEO", new Error("network failure"));
    expect(detail).toContain("FACEBOOK_PAGE_VIDEO");
    expect(detail).toContain("network failure");
  });

  it("never invents a reason when the runtime gave none", () => {
    expect(instagramTransportDetail("MEDIA_PUBLISH", null)).toContain("no error detail");
  });
});

describe("connection versus publishing capability", () => {
  it("does not report a connected account as ready when nothing is authorised", () => {
    const state = platformStateFrom({
      platform: "youtube",
      connectionRow: connected,
      hasToken: false,
      paused: false,
    });
    expect(state.connected).toBe(true);
    expect(state.capability).toBe("AUTHORIZATION_REQUIRED");
    expect(state.canPublish).toBe(false);
  });

  it("reports setup required when connected without a destination", () => {
    const state = platformStateFrom({
      platform: "facebook",
      connectionRow: { connection: "CONNECTED", account_id: null, account_label: null },
      hasToken: true,
      paused: false,
    });
    expect(state.capability).toBe("SETUP_REQUIRED");
    expect(state.canPublish).toBe(false);
  });

  it("reports paused separately from connection", () => {
    const state = platformStateFrom({
      platform: "instagram",
      connectionRow: connected,
      hasToken: true,
      paused: true,
    });
    expect(state.connected).toBe(true);
    expect(state.capability).toBe("PAUSED");
    expect(state.canPublish).toBe(false);
  });

  it("is ready only when connected, authorised, addressed and unpaused", () => {
    const state = platformStateFrom({
      platform: "youtube",
      connectionRow: connected,
      hasToken: true,
      paused: false,
    });
    expect(state.capability).toBe("READY");
    expect(state.canPublish).toBe(true);
    expect(state.supportsVisibility).toBe(true);
  });

  it("treats Shorts as the same YouTube channel, never a second sign-in", () => {
    const ready = platformStateFrom({
      platform: "youtube_shorts",
      connectionRow: connected,
      hasToken: true,
      paused: false,
    });
    expect(ready.sharesConnectionWith).toBe("youtube");
    expect(ready.canPublish).toBe(true);

    const missing = platformStateFrom({
      platform: "youtube_shorts",
      connectionRow: null,
      hasToken: false,
      paused: false,
    });
    expect(missing.capabilityDetail).toContain("connected YouTube channel");
    expect(missing.capabilityDetail).not.toContain("Connect YouTube Shorts");
  });

  it("offers a visibility choice only where the platform has one", () => {
    for (const platform of ["instagram", "facebook"] as const) {
      const state = platformStateFrom({
        platform,
        connectionRow: connected,
        hasToken: true,
        paused: false,
      });
      expect(state.supportsVisibility).toBe(false);
    }
  });
});

describe("YouTube upload path", () => {
  it("uploads with the requested visibility and only confirms with a real video id", async () => {
    const { adapterFor } = await import("@/lib/marketing/adapters");
    const { defaultMarketingSettings } = await import("@/lib/marketing/platforms");
    const seen: { body: unknown; url: string }[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      seen.push({ url, body: init?.body ?? null });
      if (url.includes("uploadType=resumable")) {
        return new Response("{}", {
          status: 200,
          headers: { location: "https://upload.test/session" },
        });
      }
      if (url === "https://upload.test/session") {
        return new Response(JSON.stringify({ id: "VID123" }), { status: 200 });
      }
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }) as unknown as typeof fetch;

    const settings = defaultMarketingSettings();
    const adapter = adapterFor("youtube_shorts", {
      connection: {
        platform: "youtube_shorts",
        connection: "CONNECTED",
        scopes: [],
        expiresAt: null,
        lastError: null,
      },
      accessToken: "token",
      accountId: "UC123",
      settings,
      connections: [
        {
          platform: "youtube_shorts",
          connection: "CONNECTED",
          scopes: [],
          expiresAt: null,
          lastError: null,
        },
      ],
      now: 1,
      fetchImpl,
      youtubePrivacy: "public",
    });

    const asset = {
      id: "a1",
      platform: "youtube_shorts",
      aspect: "9:16",
      hook: "",
      title: "EarnRoom",
      description: "Make space earn.",
      caption: "",
      hashtags: [],
      cta: "",
      seconds: 10,
      state: "QUEUED",
      videoUrl: "https://media.test/final-branded.mp4",
      thumbnailUrl: null,
    } as never;

    const result = await adapter.publish(asset, { id: "c1", assets: [] } as never);
    expect(result.ok).toBe(true);
    const start = seen.find((entry) => entry.url.includes("uploadType=resumable"));
    expect(String(start?.body)).toContain('"privacyStatus":"public"');
    if (result.ok) expect(result.platformPostId).toBe("VID123");
  });

  it("never confirms a publication when YouTube returns no video id", async () => {
    const { publishYoutubeVideo } = await import("@/lib/marketing/youtube");
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("uploadType=resumable")) {
        return new Response("{}", { status: 200, headers: { location: "https://upload.test/s" } });
      }
      if (url === "https://upload.test/s") return new Response("{}", { status: 200 });
      return new Response(new Uint8Array([1]), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await publishYoutubeVideo({
      fetchImpl,
      accessToken: "t",
      videoUrl: "https://media.test/f.mp4",
      title: "t",
      description: "d",
      tags: [],
      privacyStatus: "unlisted",
      now: 1,
    });
    expect(result.ok).toBe(false);
  });

  it("reads the real visibility back from YouTube rather than trusting the request", async () => {
    const { fetchYoutubeVideoStatus } = await import("@/lib/marketing/youtube");
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ items: [{ status: { privacyStatus: "private" } }] }), {
        status: 200,
      })) as unknown as typeof fetch;
    const status = await fetchYoutubeVideoStatus(fetchImpl, "t", "VID123");
    expect(status.privacyStatus).toBe("private");
  });
});
