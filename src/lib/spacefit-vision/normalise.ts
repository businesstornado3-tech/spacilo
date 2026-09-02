/**
 * SpaceFit Vision — catalogue normalisation, duplicate reconciliation and
 * confidence banding.
 *
 * Pure functions only. Nothing here talks to a provider or the database, so
 * the same logic runs server-side (before storing detections) and client-side
 * (when the renter reviews them).
 *
 * PRINCIPLE: the provider identifies objects; EarnRoom's own catalogue
 * supplies typical dimensions. A detection is only forced onto a catalogue
 * entry when the match is reasonably confident — otherwise it stays a custom
 * item for the renter to confirm.
 */
import { CATALOGUE, CATALOGUE_BY_KEY, type CatalogueItem } from "@/lib/inventory-catalogue";
import type { ItemCategory } from "@/lib/inventory-model";
import {
  scoreToBand,
  type ConfidenceBand,
  type InventoryIntent,
  type VisionDetection,
} from "@/lib/spacefit-vision/schema";

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
 * EarnRoom catalogue. Uncertain matches return `none` so the renter is
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

export type ReviewBand = ConfidenceBand;

export const CONFIDENCE_THRESHOLDS = { high: 0.8, medium: 0.55 };

/** Legacy helper: turns a stored numeric score into a band. */
export function reviewBand(confidence: number | null | undefined): ReviewBand {
  return scoreToBand(confidence);
}

/**
 * Renter-facing status of a suggestion. Identification and count are shown as
 * two separate statements so the renter knows exactly what to check.
 */
export interface ReviewStatusCopy {
  /** "Item recognised" / "Please check item". */
  itemLabel: string;
  itemOk: boolean;
  /** "Quantity looks clear" / "Check quantity", or null for single objects. */
  quantityLabel: string | null;
  quantityOk: boolean;
  /** True when both identification and count are clear → "Looks clear". */
  allClear: boolean;
}

export function reviewStatus(input: {
  object_confidence: ConfidenceBand;
  quantity_confidence: ConfidenceBand;
  quantity: number;
}): ReviewStatusCopy {
  const itemOk = input.object_confidence === "high";
  const countMatters = input.quantity > 1 || input.quantity_confidence === "low";
  const quantityOk = input.quantity_confidence === "high";

  return {
    itemLabel: itemOk
      ? "Item recognised"
      : input.object_confidence === "medium"
        ? "Please check item"
        : "Not sure — is this right?",
    itemOk,
    quantityLabel: countMatters ? (quantityOk ? "Quantity looks clear" : "Check quantity") : null,
    quantityOk,
    allClear: itemOk && (quantityOk || !countMatters),
  };
}

export const REVIEW_BAND_LABEL: Record<ReviewBand, string> = {
  high: "Looks clear",
  medium: "Please check",
  low: "Not sure — is this right?",
};

/** "About 11" for uncertain counts, "11" when the count is clear. */
export function quantityDisplay(quantity: number, band: ConfidenceBand): string {
  return band === "high" ? String(quantity) : `About ${quantity}`;
}

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

/** Categories whose members are typically homogeneous and repeated. */
const REPEATED_CATEGORIES: ItemCategory[] = ["boxes", "bags", "documents", "business", "student"];

const BAND_RANK: Record<ConfidenceBand, number> = { low: 0, medium: 1, high: 2 };

function lowestBand(bands: ConfidenceBand[]): ConfidenceBand {
  return bands.reduce((a, b) => (BAND_RANK[b] < BAND_RANK[a] ? b : a), "high" as ConfidenceBand);
}

function downgrade(band: ConfidenceBand): ConfidenceBand {
  return band === "high" ? "medium" : "low";
}

export function isRepeatedItem(detection: {
  repeated_item_group?: boolean;
  category: ItemCategory;
  estimated_quantity: number;
}) {
  return (
    detection.repeated_item_group === true ||
    (REPEATED_CATEGORIES.includes(detection.category) && detection.estimated_quantity > 1)
  );
}

