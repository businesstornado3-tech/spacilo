/**
 * Milestone 7 — space suitability.
 *
 * Rates a space for each realistic use from facts only: geometry, access,
 * environment and the obstacles present. Never claims safety or insurance —
 * a rating is an estimate to help a host and renter judge fit.
 */
import type {
  AccessAnalysis,
  Obstacle,
  RoomGeometry,
  SpaceSuitability,
  StorageSpace,
  SuitabilityRating,
  SuitabilityUse,
  UsableSpace,
} from "./contracts";
import { clamp01 } from "./geometry";

const LABELS: Record<SuitabilityUse, string> = {
  boxes: "Boxes and cartons",
  furniture: "Household furniture",
  electronics: "Electronics",
  business: "Business stock",
  archive: "Archive and documents",
  sports: "Sports equipment",
  motorcycle: "Motorcycles",
  bicycle: "Bicycles",
  vehicle: "Vehicles",
  fragile: "Fragile items",
  long_term: "Long-term storage",
};

function ratingFor(score: number): SuitabilityRating {
  if (score >= 80) return "ideal";
  if (score >= 60) return "suitable";
  if (score >= 38) return "limited";
  return "unsuitable";
}

interface Context {
  space: StorageSpace;
  geometry: RoomGeometry;
  usable: UsableSpace;
  access: AccessAnalysis;
  obstacles: Obstacle[];
  features: string[];
}

/** Indoor, heated or otherwise dry spaces protect sensitive contents. */
function dryness(context: Context): number {
  const { space, features } = context;
  if (features.includes("heated")) return 1;
  if (space.kind === "bedroom" || space.kind === "storage_room") return 0.95;
  if (space.kind === "commercial" || space.kind === "warehouse") return 0.8;
  if (space.kind === "garage" || space.kind === "container") return 0.62;
  if (space.kind === "loft") return 0.55;
  if (space.kind === "shed") return 0.4;
  return 0.2;
}

function security(context: Context): number {
  const { space, features } = context;
  let value = space.kind === "parking" ? 0.35 : 0.65;
  if (features.includes("cctv")) value += 0.15;
  if (features.includes("alarm")) value += 0.1;
  if (features.includes("locked")) value += 0.1;
  return clamp01(value);
}

const ACCESS_SCORE: Record<AccessAnalysis["access"], number> = {
  easy: 1,
  moderate: 0.78,
  difficult: 0.5,
  restricted: 0.25,
};

function evaluate(use: SuitabilityUse, context: Context): SpaceSuitability {
  const { space, geometry, usable, access } = context;
  const dry = dryness(context);
  const secure = security(context);
  const accessScore = ACCESS_SCORE[access.access];
  const volume = usable.availableVolumeM3;
  const clearance = geometry.ceiling.minHeightM;

  const reasons: string[] = [];
  const cautions: string[] = [];
  let score = 0;

  const volumeScore = (need: number) => clamp01(volume / need);

  switch (use) {
    case "boxes":
      score = 100 * (0.4 * volumeScore(6) + 0.3 * dry + 0.3 * accessScore);
      reasons.push(`About ${volume}m³ available for stacked cartons.`);
      break;
    case "furniture":
      score =
        100 *
        (0.35 * volumeScore(12) +
          0.3 * clamp01(access.largestItemM.widthM / 0.9) +
          0.2 * clamp01(clearance / 2.1) +
          0.15 * dry);
      reasons.push(`Opening takes items up to ${access.largestItemM.widthM}m wide.`);
      if (access.largestItemM.widthM < 0.85) cautions.push("Wide furniture would need dismantling.");
      break;
    case "electronics":
      score = 100 * (0.5 * dry + 0.3 * secure + 0.2 * volumeScore(3));
      if (dry < 0.7) cautions.push("Temperature swings are likely — electronics need a dry spot.");
      break;
    case "business":
      score =
        100 *
        (0.3 * volumeScore(15) +
          0.3 * accessScore +
          0.2 * secure +
          0.2 * (usable.walkableAreaM2 > 0 ? 1 : 0.5));
      if (access.loading === "difficult" || access.loading === "restricted") {
        cautions.push("Regular stock movements would be slow here.");
      }
      break;
    case "archive":
      score = 100 * (0.45 * dry + 0.3 * volumeScore(4) + 0.25 * secure);
      reasons.push("Document boxes need dry, stable conditions above all.");
      break;
    case "sports":
      score = 100 * (0.4 * volumeScore(5) + 0.3 * clamp01(clearance / 2) + 0.3 * accessScore);
      break;
    case "bicycle":
      score =
        100 *
        (0.35 * clamp01(access.largestItemM.widthM / 0.75) +
          0.3 * clamp01(usable.wallCapacityM2 / 6) +
          0.2 * dry +
          0.15 * secure);
      if (usable.wallCapacityM2 > 4) reasons.push("Wall area is available for vertical bike mounts.");
      break;
    case "motorcycle":
      score =
        100 *
        (0.4 * clamp01(access.largestItemM.widthM / 1) +
          0.25 * clamp01(usable.usableFloorAreaM2 / 4) +
          0.2 * (geometry.floor.surface === "level" ? 1 : 0.5) +
          0.15 * secure);
      cautions.push("Fuel and batteries need checking before storage.");
      break;
    case "vehicle":
      score =
        100 *
        (0.4 * clamp01(space.depth / 4.8) +
          0.3 * clamp01(space.width / 2.4) +
          0.3 * clamp01(access.largestItemM.widthM / 2.2));
      break;
    case "fragile":
      score = 100 * (0.4 * dry + 0.3 * accessScore + 0.3 * clamp01(usable.usableFloorAreaM2 / 4));
      cautions.push("Fragile items should be packed and padded before handover.");
      break;
    case "long_term":
      score = 100 * (0.4 * dry + 0.3 * secure + 0.3 * clamp01(volume / 8));
      break;
  }

  const blocking = context.obstacles.filter((obstacle) => !obstacle.removable).length;
  if (blocking > 0) {
    score -= blocking * 3;
    cautions.push(`${blocking} fixed feature${blocking === 1 ? "" : "s"} reduce the clear area.`);
  }

  const value = Math.max(0, Math.min(100, Math.round(score)));
  const confidence = Math.round(clamp01(0.6 + (context.space.kind === "parking" ? 0 : 0.1) + dry * 0.2) * 100) / 100;

  return {
    use,
    label: LABELS[use],
    rating: ratingFor(value),
    score: value,
    confidence,
    reasons,
    cautions,
  };
}

export function assessSuitability(
  space: StorageSpace,
  geometry: RoomGeometry,
  usable: UsableSpace,
  access: AccessAnalysis,
  obstacles: Obstacle[],
  features: string[] = [],
): SpaceSuitability[] {
  const context: Context = { space, geometry, usable, access, obstacles, features };
  const uses: SuitabilityUse[] = [
    "boxes",
    "furniture",
    "electronics",
    "business",
    "archive",
    "sports",
    "motorcycle",
    "bicycle",
    "vehicle",
    "fragile",
    "long_term",
  ];
  return uses.map((use) => evaluate(use, context)).sort((a, b) => b.score - a.score);
}

export function bestUses(suitability: SpaceSuitability[], limit = 3): SpaceSuitability[] {
  return suitability.filter((entry) => entry.rating !== "unsuitable").slice(0, limit);
}
