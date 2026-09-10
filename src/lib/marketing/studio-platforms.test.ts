import { describe, expect, it } from "vitest";

import {
  STUDIO_PLATFORMS,
  studioPlatformRows,
  type StudioConnectionInput,
} from "./studio-platforms";

const connection = (over: Partial<StudioConnectionInput> = {}): StudioConnectionInput => ({
  platform: "youtube",
  connection: "CONNECTED",
  accountLabel: "EarnRoom (@earnroom)",
  paused: false,
  publishingSupported: true,
  ...over,
});

const rows = (over: Partial<Parameters<typeof studioPlatformRows>[0]> = {}) =>
  studioPlatformRows({
    connections: [connection()],
    publications: [],
    videoReady: true,
    campaignApproved: true,
    publishingPaused: false,
    ...over,
  });

const find = (platform: string) => rows().find((row) => row.platform === platform)!;

describe("marketing studio platform rows", () => {
  it("shows exactly seven platforms, once each, in order", () => {
    const list = rows();
    expect(list).toHaveLength(7);
    expect(list.map((row) => row.platform)).toEqual([...STUDIO_PLATFORMS]);
    expect(new Set(list.map((row) => row.platform)).size).toBe(7);
  });

  it("offers Connect and one concise reason when a platform is not connected", () => {
    const instagram = find("instagram");
    expect(instagram.state).toBe("NOT_CONNECTED");
    expect(instagram.action).toBe("CONNECT");
    expect(instagram.reason).toBe("Account connection required.");
  });

  it("shows the real account name once connected", () => {
    expect(find("youtube").detail).toBe("EarnRoom (@earnroom)");
    expect(find("youtube").state).toBe("CONNECTED");
    expect(find("youtube").canPublish).toBe(true);
    expect(find("youtube").action).toBe("PUBLISH");
  });

  it("derives YouTube Shorts from the YouTube connection and never offers a second sign-in", () => {
    const shorts = find("youtube_shorts");
    expect(shorts.state).toBe("CONNECTED");
    expect(shorts.detail).toBe("Uses YouTube channel: EarnRoom (@earnroom)");
    expect(shorts.action).toBe("PUBLISH");
    const none = studioPlatformRows({
      connections: [],
      publications: [],
      videoReady: true,
      campaignApproved: true,
      publishingPaused: false,
    }).find((row) => row.platform === "youtube_shorts")!;
    expect(none.action).toBe("NONE");
    expect(none.actionLabel).not.toContain("Connect YouTube Shorts");
  });

  it("gives one reason when the video is not ready, and no publish action", () => {
    const list = rows({ videoReady: false });
    const youtube = list.find((row) => row.platform === "youtube")!;
    // The account stays connected; only publishing waits.
    expect(youtube.state).toBe("CONNECTED");
    expect(youtube.reason).toBe("Campaign video required.");
    expect(youtube.canPublish).toBe(false);
    expect(youtube.action).toBe("PUBLISH");
  });

  it("gives one reason when the campaign still needs approval", () => {
    const youtube = rows({ campaignApproved: false }).find((row) => row.platform === "youtube")!;
    expect(youtube.reason).toBe("Campaign approval required.");
  });

  it("blocks everything while publishing is paused", () => {
    const youtube = rows({ publishingPaused: true }).find((row) => row.platform === "youtube")!;
    expect(youtube.state).toBe("CONNECTED");
    expect(youtube.canPublish).toBe(false);
    expect(youtube.reason).toBe("Publishing is paused.");
  });

  it("shows a platform's own approval requirement rather than pretending it is ready", () => {
    const tiktok = rows({
      connections: [
        connection(),
        connection({
          platform: "tiktok",
          accountLabel: "@earnroom",
          approvalNote: "Publishing approval required.",
        }),
      ],
    }).find((row) => row.platform === "tiktok")!;
    expect(tiktok.state).toBe("CONNECTED");
    expect(tiktok.reason).toBe("Publishing approval required.");
    expect(tiktok.canPublish).toBe(false);
  });

  it("only shows Published with the platform's own confirmed URL, and no second Publish", () => {
    const youtube = rows({
      publications: [
        {
          platform: "youtube",
          state: "PUBLISHED",
          platformUrl: "https://www.youtube.com/watch?v=abc123",
          platformPostId: "abc123",
        },
      ],
    }).find((row) => row.platform === "youtube")!;
    expect(youtube.state).toBe("PUBLISHED");
    expect(youtube.action).toBe("WATCH");
    expect(youtube.actionLabel).toBe("Watch on YouTube");
    expect(youtube.watchUrl).toBe("https://www.youtube.com/watch?v=abc123");
  });

  it("never invents a URL when the platform did not return one", () => {
    const facebook = rows({
      connections: [connection(), connection({ platform: "facebook", accountLabel: "EarnRoom" })],
      publications: [
        { platform: "facebook", state: "PUBLISHED", platformUrl: null, platformPostId: "9" },
      ],
    }).find((row) => row.platform === "facebook")!;
    expect(facebook.watchUrl).toBeNull();
    expect(facebook.action).toBe("NONE");
  });

  it("reports a failed attempt in simple words and allows one retry", () => {
    const youtube = rows({
      publications: [
        { platform: "youtube", state: "UPLOAD_FAILED", platformUrl: null, platformPostId: null },
      ],
    }).find((row) => row.platform === "youtube")!;
    expect(youtube.state).toBe("FAILED");
    expect(youtube.reason).toBe("The upload to YouTube did not finish.");
    expect(youtube.actionLabel).toBe("Try again");
  });

  it("shows the platform's own reason rather than a generic apology", () => {
    const instagram = rows({
      connections: [connection(), connection({ platform: "instagram", accountLabel: "@earnroom" })],
      publications: [
        {
          platform: "instagram",
          state: "PLATFORM_REJECTED",
          platformUrl: null,
          platformPostId: null,
          error: "The media file is not a supported Reel format. [ref IN-ABC123]",
        },
      ],
    }).find((row) => row.platform === "instagram")!;
    expect(instagram.state).toBe("FAILED");
    expect(instagram.reason).toContain("not a supported Reel format");
    expect(instagram.reason).toContain("IN-ABC123");
    expect(instagram.failureReason).toBe(instagram.reason);
  });

  it("does not turn a connected-but-unattempted platform into a failure", () => {
    const facebook = rows({
      connections: [connection(), connection({ platform: "facebook", accountLabel: "EarnRoom" })],
      publications: [],
    }).find((row) => row.platform === "facebook")!;
    expect(facebook.state).toBe("CONNECTED");
    expect(facebook.failureReason).toBeNull();
  });

  it("shows the in-flight platform as publishing, with no duplicate action", () => {
    const youtube = rows({ publishing: "youtube" }).find((row) => row.platform === "youtube")!;
    expect(youtube.state).toBe("PUBLISHING");
    expect(youtube.action).toBe("NONE");
  });
});
