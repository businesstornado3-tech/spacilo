/**
 * Phase 6J — the ten real pipeline stages.
 *
 * Progress is derived from actual state, never simulated. Each stage is a pure
 * function of what has genuinely happened, so a stage can only be marked done
 * when the work behind it produced a result.
 */

export type StepState = "waiting" | "working" | "done" | "failed";

export interface PlannerStep {
  id: string;
  label: string;
  state: StepState;
}

export interface PlannerProgressInput {
  /** Belongings photographs supplied. */
  itemPhotos: number;
  /** Detected physical units before confirmation. */
  detectedUnits: number;
  /** Dimensions exist for every confirmed unit. */
  sized: boolean;
  /** Space photograph or manual dimensions supplied. */
  spaceSupplied: boolean;
  /** Room geometry resolved (walls, access, features). */
  roomReady: boolean;
  /** Inventory locked by the user. */
  inventoryLocked: boolean;
  /** Deterministic arrangement produced. */
  planReady: boolean;
  /** Arrangement passed the hard-constraint checks. */
  constraintsClear: boolean;
  /** Render lifecycle. */
  render: "idle" | "working" | "ready" | "failed";
  /** Verification lifecycle. */
  verification: "not_run" | "passed" | "incomplete" | "rejected";
}

const step = (id: string, label: string, state: StepState): PlannerStep => ({ id, label, state });

const gate = (done: boolean, working: boolean): StepState =>
  done ? "done" : working ? "working" : "waiting";

export function plannerSteps(input: PlannerProgressInput): PlannerStep[] {
  return [
    step("read", "Reading your belongings", gate(input.detectedUnits > 0, input.itemPhotos > 0)),
    step("identify", "Identifying items", gate(input.inventoryLocked, input.detectedUnits > 0)),
    step("size", "Estimating item sizes", gate(input.sized && input.inventoryLocked, input.inventoryLocked)),
    step("space", "Understanding your space", gate(input.roomReady, input.spaceSupplied)),
    step("access", "Mapping doors, walls and access", gate(input.roomReady, input.spaceSupplied)),
    step("inventory", "Building your inventory", gate(input.inventoryLocked, input.detectedUnits > 0)),
    step("plan", "Planning the best arrangement", gate(input.planReady, input.roomReady && input.inventoryLocked)),
    step(
      "checks",
      "Checking walkway and collisions",
      gate(input.planReady && input.constraintsClear, input.planReady),
    ),
    step(
      "render",
      "Creating visual preview",
      input.render === "failed"
        ? "failed"
        : gate(input.render === "ready", input.render === "working"),
    ),
    step(
      "verify",
      "Verifying the result",
      input.verification === "rejected" || input.verification === "incomplete"
        ? "failed"
        : gate(input.verification === "passed", input.render === "working" || input.render === "ready"),
    ),
  ];
}

/** 0–100, counting only stages that genuinely completed. */
export function plannerProgressPercent(steps: PlannerStep[]): number {
  const done = steps.filter((entry) => entry.state === "done").length;
  return Math.round((done / steps.length) * 100);
}

/** The stage currently being worked on, for the single-line summary. */
export function currentPlannerStep(steps: PlannerStep[]): PlannerStep | null {
  return steps.find((entry) => entry.state === "working") ?? null;
}
