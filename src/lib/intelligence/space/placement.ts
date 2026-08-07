/**
 * Milestone 8 + 13 — placement intelligence and its explanations.
 *
 * Turns zones into concrete "put this there, because…" proposals. Every
 * proposal names the surface, the reason, the evidence behind it, a confidence
 * and a priority — a recommendation without a reason cannot be constructed.
 */
import type {
  AccessAnalysis,
  PlacementProposal,
  RoomGeometry,
  Shelf,
  StorageZone,
  UsableSpace,
  ZoneKind,
} from "./contracts";
import { clamp01, round1 } from "./geometry";

interface Candidate {
  subject: string;
  label: string;
  zone: ZoneKind;
  surface: PlacementProposal["surface"];
  target: string;
  reason: string;
  priority: PlacementProposal["priority"];
  /** Extra evidence beyond the zone's own capacity. */
  evidence?: (context: PlacementContext) => string[];
  /** When false the candidate is skipped for this space. */
  applies?: (context: PlacementContext) => boolean;
}

export interface PlacementContext {
  geometry: RoomGeometry;
  zones: StorageZone[];
  shelves: Shelf[];
  usable: UsableSpace;
  access: AccessAnalysis;
}

const CANDIDATES: Candidate[] = [
  {
    subject: "wardrobe",
    label: "Wardrobe",
    zone: "large_furniture",
    surface: "floor",
    target: "Back wall, standing upright",
    reason: "Tall flat furniture stores best against the deepest wall, where nothing is lifted over it.",
    priority: "high",
    evidence: (context) => [
      `Ceiling clearance ${round1(context.geometry.ceiling.minHeightM)}m.`,
      `Back wall run ${round1(context.geometry.floor.widthM)}m.`,
    ],
    applies: (context) => context.geometry.ceiling.minHeightM >= 1.9,
  },
  {
    subject: "mattress",
    label: "Mattress",
    zone: "large_furniture",
    surface: "floor",
    target: "Side wall, stood on edge",
    reason: "A mattress on edge uses a fraction of the floor and stays off the ground.",
    priority: "high",
  },
  {
    subject: "bicycle",
    label: "Bicycle",
    zone: "bikes",
    surface: "wall",
    target: "Vertical wall mount",
    reason: "Hanging the bike recovers its whole footprint for other items.",
    priority: "medium",
    evidence: (context) => [`${round1(context.usable.wallCapacityM2)}m² of mountable wall available.`],
  },
  {
    subject: "boxes",
    label: "Boxes",
    zone: "shelving",
    surface: "shelf",
    target: "Shelving run",
    reason: "Boxes on shelving keep the floor clear and every label readable.",
    priority: "high",
    evidence: (context) => [
      `${context.shelves.length} shelf run${context.shelves.length === 1 ? "" : "s"} available.`,
    ],
    applies: (context) => context.shelves.length > 0,
  },
  {
    subject: "boxes",
    label: "Boxes",
    zone: "boxes",
    surface: "floor",
    target: "Middle of the space, stacked in columns",
    reason: "Even columns of boxes use the height without burying anything.",
    priority: "high",
    applies: (context) => context.shelves.length === 0,
  },
  {
    subject: "suitcase",
    label: "Suitcases",
    zone: "seasonal",
    surface: "shelf",
    target: "Upper shelf",
    reason: "Light, rarely used items belong highest so nothing else has to move.",
    priority: "low",
  },
  {
    subject: "toolbox",
    label: "Toolbox",
    zone: "heavy",
    surface: "floor",
    target: "Floor level, back corner",
    reason: "Heavy items stay low so nobody lifts weight above shoulder height.",
    priority: "medium",
  },
  {
    subject: "electronics",
    label: "TV and electronics",
    zone: "fragile",
    surface: "floor",
    target: "Fragile zone, upright and padded",
    reason: "Screens travel upright and need a spot nothing is stacked on.",
    priority: "high",
  },
  {
    subject: "seasonal",
    label: "Seasonal items",
    zone: "seasonal",
    surface: "overhead",
    target: "Overhead storage",
    reason: "Overhead racking is worth using for light items reached twice a year.",
    priority: "low",
    applies: (context) => context.geometry.ceiling.supportsOverhead,
  },
  {
    subject: "vehicle",
    label: "Motorcycle or trailer",
    zone: "vehicle",
    surface: "bay",
    target: "Central bay, straight run to the opening",
    reason: "Wheeled items need to roll in and out without turning.",
    priority: "medium",
    evidence: (context) => [`Turning space needed about ${context.access.turningRadiusM}m.`],
  },
];

export function generatePlacements(context: PlacementContext): PlacementProposal[] {
  const proposals: PlacementProposal[] = [];

  for (const candidate of CANDIDATES) {
    if (candidate.applies && !candidate.applies(context)) continue;
    const zone = context.zones.find((entry) => entry.kind === candidate.zone);
    if (!zone) continue;

    const evidence = [
      `${zone.label} zone: ${zone.areaM2}m² floor, ${zone.volumeM3}m³ volume.`,
      ...(candidate.evidence ? candidate.evidence(context) : []),
    ];

    proposals.push({
      id: `${zone.id}-${candidate.subject}`,
      subject: candidate.subject,
      label: candidate.label,
      target: candidate.target,
      zoneId: zone.id,
      surface: candidate.surface,
      reason: candidate.reason,
      evidence,
      confidence: Math.round(clamp01(zone.confidence * 0.95) * 100) / 100,
      priority: candidate.priority,
    });
  }

  const order: Record<PlacementProposal["priority"], number> = { high: 0, medium: 1, low: 2 };
  return proposals.sort((a, b) => order[a.priority] - order[b.priority] || a.id.localeCompare(b.id));
}

/** Milestone 13 — one plain sentence per proposal, safe to show anywhere. */
export function explainPlacement(proposal: PlacementProposal): string {
  return `${proposal.label} → ${proposal.target.toLowerCase()}, because ${proposal.reason
    .replace(/^[A-Z]/, (character) => character.toLowerCase())
    .replace(/\.$/, "")}.`;
}
