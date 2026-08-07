/**
 * Milestone 2 + 11 + 12 — the twin viewer.
 *
 * WebGL when the device supports it, a real 2D plan when it does not. The
 * fallback is not an apology screen: it renders the same scene from the same
 * engine, so every device sees the truth about the space.
 */
import { Suspense, lazy, useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { CAMERA_PRESETS, cameraPositionFor, cameraTargetFor } from "@/lib/twin/cameras";
import type { CameraMode, TwinScene } from "@/lib/twin/contracts";

import { TwinPlanFallback } from "./TwinPlanFallback";

const TwinCanvas = lazy(() => import("./TwinCanvas"));

/** Cheap capability probe; runs once, client-side only. */
function detectWebgl(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export interface TwinViewerProps {
  scene: TwinScene;
  mode?: CameraMode;
  highlightId?: string | null;
  onSelect?: (id: string) => void;
  /** Force the 2D plan — used by print, tests and reduced-capability surfaces. */
  force2d?: boolean;
  className?: string;
  height?: number;
}

export function TwinViewer({
  scene,
  mode = "perspective",
  highlightId = null,
  onSelect,
  force2d = false,
  className,
  height = 380,
}: TwinViewerProps) {
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setWebgl(detectWebgl());
  }, []);

  const camera = useMemo(() => {
    const preset = CAMERA_PRESETS[mode];
    return {
      preset,
      position: cameraPositionFor(preset, scene.room),
      target: cameraTargetFor(preset, scene.room),
    };
  }, [mode, scene.room]);

  const use3d = !force2d && webgl === true && !failed;

  return (
    <div
      className={cn("relative overflow-hidden rounded-xl border border-border bg-muted/30", className)}
      style={{ height }}
      role="img"
      aria-label={`${scene.label}: ${scene.objects.length} item groups in a ${scene.room.widthM}m by ${scene.room.depthM}m space`}
    >
      {use3d ? (
        <Suspense fallback={<TwinPlanFallback scene={scene} highlightId={highlightId} />}>
          <TwinCanvas
            scene={scene}
            camera={camera}
            highlightId={highlightId}
            onSelect={onSelect}
            onError={() => setFailed(true)}
          />
        </Suspense>
      ) : (
        <TwinPlanFallback scene={scene} highlightId={highlightId} onSelect={onSelect} />
      )}
    </div>
  );
}
