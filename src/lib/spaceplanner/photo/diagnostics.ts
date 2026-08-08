/**
 * Phase 6I — SpacePlanner run diagnostics.
 *
 * Every run of the pipeline records what went in, what the deterministic
 * planner produced, how long each stage took and what the render verifier
 * concluded. Purely observational: nothing here influences the plan. It exists
 * so a future problem can be attributed to recognition, sizing, packing,
 * rendering or verification rather than guessed at.
 *
 * Hashes are stable — the same inventory, the same room and the same manifest
 * always produce the same hash, which is exactly how determinism is proved.
 */
import { hashString } from "@/lib/vision/hash";
import type { CoverageReport, PlacementManifest } from "./manifest";

export type VerificationStatus = "not_run" | "passed" | "incomplete" | "rejected";

export interface RunDiagnostics {
  runId: string;
  inventoryHash: string;
  roomHash: string;
  manifestHash: string;
  inputHash: string;
  plannerDurationMs: number;
  renderDurationMs: number;
  verificationDurationMs: number;
  totalDurationMs: number;
  renderAttempts: number;
  verificationStatus: VerificationStatus;
  unexpectedObjectCount: number;
  missingObjectCount: number;
  qualityScore: number;
  clusterCount: number;
  walkwayClearanceM: number;
}

const hash = (prefix: string, value: string) => `${prefix}_${hashString(value).toString(36)}`;

/** Stable hash of the room model the planner worked against. */
export function roomHash(manifest: PlacementManifest): string {
  const walkway = manifest.walkway
    ? `${manifest.walkway.xM},${manifest.walkway.yM},${manifest.walkway.widthM},${manifest.walkway.depthM}`
    : "none";
  return hash(
    "room",
    `${manifest.spaceWidthM}x${manifest.spaceDepthM}x${manifest.spaceHeightM}|${walkway}`,
  );
}

/**
 * Stable hash of the placement manifest. Byte-for-byte equality of the plan is
 * asserted through this value: same inputs must always yield the same hash.
 */
export function manifestHash(manifest: PlacementManifest): string {
  return hash("plan", serialiseManifest(manifest));
}

/** Deterministic serialisation. Field order is fixed, never object key order. */
export function serialiseManifest(manifest: PlacementManifest): string {
  const entries = manifest.entries
    .map((entry) =>
      [
        entry.id,
        entry.label,
        entry.quantity,
        entry.widthCm,
        entry.depthCm,
        entry.heightCm,
        entry.state,
        entry.orientation,
        entry.positions
          .map((position) =>
            [
              position.xM,
              position.yM,
              position.baseHeightM,
              position.widthM,
              position.depthM,
              position.heightM,
              position.units,
              position.layer,
              position.rotationDeg,
              position.orientation,
              position.zone,
            ].join(","),
          )
          .join(";"),
      ].join("|"),
    )
    .join("\n");
  return `${manifest.inventoryId}\n${manifest.spaceWidthM}x${manifest.spaceDepthM}x${manifest.spaceHeightM}\n${
    manifest.walkway
      ? `${manifest.walkway.xM},${manifest.walkway.yM},${manifest.walkway.widthM},${manifest.walkway.depthM}`
      : "no-walkway"
  }\n${entries}`;
}

/** Reads the verification outcome from a coverage report. */
export function verificationStatusOf(coverage: CoverageReport | null): VerificationStatus {
  if (!coverage) return "not_run";
  if ((coverage.unexpected?.length ?? 0) > 0) return "rejected";
  return coverage.complete ? "passed" : "incomplete";
}

export interface DiagnosticsInput {
  manifest: PlacementManifest;
  coverage: CoverageReport | null;
  plannerDurationMs: number;
  renderDurationMs: number;
  verificationDurationMs: number;
  renderAttempts: number;
  qualityScore: number;
  clusterCount: number;
  walkwayClearanceM: number;
}

export function runDiagnostics(input: DiagnosticsInput): RunDiagnostics {
  const inventoryHash = hash("inv", input.manifest.inventoryId);
  const room = roomHash(input.manifest);
  const plan = manifestHash(input.manifest);
  return {
    runId: hash("run", `${plan}|${input.renderAttempts}`),
    inventoryHash,
    roomHash: room,
    manifestHash: plan,
    inputHash: hash("in", `${inventoryHash}|${room}`),
    plannerDurationMs: Math.round(input.plannerDurationMs),
    renderDurationMs: Math.round(input.renderDurationMs),
    verificationDurationMs: Math.round(input.verificationDurationMs),
    totalDurationMs: Math.round(
      input.plannerDurationMs + input.renderDurationMs + input.verificationDurationMs,
    ),
    renderAttempts: input.renderAttempts,
    verificationStatus: verificationStatusOf(input.coverage),
    unexpectedObjectCount: input.coverage?.unexpected?.length ?? 0,
    missingObjectCount: input.coverage?.missing.length ?? 0,
    qualityScore: Math.round(input.qualityScore),
    clusterCount: input.clusterCount,
    walkwayClearanceM: input.walkwayClearanceM,
  };
}
