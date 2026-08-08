/**
 * Phase 6J — uncertain-object discipline.
 *
 * A low-confidence detection must never be promoted into a specific identity.
 * "Unclear object → probably shoes" is exactly the failure that put shoes into
 * a render when no shoes existed. Anything the recogniser is not confident
 * about is renamed to a neutral, category-level description so neither the
 * planner nor the renderer can treat a guess as a fact.
 */
import type { DetectedObject } from "@/lib/vision/types";

/** Below this, an AI-proposed identity is treated as unverified. */
export const IDENTITY_CONFIDENCE = 0.55;

const GENERIC_BY_CATEGORY: Record<string, string> = {
  boxes: "Unidentified box",
  luggage: "Unidentified case or bag",
  bags: "Unidentified bag",
  soft: "Unknown soft item",
  furniture: "Unidentified furniture item",
  appliances: "Unidentified appliance",
  electronics: "Unidentified electronic item",
  sports: "Unidentified sports item",
  garden: "Unidentified garden item",
  tools: "Unidentified tool or toolbox",
  other: "Unidentified object",
};

export function genericLabelFor(category: string): string {
  return GENERIC_BY_CATEGORY[category] ?? GENERIC_BY_CATEGORY["other"]!;
}

/**
 * Neutralises uncertain identities. Manual entries are the user's own words and
 * are always left exactly as written.
 */
export function generaliseUncertain(
  objects: DetectedObject[],
  threshold = IDENTITY_CONFIDENCE,
): DetectedObject[] {
  return objects.map((object) => {
    if (object.source === "manual" || object.confidence >= threshold) return object;
    const label = genericLabelFor(object.category);
    if (label === object.label) return object;
    return { ...object, label, catalogueId: null };
  });
}

/** True when nothing in the list carries an unverified specific identity. */
export function identitiesAreVerified(
  objects: DetectedObject[],
  threshold = IDENTITY_CONFIDENCE,
): boolean {
  return objects.every(
    (object) =>
      object.source === "manual" ||
      object.confidence >= threshold ||
      object.label === genericLabelFor(object.category),
  );
}
