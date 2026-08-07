/**
 * Stage 10 — object relationships.
 *
 * Boxes on shelves, a bike leaning on a wall, a TV on a cabinet, a mattress
 * against a wall, a suitcase inside a wardrobe. The hierarchy matters for
 * planning: something resting on something else is not separate floor space.
 *
 * Relationships are inferred from bounding-box geometry within a single frame,
 * so they are only proposed when two objects were actually seen together.
 */
import type { VisionObject, VisionRelationKind, VisionRelationship } from "./contracts";
import type { FusedDetection } from "./fusion";

interface Rule {
  kind: VisionRelationKind;
  subject: (key: string, subcategory: string) => boolean;
  object: (key: string, subcategory: string) => boolean;
  explanation: (subject: string, object: string) => string;
  confidence: number;
}

const isBox = (key: string) =>
  key.includes("box") || key === "plastic-tub" || key === "storage-bin" || key === "retail-stock";

const RULES: Rule[] = [
  {
    kind: "on_top_of",
    subject: (key) => isBox(key),
    object: (_key, subcategory) => subcategory === "Shelving",
    explanation: (subject, object) => `${subject} sit on the ${object.toLowerCase()} rather than the floor.`,
    confidence: 0.82,
  },
  {
    kind: "on_top_of",
    subject: (_key, subcategory) => subcategory === "Screen",
    object: (key, subcategory) => subcategory === "Table" || key === "chest-drawers",
    explanation: (subject, object) => `${subject} stands on the ${object.toLowerCase()}.`,
    confidence: 0.8,
  },
  {
    kind: "leaning_against",
    subject: (key) => key === "bicycle" || key === "ladder" || key === "surfboard",
    object: (_key, subcategory) => subcategory === "Shelving" || subcategory === "Bedroom furniture",
    explanation: (subject, object) => `${subject} leans against the ${object.toLowerCase()} rather than standing free.`,
    confidence: 0.74,
  },
  {
    kind: "leaning_against",
    subject: (_key, subcategory) => subcategory === "Mattress",
    object: (_key, subcategory) => subcategory === "Bed",
    explanation: (subject, object) => `${subject} rests against the ${object.toLowerCase()}.`,
    confidence: 0.72,
  },
  {
    kind: "inside",
    subject: (_key, subcategory) => subcategory === "Luggage",
    object: (key) => key === "wardrobe",
    explanation: (subject, object) => `${subject} is stored inside the ${object.toLowerCase()}.`,
    confidence: 0.7,
  },
  {
    kind: "stacked_with",
    subject: (key) => isBox(key),
    object: (key) => isBox(key),
    explanation: (subject, object) => `${subject} and ${object.toLowerCase()} form one stack.`,
    confidence: 0.68,
  },
];

/** True when two detections were seen together in at least one photo. */
function sharesPhoto(a: FusedDetection, b: FusedDetection): boolean {
  return a.photoIds.some((id) => b.photoIds.includes(id));
}

export function buildRelationships(
  objects: VisionObject[],
  detections: Map<string, FusedDetection>,
): VisionRelationship[] {
  const out: VisionRelationship[] = [];

  for (const subject of objects) {
    for (const object of objects) {
      if (subject.id === object.id) continue;
      const subjectDetection = detections.get(subject.classKey);
      const objectDetection = detections.get(object.classKey);
      if (!subjectDetection || !objectDetection) continue;
      if (!sharesPhoto(subjectDetection, objectDetection)) continue;

      for (const rule of RULES) {
        if (!rule.subject(subject.classKey, subject.classification.subcategory)) continue;
        if (!rule.object(object.classKey, object.classification.subcategory)) continue;
        if (rule.kind === "stacked_with" && subject.classKey === object.classKey) continue;

        const id = `rel-${rule.kind}-${subject.id}-${object.id}`;
        if (out.some((entry) => entry.id === id)) continue;
        // A stack is symmetric; keep one direction only.
        if (
          rule.kind === "stacked_with" &&
          out.some((entry) => entry.subjectId === object.id && entry.objectId === subject.id)
        ) {
          continue;
        }

        out.push({
          id,
          kind: rule.kind,
          subjectId: subject.id,
          objectId: object.id,
          confidence:
            Math.round(
              rule.confidence *
                Math.min(subject.confidence.overall, object.confidence.overall) *
                100,
            ) / 100,
          explanation: rule.explanation(subject.label, object.label),
        });
        break;
      }
    }
  }

  return out.sort((a, b) => b.confidence - a.confidence);
}
