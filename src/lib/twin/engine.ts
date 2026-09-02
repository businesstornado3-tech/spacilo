/**
 * Milestone 1 + 9 — the Digital Twin engine.
 *
 * One object owns the twin: its scene, its history, its versions, and its
 * playback position. Everything else — the WebGL renderer, the SVG fallback,
 * the host dashboard, the hero — is a subscriber. That is what stops the 3D
 * view and the 2D view from ever disagreeing, and what makes a future WebXR
 * session a new subscriber rather than a second implementation.
 *
 * The engine is framework-free and synchronous. It holds no DOM reference, no
 * timers and no GPU handle, so it runs identically in a test, on the server,
 * and inside a headset.
 */
import type { SpacePlan, StorageSpace } from "@/lib/spaceplanner/types";

import { buildRoomShell, type RoomShellOptions } from "./garage";
import { buildMotionPlan, objectsFromPack, type MotionPlanOptions } from "./motion";
import { settleAll, validateScene, type PhysicsViolation } from "./physics";
import {
  TWIN_ENGINE_ID,
  type MotionPlan,
  type MotionStep,
  type RoomShell,
  type TwinChange,
  type TwinObject,
  type TwinScene,
  type TwinVersion,
} from "./contracts";

export interface TwinState {
  scene: TwinScene;
  motion: MotionPlan;
  /** How many motion steps have been applied. 0 = the unplanned load. */
  cursor: number;
  history: TwinChange[];
  versions: TwinVersion[];
  violations: PhysicsViolation[];
}

export type TwinListener = (state: TwinState) => void;

export interface TwinEngineOptions {
  room?: RoomShellOptions;
  motion?: MotionPlanOptions;
  /** Cap on retained versions, so long sessions cannot grow without bound. */
  maxVersions?: number;
  maxHistory?: number;
}

const clone = <T,>(value: T): T => structuredClone(value);

function walkwayFor(plan: SpacePlan) {
  const walkway = plan.after.walkway;
  return walkway ? { x: walkway.x, z: walkway.y, widthM: walkway.w, depthM: walkway.d } : null;
}

export class DigitalTwinEngine {
  readonly id = TWIN_ENGINE_ID;

  private state: TwinState;
  private readonly listeners = new Set<TwinListener>();
  private readonly options: Required<Pick<TwinEngineOptions, "maxVersions" | "maxHistory">> &
    TwinEngineOptions;
  private plan: SpacePlan;

  constructor(plan: SpacePlan, options: TwinEngineOptions = {}) {
    this.options = { maxVersions: 12, maxHistory: 200, ...options };
    this.plan = plan;
    this.state = this.initialState(plan);
  }

  /* ------------------------------------------------------------- reading */

  getState(): TwinState {
    return this.state;
  }

  getScene(): TwinScene {
    return this.state.scene;
  }

  getMotionPlan(): MotionPlan {
    return this.state.motion;
  }

  /** The step that would run next, or null at the end of the plan. */
  nextStep(): MotionStep | null {
    return this.state.motion.steps[this.state.cursor] ?? null;
  }

  /** The step that just ran, or null before the first one. */
  currentStep(): MotionStep | null {
    return this.state.cursor > 0 ? (this.state.motion.steps[this.state.cursor - 1] ?? null) : null;
  }

  /** 0–1 through the reasoning, from the real step count. Never a fake timer. */
  progress(): number {
    const total = this.state.motion.steps.length;
    return total === 0 ? 1 : this.state.cursor / total;
  }

  isComplete(): boolean {
    return this.state.cursor >= this.state.motion.steps.length;
  }

