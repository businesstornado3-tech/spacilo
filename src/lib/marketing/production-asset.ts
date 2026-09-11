/**
 * Which stored video a campaign actually publishes.
 *
 * A campaign can hold several stored videos: a free Browser Preview made
 * while drafting, and the real production film made afterwards. Publishing
 * per-platform rows separately once sent Instagram a 30-second Browser
 * Preview while Facebook got the paid production film — the same campaign,
 * two different videos.
 *
 * A campaign may now hold many videos and each one is published in its own
 * right, so this module answers two separate questions:
 *
 *   - which video the Studio should have selected when it opens: the newest
 *     stored file (the one just made), with the production route only breaking
 *     a tie between files made at the same moment;
 *   - `resolveSelectedVideo`: whether the exact video the founder chose can be
 *     published. There is no substitution here — if that video has no stored
 *     file, publishing refuses rather than sending a different one.
 *
 * Pure module: no network, no database.
 */

/** Highest production route first. */
const ROUTE_RANK: Record<string, number> = {
  PAID_CLOUD: 4,
  FREE_CLOUD: 3,
  LOCAL: 2,
  BROWSER: 1,
};

export type StoredVideoRow = {
  id: string;
  assetId: string;
  /** Only a stored, branded artifact has one. */
  storagePath: string | null;
  executionMode: string | null;
  createdAt: string;
  seconds?: number | null;
};

export type ProductionVideo = {
  id: string;
  assetId: string;
  storagePath: string;
  executionMode: string;
  createdAt: string;
  /** Plain-English provenance line, recorded with the publication. */
  provenance: string;
  /** True when the only stored file is a free Browser Preview. */
  previewOnly: boolean;
};

export type ProductionVideoResult =
  { ok: true; video: ProductionVideo } | { ok: false; reason: string };

function rank(mode: string | null): number {
  return ROUTE_RANK[mode ?? ""] ?? 0;
}

/** Picks the one video every platform of this campaign must publish. */
export function resolveProductionVideo(rows: readonly StoredVideoRow[]): ProductionVideoResult {
  const stored = rows.filter((row) => Boolean(row.storagePath));
  if (stored.length === 0) {
    return {
      ok: false,
      reason:
        "No final branded EarnRoom video is stored for this campaign yet, so nothing can be published.",
    };
  }

  const best = [...stored].sort((a, b) => {
    const byRoute = rank(b.executionMode) - rank(a.executionMode);
    if (byRoute !== 0) return byRoute;
    const byTime = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (byTime !== 0) return byTime;
    return a.id.localeCompare(b.id);
  })[0]!;

  const mode = best.executionMode ?? "UNKNOWN";
  const previewOnly = rank(best.executionMode) <= ROUTE_RANK["BROWSER"]!;
  return {
    ok: true,
    video: {
      id: best.id,
      assetId: best.assetId,
      storagePath: best.storagePath!,
      executionMode: mode,
      createdAt: best.createdAt,
      previewOnly,
      provenance: `Published the campaign's production video ${best.id} (${mode}, asset ${best.assetId}).`,
    },
  };
}