/**
 * Reconciles detections across photographs.
 *
 * Overlapping photos of the same belongings must not become several copies of
 * the same bicycle, and counts from separate photos are NEVER summed: the
 * merged quantity is the largest single reconciled sighting, because three
 * views of one stack of boxes is still one stack of boxes.
 *
 *  - likely_same       → merged, quantity kept at the largest single sighting
 *  - possibly_same     → merged, renter is explicitly asked to confirm the count
 *  - likely_different  → left separate
 *
 * Merging repeated goods across photos lowers quantity confidence rather than
 * inventing precision the photographs cannot support.
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
    const repeated = isRepeatedItem(detection);
    const identity =
      providerGroup && detection.duplicate_certainty !== "likely_different"
        ? `g:${providerGroup}`
        : SINGLE_OBJECT_CATEGORIES.includes(detection.category) || repeated
          ? `k:${detection.inventory_intent}:${detection.catalogue_key ?? singular(clean(detection.label))}`
          : `u:${groups.size}:${detection.label}`;
    const bucket = groups.get(identity) ?? [];
    bucket.push(detection);
    groups.set(identity, bucket);
  }

  const merged: NormalisedDetection[] = [];
  for (const bucket of groups.values()) {
    if (bucket.length === 1) {
      merged.push(withDerivedConfidence(bucket[0]!, false));
      continue;
    }
    const primary = bucket.reduce((a, b) =>
      BAND_RANK[b.object_confidence] > BAND_RANK[a.object_confidence] ? b : a,
    );
    const photoIndexes = Array.from(new Set(bucket.flatMap((d) => d.source_photo_indexes))).sort();
    const explicitlySame = bucket.some((d) => d.duplicate_certainty === "likely_same");

    // Never sum across photos: overlapping views of the same belongings are
    // one set of belongings. Take the largest single sighting instead.
    const quantity = Math.max(...bucket.map((d) => d.estimated_quantity));
    const min = Math.min(
      ...bucket.map((d) => d.minimum_plausible_quantity ?? d.estimated_quantity),
    );
    const max = Math.max(
      ...bucket.map((d) => d.maximum_plausible_quantity ?? d.estimated_quantity),
    );

    merged.push(
      withDerivedConfidence(
        {
          ...primary,
          estimated_quantity: quantity,
          minimum_plausible_quantity: Math.min(min, quantity),
          maximum_plausible_quantity: Math.max(max, quantity),
          object_confidence: primary.object_confidence,
          quantity_confidence: lowestBand(bucket.map((d) => d.quantity_confidence)),
          repeated_item_group: bucket.some((d) => isRepeatedItem(d)),
          source_photo_indexes: photoIndexes,
          duplicate_certainty: explicitlySame ? "likely_same" : "possibly_same",
          possible_duplicate_group:
            primary.possible_duplicate_group ?? primary.catalogue_key ?? primary.label,
        },
        true,
      ),
    );
  }

  return merged;
}

/**
 * Repeated goods seen across several photographs can never be counted exactly
 * from photos alone, so quantity confidence is capped accordingly. Object
 * confidence is untouched — knowing WHAT it is stays independent of HOW MANY.
 */
function withDerivedConfidence(
  detection: NormalisedDetection,
  mergedAcrossSightings: boolean,
): NormalisedDetection {
  const repeated = isRepeatedItem(detection);
  let quantityConfidence = detection.quantity_confidence;

  if (repeated && (mergedAcrossSightings || detection.source_photo_indexes.length > 1)) {
    quantityConfidence = downgrade(quantityConfidence);
  } else if (repeated && detection.estimated_quantity > 3 && quantityConfidence === "high") {
    quantityConfidence = "medium";
  }

  // A single distinctive object seen in several photos is still one object.
  if (!repeated && detection.estimated_quantity === 1) quantityConfidence = "high";

  const range = {
    min: detection.minimum_plausible_quantity,
    max: detection.maximum_plausible_quantity,
  };
  if (repeated && quantityConfidence !== "high") {
    const spread = Math.max(1, Math.round(detection.estimated_quantity * 0.2));
    range.min = Math.max(1, range.min ?? detection.estimated_quantity - spread);
    range.max = Math.max(range.min, range.max ?? detection.estimated_quantity + spread);
  }

  return {
    ...detection,
    quantity_confidence: quantityConfidence,
    repeated_item_group: repeated,
    minimum_plausible_quantity: range.min,
    maximum_plausible_quantity: range.max,
  };
}

/** Copy shown when a detection was seen in more than one photo. */
export function duplicateNotice(
  detection: Pick<
    NormalisedDetection,
    "duplicate_certainty" | "source_photo_indexes" | "label" | "repeated_item_group"
  > & { quantity_confidence?: ConfidenceBand },
): string | null {
  const seenTwice = detection.source_photo_indexes.length > 1;
  if (detection.repeated_item_group) {
    if (detection.quantity_confidence === "high" && !seenTwice) return null;
    return seenTwice
      ? `Some of these overlap across your photos. Please check the quantity.`
      : `These overlap in your photo, so the count is an estimate. Please check it.`;
  }
  if (!seenTwice && !detection.duplicate_certainty) return null;
  if (detection.duplicate_certainty === "likely_same") {
    return `We think this is the same ${detection.label.toLowerCase()} seen in more than one photo, so we've counted it once.`;
  }
  if (detection.duplicate_certainty === "possibly_same") {
    return `This might be the same ${detection.label.toLowerCase()} in more than one photo. How many are you storing?`;
  }
  return null;
}

/** Copy for detections that may be part of the room rather than belongings. */
export const INTENT_PROMPT: Record<InventoryIntent, string | null> = {
  likely_inventory: null,
  uncertain_inventory: "Is this one of your items?",
  likely_environment: "This looks like part of the room rather than something you're storing.",
};
