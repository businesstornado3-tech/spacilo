/**
 * Phase 6AB — deterministic multi-photo IDENTITY RESOLUTION.
 *
 * Several photographs of the same belongings are several VIEWS of one
 * inventory, not several inventories. The job of this module is to decide,
 * without a model and without ambiguity, which detections are the same
 * physical object seen from another angle and which are genuinely separate
 * things somebody owns.
 *
 * The rules:
 *
 *   • Two detections in the SAME photograph are two physical objects. They
 *     never merge, whatever their labels say.
 *   • Across photographs the default assumption for a "your stuff" upload is
 *     that the same noun is the same object — one TV photographed twice is
 *     one TV. Quantity is therefore the largest seen in any single frame,
 *     never the sum.
 *   • That default is overridden by CONTRADICTING evidence: a different
 *     colour, a different material, a different size word, or dimensions that
 *     cannot describe the same thing. A grey suitcase is not a blue suitcase;
 *     a small blue suitcase is not a large blue suitcase.
 *   • Descriptors present on one side and simply absent on the other are not
 *     a contradiction: "TV" and "black TV" are the same television.
 *   • Angles distort apparent size, so the cross-photo dimension tolerance is
 *     deliberately wider than a same-frame comparison would be.
 *
 * A merge never deletes: it unions the photo ids, keeps the higher confidence
 * and the larger quantity, and records a reason that diagnostics can show.
 */
import type { DetectedObject } from "./types";

/** Descriptor groups. A conflict WITHIN a group keeps two objects apart. */
const COLOUR =
  /\b(black|white|grey|gray|silver|blue|navy|red|green|yellow|orange|purple|pink|brown|beige|cream|tan|gold|clear|transparent)\b/g;
const MATERIAL = /\b(wooden|wood|metal|steel|plastic|cardboard|fabric|leather|glass|canvas)\b/g;
const SIZE = /\b(large|small|medium|big|tall|short|mini|compact|oversized)\b/g;

/**
 * Everything that is noise for identity purposes — articles, filler and the
 * styling words detectors sprinkle on the same object ("flat screen TV",
 * "smart television").
 */
const NOISE =
  /\b(a|an|the|of|with|and|approx|approximately|about|item|object|flat|flatscreen|flat-screen|smart|led|lcd|plasma|modern|old|new|standard|typical|generic)\b/g;

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
  const stripped = normaliseLabel(label)
    .replace(COLOUR, " ")
    .replace(MATERIAL, " ")
    .replace(SIZE, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Detectors are inconsistent between everyday synonyms for the same thing;
  // "TV" and "television" are one object, and identity must not depend on
  // which word the model happened to choose.
  return stripped
    .split(" ")
    .map((word) => SYNONYMS[word] ?? word)
    .filter((word, index, words) => word.length > 0 && words.indexOf(word) === index)
    .join(" ")
    .trim();
}

/** Everyday synonyms collapsed to one canonical noun. */
const SYNONYMS: Record<string, string> = {
  tv: "television",
  telly: "television",
  screen: "television",
  monitor: "television",
  couch: "sofa",
  settee: "sofa",
  fridge: "refrigerator",
  bike: "bicycle",
  cycle: "bicycle",
  case: "suitcase",
  luggage: "suitcase",
  carton: "box",
  crate: "box",
  cupboard: "wardrobe",
  bookshelf: "shelving",
  bookcase: "shelving",
  shelf: "shelving",
  rug: "carpet",
  pram: "pushchair",
  stroller: "pushchair",
};

/** The descriptors themselves, sorted, so comparison is order-independent. */
export function descriptorsOf(label: string): string[] {
  const text = normaliseLabel(label);
  return [
    ...new Set([
      ...(text.match(COLOUR) ?? []),
      ...(text.match(MATERIAL) ?? []),
      ...(text.match(SIZE) ?? []),
    ]),
  ].sort();
}

function groupsOf(label: string): { colour: string[]; material: string[]; size: string[] } {
  const text = normaliseLabel(label);
  const pick = (pattern: RegExp) => [...new Set(text.match(pattern) ?? [])].sort();
  return { colour: pick(COLOUR), material: pick(MATERIAL), size: pick(SIZE) };
}

/**
 * True when a descriptor group CONTRADICTS: both sides said something and
 * said different things. Silence on one side is never a contradiction.
 */
function contradicts(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  return !a.some((token) => b.includes(token));
}

/**
 * Dimensions agree when every axis is within tolerance. The cross-photo
 * default is wide: the same suitcase photographed head-on and at 45° is
 * routinely estimated 30% apart.
 */
export function dimensionsAgree(
  a: Pick<DetectedObject, "width" | "depth" | "height">,
  b: Pick<DetectedObject, "width" | "depth" | "height">,
  relative = 0.35,
  absoluteCm = 15,
): boolean {
  const axes: (keyof typeof a)[] = ["width", "depth", "height"];
  return axes.every((axis) => {
    const left = Math.max(0, a[axis]);
    const right = Math.max(0, b[axis]);
    const delta = Math.abs(left - right);
    return delta <= absoluteCm || delta <= Math.max(left, right) * relative;
  });
}

export type IdentityVerdict =
  | { same: true; reason: string }
  | { same: false; reason: string };

/**
 * The identity decision, with its reason. Every merge and every retention in
 * the report comes from here, so both are explainable and testable.
 */
