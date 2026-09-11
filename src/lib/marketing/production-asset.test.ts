import { describe, expect, it } from "vitest";

import { resolveProductionVideo, type StoredVideoRow } from "./production-asset";

const row = (over: Partial<StoredVideoRow>): StoredVideoRow => ({
  id: "v1",
  assetId: "A01",
  storagePath: "p.mp4",
  executionMode: "BROWSER",
  createdAt: "2026-09-11T10:00:00Z",
  ...over,
});

describe("one campaign publishes one production video", () => {
  it("prefers the paid production film over an older browser preview", () => {
    const result = resolveProductionVideo([
      row({ id: "preview", assetId: "A02", executionMode: "BROWSER" }),
      row({
        id: "paid",
        assetId: "A01",
        executionMode: "PAID_CLOUD",
        createdAt: "2026-09-11T10:27:00Z",
      }),
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.video.id).toBe("paid");
      expect(result.video.previewOnly).toBe(false);
    }
  });

  it("opens on the video that was just made, whichever route made it", () => {
    const result = resolveProductionVideo([
      row({ id: "paid", executionMode: "PAID_CLOUD", createdAt: "2026-09-11T09:00:00Z" }),
      row({ id: "newest", executionMode: "BROWSER", createdAt: "2026-09-11T23:00:00Z" }),
    ]);
    expect(result.ok && result.video.id).toBe("newest");
  });

  it("publishes the exact video chosen, and substitutes nothing", () => {
    const rows = [
      row({ id: "paid", executionMode: "PAID_CLOUD", createdAt: "2026-09-11T09:00:00Z" }),
      row({ id: "newest", createdAt: "2026-09-11T23:00:00Z" }),
    ];
    expect(resolveSelectedVideo(rows, "paid").ok && resolveSelectedVideo(rows, "paid")).toMatchObject(
      { ok: true },
    );
    const chosen = resolveSelectedVideo(rows, "paid");
    expect(chosen.ok && chosen.video.id).toBe("paid");
    expect(resolveSelectedVideo(rows, "not-in-campaign").ok).toBe(false);
    expect(resolveSelectedVideo([row({ id: "raw", storagePath: null })], "raw").ok).toBe(false);
  });

  it("ignores videos with no stored branded file", () => {
    const result = resolveProductionVideo([
      row({ id: "raw", executionMode: "PAID_CLOUD", storagePath: null }),
      row({ id: "preview" }),
    ]);
    expect(result.ok && result.video.id).toBe("preview");
    expect(result.ok && result.video.previewOnly).toBe(true);
  });

  it("refuses when the campaign has no stored video at all", () => {
    const result = resolveProductionVideo([row({ storagePath: null })]);
    expect(result.ok).toBe(false);
  });

  it("never publishes an intermediate part of a longer film", () => {
    // While a 30-second film is being made part by part, nothing is stored:
    // only the finished, branded film has a file behind it.
    const result = resolveProductionVideo([
      row({ id: "part-in-progress", executionMode: "PAID_CLOUD", storagePath: null }),
    ]);
    expect(result.ok).toBe(false);
  });

  it("publishes nothing when a part failed part-way through", () => {
    const result = resolveProductionVideo([
      row({ id: "failed-30s", executionMode: "PAID_CLOUD", storagePath: null }),
      row({ id: "also-failed", executionMode: "PAID_CLOUD", storagePath: null }),
    ]);
    expect(result.ok).toBe(false);
  });

  it("keeps campaigns apart: only the rows given are considered", () => {
    const a = resolveProductionVideo([row({ id: "a", assetId: "A-1" })]);
    const b = resolveProductionVideo([row({ id: "b", assetId: "B-1" })]);
    expect(a.ok && a.video.assetId).toBe("A-1");
    expect(b.ok && b.video.assetId).toBe("B-1");
  });
});
