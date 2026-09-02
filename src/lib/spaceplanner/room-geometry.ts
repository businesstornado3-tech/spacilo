/**
 * Phase 6Q — room geometry validation.
 *
 * The planner is only as honest as the room it is given. A photograph can only
 * ever produce an estimate, and an estimate that describes a marked storage
 * footprint is NOT the same measurement as the room that contains it. Treating
 * one as the other is what produced a 1.10m "room" that no television could
 * hang in.
 *
 * This module keeps the two measurements apart, checks them for physical
 * plausibility, and reports uncertainty so the user can correct it rather than
 * being handed a silently impossible plan.
 */

export type GeometryBasis = "photo-room" | "photo-usable-area" | "manual" | "listing";

export interface RoomGeometry {
  /** The physical room, wall to wall. */
  roomWidthM: number;
  roomDepthM: number;
  roomHeightM: number;
  /** The floor the user marked for storage. Never larger than the room. */
  usableWidthM: number;
  usableDepthM: number;
  basis: GeometryBasis;
  /** 0–1 confidence in the room dimensions. */
  confidence: number;
}

export type GeometryIssueCode =
  | "implausible_width"
  | "implausible_depth"
  | "implausible_height"
  | "usable_exceeds_room"
  | "usable_reported_as_room"
  | "low_confidence";

export interface GeometryIssue {
  code: GeometryIssueCode;
  message: string;
}

export interface GeometryValidation {
  geometry: RoomGeometry;
  issues: GeometryIssue[];
  /** True when the geometry must be confirmed by a person before it is trusted. */
  needsConfirmation: boolean;
  /** Plain-language summary for the UI. */
  summary: string;
}

/** Below this a "room" is almost certainly a partial or usable-area figure. */
export const MIN_PLAUSIBLE_ROOM_WIDTH_M = 1.5;
export const MIN_PLAUSIBLE_ROOM_DEPTH_M = 1.5;
export const MIN_PLAUSIBLE_ROOM_HEIGHT_M = 1.8;
export const LOW_GEOMETRY_CONFIDENCE = 0.6;

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Validates room geometry without ever silently changing it.
 *
 * Nothing here inflates a dimension to make an object fit. A suspicious
 * measurement is reported, not corrected: the user is asked to confirm.
 */
export function validateRoomGeometry(input: {
  roomWidthM: number;
  roomDepthM: number;
  roomHeightM: number;
  usableWidthM?: number;
  usableDepthM?: number;
  basis: GeometryBasis;
  confidence?: number;
}): GeometryValidation {
  const issues: GeometryIssue[] = [];
  const roomWidthM = round2(Math.max(0.1, input.roomWidthM));
  const roomDepthM = round2(Math.max(0.1, input.roomDepthM));
  const roomHeightM = round2(Math.max(0.1, input.roomHeightM));
  const confidence = Math.max(0, Math.min(1, input.confidence ?? 0.6));
  const fromPhoto = input.basis === "photo-room" || input.basis === "photo-usable-area";

  let usableWidthM = round2(Math.max(0.1, input.usableWidthM ?? roomWidthM));
  let usableDepthM = round2(Math.max(0.1, input.usableDepthM ?? roomDepthM));

  if (usableWidthM > roomWidthM + 0.01 || usableDepthM > roomDepthM + 0.01) {
    issues.push({
      code: "usable_exceeds_room",
      message: "The storage area measured larger than the room it sits in.",
    });
    usableWidthM = Math.min(usableWidthM, roomWidthM);
    usableDepthM = Math.min(usableDepthM, roomDepthM);
  }

  if (roomWidthM < MIN_PLAUSIBLE_ROOM_WIDTH_M) {
    issues.push({
      code: "implausible_width",
      message: `A room width of ${roomWidthM.toFixed(2)}m is unusually narrow — this may be the width of the area you marked rather than the room.`,
    });
  }
  if (roomDepthM < MIN_PLAUSIBLE_ROOM_DEPTH_M) {
    issues.push({
      code: "implausible_depth",
      message: `A room depth of ${roomDepthM.toFixed(2)}m is unusually shallow for a storage space.`,
    });
  }
  if (roomHeightM < MIN_PLAUSIBLE_ROOM_HEIGHT_M) {
    issues.push({
      code: "implausible_height",
      message: `A ceiling height of ${roomHeightM.toFixed(2)}m is lower than most rooms.`,
    });
  }
  if (input.basis === "photo-usable-area") {
    issues.push({
      code: "usable_reported_as_room",
      message:
        "These dimensions describe the area you marked, not the whole room. Wall-mounted items are checked against the room's walls.",
    });
  }
  if (fromPhoto && confidence < LOW_GEOMETRY_CONFIDENCE) {
    issues.push({
      code: "low_confidence",
      message: "EarnRoom AI wasn't confident about these dimensions from the photographs.",
    });
  }

  const geometry: RoomGeometry = {
    roomWidthM,
    roomDepthM,
    roomHeightM,
    usableWidthM,
    usableDepthM,
    basis: input.basis,
    confidence,
  };

  const blocking = issues.filter((issue) => issue.code !== "usable_reported_as_room");
  const needsConfirmation = fromPhoto && blocking.length > 0;

  return {
    geometry,
    issues,
    needsConfirmation,
    summary: `${roomWidthM.toFixed(2)}m × ${roomDepthM.toFixed(2)}m × ${roomHeightM.toFixed(2)}m (${
      input.basis === "manual" ? "confirmed" : "estimated"
    })`,
  };
}

/** The longest wall run the room offers a wall-mounted object, in metres. */
export function longestWallRun(geometry: RoomGeometry): number {
  return round2(Math.max(geometry.roomWidthM, geometry.roomDepthM));
}
