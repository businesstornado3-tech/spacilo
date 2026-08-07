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

export const BELONGINGS_STAGES: VisionStage[] = [
  { id: "scan", label: "Scanning belongings…", duration: 620 },
  { id: "detect", label: "Detecting objects…", duration: 700 },
  { id: "dimensions", label: "Estimating dimensions…", duration: 620 },
  { id: "volume", label: "Calculating volume…", duration: 520 },
  { id: "weight", label: "Estimating weight…", duration: 480 },
  { id: "inventory", label: "Building inventory…", duration: 560 },
  { id: "packing", label: "Optimising packing…", duration: 600 },
];

export const SPACE_STAGES: VisionStage[] = [
  { id: "scan", label: "Scanning your space…", duration: 620 },
  { id: "geometry", label: "Estimating dimensions…", duration: 700 },
  { id: "obstacles", label: "Finding usable floor area…", duration: 640 },
  { id: "ceiling", label: "Estimating ceiling height…", duration: 520 },
  { id: "demand", label: "Checking local demand…", duration: 600 },
  { id: "value", label: "Estimating monthly income…", duration: 560 },
];

export function totalDuration(stages: VisionStage[]): number {
  return stages.reduce((sum, stage) => sum + stage.duration, 0);
}
