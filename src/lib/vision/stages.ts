/**
 * Vision analysis stages — the visible thinking.
 *
 * Presentational pacing only. The stages describe what the engine is doing so
 * the wait feels understood rather than empty.
 */
export interface VisionStage {
  id: string;
  label: string;
  /** Milliseconds this stage is shown for. */
  duration: number;
}

/**
 * Belongings stages, in the order the real pipeline runs them. Durations are
 * a pacing hint for the shimmer only — progress is driven by the pipeline.
 */
export const BELONGINGS_STAGES: VisionStage[] = [
  { id: "reading", label: "Reading your photos…", duration: 1200 },
  { id: "finding", label: "Finding your items…", duration: 5000 },
  { id: "estimating", label: "Estimating sizes…", duration: 2500 },
  { id: "inventory", label: "Building your inventory…", duration: 1200 },
];

export const SPACE_STAGES: VisionStage[] = [
  { id: "reading", label: "Reading your photos…", duration: 1200 },
  { id: "space", label: "Measuring the usable area…", duration: 5000 },
  { id: "estimating", label: "Estimating capacity…", duration: 2000 },
  { id: "value", label: "Estimating monthly income…", duration: 1200 },
];

/** Pipeline stage key → index in the stage list above. */
export function stageIndexFor(stages: VisionStage[], key: string): number {
  const index = stages.findIndex((stage) => stage.id === key);
  return index < 0 ? 0 : index;
}

export function totalDuration(stages: VisionStage[]): number {
  return stages.reduce((sum, stage) => sum + stage.duration, 0);
}
