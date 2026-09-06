import { describe, expect, it } from "vitest";

import {
  attemptPublish,
  canTransition,
  retryDelayMs,
  shouldRetry,
  stateAfterValidation,
  transition,
  unconfiguredAdapter,
} from "./publishing";
import { allCapabilities, capabilityFor, defaultMarketingSettings, type PlatformConnectionRecord } from "./platforms";
import { planDailyCampaign } from "./orchestrator";
import { generateVideo, registerVideoProvider, resetVideoProviders, videoProviderState } from "./video";
import type { PlatformAsset, PublicationRecord, PublishingAdapter } from "./types";

const NOW = Date.parse("2026-06-15T09:00:00Z");
const settings = defaultMarketingSettings();

const campaign = planDailyCampaign({
  now: NOW,
  settings,
  places: [],
  growth: [],
  history: [],
  insights: [],
  existingIds: [],
}).campaign;

const record = (over: Partial<PublicationRecord> = {}): PublicationRecord => ({
  campaignId: campaign.id,
  assetId: "asset-1",
  platform: "youtube_shorts",
  state: "QUEUED",
  platformPostId: null,
  platformUrl: null,
  updatedAt: NOW,
  error: null,
  retryCount: 0,
  ...over,
});

const asset = (over: Partial<PlatformAsset> = {}): PlatformAsset => ({
  ...campaign.assets[0]!,
  platform: "youtube_shorts",
  videoUrl: "https://storage.example/render.mp4",
  ...over,
});

const connected: PlatformConnectionRecord[] = [
  { platform: "youtube_shorts", connection: "CONNECTED", scopes: ["upload"], expiresAt: null, lastError: null },
];

describe("platform capability detection", () => {
  it("reports every platform as requiring configuration when nothing is connected", () => {
    const capabilities = allCapabilities([], settings, NOW);
    expect(capabilities.every((item) => item.connection === "REQUIRES_CONFIGURATION")).toBe(true);
    expect(capabilities.every((item) => item.autonomousAvailable === false)).toBe(true);
    expect(capabilities[0]?.statusLabel).toBe("Requires configuration");
  });

  it("detects expired authorisation", () => {
    const capability = capabilityFor(
      "instagram",
      [{ platform: "instagram", connection: "CONNECTED", scopes: [], expiresAt: NOW - 1, lastError: null }],
      settings,
      NOW,
    );
    expect(capability.connection).toBe("AUTH_EXPIRED");
    expect(capability.statusLabel).toBe("Authentication expired");
  });

  it("never claims autonomous publishing where the official API cannot do it", () => {
    const capability = capabilityFor(
      "tiktok",
      [{ platform: "tiktok", connection: "CONNECTED", scopes: [], expiresAt: null, lastError: null }],
      { ...settings, globalMode: "AUTONOMOUS" },
      NOW,
    );
    expect(capability.autonomousAvailable).toBe(false);
    expect(capability.statusLabel).toBe("Connected — autonomous publishing unavailable");
  });
});

describe("publication state machine", () => {
  it("refuses illegal transitions and forbids resurrecting a published asset", () => {
    expect(canTransition("QUEUED", "PUBLISHED")).toBe(false);
    expect(canTransition("UPLOADING", "PUBLISHED")).toBe(true);
    expect(() => transition(record({ state: "PUBLISHED" }), "QUEUED", NOW)).toThrow();
  });

  it("routes validated assets by publishing mode and pause state", () => {
    expect(stateAfterValidation(false, "youtube", settings)).toBe("VALIDATION_FAILED");
    expect(stateAfterValidation(true, "youtube", { ...settings, globalMode: "DRAFT" })).toBe("VALIDATED");
    expect(stateAfterValidation(true, "youtube", { ...settings, globalMode: "AUTONOMOUS" })).toBe("QUEUED");
    expect(stateAfterValidation(true, "youtube", { ...settings, globalMode: "AUTONOMOUS", pausedPlatforms: ["youtube"] })).toBe("PAUSED");
  });

  it("backs off exponentially and stops retrying a platform rejection", () => {
    expect(retryDelayMs(0)).toBeLessThan(retryDelayMs(2));
    expect(shouldRetry(record({ state: "PLATFORM_REJECTED" }))).toBe(false);
    expect(shouldRetry(record({ state: "UPLOAD_FAILED", retryCount: 1 }))).toBe(true);
  });
});

