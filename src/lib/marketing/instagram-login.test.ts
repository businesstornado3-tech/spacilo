/**
 * Instagram API with Instagram Login — official flow.
 *
 * These tests pin the things that must never drift: the authorisation URL and
 * scopes, the Instagram token endpoints, the absence of any Facebook Page
 * dependency, the requirement that only `media_publish` produces a
 * publication, error classification, and token redaction.
 */
import { describe, expect, it, vi } from "vitest";

import { authorizeUrl, oauthDefinition, resolveOAuthCredentials } from "./oauth";
import { adapterFor } from "./adapters";
import { defaultMarketingSettings, type PlatformConnectionRecord } from "./platforms";
import {
  INSTAGRAM_LOGIN_SCOPES,
  exchangeInstagramCode,
  exchangeInstagramLongLivedToken,
  fetchInstagramAccount,
  fetchInstagramMediaInsights,
  instagramErrorState,
  instagramStatusDetail,
  instagramStatusWord,
  publicationStateFor,
  publishInstagramLoginReel,
  sanitiseInstagramError,
} from "./instagram-login";
import type { MarketingCampaign, PlatformAsset } from "./types";

const NOW = Date.UTC(2026, 0, 5);
const REDIRECT = "https://earnroom.co.uk/api/public/marketing/oauth/instagram";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("instagram login oauth definition", () => {
  it("uses Meta's Instagram authorisation endpoint, not Facebook Login", () => {
    const def = oauthDefinition("instagram");
    expect(def.authorizeUrl).toBe("https://www.instagram.com/oauth/authorize");
    expect(def.tokenUrl).toBe("https://api.instagram.com/oauth/access_token");
    expect(def.authorizeUrl).not.toMatch(/facebook\.com/);
  });

  it("requests only the Instagram Login permissions the implementation needs", () => {
    const def = oauthDefinition("instagram");
    expect([...def.scopes]).toEqual([
      "instagram_business_basic",
      "instagram_business_content_publish",
    ]);
    // The obsolete Facebook-Login permission names must be gone.
    for (const gone of [
      "instagram_basic",
      "instagram_content_publish",
      "pages_show_list",
      "business_management",
    ]) {
      expect(def.scopes).not.toContain(gone);
    }
    // Messaging/comment permissions are granted on the app but not requested,
    // because no governed workflow exists for them yet.
    expect(def.scopes).not.toContain("instagram_business_manage_messages");
    expect(def.scopes).not.toContain("instagram_business_manage_comments");
  });

  it("builds an authorisation URL with the exact callback and a comma scope list", () => {
    const url = new URL(
      authorizeUrl({
        platform: "instagram",
        clientId: "app-id",
        redirectUri: REDIRECT,
        state: "one-time-state",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://www.instagram.com/oauth/authorize");
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("one-time-state");
    expect(url.searchParams.get("scope")).toBe(INSTAGRAM_LOGIN_SCOPES.join(","));
    expect(url.toString()).not.toMatch(/client_secret/);
  });

  it("falls back to the Meta app credentials and prefers Instagram-specific ones", () => {
    expect(
      resolveOAuthCredentials("instagram", { META_APP_ID: "m", META_APP_SECRET: "s" }),
    ).toEqual({ clientId: "m", clientSecret: "s", missing: [] });
    expect(
      resolveOAuthCredentials("instagram", {
        META_APP_ID: "m",
        META_APP_SECRET: "s",
        INSTAGRAM_APP_ID: "i",
        INSTAGRAM_APP_SECRET: "x",
      }).clientId,
    ).toBe("i");
    expect(resolveOAuthCredentials("instagram", {}).missing).toEqual([
      "META_APP_ID",
      "META_APP_SECRET",
    ]);
  });
});

describe("instagram token exchange", () => {
  it("exchanges the code at the Instagram token endpoint and reads the account id", async () => {
    const fetchImpl = vi.fn(async () =>
      json({ access_token: "IGQshort", user_id: 17841400000000000, permissions: ["a", "b"] }),
    ) as unknown as typeof fetch;
    const result = await exchangeInstagramCode(fetchImpl, {
      clientId: "app",
      clientSecret: "secret",
      redirectUri: REDIRECT,
      code: "the-code",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.accessToken).toBe("IGQshort");
      expect(result.value.userId).toBe("17841400000000000");
      expect(result.value.permissions).toEqual(["a", "b"]);
    }
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("https://api.instagram.com/oauth/access_token");
    expect(String((init as RequestInit).body)).toContain("grant_type=authorization_code");
  });

  it("reports a refusal without ever leaking a token or secret", async () => {
    const fetchImpl = vi.fn(async () =>
      json({ error_message: "Invalid client_secret=supersecretvalue" }, 400),
    ) as unknown as typeof fetch;
    const result = await exchangeInstagramCode(fetchImpl, {
      clientId: "app",
      clientSecret: "secret",
      redirectUri: REDIRECT,
      code: "bad",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toContain("supersecretvalue");
      expect(result.error).toContain("[redacted]");
    }
  });

  it("swaps the short-lived token for the long-lived one", async () => {
    const fetchImpl = vi.fn(async () =>
      json({ access_token: "IGQlong", expires_in: 5_184_000 }),
    ) as unknown as typeof fetch;
    const result = await exchangeInstagramLongLivedToken(fetchImpl, {
      clientSecret: "secret",
      accessToken: "IGQshort",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.expiresInSeconds).toBe(5_184_000);
    const [url] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(String(url)).toContain("grant_type=ig_exchange_token");
  });
});

describe("instagram account lookup", () => {
  it("reads the professional account from graph.instagram.com with no Page call", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: unknown) => {
      calls.push(String(url));
      return json({ user_id: "178414", username: "businesstornado3", account_type: "BUSINESS" });
    }) as unknown as typeof fetch;
    const result = await fetchInstagramAccount(fetchImpl, "IGQlong");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe("178414");
      expect(result.value.username).toBe("businesstornado3");
    }
    expect(calls[0]).toContain("https://graph.instagram.com/");
    expect(calls.join(" ")).not.toContain("accounts");
    expect(calls.join(" ")).not.toContain("graph.facebook.com");
  });

  it("says the authorisation is rejected rather than inventing an account", async () => {
    const fetchImpl = vi.fn(async () =>
      json({ error: { message: "Invalid OAuth access token", code: 190 } }, 401),
    ) as unknown as typeof fetch;
    const result = await fetchInstagramAccount(fetchImpl, "stale");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.state).toBe("AUTH_REQUIRED");
  });
});

