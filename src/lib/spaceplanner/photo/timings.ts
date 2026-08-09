/**
 * Phase 6T — measurable performance budgets for the SpacePlanner pipeline.
 *
 * These are UX targets, NOT timeouts. Nothing here terminates valid work: the
 * only thing a budget does is decide whether a measured stage is reported as
 * "within target" or "over target", and which stage is the bottleneck. A stage
 * that runs long is reported honestly with its real duration.
 */

/** From "Analyse my belongings" to a usable inventory on screen. */
export const BELONGINGS_ANALYSIS_BUDGET_MS = 5000;
/** From "Analyse this space" to a usable room model. */
export const SPACE_ANALYSIS_BUDGET_MS = 5000;
/** From a usable room model to a validated deterministic PlacementManifest. */
export const DETERMINISTIC_PLAN_BUDGET_MS = 5000;

/**
 * Every stage the pipeline measures. `null` means "not measured yet" and is
 * never rendered as zero — an unknown duration is shown as "—".
 */
export interface PipelineTimings {
  /** Vision call that found the objects. */
  detectionMs: number | null;
  /** Sizing / canonicalisation of what detection returned. */
  classificationMs: number | null;
  /** Wall clock from pressing analyse to a usable inventory. */
  inventoryReadyMs: number | null;
  /** Vision call that measured the room. */
  spaceAnalysisMs: number | null;
  /** Deterministic optimiser only. Never includes an AI call. */
  planMs: number | null;
  /** Hard-constraint validation of the produced manifest. */
  manifestValidationMs: number | null;
  /** Wall clock from pressing analyse-space to a usable arrangement plan. */
  timeToArrangementMs: number | null;
  /** Image model call. */
  renderMs: number | null;
  /** Render verification call. */
  verifyMs: number | null;
  /** Whole visualisation, including photo preparation. */
  totalMs: number | null;
}

export const EMPTY_TIMINGS: PipelineTimings = {
  detectionMs: null,
  classificationMs: null,
  inventoryReadyMs: null,
  spaceAnalysisMs: null,
  planMs: null,
  manifestValidationMs: null,
  timeToArrangementMs: null,
  renderMs: null,
  verifyMs: null,
  totalMs: null,
};

export type BudgetState = "unknown" | "within" | "over";

export interface BudgetVerdict {
  state: BudgetState;
  budgetMs: number;
  actualMs: number | null;
  /** Milliseconds over target. 0 when inside the budget or unknown. */
  overBy: number;
}

export function budgetVerdict(actualMs: number | null, budgetMs: number): BudgetVerdict {
  if (actualMs === null || !Number.isFinite(actualMs)) {
    return { state: "unknown", budgetMs, actualMs: null, overBy: 0 };
  }
  const overBy = Math.max(0, Math.round(actualMs - budgetMs));
  return { state: overBy > 0 ? "over" : "within", budgetMs, actualMs: Math.round(actualMs), overBy };
}

/**
 * The slowest measured contributor to a target, so a miss is attributed rather
 * than guessed at.
 */
export function bottleneckOf(parts: Record<string, number | null>): string | null {
  let worst: { label: string; ms: number } | null = null;
  for (const [label, ms] of Object.entries(parts)) {
    if (ms === null || !Number.isFinite(ms)) continue;
    if (!worst || ms > worst.ms) worst = { label, ms };
  }
  return worst ? worst.label : null;
}

/** Human-readable seconds, or an em dash when the stage never ran. */
export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
