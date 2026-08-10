/**
 * Phase 6AA — deterministic multi-photo inventory merge.
 *
 * Two photographs of the SAME belongings from different angles must INCREASE
 * recall. They must never make the inventory smaller, and they must never
 * pick "photo A or photo B": the result is the deterministic UNION of both
 * views, with genuine duplicate views of one physical object collapsed.
 *
 * The rules are deliberately conservative, because a wrong merge silently
 * deletes something somebody owns:
 *
 *   • Two objects seen in the SAME photograph are two physical objects.
 *     They never merge, whatever their labels say.
 *   • Two objects merge only when their canonical identity matches AND their
 *     estimated dimensions agree AND no distinguishing descriptor (colour,
 *     material, size word) contradicts.
 *   • "grey suitcase" and "blue suitcase" never merge. "box" and "box" of
 *     clearly different sizes never merge.
 *   • A merge keeps the larger quantity, the higher confidence, the better
 *     evidence and every source photo id — never less than either input.
 *
 * No model is involved. The same detections always merge the same way.
 */
import type { DetectedObject } from "./types";

/** Descriptors that make two otherwise identical labels different objects. */
const DISTINGUISHERS =
  /\b(black|white|grey|gray|silver|blue|navy|red|green|yellow|orange|purple|pink|brown|beige|cream|tan|gold|clear|transparent|wooden|metal|plastic|cardboard|fabric|leather|large|small|medium|big|tall|short|wheeled|hard[- ]?shell|soft)\b/g;

/** Everything that is noise for identity purposes. */
const NOISE = /\b(a|an|the|of|with|and|approx|approximately|about|item|object)\b/g;

export function normaliseLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The identity of the object with its descriptors stripped out. */
export function identityOf(label: string): string {
  return normaliseLabel(label).replace(DISTINGUISHERS, " ").replace(/\s+/g, " ").trim();
}

/** The descriptors themselves, sorted, so comparison is order-independent. */
export function descriptorsOf(label: string): string[] {
  return [...new Set(normaliseLabel(label).match(DISTINGUISHERS) ?? [])].sort();
}

/** Dimensions agree when every axis is within tolerance. */
export function dimensionsAgree(
  a: Pick<DetectedObject, "width" | "depth" | "height">,
  b: Pick<DetectedObject, "width" | "depth" | "height">,
  relative = 0.2,
  absoluteCm = 8,
): boolean {
  const axes: (keyof typeof a)[] = ["width", "depth", "height"];
  return axes.every((axis) => {
    const left = Math.max(0, a[axis]);
    const right = Math.max(0, b[axis]);
    const delta = Math.abs(left - right);
    return delta <= absoluteCm || delta <= Math.max(left, right) * relative;
  });
}

/** True when two detections are the same physical object seen twice. */
export function isSameObjectAcrossPhotos(a: DetectedObject, b: DetectedObject): boolean {
  // Same photograph → two different things. Never merged.
  const sharesPhoto = a.photoIds.some((id) => b.photoIds.includes(id));
  if (sharesPhoto && a.photoIds.length > 0) return false;

  if (a.category !== b.category) return false;
  if (a.fragile !== b.fragile) return false;

  const identityA = identityOf(a.label);
  const identityB = identityOf(b.label);
  if (!identityA || !identityB) return false;
  if (identityA !== identityB) return false;

  // A colour, material or size word present on one side and contradicted on
  // the other keeps them apart: a grey suitcase is not a blue suitcase.
  const descriptorsA = descriptorsOf(a.label);
  const descriptorsB = descriptorsOf(b.label);
  if (descriptorsA.length > 0 && descriptorsB.length > 0) {
    const same = descriptorsA.length === descriptorsB.length &&
      descriptorsA.every((token, index) => token === descriptorsB[index]);
    if (!same) return false;
  }

  return dimensionsAgree(a, b);
}

function combine(a: DetectedObject, b: DetectedObject): DetectedObject {
  // The more confident view supplies the dimensions and the wording; ties go
  // to the first-seen object so the result never depends on ordering luck.
  const primary = b.confidence > a.confidence ? b : a;
  const secondary = primary === a ? b : a;
  return {
    ...primary,
    id: a.id,
    quantity: Math.max(a.quantity, b.quantity),
    confidence: Math.max(a.confidence, b.confidence),
    stackable: a.stackable || b.stackable,
    photoIds: [...new Set([...a.photoIds, ...b.photoIds])],
    ...(primary.evidence || secondary.evidence
      ? { evidence: primary.evidence ?? secondary.evidence }
      : {}),
  };
}

export interface MergeReport {
  /** Units before merging, across every photograph. */
  inputUnits: number;
  /** Units after merging. Never larger than the input. */
  outputUnits: number;
  /** Distinct objects after merging. */
  mergedObjectCount: number;
  /** Units per source photograph, keyed by photo id. */
  objectsPerPhoto: Record<string, number>;
  photoCount: number;
  /** How many duplicate views were collapsed. */
  duplicateViewsMerged: number;
}

/**
 * The union merge. Input order does not matter beyond deterministic
 * tie-breaking, and nothing is ever dropped: an object that matches nothing
 * survives untouched.
 */
export function mergeAcrossPhotos(objects: DetectedObject[]): {
  objects: DetectedObject[];
  report: MergeReport;
} {
  const perPhoto: Record<string, number> = {};
  let inputUnits = 0;
  for (const object of objects) {
    inputUnits += Math.max(0, object.quantity);
    for (const photoId of object.photoIds) {
      perPhoto[photoId] = (perPhoto[photoId] ?? 0) + Math.max(0, object.quantity);
    }
  }

  const out: DetectedObject[] = [];
  let duplicateViewsMerged = 0;

  for (const object of objects) {
    const index = out.findIndex((candidate) => isSameObjectAcrossPhotos(candidate, object));
    if (index < 0) {
      out.push({ ...object, photoIds: [...object.photoIds] });
      continue;
    }
    out[index] = combine(out[index]!, object);
    duplicateViewsMerged += 1;
  }

  const outputUnits = out.reduce((sum, object) => sum + Math.max(0, object.quantity), 0);

  return {
    objects: out,
    report: {
      inputUnits,
      outputUnits,
      mergedObjectCount: out.length,
      objectsPerPhoto: perPhoto,
      photoCount: Object.keys(perPhoto).length,
      duplicateViewsMerged,
    },
  };
}
