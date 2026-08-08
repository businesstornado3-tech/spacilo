/**
 * Stage 4 — multi-image scene fusion.
 *
 * Five photos of one garage are one inventory, not five. Fusion decides how
 * many real objects exist behind a set of sightings and which sightings belong
 * to the same object.
 *
 * The rule is deliberately conservative: for a given class, the number of real
 * objects is the most seen in any single frame. Another angle of the same
 * three bikes is corroboration, never three more bikes. Over-counting a
 * customer's belongings is the expensive mistake, so the engine refuses to.
 */
import type { InstanceSighting } from "./segmentation";

export interface FusedInstance {
  /** Stable identity for one real object across every frame it appears in. */
  identityKey: string;
  classKey: string;
  label: string;
  ordinal: number;
  /** Every sighting attributed to this object, best frame first. */
  sightings: InstanceSighting[];
  photoIds: string[];
  viewpoints: InstanceSighting["viewpoint"][];
  /** Mean apparent area across frames — steadier than any single view. */
  apparentArea: number;
  detectionConfidence: number;
  /** How many frames independently confirm this object. */
  corroboration: number;
}

export interface FusionResult {
  instances: FusedInstance[];
  duplicatesMerged: number;
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;

function byQuality(a: InstanceSighting, b: InstanceSighting): number {
  if (b.frameQuality !== a.frameQuality) return b.frameQuality - a.frameQuality;
  if (b.detectionConfidence !== a.detectionConfidence) {
    return b.detectionConfidence - a.detectionConfidence;
  }
  return a.id.localeCompare(b.id);
}

export function fuseSightings(sightings: InstanceSighting[]): FusionResult {
  const byClass = new Map<string, InstanceSighting[]>();
  for (const sighting of sightings) {
    const bucket = byClass.get(sighting.classKey);
    if (bucket) bucket.push(sighting);
    else byClass.set(sighting.classKey, [sighting]);
  }

  const instances: FusedInstance[] = [];
  let duplicatesMerged = 0;

  for (const [classKey, group] of [...byClass.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    // Most of this class visible in any one frame = how many really exist.
    const perPhoto = new Map<string, InstanceSighting[]>();
    for (const sighting of group) {
      const bucket = perPhoto.get(sighting.photoId);
      if (bucket) bucket.push(sighting);
      else perPhoto.set(sighting.photoId, [sighting]);
    }
    const realCount = Math.max(...[...perPhoto.values()].map((rows) => rows.length));

    // Frames are ranked by quality; the best frame supplies the primary view.
    const frames = [...perPhoto.entries()].sort(([, a], [, b]) => byQuality(a[0]!, b[0]!));

    for (let index = 0; index < realCount; index += 1) {
      const attributed: InstanceSighting[] = [];
      for (const [, rows] of frames) {
        const ordered = [...rows].sort((a, b) => a.ordinal - b.ordinal);
        const match = ordered[index];
        if (match) attributed.push(match);
      }
      if (attributed.length === 0) continue;
      attributed.sort(byQuality);
      duplicatesMerged += attributed.length - 1;

      const apparentArea =
        attributed.reduce((sum, entry) => sum + entry.apparentArea, 0) / attributed.length;
      const best = attributed[0]!;
      // Repeated sightings raise confidence, but never past what evidence supports.
      const boost = Math.min(0.12, (attributed.length - 1) * 0.05);
      const detectionConfidence =
        Math.round(Math.min(0.97, best.detectionConfidence + boost) * 100) / 100;

      instances.push({
        identityKey: `${classKey}#${index + 1}`,
        classKey,
        label: best.label,
        ordinal: index + 1,
        sightings: attributed,
        photoIds: [...new Set(attributed.map((entry) => entry.photoId))],
        viewpoints: [...new Set(attributed.map((entry) => entry.viewpoint))],
        apparentArea: round3(apparentArea),
        detectionConfidence,
        corroboration: attributed.length,
      });
    }
  }

  return { instances, duplicatesMerged };
}