describe("instagram reel publishing", () => {
  const base = {
    instagramAccountId: "178414",
    accessToken: "IGQlong",
    videoUrl: "https://example.com/reel.mp4",
    caption: "Make space earn.",
    now: NOW,
    sleep: async () => {},
    pollIntervalMs: 0,
  };

  it("publishes only after media_publish returns a real media id", async () => {
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (url: unknown) => {
      const href = String(url);
      seen.push(href);
      if (href.includes("permalink")) {
        return json({ permalink: "https://www.instagram.com/reel/abc/" });
      }
      if (href.includes("status_code")) return json({ status_code: "FINISHED" });
      if (href.includes("/media_publish")) return json({ id: "media-999" });
      if (href.includes("/media")) return json({ id: "container-1" });
      return json({});
    }) as unknown as typeof fetch;

    const result = await publishInstagramLoginReel({ ...base, fetchImpl });
    expect(result).toMatchObject({
      ok: true,
      platformPostId: "media-999",
      platformUrl: "https://www.instagram.com/reel/abc/",
    });
    // The Instagram user token is used; no Facebook Page endpoint is touched.
    expect(seen.every((href) => href.startsWith("https://graph.instagram.com/"))).toBe(true);
  });

  it("never treats a container id as a publication", async () => {
    const fetchImpl = vi.fn(async (url: unknown) => {
      const href = String(url);
      if (href.includes("/media_publish")) return json({ id: "container-1" });
      if (href.includes("status_code")) return json({ status_code: "FINISHED" });
      if (href.includes("/media")) return json({ id: "container-1" });
      return json({});
    }) as unknown as typeof fetch;
    const result = await publishInstagramLoginReel({ ...base, fetchImpl });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("PUBLISH_FAILED");
  });

  it("stops honestly when processing times out", async () => {
    const fetchImpl = vi.fn(async (url: unknown) => {
      const href = String(url);
      if (href.includes("status_code")) return json({ status_code: "IN_PROGRESS" });
      return json({ id: "container-1" });
    }) as unknown as typeof fetch;
    const result = await publishInstagramLoginReel({ ...base, fetchImpl, maxPollAttempts: 2 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.state).toBe("UPLOAD_FAILED");
      expect(result.error).toContain("MEDIA_PROCESSING_TIMEOUT");
    }
  });

  it("refuses a media link that is not public HTTPS", async () => {
    const fetchImpl = vi.fn(async () => json({})) as unknown as typeof fetch;
    const result = await publishInstagramLoginReel({
      ...base,
      fetchImpl,
      videoUrl: "http://insecure.example/reel.mp4",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.state).toBe("VALIDATION_FAILED");
  });

  it("maps a permission refusal onto an auth failure, never a publication", async () => {
    const fetchImpl = vi.fn(async () =>
      json({ error: { message: "Permissions error", code: 10 } }, 403),
    ) as unknown as typeof fetch;
    const result = await publishInstagramLoginReel({ ...base, fetchImpl });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.state).toBe("AUTH_REQUIRED");
      expect(result.error).toContain("PERMISSION_DENIED");
    }
  });
});

