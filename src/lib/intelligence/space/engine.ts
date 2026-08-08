/**
 * Milestone 1 + 19 — the Space Intelligence Engine.
 *
 *   Space → analyse → understand → recommend → structured output.
 *
 * Every stage is a pure function of its inputs, so the engine is deterministic:
 * the same space always produces the same analysis. Results are memoised on a
 * stable key, so a listing page, a host dashboard and a booking check share one
 * computation rather than repeating it three times.
 */
import type {
  DigitalTwin,
  SpaceAnalysis,
  SpaceAnalysisInput,
  SpaceReport,
} from "./contracts";
import { analyseAccess, buildAccessZones, buildLoadingZones, buildParkingZones, buildWalkways } from "./access";
import { calculateUsableSpace } from "./capacity";
import { assessSpaceCompatibility, type CompatibilityInput } from "./compatibility";
import { buildExplanations } from "./explain";
import { buildGeometry, clamp01, proposeObstacles, proposeShelves } from "./geometry";
import { recommendForHost } from "./host";
import { diagnoseHealth, optimiseSpace } from "./optimisation";
import { generatePlacements } from "./placement";
import { buildReports } from "./reports";
import { assessSuitability } from "./suitability";
import { SPACE_ENGINE_ID, SPACE_ENGINE_VERSION, buildDigitalTwin } from "./twin";
import { buildZones } from "./zones";

export { SPACE_ENGINE_ID, SPACE_ENGINE_VERSION };

/* --------------------------------------------------------------- cache */

const cache = new Map<string, SpaceAnalysis>();
const MAX_CACHED = 24;

/** Stable key covering everything the analysis depends on. */
export function analysisKey(input: SpaceAnalysisInput): string {
  const { space } = input;
  return [
    space.id,
    space.kind,
    space.width,
    space.depth,
    space.height,
    space.doorWidth,
    (input.obstacles ?? []).map((entry) => `${entry.kind}:${entry.footprint.w}x${entry.footprint.d}`).join(","),
    (input.shelves ?? []).map((entry) => `${entry.id}:${entry.levels}`).join(","),
    (input.features ?? []).slice().sort().join(","),
    input.occupiedVolumeM3 ?? 0,
    input.monthlyPence ?? 0,
    input.hostConfirmed ? 1 : 0,
  ].join("|");
}

export function clearSpaceAnalysisCache(): void {
  cache.clear();
}

/* -------------------------------------------------------------- engine */

/**
 * Runs the full analysis. `generatedAt` is injectable so the twin's timestamps
 * stay deterministic under test.
 */
export function analyseSpace(
  input: SpaceAnalysisInput,
  options: { generatedAt?: number; useCache?: boolean } = {},
): SpaceAnalysis {
  const useCache = options.useCache !== false && options.generatedAt === undefined;
  const key = analysisKey(input);
  if (useCache) {
    const hit = cache.get(key);
    if (hit) return hit;
  }

  const { space } = input;
  const occupied = input.occupiedVolumeM3 ?? 0;

  const geometry = buildGeometry(space);
  const obstacles = proposeObstacles(space, input.obstacles);
  const shelves = proposeShelves(space, obstacles, input.shelves);
  const walkways = buildWalkways(space, geometry);
  const accessZones = buildAccessZones(space, walkways);
  const parking = buildParkingZones(space, geometry);
  const loading = buildLoadingZones(space);

  const access = analyseAccess(space, geometry, obstacles, walkways, loading);
  const usable = calculateUsableSpace(space, geometry, obstacles, walkways, occupied);
  const zones = buildZones(space, geometry, obstacles, shelves, walkways);
  const suitability = assessSuitability(space, geometry, usable, access, obstacles, input.features ?? []);
  const placements = generatePlacements({ geometry, zones, shelves, usable, access });
  const optimisation = optimiseSpace(geometry, usable, zones, access, occupied);
  const health = diagnoseHealth(usable, optimisation, access, zones, obstacles, occupied);
  const hostRecommendations = recommendForHost(
    input,
    geometry,
    usable,
    access,
    optimisation,
    suitability,
    shelves,
  );

  // Confidence inherits from the weakest reasoning in the chain: zones and
  // suitability rest on proposed geometry unless the host confirmed it.
  const zoneConfidence =
    zones.reduce((sum, zone) => sum + zone.confidence, 0) / Math.max(1, zones.length);
  const confidence =
    Math.round(
      clamp01(
        0.45 * zoneConfidence +
          0.25 * (input.hostConfirmed ? 0.95 : 0.7) +
          0.3 * (suitability[0] ? suitability[0].confidence : 0.7),
      ) * 100,
    ) / 100;

  const generatedAt = options.generatedAt ?? Date.now();
  const twin: DigitalTwin = buildDigitalTwin(space, geometry, zones, obstacles, shelves, usable, {
    ...(input.hostConfirmed ? { hostConfirmed: true } : {}),
    confidence,
    generatedAt,
  });

  const analysis: SpaceAnalysis = {
    space,
    geometry,
    obstacles,
    shelves,
    walkways,
    zones,
    parking,
    loading,
    accessZones,
    usable,
    access,
    suitability,
    placements,
    optimisation,
    health,
    hostRecommendations,
    compatibility: assessSpaceCompatibility(
      input,
      usable,
      access,
      suitability,
      optimisation,
      health,
    ),
    twin,
    explanations: buildExplanations({
      usable,
      access,
      zones,
      suitability,
      placements,
      health,
      optimisation,
    }),
    confidence,
  };

  if (useCache) {
    if (cache.size >= MAX_CACHED) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, analysis);
  }

  return analysis;
}

/** Re-checks an existing analysis against one renter's requirements. */
export function checkCompatibility(
  analysis: SpaceAnalysis,
  input: SpaceAnalysisInput,
  request: CompatibilityInput,
) {
  return assessSpaceCompatibility(
    input,
    analysis.usable,
    analysis.access,
    analysis.suitability,
    analysis.optimisation,
    analysis.health,
    request,
  );
}

/** Reports for a space, reusing the cached analysis rather than recomputing. */
export function spaceReports(input: SpaceAnalysisInput): SpaceReport[] {
  return buildReports(analyseSpace(input), input.monthlyPence);
}
