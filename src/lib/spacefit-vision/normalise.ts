/**
 * SpaceFit Vision — catalogue normalisation, duplicate reconciliation and
 * confidence banding.
 *
 * Pure functions only. Nothing here talks to a provider or the database, so
 * the same logic runs server-side (before storing detections) and client-side
 * (when the renter reviews them).
 *
 * PRINCIPLE: the provider identifies objects; Project Stow's own catalogue
 * supplies typical dimensions. A detection is only forced onto a catalogue
 * entry when the match is reasonably confident — otherwise it stays a custom
 * item for the renter to confirm.
 */
import { CATALOGUE, CATALOGUE_BY_KEY, type CatalogueItem } from "@/lib/inventory-catalogue";
import type { ItemCategory } from "@/lib/inventory-model";
import type { VisionDetection } from "@/lib/spacefit-vision/schema";

/** Extra words that should steer a label towards a catalogue entry. */
const ALIASES: Record<string, string[]> = {
  "small-box": ["small box", "small cardboard box", "small carton"],
  "medium-box": [
    "box",
    "boxes",
    "cardboard box",
    "moving box",
    "packing box",
    "medium box",
    "medium cardboard box",
    "carton",
  ],
  "large-box": ["large box", "large cardboard box", "big box", "tea chest"],
  "plastic-storage-box": ["plastic box", "storage box", "plastic crate", "crate", "tub", "really useful box"],
  "cabin-suitcase": ["cabin suitcase", "carry on", "carry-on", "hand luggage", "small suitcase"],
  "medium-suitcase": ["suitcase", "luggage", "medium suitcase", "trolley case"],
  "large-suitcase": ["large suitcase", "big suitcase", "hold luggage"],
  "duffel-bag": ["duffel", "duffle", "holdall", "sports bag", "kit bag", "bag"],
  "dining-chair": ["dining chair", "chair", "kitchen chair"],
  armchair: ["armchair", "arm chair", "easy chair", "recliner"],
  "office-chair": ["office chair", "swivel chair"],
  "coffee-table": ["coffee table", "side table"],
  "dining-table": ["dining table", "kitchen table", "table"],
  "bedside-table": ["bedside table", "nightstand"],
  "chest-of-drawers": ["chest of drawers", "drawers", "dresser", "drawer unit"],
  bookshelf: ["bookshelf", "bookcase", "shelving unit", "shelves"],
  desk: ["desk", "writing desk", "computer desk"],
  "single-mattress": ["single mattress"],
  "double-mattress": ["mattress", "double mattress", "king mattress"],
  sofa: ["sofa", "settee", "couch", "two seater sofa", "three seater sofa"],
  microwave: ["microwave", "microwave oven"],
  "vacuum-cleaner": ["vacuum", "hoover", "vacuum cleaner"],
  "mini-fridge": ["mini fridge", "fridge", "refrigerator", "under counter fridge"],
  "washing-machine": ["washing machine", "washer", "tumble dryer", "dryer"],
  tv: ["tv", "television", "flat screen", "flatscreen tv"],
  "computer-monitor": ["monitor", "computer monitor", "screen"],
  "desktop-computer": ["desktop", "pc", "computer tower", "desktop computer"],
  bicycle: ["bike", "bicycle", "adult bicycle", "road bike", "mountain bike", "push bike", "cycle"],
  "golf-bag": ["golf bag", "golf clubs"],
  "ski-equipment": ["skis", "ski", "ski equipment"],
  snowboard: ["snowboard"],
  "bedding-bag": ["bedding bag", "duvet bag", "vacuum bag", "bedding"],
  "archive-box": ["archive box", "banker box", "file box"],
  "stock-box": ["stock box", "stock carton"],
  "equipment-case": ["equipment case", "flight case", "tool case"],
  "document-box": ["document box", "paperwork box", "files"],
};

const ALIAS_INDEX: { key: string; phrase: string }[] = Object.entries(ALIASES).flatMap(
  ([key, phrases]) => phrases.map((phrase) => ({ key, phrase })),
);

