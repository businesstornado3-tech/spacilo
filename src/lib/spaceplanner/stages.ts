/**
 * The visible reasoning steps.
 *
 * These are not a fake progress bar: each stage names a real part of the
 * deterministic pipeline that runs to produce the plan, and the timeline shows
 * them in the order the engine works through them.
 */
export interface ThinkingStage {
  id: string;
  label: string;
  /** Milliseconds this stage is highlighted for when motion is allowed. */
  duration: number;
}

export const THINKING_STAGES: ThinkingStage[] = [
  { id: "scan", label: "Scanning belongings", duration: 420 },
  { id: "categorise", label: "Recognising object categories", duration: 380 },
  { id: "dimensions", label: "Estimating dimensions", duration: 400 },
  { id: "volume", label: "Calculating total volume", duration: 360 },
  { id: "fragile", label: "Identifying fragile items", duration: 340 },
  { id: "stacking", label: "Checking stacking rules", duration: 380 },
  { id: "access", label: "Planning access routes", duration: 360 },
  { id: "placement", label: "Optimising placement", duration: 460 },
  { id: "capacity", label: "Calculating remaining capacity", duration: 340 },
  { id: "plan", label: "Generating intelligent storage plan", duration: 460 },
];

export const TOTAL_THINKING_MS = THINKING_STAGES.reduce((sum, s) => sum + s.duration, 0);

/** Cumulative start offset for each stage, used by the timeline animation. */
export function stageOffsets(): number[] {
  let elapsed = 0;
  return THINKING_STAGES.map((stage) => {
    const start = elapsed;
    elapsed += stage.duration;
    return start;
  });
}
