/**
 * Milestone 5 — the physics rules.
 *
 * Deliberately not a physics *simulator*. A simulator would make the layout
 * non-deterministic, and a layout that changes between two identical runs
 * cannot be explained. Instead this module enforces the same rules a real
 * pack obeys — gravity, support, collision, weight order, surface limits —
 * against the layout the planner produced, and reports every breach.
 *
 * FUTURE HOOK: a rigid-body solver can be dropped in behind `settle()` for
 * free-drag editing. `validateScene` stays the acceptance gate either way.
 */
import type { RoomShell, TwinObject, TwinScene } from "./contracts";

const EPS = 0.005;

const WEIGHT_ORDER: Record<TwinObject["weight"], number> = { light: 1, medium: 2, heavy: 3 };

export interface Aabb {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/** World-space bounds of an object, accounting for a quarter-turn rotation. */
export function boundsOf(object: TwinObject): Aabb {
  const turned = object.transform.rotationDeg % 180 !== 0;
  const w = turned ? object.size.depthM : object.size.widthM;
  const d = turned ? object.size.widthM : object.size.depthM;
  const { x, y, z } = object.transform.position;
  return {
    minX: x - w / 2,
    maxX: x + w / 2,
    minY: y,
    maxY: y + object.size.heightM,
    minZ: z - d / 2,
    maxZ: z + d / 2,
  };
}

export function overlaps(a: Aabb, b: Aabb): boolean {
  return (
    a.minX < b.maxX - EPS &&
    a.maxX > b.minX + EPS &&
    a.minY < b.maxY - EPS &&
    a.maxY > b.minY + EPS &&
    a.minZ < b.maxZ - EPS &&
    a.maxZ > b.minZ + EPS
  );
}

/** True when `upper` sits directly on `lower` with a real contact patch. */
export function supports(lower: TwinObject, upper: TwinObject): boolean {
  const a = boundsOf(lower);
  const b = boundsOf(upper);
  if (Math.abs(b.minY - a.maxY) > 0.02) return false;
  const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const overlapZ = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
  if (overlapX <= 0 || overlapZ <= 0) return false;
  const footprint = (b.maxX - b.minX) * (b.maxZ - b.minZ);
  // Half the base must be carried, or it is balanced rather than supported.
  return (overlapX * overlapZ) / Math.max(footprint, EPS) >= 0.5;
}

/** Drops an object to whatever is beneath it. Gravity, applied once. */
export function settle(object: TwinObject, others: TwinObject[]): TwinObject {
  const bounds = boundsOf(object);
  let restY = 0;
  for (const other of others) {
    if (other.id === object.id) continue;
    const b = boundsOf(other);
    const overlapX = Math.min(bounds.maxX, b.maxX) - Math.max(bounds.minX, b.minX);
    const overlapZ = Math.min(bounds.maxZ, b.maxZ) - Math.max(bounds.minZ, b.minZ);
    if (overlapX <= EPS || overlapZ <= EPS) continue;
    if (b.maxY <= bounds.minY + 0.02 && b.maxY > restY) restY = b.maxY;
  }
  if (Math.abs(restY - object.transform.position.y) < EPS) return object;
  return {
    ...object,
    transform: { ...object.transform, position: { ...object.transform.position, y: restY } },
  };
}

export function settleAll(objects: TwinObject[]): TwinObject[] {
  const ordered = [...objects].sort((a, b) => a.transform.position.y - b.transform.position.y);
  const done: TwinObject[] = [];
  for (const object of ordered) {
    done.push(object.fixed ? object : settle(object, done));
  }
  return objects.map((object) => done.find((entry) => entry.id === object.id) ?? object);
}

/* --------------------------------------------------------------- checks */

export type ViolationKind =
  | "collision"
  | "floating"
  | "out_of_room"
  | "ceiling"
  | "heavy_on_light"
  | "crushed_fragile";

export interface PhysicsViolation {
  kind: ViolationKind;
  objectId: string;
  otherId?: string;
  detail: string;
}

export function validateObjects(objects: TwinObject[], room: RoomShell): PhysicsViolation[] {
  const violations: PhysicsViolation[] = [];
  const bounds = new Map(objects.map((object) => [object.id, boundsOf(object)]));

  for (const object of objects) {
    const a = bounds.get(object.id)!;

    if (a.minX < -EPS || a.minZ < -EPS || a.maxX > room.widthM + EPS || a.maxZ > room.depthM + EPS) {
      violations.push({
        kind: "out_of_room",
        objectId: object.id,
        detail: `${object.label} sits outside the ${room.widthM}m × ${room.depthM}m floor.`,
      });
    }
    if (a.maxY > room.heightM + EPS) {
      violations.push({
        kind: "ceiling",
        objectId: object.id,
        detail: `${object.label} reaches ${a.maxY.toFixed(2)}m against a ${room.heightM.toFixed(2)}m ceiling.`,
      });
    }

    if (a.minY > EPS) {
      const carrier = objects.find((other) => other.id !== object.id && supports(other, object));
      if (!carrier) {
        violations.push({
          kind: "floating",
          objectId: object.id,
          detail: `${object.label} is ${a.minY.toFixed(2)}m up with nothing under it.`,
        });
      } else {
        if (WEIGHT_ORDER[object.weight] > WEIGHT_ORDER[carrier.weight]) {
          violations.push({
            kind: "heavy_on_light",
            objectId: object.id,
            otherId: carrier.id,
            detail: `${object.label} (${object.weight}) is stacked on ${carrier.label} (${carrier.weight}).`,
          });
        }
        if (carrier.fragile) {
          violations.push({
            kind: "crushed_fragile",
            objectId: object.id,
            otherId: carrier.id,
            detail: `${carrier.label} is fragile and is carrying ${object.label}.`,
          });
        }
      }
    }
  }

  for (let i = 0; i < objects.length; i += 1) {
    for (let j = i + 1; j < objects.length; j += 1) {
      const a = objects[i]!;
      const b = objects[j]!;
      if (overlaps(bounds.get(a.id)!, bounds.get(b.id)!)) {
        violations.push({
          kind: "collision",
          objectId: a.id,
          otherId: b.id,
          detail: `${a.label} and ${b.label} occupy the same space.`,
        });
      }
    }
  }

  return violations;
}

export function validateScene(scene: TwinScene): PhysicsViolation[] {
  return validateObjects(scene.objects, scene.room);
}

/** True when nothing clips, floats or overloads. The acceptance gate. */
export function isPhysicallyValid(scene: TwinScene): boolean {
  return validateScene(scene).length === 0;
}