function clean(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Very small singulariser — enough for "boxes" → "box". */
function singular(value: string) {
  return value.replace(/\b(\w+?)(ies)\b/g, "$1y").replace(/\b(\w+?)s\b/g, "$1");
}

export interface CatalogueMatch {
  item: CatalogueItem | null;
  /** How sure we are about the catalogue mapping itself (not the detection). */
  strength: "exact" | "strong" | "weak" | "none";
}

/**
 * Maps a free-text label (plus the provider's own catalogue guess) onto the
 * Project Stow catalogue. Uncertain matches return `none` so the renter is
 * asked rather than silently given the wrong typical size.
 */
export function matchCatalogue(
  label: string,
  suggestedKey?: string | null,
  category?: ItemCategory | null,
): CatalogueMatch {
  if (suggestedKey) {
    const direct = CATALOGUE_BY_KEY.get(suggestedKey.trim().toLowerCase());
    if (direct) return { item: direct, strength: "exact" };
  }

  const text = singular(clean(label));
  if (!text) return { item: null, strength: "none" };

  // Exact catalogue name
  for (const item of CATALOGUE) {
    if (singular(clean(item.name)) === text) return { item, strength: "exact" };
  }

  // Longest matching alias phrase wins ("large cardboard box" beats "box").
  let best: { key: string; length: number } | null = null;
  for (const { key, phrase } of ALIAS_INDEX) {
    const needle = singular(clean(phrase));
    if (!needle) continue;
    const hit = text === needle || text.includes(` ${needle}`) || text.startsWith(`${needle} `) || text.endsWith(` ${needle}`) || text === needle;
    if (hit && (!best || needle.length > best.length)) best = { key, length: needle.length };
  }
  if (best) {
    const item = CATALOGUE_BY_KEY.get(best.key) ?? null;
    if (item && (!category || item.category === category || category === "other")) {
      return { item, strength: best.length >= 6 ? "strong" : "weak" };
    }
    if (item) return { item, strength: "weak" };
  }

  return { item: null, strength: "none" };
}

/* ---------------------------------------------------------- confidence UX */

export type ReviewBand = "high" | "medium" | "low";

export const CONFIDENCE_THRESHOLDS = { high: 0.8, medium: 0.55 };

export function reviewBand(confidence: number | null | undefined): ReviewBand {
  if (confidence === null || confidence === undefined) return "medium";
  if (confidence >= CONFIDENCE_THRESHOLDS.high) return "high";
  if (confidence >= CONFIDENCE_THRESHOLDS.medium) return "medium";
  return "low";
}

export const REVIEW_BAND_LABEL: Record<ReviewBand, string> = {
  high: "Looks clear",
  medium: "Please check",
  low: "Not sure — is this right?",
};

/* ------------------------------------------------- duplicate reconciliation */

export type DuplicateCertainty = "likely_same" | "possibly_same" | "likely_different";

export interface NormalisedDetection extends VisionDetection {
  /** Photo indexes the detection was seen in, after merging. */
  source_photo_indexes: number[];
  catalogue_key: string | null;
  catalogue_strength: CatalogueMatch["strength"];
  category: ItemCategory;
  duplicate_certainty: DuplicateCertainty | null;
}

const SINGLE_OBJECT_CATEGORIES: ItemCategory[] = [
  "bicycles",
  "furniture",
  "appliances",
  "electronics",
  "sports",
];

/**
 * Reconciles detections across photographs.
 *
 * Overlapping photos of the same belongings must not become several copies of
 * the same bicycle. Where the provider grouped detections, or where the same
 * distinctive single object appears in more than one photo, we merge into one
 * line and record how sure we are:
 *
 *  - likely_same       → merged, quantity kept at the largest single sighting
 *  - possibly_same     → merged, renter is explicitly asked to confirm the count
 *  - likely_different  → left separate
 *
 * Repeatable goods (boxes, bags, documents) are never merged down to one — the
 * renter corrects the count instead, which is far easier than re-counting.
 */
export function reconcileDetections(detections: VisionDetection[]): NormalisedDetection[] {
  const normalised = detections.map((detection) => {
    const match = matchCatalogue(
      detection.label,
      detection.suggested_catalogue_key,
      detection.suggested_category,
    );
    const category = (match.strength === "exact" || match.strength === "strong"
      ? match.item!.category
      : detection.suggested_category) as ItemCategory;
    return {
      ...detection,
      catalogue_key: match.strength === "weak" || match.strength === "none" ? match.item?.key ?? null : match.item!.key,
      catalogue_strength: match.strength,
      category,
    } as NormalisedDetection;
  });

  const groups = new Map<string, NormalisedDetection[]>();
  for (const detection of normalised) {
    const providerGroup = detection.possible_duplicate_group?.trim().toLowerCase();
    const identity =
      providerGroup && detection.duplicate_certainty !== "likely_different"
        ? `g:${providerGroup}`
        : SINGLE_OBJECT_CATEGORIES.includes(detection.category)
          ? `k:${detection.catalogue_key ?? singular(clean(detection.label))}`
          : `u:${Math.random()}`;
    const bucket = groups.get(identity) ?? [];
    bucket.push(detection);
    groups.set(identity, bucket);
  }

  const merged: NormalisedDetection[] = [];
  for (const bucket of groups.values()) {
    if (bucket.length === 1) {
      merged.push(bucket[0]!);
      continue;
    }
    const primary = bucket.reduce((a, b) => ((b.confidence ?? 0) > (a.confidence ?? 0) ? b : a));
    const photoIndexes = Array.from(new Set(bucket.flatMap((d) => d.source_photo_indexes))).sort();
    const repeatable = !SINGLE_OBJECT_CATEGORIES.includes(primary.category);
    const explicitlySame = bucket.some((d) => d.duplicate_certainty === "likely_same");

    merged.push({
      ...primary,
      // Repeatable goods: keep the largest single sighting rather than summing
      // overlapping photos. Single objects: one thing, seen more than once.
      quantity: repeatable ? Math.max(...bucket.map((d) => d.quantity)) : Math.max(...bucket.map((d) => d.quantity)),
      source_photo_indexes: photoIndexes,
      duplicate_certainty: explicitlySame ? "likely_same" : "possibly_same",
      possible_duplicate_group: primary.possible_duplicate_group ?? primary.catalogue_key ?? primary.label,
    });
  }

  return merged;
}

/** Copy shown when a detection was seen in more than one photo. */
export function duplicateNotice(
  detection: Pick<NormalisedDetection, "duplicate_certainty" | "source_photo_indexes" | "label">,
): string | null {
  if (detection.source_photo_indexes.length < 2 && !detection.duplicate_certainty) return null;
  if (detection.duplicate_certainty === "likely_same") {
    return `We may have seen this ${detection.label.toLowerCase()} in more than one photo — check the quantity.`;
  }
  if (detection.duplicate_certainty === "possibly_same") {
    return `This might be the same ${detection.label.toLowerCase()} in more than one photo. How many are you storing?`;
  }
  return null;
}
