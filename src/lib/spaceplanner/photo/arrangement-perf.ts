/**
 * Phase 6Y — the metric that actually matters, measured in the browser.
 *
 * Every timing before this phase measured a server stage or a JS data
 * structure coming into existence. None of them answered the only question a
 * user has: "I pressed Analyse — how long until I can see my arrangement?"
 *
 * This module measures exactly that, from the click to the frame in which the
 * deterministic arrangement is actually painted. It reports two numbers and is
 * honest about the difference:
 *
 *   timeToArrangementMs        wall clock, including any time the user spent
 *                              reviewing their inventory or taking a photo.
 *   activeTimeToArrangementMs  the same journey with those user-input windows
 *                              subtracted — the part the product controls, and
 *                              the number the 5s target applies to.
 *
 * `performance.mark` is used when it exists so the run also shows up in
 * DevTools, but the numbers here come from `performance.now()` directly and
 * work in a plain test environment.
 */

export type ArrangementMark =
  | "analyseClick"
  | "inventoryReady"
  | "spaceReady"
  | "planReady"
  | "arrangementPaint";

/** The 5-second acceptance target for click → arrangement visible. */
export const ARRANGEMENT_TARGET_MS = 5000;

interface Run {
  startedAt: number;
  marks: Partial<Record<ArrangementMark, number>>;
  /** Total milliseconds spent waiting for the user, not for the product. */
  idleMs: number;
  idleStartedAt: number | null;
}

let run: Run | null = null;

function now(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function browserMark(name: ArrangementMark): void {
  try {
    if (typeof performance !== "undefined" && typeof performance.mark === "function") {
      performance.mark(`spacilo:${name}`);
    }
  } catch {
    /* marks are diagnostics; never let one break a scan */
  }
}

/** Starts a fresh measurement. Called the instant "Analyse" is pressed. */
export function startArrangementRun(): void {
  const startedAt = now();
  run = { startedAt, marks: { analyseClick: startedAt }, idleMs: 0, idleStartedAt: null };
  browserMark("analyseClick");
}

/**
 * Records a stage. The FIRST time a stage is reached wins — a re-render or a
 * retry can never make an already-measured journey look shorter.
 */
export function markArrangement(mark: ArrangementMark): void {
  if (!run || run.marks[mark] !== undefined) return;
  run.marks[mark] = now();
  browserMark(mark);
}

/** The journey pauses here: we are waiting on the user, not on ourselves. */
export function beginUserWait(): void {
  if (!run || run.idleStartedAt !== null) return;
  run.idleStartedAt = now();
}

/** The user acted; the clock we are accountable for starts again. */
export function endUserWait(): void {
  if (!run || run.idleStartedAt === null) return;
  run.idleMs += now() - run.idleStartedAt;
  run.idleStartedAt = null;
}

export interface ArrangementMetrics {
  /** Analyse click → a usable inventory on screen. */
  inventoryReadyMs: number | null;
  /** Analyse click → a usable room model. */
  spaceReadyMs: number | null;
  /** Analyse click → a validated deterministic plan in memory. */
  planReadyMs: number | null;
  /**
   * Validated plan → the frame it was actually painted in. Phase 6Z, Part A:
   * the browser paint cost of the arrangement on its own, separated from the
   * analysis that preceded it.
   */
  arrangementPaintMs: number | null;
  /** Analyse click → the arrangement actually painted. Wall clock. */
  timeToArrangementMs: number | null;
  /** The same, minus time spent waiting for the user. The 5s target. */
  activeTimeToArrangementMs: number | null;
  /** How much of the wall clock was the user thinking rather than us working. */
  userWaitMs: number | null;
  /** True only when the active time was measured AND came in under target. */
  withinTarget: boolean;
}

const EMPTY: ArrangementMetrics = {
  inventoryReadyMs: null,
  spaceReadyMs: null,
  planReadyMs: null,
  arrangementPaintMs: null,
  timeToArrangementMs: null,
  activeTimeToArrangementMs: null,
  userWaitMs: null,
  withinTarget: false,
};

/** Reads the current run. Never invents a number for a stage that never ran. */
export function arrangementMetrics(): ArrangementMetrics {
  if (!run) return EMPTY;
  const current = run;
  const idleSoFar =
    current.idleMs + (current.idleStartedAt === null ? 0 : now() - current.idleStartedAt);
  const since = (mark: ArrangementMark): number | null => {
    const at = current.marks[mark];
    return at === undefined ? null : Math.max(0, Math.round(at - current.startedAt));
  };

  const timeToArrangementMs = since("arrangementPaint");
  const activeTimeToArrangementMs =
    timeToArrangementMs === null ? null : Math.max(0, Math.round(timeToArrangementMs - idleSoFar));

  const planReadyMs = since("planReady");

  return {
    inventoryReadyMs: since("inventoryReady"),
    spaceReadyMs: since("spaceReady"),
    planReadyMs,
    arrangementPaintMs:
      timeToArrangementMs === null || planReadyMs === null
        ? null
        : Math.max(0, timeToArrangementMs - planReadyMs),
    timeToArrangementMs,
    activeTimeToArrangementMs,
    userWaitMs: Math.round(idleSoFar),
    withinTarget:
      activeTimeToArrangementMs !== null && activeTimeToArrangementMs <= ARRANGEMENT_TARGET_MS,
  };
}

/** Test and "start again" hook. */
export function resetArrangementRun(): void {
  run = null;
}
