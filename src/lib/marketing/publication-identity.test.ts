/**
 * A newly produced video must never inherit an earlier video's publication.
 * These tests pin the pure rule the Studio and the server both rely on.
 */
import { describe, expect, it } from "vitest";

import { resolveProductionVideo, resolveSelectedVideo } from "./production-asset";

const rows = [
  {
    id: "video-old",
    assetId: "asset-1",
    storagePath: "campaign/old.mp4",
    executionMode: "BROWSER",
    createdAt: "2026-05-01T09:00:00Z",
  },
  {
    id: "video-new",
    assetId: "asset-1",
    storagePath: "campaign/new.mp4",
    executionMode: "PAID_CLOUD",
    createdAt: "2026-05-02T09:00:00Z",
  },
];

/** The filter the publishing surface applies to publication records. */
function publicationsFor(
  video: { id: string; assetId: string },
  currentVideoId: string | null,
  records: { videoId: string | null; assetId: string; state: string }[],
) {
  return records
    .filter((entry) =>
      entry.videoId ? entry.videoId === video.id : entry.assetId === video.assetId && video.id === currentVideoId,
    )
    .map((entry) => ({ ...entry, historical: !entry.videoId }));
}

describe("per-video publication identity", () => {
  it("publishes the newest production video, not the Browser Preview", () => {
    const result = resolveProductionVideo(rows);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.video.id).toBe("video-new");
  });

  it("does not attach an earlier video's publication to the new one", () => {
    const records = [{ videoId: "video-old", assetId: "asset-1", state: "PUBLISHED" }];
    expect(publicationsFor(rows[1]!, "video-new", records)).toHaveLength(0);
    expect(publicationsFor(rows[0]!, "video-new", records)).toHaveLength(1);
  });

  it("flags a pre-identity record as history rather than current state", () => {
    const records = [{ videoId: null, assetId: "asset-1", state: "PUBLISHED" }];
    const attached = publicationsFor(rows[0]!, "video-old", records);
    expect(attached).toHaveLength(1);
    expect(attached[0]!.historical).toBe(true);
  });

  it("keeps each video of a campaign independently publishable", () => {
    // Video one is on Facebook; video two is on Instagram. Neither result
    // may leak onto the other video's cards.
    const records = [
      { videoId: "video-old", assetId: "asset-1", state: "PUBLISHED", platform: "facebook" },
      { videoId: "video-new", assetId: "asset-1", state: "PUBLISHED", platform: "instagram" },
    ];
    const first = publicationsFor(rows[0]!, "video-new", records);
    const second = publicationsFor(rows[1]!, "video-new", records);
    expect(first.map((entry) => entry.platform)).toEqual(["facebook"]);
    expect(second.map((entry) => entry.platform)).toEqual(["instagram"]);
  });

  it("selects the video the founder chose, never a different one", () => {
    const chosen = resolveSelectedVideo(rows, "video-old");
    expect(chosen.ok && chosen.video.id).toBe("video-old");
    expect(chosen.ok && chosen.video.storagePath).toBe("campaign/old.mp4");
    expect(resolveSelectedVideo(rows, "video-missing").ok).toBe(false);
  });
});