  subscribe(listener: TwinListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /* ------------------------------------------------------------ playback */

  /** Applies the next movement. Returns the step, or null when finished. */
  step(): MotionStep | null {
    const next = this.nextStep();
    if (!next) return null;
    const objects = this.state.scene.objects.map((object) =>
      object.id === next.objectId ? { ...object, transform: clone(next.to) } : object,
    );
    this.commit(objects, this.state.cursor + 1, {
      kind: "step_applied",
      detail: next.reason,
      by: "engine",
    });
    return next;
  }

  /** Milestone 9: reverse one movement. Undo, in playback terms. */
  stepBack(): MotionStep | null {
    if (this.state.cursor === 0) return null;
    const previous = this.state.motion.steps[this.state.cursor - 1];
    if (!previous) return null;
    const objects = this.state.scene.objects.map((object) =>
      object.id === previous.objectId ? { ...object, transform: clone(previous.from) } : object,
    );
    this.commit(objects, this.state.cursor - 1, {
      kind: "step_reverted",
      detail: `Reversed: ${previous.reason}`,
      by: "engine",
    });
    return previous;
  }

  /** Jumps straight to a point in the replay. Used by the timeline scrubber. */
  seek(cursor: number): void {
    const target = Math.max(0, Math.min(this.state.motion.steps.length, Math.round(cursor)));
    if (target === this.state.cursor) return;
    const objects = this.objectsAt(target);
    this.commit(objects, target, {
      kind: target > this.state.cursor ? "step_applied" : "step_reverted",
      detail: `Replay moved to step ${target} of ${this.state.motion.steps.length}.`,
      by: "engine",
    });
  }

  playToEnd(): void {
    this.seek(this.state.motion.steps.length);
  }

  reset(): void {
    this.seek(0);
  }

  /**
   * Objects as they stand after `cursor` steps.
   *
   * Derived from the optimised layout by rewinding the steps that have not
   * run yet. Working backwards matters: anything the planner did not move
   * then stays exactly where the final plan puts it, so a partially played
   * replay can never leave an object stranded in a spot the plan gave away.
   */
  objectsAt(cursor: number): TwinObject[] {
    const final = new Map(
      objectsFromPack(this.plan.after, this.plan.space).map((object) => [object.id, object]),
    );
    for (const object of this.state.scene.objects) {
      if (!final.has(object.id)) final.set(object.id, object);
    }
    const steps = this.state.motion.steps;
    for (let index = steps.length - 1; index >= cursor; index -= 1) {
      const step = steps[index]!;
      const object = final.get(step.objectId);
      if (object) final.set(step.objectId, { ...object, transform: clone(step.from) });
    }
    return [...final.values()];
  }


  /* ------------------------------------------------------------ editing */

  addObject(object: TwinObject): void {
    this.commit([...this.state.scene.objects, object], this.state.cursor, {
      kind: "object_added",
      detail: `${object.label} added to the twin.`,
      by: "renter",
    });
  }

  removeObject(objectId: string): void {
    const target = this.state.scene.objects.find((object) => object.id === objectId);
    if (!target) return;
    this.commit(
      this.state.scene.objects.filter((object) => object.id !== objectId),
      this.state.cursor,
      { kind: "object_removed", detail: `${target.label} removed from the twin.`, by: "renter" },
    );
  }

  /**
   * Milestone 10: swap in a freshly reasoned plan without losing history.
   * The what-if surface calls this after the advisor recalculates.
   */
  loadPlan(plan: SpacePlan, label = "Recalculated layout"): void {
    this.plan = plan;
    const next = this.initialState(plan);
    this.state = {
      ...next,
      history: [
        ...this.state.history,
        { at: Date.now(), kind: "scene_loaded", detail: label, by: "engine" } as TwinChange,
      ].slice(-this.options.maxHistory),
      versions: this.state.versions,
    };
    this.emit();
  }

  /* ------------------------------------------------------------ versions */

  /** Milestone 1: keep the current layout so it can be compared and restored. */
  commitVersion(label: string): TwinVersion {
    const version: TwinVersion = {
      version: this.state.scene.version,
      label,
      at: Date.now(),
      scene: clone(this.state.scene),
    };
    this.state = {
      ...this.state,
      versions: [...this.state.versions, version].slice(-this.options.maxVersions),
      history: [
        ...this.state.history,
        { at: version.at, kind: "layout_committed", detail: label, by: "host" } as TwinChange,
      ].slice(-this.options.maxHistory),
    };
    this.emit();
    return version;
  }

  restoreVersion(version: number): boolean {
    const found = this.state.versions.find((entry) => entry.version === version);
    if (!found) return false;
    this.state = {
      ...this.state,
      scene: clone(found.scene),
      violations: validateScene(found.scene),
      history: [
        ...this.state.history,
        {
          at: Date.now(),
          kind: "layout_committed",
          detail: `Restored "${found.label}".`,
          by: "host",
        } as TwinChange,
      ].slice(-this.options.maxHistory),
    };
    this.emit();
    return true;
  }

  getVersions(): TwinVersion[] {
    return this.state.versions;
  }

  getHistory(): TwinChange[] {
    return this.state.history;
  }

  /* -------------------------------------------------------------- internals */

  private initialState(plan: SpacePlan): TwinState {
    const room = buildRoomShell(plan.space, this.options.room);
    const motion = buildMotionPlan(plan, this.options.motion);
    // Start from the optimised layout with every step rewound, so step 0 and
    // the final frame are two ends of one consistent scene.
    const final = new Map(
      objectsFromPack(plan.after, plan.space).map((object) => [object.id, object]),
    );
    for (let index = motion.steps.length - 1; index >= 0; index -= 1) {
      const step = motion.steps[index]!;
      const object = final.get(step.objectId);
      if (object) final.set(step.objectId, { ...object, transform: clone(step.from) });
    }
    const objects = settleAll([...final.values()]);
    const scene: TwinScene = {
      room,
      objects,
      walkway: walkwayFor(plan),
      version: 1,
      label: `${plan.space.name} — as loaded`,
    };
    return {
      scene,
      motion,
      cursor: 0,
      history: [
        {
          at: Date.now(),
          kind: "scene_loaded",
          detail: `${plan.itemCount} item(s) loaded into ${plan.space.name}.`,
          by: "engine",
        },
      ],
      versions: [],
      violations: validateScene(scene),
    };
  }

  private commit(objects: TwinObject[], cursor: number, change: Omit<TwinChange, "at">): void {
    const scene: TwinScene = {
      ...this.state.scene,
      objects,
      version: this.state.scene.version + 1,
      label:
        cursor === 0
          ? `${this.state.scene.room.name} — as loaded`
          : cursor >= this.state.motion.steps.length
            ? `${this.state.scene.room.name} — optimised by EarnRoom AI`
            : `${this.state.scene.room.name} — step ${cursor} of ${this.state.motion.steps.length}`,
    };
    this.state = {
      ...this.state,
      scene,
      cursor,
      violations: validateScene(scene),
      history: [...this.state.history, { ...change, at: Date.now() }].slice(
        -this.options.maxHistory,
      ),
    };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.state);
  }
}

/** Convenience: a twin for a plan, ready to render. */
export function createDigitalTwin(plan: SpacePlan, options?: TwinEngineOptions): DigitalTwinEngine {
  return new DigitalTwinEngine(plan, options);
}

/** A bare shell with no belongings — used by empty states and host previews. */
export function emptyScene(space: StorageSpace, options?: RoomShellOptions): TwinScene {
  const room: RoomShell = buildRoomShell(space, options);
  return { room, objects: [], walkway: null, version: 1, label: `${space.name} — empty` };
}
