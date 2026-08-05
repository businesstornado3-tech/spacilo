/**
 * Temporal stabilisation for live detections.
 *
 * Raw per-frame detection flickers badly. This turns a noisy stream of boxes
 * into a small set of stable tracks so the overlay is calm and understandable,
 * and so the same bicycle seen for fifty frames stays ONE provisional bicycle.
 *
 * Pure and framework-free: no timers, no DOM, `now` is always passed in.
 */
import { mapLiveClass, type LiveTaxonomyEntry } from "@/lib/livescan/taxonomy";
import type { BoundingBox, RawDetection, StableDetection } from "@/lib/livescan/types";

export interface StabiliserOptions {
  /** Below this score a detection is ignored completely. */
  minScore: number;
  /** At/above this score (plus enough frames) a track is shown unhedged. */
  confirmScore: number;
  /** Frames a track must be seen on before it is confirmed. */
  confirmFrames: number;
  /** Frames a track must be seen on before it is shown at all. */
  showFrames: number;
  /** How long a track survives without being seen again. */
  ttlMs: number;
  /** Overlap needed to treat two boxes as the same object. */
  iouThreshold: number;
  /** Hard cap so a pathological frame can't grow the overlay unbounded. */
  maxTracks: number;
}

export const DEFAULT_STABILISER_OPTIONS: StabiliserOptions = {
  minScore: 0.4,
  confirmScore: 0.6,
  confirmFrames: 3,
  showFrames: 2,
  ttlMs: 1200,
  iouThreshold: 0.3,
  maxTracks: 12,
};

interface Track extends StableDetection {
  missedSince: number | null;
}

export function intersectionOverUnion(a: BoundingBox, b: BoundingBox): number {
  const [ax, ay, aw, ah] = a;
  const [bx, by, bw, bh] = b;
  if (aw <= 0 || ah <= 0 || bw <= 0 || bh <= 0) return 0;
  const x = Math.max(ax, bx);
  const y = Math.max(ay, by);
  const right = Math.min(ax + aw, bx + bw);
  const bottom = Math.min(ay + ah, by + bh);
  if (right <= x || bottom <= y) return 0;
  const overlap = (right - x) * (bottom - y);
  return overlap / (aw * ah + bw * bh - overlap);
}

const smooth = (previous: number, next: number, weight = 0.6) =>
  previous * (1 - weight) + next * weight;

export class DetectionStabiliser {
  private readonly options: StabiliserOptions;
  private tracks: Track[] = [];
  private sequence = 0;

  constructor(options: Partial<StabiliserOptions> = {}) {
    this.options = { ...DEFAULT_STABILISER_OPTIONS, ...options };
  }

  /** Feeds one frame of raw detections and returns the detections to display. */
  update(raw: RawDetection[], now: number): StableDetection[] {
    const matched = new Set<string>();

    for (const detection of raw) {
      if (!Number.isFinite(detection.score) || detection.score < this.options.minScore) continue;
      const mapped = mapLiveClass(detection.class);
      if (!mapped) continue; // Unknown or irrelevant: the post-capture AI handles it.

      const existing = this.bestMatch(detection, matched);
      if (existing) {
        matched.add(existing.id);
        existing.frames += 1;
        existing.score = smooth(existing.score, detection.score);
        existing.bbox = existing.bbox.map((value, index) =>
          smooth(value, detection.bbox[index] ?? value),
        ) as BoundingBox;
        existing.lastSeenAt = now;
        existing.missedSince = null;
        existing.confirmed = this.isConfirmed(existing);
        continue;
      }

      if (this.tracks.length >= this.options.maxTracks) continue;
      this.sequence += 1;
      const track: Track = {
        id: `live-${this.sequence}`,
        rawClass: detection.class.trim().toLowerCase(),
        label: mapped.label,
        category: mapped.category,
        catalogueKey: mapped.catalogueKey,
        score: detection.score,
        bbox: [...detection.bbox] as BoundingBox,
        frames: 1,
        confirmed: false,
        firstSeenAt: now,
        lastSeenAt: now,
        missedSince: null,
      };
      this.tracks.push(track);
      matched.add(track.id);
    }

    for (const track of this.tracks) {
      if (!matched.has(track.id) && track.missedSince === null) track.missedSince = now;
    }

    // Short persistence: one missed frame must not delete a real object.
    this.tracks = this.tracks.filter((track) => now - track.lastSeenAt <= this.options.ttlMs);

    return this.visible();
  }

  /** Tracks stable enough to draw. Transient one-frame noise never appears. */
  visible(): StableDetection[] {
    return this.tracks
      .filter((track) => track.frames >= this.options.showFrames)
      .map(({ missedSince: _missedSince, ...detection }) => ({ ...detection }));
  }

  /** Provisional counts by label — never a canonical inventory. */
  counts(): Array<{ label: string; count: number; category: string | null }> {
    const totals = new Map<string, { label: string; count: number; category: string | null }>();
    for (const detection of this.visible()) {
      const entry = totals.get(detection.label) ?? {
        label: detection.label,
        count: 0,
        category: detection.category,
      };
      entry.count += 1;
      totals.set(detection.label, entry);
    }
    return [...totals.values()].sort((a, b) => b.count - a.count);
  }

  reset(): void {
    this.tracks = [];
  }

  private isConfirmed(track: Track): boolean {
    return track.frames >= this.options.confirmFrames && track.score >= this.options.confirmScore;
  }

  private bestMatch(detection: RawDetection, taken: Set<string>): Track | null {
    const rawClass = detection.class.trim().toLowerCase();
    let best: Track | null = null;
    let bestScore = this.options.iouThreshold;
    for (const track of this.tracks) {
      if (taken.has(track.id) || track.rawClass !== rawClass) continue;
      const overlap = intersectionOverUnion(track.bbox, detection.bbox);
      if (overlap >= bestScore) {
        best = track;
        bestScore = overlap;
      }
    }
    return best;
  }
}

export type { LiveTaxonomyEntry };
