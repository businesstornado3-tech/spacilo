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
