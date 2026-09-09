import { describe, expect, it, vi } from "vitest";

import { adapterFor, validateAssetForPlatform, type AdapterContext } from "./adapters";
import { defaultMarketingSettings, type PlatformConnectionRecord } from "./platforms";
import type { MarketingCampaign, PlatformAsset, PlatformId } from "./types";

const NOW = Date.parse("2026-06-15T09:00:00Z");

const asset = (over: Partial<PlatformAsset> = {}): PlatformAsset => ({
  id: "ER-CAMP-2026-000001-A01-instagram",
  platform: "instagram",
  aspect: "9:16",
  hook: "Spare room sitting empty?",
  title: "Make space earn.",
  description: "EarnRoom connects people who need storage with people who have space to spare.",
  caption: "Make space earn.",
  hashtags: ["#earnroom"],
  cta: "Find storage when you need it.",
  seconds: 15,
  state: "GENERATED",
  videoUrl: "https://storage.example/clip.mp4",
  thumbnailUrl: null,
  videoStatus: "GENERATED",
  ...over,
});

const campaign = { id: "ER-CAMP-2026-000001" } as unknown as MarketingCampaign;

const connection = (platform: PlatformId): PlatformConnectionRecord => ({
  platform,
  connection: "CONNECTED",
  scopes: [],
  expiresAt: NOW + 3_600_000,
  lastError: null,
});

const context = (over: Partial<AdapterContext> = {}): AdapterContext => ({
  connection: connection("instagram"),
  accessToken: "token",
  accountId: "17841400000000000",
  settings: defaultMarketingSettings(),
  connections: [connection("instagram")],
  now: NOW,
  fetchImpl: vi.fn() as unknown as typeof fetch,
  sleep: async () => {},
  ...over,
});

describe("platform publishing adapters", () => {
  it("refuses honestly with no stored authorisation, and never returns published", async () => {
    const adapter = adapterFor(
      "instagram",
      context({ connection: null, accessToken: null, accountId: null, connections: [] }),
    );
    const result = await adapter.publish(asset(), campaign);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.state).toBe("AUTH_REQUIRED");
  });

  it("refuses when the account is connected but no destination has been chosen", async () => {
    const adapter = adapterFor("instagram", context({ accountId: null }));
    const result = await adapter.publish(asset(), campaign);
    expect(result.ok).toBe(false);
  });

  it("rejects an asset the platform's own format rules would refuse", () => {
    const wrongShape = validateAssetForPlatform(asset({ platform: "youtube", aspect: "1:1" }));
    expect(wrongShape.ok).toBe(false);

    const noVideo = validateAssetForPlatform(asset({ videoUrl: null }));
    expect(noVideo.ok).toBe(false);
    expect(noVideo.problems.join(" ")).toMatch(/no rendered video/i);

    const tooLong = validateAssetForPlatform(asset({ title: "x".repeat(300) }));
    expect(tooLong.ok).toBe(false);
  });

  it("publishes only when the platform itself confirms with a post id", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ id: "post_123" }), { status: 200 }),
    ) as unknown as typeof fetch;
    const adapter = adapterFor("instagram", context({ fetchImpl }));
    const result = await adapter.publish(asset(), campaign);
    if (result.ok) {
      expect(result.platformPostId).toBe("post_123");
    } else {
      // A platform that needs a second publish step must still never claim success.
      expect(result.state).not.toBe("PUBLISHED");
    }
  });

  it("treats a platform refusal as a failure, not a publication", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: "Not allowed" } }), { status: 403 }),
    ) as unknown as typeof fetch;
    const adapter = adapterFor("instagram", context({ fetchImpl }));
    const result = await adapter.publish(asset(), campaign);
    expect(result.ok).toBe(false);
  });

  it("does not fabricate a post id when the platform returns none", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({}), { status: 200 }),
    ) as unknown as typeof fetch;
    const adapter = adapterFor("instagram", context({ fetchImpl }));
    const result = await adapter.publish(asset(), campaign);
    expect(result.ok).toBe(false);
  });
});

describe("meta adapters", () => {
  it("refuses Facebook publishing when no Page token is stored", async () => {
    const adapter = adapterFor(
      "facebook",
      context({
        connection: connection("facebook"),
        connections: [connection("facebook")],
        accountId: "1111",
        pageAccessToken: null,
      }),
    );
    const result = await adapter.publish(asset({ platform: "facebook", aspect: "16:9" }), campaign);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.state).toBe("AUTH_REQUIRED");
  });

  it("publishes a Facebook Page video with the Page token, not the user token", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ id: "vid-1" }), { status: 200 }),
    ) as unknown as typeof fetch;
    const adapter = adapterFor(
      "facebook",
      context({
        connection: connection("facebook"),
        connections: [connection("facebook")],
        accountId: "1111",
        accessToken: "user-token",
        pageAccessToken: "page-token",
        fetchImpl,
      }),
    );
    const result = await adapter.publish(asset({ platform: "facebook", aspect: "16:9" }), campaign);
    expect(result).toMatchObject({ ok: true, platformPostId: "vid-1" });
    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(String(call[0])).toContain("/1111/videos");
    expect(String((call[1] as RequestInit).body)).toContain("access_token=page-token");
    expect(String((call[1] as RequestInit).body)).not.toContain("user-token");
  });

  it("only reports Instagram as published after media_publish returns an id", async () => {
    const responses = [
      new Response(JSON.stringify({ id: "container-1" }), { status: 200 }),
      new Response(JSON.stringify({ status_code: "FINISHED" }), { status: 200 }),
      new Response(JSON.stringify({ id: "media-1" }), { status: 200 }),
      new Response(JSON.stringify({ permalink: "https://instagram.com/reel/x" }), { status: 200 }),
    ];
    let index = 0;
    const fetchImpl = vi.fn(async () => responses[index++]!) as unknown as typeof fetch;
    const adapter = adapterFor(
      "instagram",
      context({ pageAccessToken: "page-token", fetchImpl }),
    );
    const result = await adapter.publish(asset(), campaign);
    expect(result).toMatchObject({ ok: true, platformPostId: "media-1" });
  });
});