describe("instagram error classification", () => {
  it("recognises the required failure kinds", () => {
    expect(instagramErrorState(429, {}).state).toBe("RATE_LIMITED");
    expect(instagramErrorState(400, { error: { code: 190, error_subcode: 463 } }).state).toBe(
      "TOKEN_EXPIRED",
    );
    expect(instagramErrorState(401, {}).state).toBe("AUTH_REQUIRED");
    expect(instagramErrorState(403, {}).state).toBe("PERMISSION_DENIED");
    expect(instagramErrorState(404, {}).state).toBe("ACCOUNT_NOT_FOUND");
    expect(instagramErrorState(500, {}).state).toBe("UPLOAD_FAILED");
    expect(instagramErrorState(400, {}).state).toBe("PLATFORM_REJECTED");
  });

  it("never maps a failure onto a published state", () => {
    for (const state of [
      "AUTH_REQUIRED",
      "TOKEN_EXPIRED",
      "INVALID_SCOPE",
      "PERMISSION_DENIED",
      "ACCOUNT_NOT_FOUND",
      "MEDIA_INVALID",
      "MEDIA_PROCESSING",
      "MEDIA_PROCESSING_TIMEOUT",
      "PLATFORM_REJECTED",
      "RATE_LIMITED",
      "UPLOAD_FAILED",
      "PUBLISH_FAILED",
    ] as const) {
      expect(publicationStateFor(state)).not.toBe("PUBLISHED");
    }
  });

  it("redacts anything token-shaped from a platform message", () => {
    expect(
      sanitiseInstagramError({ error: { message: "bad IGQVJXbadtokenvalue1234567" } }, "fallback"),
    ).toContain("[redacted]");
  });
});

describe("instagram insights", () => {
  it("returns only metrics Instagram actually reported", async () => {
    const fetchImpl = vi.fn(async () =>
      json({
        data: [
          { name: "reach", values: [{ value: 120 }] },
          { name: "likes", values: [{ value: 8 }] },
        ],
      }),
    ) as unknown as typeof fetch;
    const result = await fetchInstagramMediaInsights(fetchImpl, {
      mediaId: "media-999",
      accessToken: "IGQlong",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metrics).toEqual({ reach: 120, likes: 8 });
      expect(result.value.unavailable).toContain("shares");
    }
  });
});

describe("instagram console status", () => {
  const base = {
    configured: true,
    connected: true,
    expired: false,
    paused: false,
    accountFound: true,
    lastError: null,
    publishedBefore: false,
  };

  it("never depends on a Facebook Page", () => {
    expect(instagramStatusWord(base)).toBe("CONNECTED");
    expect(instagramStatusWord({ ...base, connected: false })).toBe("NOT CONNECTED");
    expect(instagramStatusWord({ ...base, expired: true })).toBe("AUTHORIZATION REQUIRED");
    expect(instagramStatusWord({ ...base, accountFound: false })).toBe(
      "CONNECTED — INSTAGRAM ACCOUNT NOT FOUND",
    );
    expect(instagramStatusDetail({ ...base, configured: false })).not.toMatch(/Facebook/i);
    expect(instagramStatusDetail(base)).not.toMatch(/Facebook Page/i);
  });
});