describe("publishing attempts", () => {
  it("never publishes through an unconfigured platform", async () => {
    const attempt = await attemptPublish({
      adapter: unconfiguredAdapter("youtube_shorts", settings),
      asset: asset(),
      campaign,
      connections: [],
      settings,
      record: record(),
      now: NOW,
    });
    expect(attempt.record.state).toBe("AUTH_REQUIRED");
    expect(attempt.record.platformPostId).toBeNull();
  });

  it("stops at the pause switch before contacting any platform", async () => {
    let called = false;
    const adapter: PublishingAdapter = {
      platform: "youtube_shorts",
      capability: () => capabilityFor("youtube_shorts", connected, settings, NOW),
      publish: async () => {
        called = true;
        return { ok: true, platformPostId: "x", platformUrl: null, publishedAt: NOW };
      },
    };
    const attempt = await attemptPublish({
      adapter,
      asset: asset(),
      campaign,
      connections: connected,
      settings: { ...settings, pauseAllPublishing: true },
      record: record(),
      now: NOW,
    });
    expect(called).toBe(false);
    expect(attempt.record.state).toBe("PAUSED");
  });

  it("refuses to upload an asset that has no rendered video", async () => {
    const adapter: PublishingAdapter = {
      platform: "youtube_shorts",
      capability: () => capabilityFor("youtube_shorts", connected, settings, NOW),
      publish: async () => ({ ok: true, platformPostId: "x", platformUrl: null, publishedAt: NOW }),
    };
    const attempt = await attemptPublish({
      adapter,
      asset: asset({ videoUrl: null }),
      campaign,
      connections: connected,
      settings,
      record: record(),
      now: NOW,
    });
    expect(attempt.record.state).toBe("UPLOAD_FAILED");
  });

  it("only reports PUBLISHED with a platform post id, and records the url", async () => {
    const adapter: PublishingAdapter = {
      platform: "youtube_shorts",
      capability: () => capabilityFor("youtube_shorts", connected, settings, NOW),
      publish: async () => ({ ok: true, platformPostId: "vid_123", platformUrl: "https://youtu.be/vid_123", publishedAt: NOW + 5 }),
    };
    const attempt = await attemptPublish({
      adapter,
      asset: asset(),
      campaign,
      connections: connected,
      settings,
      record: record(),
      now: NOW,
    });
    expect(attempt.record.state).toBe("PUBLISHED");
    expect(attempt.record.platformPostId).toBe("vid_123");
    expect(attempt.record.platformUrl).toBe("https://youtu.be/vid_123");
  });

  it("treats a thrown adapter error as a retryable upload failure", async () => {
    const adapter: PublishingAdapter = {
      platform: "youtube_shorts",
      capability: () => capabilityFor("youtube_shorts", connected, settings, NOW),
      publish: async () => {
        throw new Error("network down");
      },
    };
    const attempt = await attemptPublish({
      adapter,
      asset: asset(),
      campaign,
      connections: connected,
      settings,
      record: record(),
      now: NOW,
    });
    expect(attempt.record.state).toBe("UPLOAD_FAILED");
    expect(attempt.record.retryCount).toBe(1);
    expect(attempt.record.error).toContain("network down");
  });
});

describe("video provider abstraction", () => {
  it("reports an honest failure when no provider is configured", async () => {
    resetVideoProviders();
    expect(videoProviderState().state).toBe("NOT_CONFIGURED");
    const result = await generateVideo({
      campaignId: campaign.id,
      assetId: "asset-1",
      aspect: "9:16",
      seconds: 30,
      scenes: campaign.story.scenes,
      brandProfileId: "earnroom-2026",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe("PROVIDER_NOT_CONFIGURED");
  });

  it("uses a connected provider when one is registered", async () => {
    resetVideoProviders();
    registerVideoProvider({
      id: "test-provider",
      name: "Test",
      state: "CONNECTED",
      capabilities: { video: true, voiceover: true, captions: true, thumbnail: true },
      generate: async () => ({ ok: true, videoUrl: "https://x/v.mp4", thumbnailUrl: null, providerId: "test-provider", seconds: 30 }),
    });
    expect(videoProviderState().state).toBe("CONNECTED");
    const result = await generateVideo({
      campaignId: campaign.id,
      assetId: "asset-1",
      aspect: "9:16",
      seconds: 30,
      scenes: campaign.story.scenes,
      brandProfileId: "earnroom-2026",
    });
    expect(result.ok).toBe(true);
    resetVideoProviders();
  });
});
