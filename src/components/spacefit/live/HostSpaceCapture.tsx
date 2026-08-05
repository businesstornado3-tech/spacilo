/**
 * SpaceFit Live Scan — the shared HOST capture flow.
 *
 * One component owns the whole host journey so guest, dashboard and listing
 * wizard all behave identically:
 *
 *   live camera + local guidance
 *     → Capture space (camera + inference released by LiveScanner's capture)
 *     → frozen frame + post-capture choice
 *     → Boundary Editor (rectangle / square / circle / flexible)
 *     → measurement proposal the host explicitly confirms
 *
 * Nothing here measures anything itself: BoundaryEditor and boundary-scale.ts
 * remain the only source of metres, and metric scale stays earned.
 */
import * as React from "react";
import { PencilRuler, RefreshCw, Ruler, ImageIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BoundaryEditor } from "@/components/spacefit/live/BoundaryEditor";
import { LiveScanner } from "@/components/spacefit/live/LiveScanner";
import type { BoundaryMeasurement } from "@/lib/livescan/boundary-scale";

export interface HostSpaceCaptureProps {
  /** Receives the captured frame so the existing photo pipeline is unchanged. */
  onCaptured: (file: File) => void | Promise<void>;
  /** Host-confirmed boundary measurement. Never auto-verified. */
  onMeasured: (measurement: BoundaryMeasurement) => void | Promise<void>;
  /** Optional escape hatch — the host must never be trapped in drawing. */
  onManualEntry?: () => void;
  /** Rendered inside the idle Live Scan card (upload / manual fallbacks). */
  fallback?: React.ReactNode;
  className?: string;
}

type Stage = "camera" | "choose" | "draw";

export function HostSpaceCapture({
  onCaptured,
  onMeasured,
  onManualEntry,
  fallback,
  className,
}: HostSpaceCaptureProps) {
  const [frozen, setFrozen] = React.useState<string | null>(null);
  const [stage, setStage] = React.useState<Stage>("camera");

  const clearFrozen = React.useCallback(() => {
    setFrozen((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
  }, []);

  // Never leak the frozen frame's blob URL.
  React.useEffect(() => clearFrozen, [clearFrozen]);

  function retake() {
    clearFrozen();
    setStage("camera");
  }

  if (stage === "draw" && frozen) {
    return (
      <div className={className}>
        <BoundaryEditor
          imageUrl={frozen}
          onCancel={() => setStage("choose")}
          onConfirm={async (measurement) => {
            await onMeasured(measurement);
            clearFrozen();
            setStage("camera");
          }}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="ghost" onClick={retake}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Retake photo
          </Button>
          {onManualEntry ? (
            <Button type="button" variant="ghost" onClick={onManualEntry}>
              <Ruler className="size-4" aria-hidden="true" />
              Enter measurements manually
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  if (stage === "choose" && frozen) {
    return (
      <div className={className}>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <img
            src={frozen}
            alt="The photo you just captured of your space"
            className="block w-full"
          />
          <div className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="type-h3">Which part of this space are you offering?</h3>
              <Badge variant="neutral" className="ml-auto">
                Photo saved
              </Badge>
            </div>
            <p className="mt-1 type-body-sm text-muted-foreground">
              Outline the area you're letting so we only estimate the part renters can actually use.
            </p>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button
                type="button"
                size="lg"
                className="min-h-14 flex-1"
                onClick={() => setStage("draw")}
              >
                <PencilRuler className="size-5" aria-hidden="true" />
                Draw available area
              </Button>
              <Button
                type="button"
                size="lg"
                variant="secondary"
                className="min-h-14"
                onClick={retake}
              >
                <ImageIcon className="size-5" aria-hidden="true" />
                Use full visible space
              </Button>
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="ghost" onClick={retake}>
                <RefreshCw className="size-4" aria-hidden="true" />
                Retake photo
              </Button>
              {onManualEntry ? (
                <Button type="button" variant="ghost" onClick={onManualEntry}>
                  <Ruler className="size-4" aria-hidden="true" />
                  Enter measurements manually
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <LiveScanner
      mode="host"
      className={className}
      fallback={fallback}
      onCapture={async (file: File) => {
        await onCaptured(file);
        setFrozen((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return URL.createObjectURL(file);
        });
        setStage("choose");
      }}
    />
  );
}