describe("instagram adapter", () => {
  const connection: PlatformConnectionRecord = {
    platform: "instagram",
    connection: "CONNECTED",
    scopes: [...INSTAGRAM_LOGIN_SCOPES],
    expiresAt: NOW + 3_600_000,
    lastError: null,
  };
  const asset = {
    id: "ER-CAMP-2026-000001-A01-instagram",
    platform: "instagram",
    aspect: "9:16",
    hook: "hook",
    title: "Make space earn.",
    description: "EarnRoom",
    caption: "EarnRoom",
    hashtags: [],
    cta: "",
    seconds: 30,
    state: "QUEUED",
    videoUrl: "https://example.com/reel.mp4",
    thumbnailUrl: null,
    videoStatus: "GENERATED",
  } as unknown as PlatformAsset;

  it("publishes with the Instagram user token and needs no Page token", async () => {
    const fetchImpl = vi.fn(async (url: unknown) => {
      const href = String(url);
      if (href.includes("/media_publish")) return json({ id: "media-42" });
      if (href.includes("status_code")) return json({ status_code: "FINISHED" });
      if (href.includes("/media")) return json({ id: "container-7" });
      return json({});
    }) as unknown as typeof fetch;

    const adapter = adapterFor("instagram", {
      connection,
      accessToken: "IGQlong",
      accountId: "178414",
      pageAccessToken: null,
      settings: defaultMarketingSettings(),
      connections: [connection],
      now: NOW,
      fetchImpl,
      sleep: async () => {},
    });
    const result = await adapter.publish(asset, { id: "ER-CAMP-2026-000001" } as MarketingCampaign);
    expect(result).toMatchObject({ ok: true, platformPostId: "media-42" });
  });

  it("refuses when no Instagram authorisation is stored", async () => {
    const adapter = adapterFor("instagram", {
      connection,
      accessToken: null,
      accountId: "178414",
      pageAccessToken: null,
      settings: defaultMarketingSettings(),
      connections: [connection],
      now: NOW,
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    const result = await adapter.publish(asset, { id: "ER-CAMP-2026-000001" } as MarketingCampaign);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.state).toBe("AUTH_REQUIRED");
  });
});

describe("instagram connection source of truth", () => {
  it("is connected only with a stored token and an account id", () => {
    expect(instagramIsConnected({ hasStoredToken: true, accountId: "17841425343792806" })).toBe(
      true,
    );
  });

  it("is not connected when no Instagram token is stored", () => {
    expect(instagramIsConnected({ hasStoredToken: false, accountId: "17841425343792806" })).toBe(
      false,
    );
  });

  it("is not connected when no Instagram account id was discovered", () => {
    expect(instagramIsConnected({ hasStoredToken: true, accountId: null })).toBe(false);
  });

  it("reports NOT CONNECTED for a Facebook-Page-derived row with no token", () => {
    const input = {
      configured: true,
      connected: instagramIsConnected({ hasStoredToken: false, accountId: null }),
      expired: false,
      paused: false,
      accountFound: false,
      lastError: null,
      publishedBefore: false,
    };
    expect(instagramStatusWord(input)).toBe("NOT CONNECTED");
  });

  it("reports NOT CONNECTED when a token is missing even though an account id lingers", () => {
    const input = {
      configured: true,
      connected: instagramIsConnected({ hasStoredToken: false, accountId: "1784142" }),
      expired: false,
      paused: false,
      accountFound: true,
      lastError: null,
      publishedBefore: false,
    };
    expect(instagramStatusWord(input)).toBe("NOT CONNECTED");
  });

  it("reports CONNECTED after a genuine Instagram Login callback", () => {
    const input = {
      configured: true,
      connected: instagramIsConnected({ hasStoredToken: true, accountId: "1784142" }),
      expired: false,
      paused: false,
      accountFound: true,
      lastError: null,
      publishedBefore: false,
    };
    expect(instagramStatusWord(input)).toBe("CONNECTED");
  });
});
