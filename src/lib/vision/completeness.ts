/**
 * Phase 6Y — inventory completeness sanity check.
 *
 * Phase 6X made belongings detection fast. It also, in live use, made it
 * *thin*: the fast model would return the television but not the stand, one
 * suitcase but not the one beside it, and almost none of the small objects on
 * the floor. Speed bought at the cost of recall is not a win — the photograph
 * is the source of truth for what the user owns, and everything visible in it
 * has to reach the planner.
 *
 * This module is the deterministic guard. It never adds an object and never
 * removes one; it only reads a finished scan and answers one question: does
 * this look like a COMPLETE enumeration of the photograph, or does it look
 * like the model stopped early? A "no" triggers one extra, tightly constrained
 * sweep call — not a return to the slow reasoning pipeline.
 */

/** The minimum a photograph of someone's belongings usually yields. */
export const MIN_OBJECTS_PER_PHOTO = 4;
/** Longest side, in centimetres, under which an object counts as "small". */
export const SMALL_OBJECT_CM = 45;
/** A scan of several large objects with no small ones at all is suspicious. */
export const LARGE_OBJECTS_WITHOUT_SMALL = 2;

export interface CompletenessInput {
  /** One entry per distinct detected object. */
  items: readonly { label: string; widthCm: number; depthCm: number; heightCm: number }[];
  photoCount: number;
  /** "selected" scans are deliberately narrow and are never flagged. */
  mode: "selected" | "whole";
}

export interface CompletenessVerdict {
  /** True when the scan should get one extra sweep before planning. */
  incomplete: boolean;
  /** Plain-language reasons, for diagnostics. Empty when the scan looks fine. */
  reasons: string[];
  objectCount: number;
  smallObjectCount: number;
  /** Objects per photograph, rounded to one decimal. */
  density: number;
}

function longestSideCm(item: { widthCm: number; depthCm: number; heightCm: number }): number {
  return Math.max(item.widthCm, item.depthCm, item.heightCm);
}

/**
 * Decides whether a finished scan looks like it missed things.
 *
 * Deliberately conservative: a false "complete" costs the user their
 * belongings, a false "incomplete" costs one compact model call.
 */
export function assessCompleteness(input: CompletenessInput): CompletenessVerdict {
  const objectCount = input.items.length;
  const photoCount = Math.max(1, input.photoCount);
  const smallObjectCount = input.items.filter(
    (item) => longestSideCm(item) <= SMALL_OBJECT_CM,
  ).length;
  const largeObjectCount = objectCount - smallObjectCount;
  const density = Math.round((objectCount / photoCount) * 10) / 10;
  const reasons: string[] = [];

  // A marked region is meant to be narrow. Never second-guess the user.
  if (input.mode === "selected") {
    return { incomplete: false, reasons, objectCount, smallObjectCount, density };
  }

  if (objectCount === 0) {
    // An empty scan is either an empty photograph or a failed one. Sweeping
    // an empty photograph is cheap; missing a full one is not.
    reasons.push("nothing at all was returned for this photograph");
  } else if (density < MIN_OBJECTS_PER_PHOTO) {
    reasons.push(
      `only ${objectCount} object${objectCount === 1 ? "" : "s"} across ${photoCount} photograph${
        photoCount === 1 ? "" : "s"
      }`,
    );
  }

  if (smallObjectCount === 0 && largeObjectCount >= LARGE_OBJECTS_WITHOUT_SMALL) {
    reasons.push("large objects were found but no small ones, which is rarely true of a real room");
  }

  return {
    incomplete: reasons.length > 0,
    reasons,
    objectCount,
    smallObjectCount,
    density,
  };
}
