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
 * Phase 6Y — the headline target: from the "Analyse my belongings" click to
 * the deterministic arrangement being painted, excluding time spent waiting
 * for the user to review or photograph.
 */
export const ARRANGEMENT_VISIBLE_BUDGET_MS = 5000;


/**
 * Every stage the pipeline measures. `null` means "not measured yet" and is
 * never rendered as zero — an unknown duration is shown as "—".
 */
export interface PipelineTimings {
  /** Phase 6V — decoding, downscaling and encoding photographs, once. */
  photoPrepMs: number | null;
  /** Vision call that found the objects. */
  detectionMs: number | null;
  /** Deterministic cross-photograph merge. Never an AI call. */
  mergeMs: number | null;
  /** Confidence-gated second look. 0 when nothing needed refining. */
  refineMs: number | null;
  /** Phase 6Y — completeness sweep. 0 when the first pass looked complete. */
  sweepMs: number | null;
  /** Model calls made for the belongings scan, so parallelism is visible. */
  scanCalls: number | null;
  refineCalls: number | null;
  sweepCalls: number | null;
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
  /**
   * Phase 6Y — measured in the BROWSER, from the Analyse click to the frame
   * in which the deterministic arrangement was painted. Wall clock, so it
   * includes any time the user spent reviewing or photographing.
   */
  timeToArrangementMs: number | null;
  /** The same journey with user-input windows subtracted. The 5s target. */
  activeTimeToArrangementMs: number | null;
  /** Analyse click → a validated deterministic plan existed. */
  planReadyMs: number | null;
  /** Image model call. */
  renderMs: number | null;
  /** Render verification call. */
  verifyMs: number | null;
  /** Whole visualisation, including photo preparation. */
  totalMs: number | null;
}


export const EMPTY_TIMINGS: PipelineTimings = {
  photoPrepMs: null,
  detectionMs: null,
  mergeMs: null,
  refineMs: null,
  sweepMs: null,
  scanCalls: null,
  refineCalls: null,
  sweepCalls: null,
  classificationMs: null,
  inventoryReadyMs: null,
  spaceAnalysisMs: null,
  planMs: null,
  manifestValidationMs: null,
  timeToArrangementMs: null,
  activeTimeToArrangementMs: null,
  planReadyMs: null,
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

/* --------------------------------------------------------- Phase 6U */

/** Merges measured stages onto a timing record without inventing values. */
export function mergeTimings(
  base: PipelineTimings,
  patch: Partial<PipelineTimings>,
): PipelineTimings {
  const next: PipelineTimings = { ...base };
  for (const [key, value] of Object.entries(patch) as [keyof PipelineTimings, number | null | undefined][]) {
    if (value === undefined) continue;
    next[key] = value === null ? null : Math.max(0, Math.round(value));
  }
  return next;
}

/** Runs a synchronous stage and reports how long it really took. */
export function measure<T>(work: () => T): { value: T; ms: number } {
  const startedAt = Date.now();
  const value = work();
  return { value, ms: Date.now() - startedAt };
}

/** Runs an asynchronous stage and reports how long it really took. */
export async function measureAsync<T>(work: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const startedAt = Date.now();
  const value = await work();
  return { value, ms: Date.now() - startedAt };
}

export interface BudgetReport {
  /** "Analyse my belongings" → a usable inventory. */
  belongings: BudgetVerdict;
  /** "Analyse this space" → a validated room model. */
  space: BudgetVerdict;
  /** Deterministic planning + manifest validation. */
  plan: BudgetVerdict;
  /**
   * Phase 6Y — the headline acceptance criterion: Analyse click → the
   * deterministic arrangement painted, with user-input time excluded.
   */
  arrangement: BudgetVerdict;
  /** The slowest measured stage overall, or null when nothing was measured. */
  bottleneck: string | null;
  /** True only when every MEASURED target came in under its budget. */
  allWithinBudget: boolean;
}

/**
 * Turns measured timings into explicit budget verdicts. A stage that was never
 * measured is "unknown" and never counted as a pass — a target is only claimed
 * to be met when a real measurement says so.
 */
export function budgetReport(timings: PipelineTimings): BudgetReport {
  const belongings = budgetVerdict(timings.inventoryReadyMs, BELONGINGS_ANALYSIS_BUDGET_MS);
  const space = budgetVerdict(timings.spaceAnalysisMs, SPACE_ANALYSIS_BUDGET_MS);
  const planTotal =
    timings.planMs === null && timings.manifestValidationMs === null
      ? null
      : (timings.planMs ?? 0) + (timings.manifestValidationMs ?? 0);
  const plan = budgetVerdict(planTotal, DETERMINISTIC_PLAN_BUDGET_MS);
  const arrangement = budgetVerdict(
    timings.activeTimeToArrangementMs,
    ARRANGEMENT_VISIBLE_BUDGET_MS,
  );
  const verdicts = [belongings, space, plan, arrangement];
  return {
    belongings,
    space,
    plan,
    arrangement,
    bottleneck: bottleneckOf({
      "photo preparation": timings.photoPrepMs,
      detection: timings.detectionMs,
      "completeness sweep": timings.sweepMs,
      refinement: timings.refineMs,
      classification: timings.classificationMs,
      "space analysis": timings.spaceAnalysisMs,
      planning: timings.planMs,
      "manifest validation": timings.manifestValidationMs,
      render: timings.renderMs,
      verification: timings.verifyMs,
    }),
    allWithinBudget:
      verdicts.some((verdict) => verdict.state !== "unknown") &&
      verdicts.every((verdict) => verdict.state !== "over"),
  };

}
