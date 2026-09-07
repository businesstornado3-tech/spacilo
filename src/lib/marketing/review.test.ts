/**
 * Founder review logic — tests.
 *
 * These prove the promises the console makes: a preview is never full width,
 * a missing video is never dressed up as a ready one, and a platform is only
 * called ready when it truly could publish.
 */
import { describe, expect, it } from "vitest";

import { decisionView, playerBox, publicationReadiness, versionRow } from "./review";
import type { MarketingSettings, PlatformAsset, PlatformCapability } from "./types";

function asset(overrides: Partial<PlatformAsset> = {}): PlatformAsset {
  return {
    id: "asset-1",
    platform: "tiktok",
    aspect: "9:16",
    hook: "hook",
    title: "title",
    description: "description",
    caption: "caption",
    hashtags: ["#storage"],
    cta: "cta",
    seconds: 20,
    state: "GENERATED",
    videoUrl: null,
    thumbnailUrl: null,
    videoStatus: "NOT_REQUESTED",
    ...overrides,
  };
}

function capability(overrides: Partial<PlatformCapability> = {}): PlatformCapability {
  return {
    platform: "tiktok",
    label: "TikTok",
    connection: "CONNECTED",
    publishingSupported: true,
    autonomousAvailable: true,
    mode: "APPROVAL_REQUIRED",
    paused: false,
    statusLabel: "Connected",
    reason: "Connected.",
    aspects: ["9:16"],
    maxSeconds: 60,
    ...overrides,
  };
}

const settings: Pick<MarketingSettings, "pauseAllPublishing" | "globalMode"> = {
  pauseAllPublishing: false,
  globalMode: "APPROVAL_REQUIRED",
};

describe("preview player", () => {
  it("keeps a portrait clip compact", () => {
    const box = playerBox("9:16");
    expect(box.heightPx).toBeLessThanOrEqual(480);
    expect(box.heightPx).toBeGreaterThanOrEqual(360);
    expect(box.widthPx).toBeLessThan(box.heightPx);
  });

  it("caps a landscape clip at 720px wide and keeps its shape", () => {
    const box = playerBox("16:9");
    expect(box.widthPx).toBe(720);
    expect(Math.round((box.widthPx / box.heightPx) * 100) / 100).toBeCloseTo(16 / 9, 1);
  });

  it("keeps a square clip square", () => {
    const box = playerBox("1:1");
    expect(box.widthPx).toBe(box.heightPx);
  });
});

describe("platform versions", () => {
  it("says NOT GENERATED rather than implying a video exists", () => {
    const row = versionRow(asset(), "TikTok");
    expect(row.status).toBe("NOT GENERATED");
    expect(row.hasVideo).toBe(false);
    expect(row.meta).toBe("9:16 · 20s");
  });

  it("marks a finished version ready to review", () => {
    const row = versionRow(asset({ videoUrl: "https://example/v.mp4" }), "TikTok");
    expect(row.status).toBe("READY TO REVIEW");
    expect(row.hasVideo).toBe(true);
  });

  it("reports a failure honestly", () => {
    const row = versionRow(asset({ videoStatus: "FAILED" }), "TikTok");
    expect(row.status).toBe("FAILED");
    expect(row.tone).toBe("bad");
  });

  it("shows a published version as published", () => {
    const row = versionRow(asset({ state: "PUBLISHED", videoUrl: "u" }), "TikTok");
    expect(row.status).toBe("PUBLISHED");
  });
});

describe("approval decision", () => {
  const base = {
    status: "PLANNED",
    validationPassed: true,
    approvedAt: null,
    decidedAt: null,
    note: null,
    videosReady: 1,
    videosTotal: 2,
    publishingPaused: false,
  };

  it("waits for a decision when nothing has been decided", () => {
    const view = decisionView(base);
    expect(view.canApprove).toBe(true);
    expect(view.canPublish).toBe(false);
    expect(view.headline).toContain("Waiting");
  });

  it("refuses approval when the checks failed", () => {
    const view = decisionView({ ...base, validationPassed: false });
    expect(view.canApprove).toBe(false);
    expect(view.approveBlockedReason).toContain("checks");
  });

  it("refuses approval when no video was made", () => {
    const view = decisionView({ ...base, videosReady: 0 });
    expect(view.canApprove).toBe(false);
  });

  it("remembers an approval after a refresh", () => {
    const view = decisionView({
      ...base,
      status: "APPROVED",
      approvedAt: "2026-09-07T09:00:00.000Z",
    });
    expect(view.headline).toContain("approved");
    expect(view.canPublish).toBe(true);
    expect(view.canApprove).toBe(false);
  });

  it("will not publish while publishing is paused", () => {
    const view = decisionView({ ...base, status: "APPROVED", publishingPaused: true });
    expect(view.canPublish).toBe(false);
    expect(view.publishBlockedReason).toContain("paused");
  });

  it("keeps the rejection reason visible", () => {
    const view = decisionView({ ...base, status: "REJECTED", note: "Wrong town" });
    expect(view.detail).toContain("Wrong town");
    expect(view.canPublish).toBe(false);
  });
});

describe("publication readiness", () => {
  it("is ready only when everything genuinely lines up", () => {
    const [row] = publicationReadiness({
      campaignStatus: "APPROVED",
      settings,
      capabilities: [capability()],
      assets: [asset({ videoUrl: "https://example/v.mp4" })],
      publications: [],
    });
    expect(row!.ready).toBe(true);
  });

  it("never claims readiness without a connected account", () => {
    const [row] = publicationReadiness({
      campaignStatus: "APPROVED",
      settings,
      capabilities: [capability({ connection: "NOT_CONNECTED" })],
      assets: [asset({ videoUrl: "u" })],
      publications: [],
    });
    expect(row!.ready).toBe(false);
    expect(row!.blockers.join(" ")).toContain("not connected");
  });

  it("never claims readiness without a video", () => {
    const [row] = publicationReadiness({
      campaignStatus: "APPROVED",
      settings,
      capabilities: [capability()],
      assets: [asset()],
      publications: [],
    });
    expect(row!.ready).toBe(false);
  });

  it("blocks an unapproved campaign", () => {
    const [row] = publicationReadiness({
      campaignStatus: "PLANNED",
      settings,
      capabilities: [capability()],
      assets: [asset({ videoUrl: "u" })],
      publications: [],
    });
    expect(row!.blockers[0]).toContain("not been approved");
  });

  it("reports a paused platform and paused publishing separately", () => {
    const [row] = publicationReadiness({
      campaignStatus: "APPROVED",
      settings: { ...settings, pauseAllPublishing: true },
      capabilities: [capability({ paused: true })],
      assets: [asset({ videoUrl: "u" })],
      publications: [],
    });
    expect(row!.blockers.length).toBeGreaterThanOrEqual(2);
  });

  it("shows an already published platform with its link", () => {
    const [row] = publicationReadiness({
      campaignStatus: "PUBLISHED",
      settings,
      capabilities: [capability()],
      assets: [asset({ videoUrl: "u", state: "PUBLISHED" })],
      publications: [
        {
          campaignId: "c",
          assetId: "asset-1",
          platform: "tiktok",
          state: "PUBLISHED",
          platformPostId: "p",
          platformUrl: "https://tiktok.com/p",
          updatedAt: 0,
          error: null,
          retryCount: 0,
        },
      ],
    });
    expect(row!.summary).toContain("https://tiktok.com/p");
  });
});