export function resolveIdentity(a: DetectedObject, b: DetectedObject): IdentityVerdict {
  const sharesPhoto = a.photoIds.some((id) => b.photoIds.includes(id));
  if (sharesPhoto && a.photoIds.length > 0) {
    return { same: false, reason: "seen together in the same photograph" };
  }
  if (a.category !== b.category) return { same: false, reason: "different category" };
  if (a.fragile !== b.fragile) return { same: false, reason: "different fragility" };

  const identityA = identityOf(a.label);
  const identityB = identityOf(b.label);
  if (!identityA || !identityB) return { same: false, reason: "no comparable label" };
  if (identityA !== identityB) return { same: false, reason: "different object type" };

  const left = groupsOf(a.label);
  const right = groupsOf(b.label);
  if (contradicts(left.colour, right.colour)) return { same: false, reason: "different colour" };
  if (contradicts(left.material, right.material)) {
    return { same: false, reason: "different material" };
  }
  if (contradicts(left.size, right.size)) return { same: false, reason: "different stated size" };
  if (!dimensionsAgree(a, b)) return { same: false, reason: "different dimensions" };

  return { same: true, reason: "same object photographed from another angle" };
}

/** True when two detections are the same physical object seen twice. */
export function isSameObjectAcrossPhotos(a: DetectedObject, b: DetectedObject): boolean {
  return resolveIdentity(a, b).same;
}

function combine(a: DetectedObject, b: DetectedObject): DetectedObject {
  // The more confident view supplies the dimensions and the wording; ties go
  // to the first-seen object so the result never depends on ordering luck.
  const primary = b.confidence > a.confidence ? b : a;
  const secondary = primary === a ? b : a;
  return {
    ...primary,
    id: a.id,
    // Views of one object never add up: the count is the most seen at once.
    quantity: Math.max(a.quantity, b.quantity),
    confidence: Math.max(a.confidence, b.confidence),
    stackable: a.stackable || b.stackable,
    photoIds: [...new Set([...a.photoIds, ...b.photoIds])],
    identityGroupId: a.identityGroupId ?? a.id,
    ...(primary.evidence || secondary.evidence
      ? { evidence: primary.evidence ?? secondary.evidence }
      : {}),
  };
}

/** One explainable identity decision, for diagnostics and tests. */
export interface MergeDecision {
  kind: "merged" | "retained";
  identityGroupId: string;
  labels: string[];
  photoIds: string[];
  reason: string;
}

export interface MergeReport {
  /** Units before merging, across every photograph. */
  inputUnits: number;
  /** Units after merging. Never larger than the input. */
  outputUnits: number;
  /** Raw visual detections, before identity resolution. */
  rawDetectionCount: number;
  /** Distinct physical objects after identity resolution. */
  uniquePhysicalObjectCount: number;
  /** Distinct objects after merging. Same as the unique physical count. */
  mergedObjectCount: number;
  /** Units per source photograph, keyed by photo id. */
  objectsPerPhoto: Record<string, number>;
  photoCount: number;
  /** How many duplicate views were collapsed. */
  duplicateViewsMerged: number;
  /** Alias used by the performance diagnostics panel. */
  mergedViewCount: number;
  /** Why each merge happened, and why near-misses were kept apart. */
  decisions: MergeDecision[];
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
  const decisions: MergeDecision[] = [];
  let duplicateViewsMerged = 0;

  for (const object of objects) {
    let mergedInto = -1;
    let nearMiss: { index: number; reason: string } | null = null;

    for (let index = 0; index < out.length; index += 1) {
      const verdict = resolveIdentity(out[index]!, object);
      if (verdict.same) {
        mergedInto = index;
        decisions.push({
          kind: "merged",
          identityGroupId: out[index]!.identityGroupId ?? out[index]!.id,
          labels: [out[index]!.label, object.label],
          photoIds: [...new Set([...out[index]!.photoIds, ...object.photoIds])],
          reason: verdict.reason,
        });
        break;
      }
      // A same-type object kept apart is the interesting near-miss: report it
      // so a wrongly-retained duplicate is diagnosable rather than invisible.
      if (
        !nearMiss &&
        out[index]!.category === object.category &&
        identityOf(out[index]!.label) === identityOf(object.label)
      ) {
        nearMiss = { index, reason: verdict.reason };
      }
    }

    if (mergedInto < 0) {
      out.push({
        ...object,
        photoIds: [...object.photoIds],
        identityGroupId: object.identityGroupId ?? object.id,
      });
      if (nearMiss) {
        decisions.push({
          kind: "retained",
          identityGroupId: object.identityGroupId ?? object.id,
          labels: [out[nearMiss.index]!.label, object.label],
          photoIds: [...object.photoIds],
          reason: nearMiss.reason,
        });
      }
      continue;
    }

    out[mergedInto] = combine(out[mergedInto]!, object);
    duplicateViewsMerged += 1;
  }

  const outputUnits = out.reduce((sum, object) => sum + Math.max(0, object.quantity), 0);

  return {
    objects: out,
    report: {
      inputUnits,
      outputUnits,
      rawDetectionCount: objects.length,
      uniquePhysicalObjectCount: out.length,
      mergedObjectCount: out.length,
      objectsPerPhoto: perPhoto,
      photoCount: Object.keys(perPhoto).length,
      duplicateViewsMerged,
      mergedViewCount: duplicateViewsMerged,
      decisions,
    },
  };
}

/**
 * Label-only identity test, for callers that hold a raw detector payload
 * rather than a `DetectedObject` (the server-side cross-photo pass). Same
 * rules: same noun, no contradicting descriptor group.
 */
export function labelsDescribeSameObject(a: string, b: string): boolean {
  const identityA = identityOf(a);
  const identityB = identityOf(b);
  if (!identityA || !identityB || identityA !== identityB) return false;
  const left = groupsOf(a);
  const right = groupsOf(b);
  return (
    !contradicts(left.colour, right.colour) &&
    !contradicts(left.material, right.material) &&
    !contradicts(left.size, right.size)
  );
}
