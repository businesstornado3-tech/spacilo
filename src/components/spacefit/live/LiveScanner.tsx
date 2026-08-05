/**
 * SpaceFit Live Scan — the shared scanner UI.
 *
 * One component serves guest renter, guest host, authenticated renter and
 * authenticated host: only `mode` and the capture callback change.
 *
 * It never starts the camera on mount, never uploads a preview frame, and never
 * shows a metre figure. Live labels are provisional; the captured photo goes to
 * the existing secure SpaceFit AI pipeline, which remains the authority.
 */
import * as React from "react";
import { Camera, CameraOff, Loader2, RefreshCw, ScanLine, X } from "lucide-react";

import { Alert } from "@/components/common/Alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLiveScan, type UseLiveScanOptions } from "@/hooks/useLiveScan";
import { liveDetectionLabel } from "@/lib/livescan/taxonomy";
import { hostPossibleObstructions, HOST_RESHOOT_TIPS } from "@/lib/livescan/guidance";
import {
  CAPTURE_READINESS_LABEL,
  LIVE_SCAN_ERROR_COPY,
  type LiveScanMode,
} from "@/lib/livescan/types";

export interface LiveScannerProps extends Omit<UseLiveScanOptions, "onCapture"> {
  mode: LiveScanMode;
  /** Receives the single intentionally captured frame. */
  onCapture: (file: File) => void | Promise<void>;
  /** Rendered when the camera can't be used at all. */
  fallback?: React.ReactNode;
  className?: string;
}

const HEADLINE: Record<LiveScanMode, string> = {
  renter: "Show SpaceFit what you want to store",
  host: "Show SpaceFit the space you want to offer",
};

export function LiveScanner({ fallback, className, ...options }: LiveScannerProps) {
  const scan = useLiveScan(options);
  const { mode } = options;
  const active = scan.status === "live" || scan.status === "preparing";
  const obstructions = mode === "host" ? hostPossibleObstructions(scan.detections) : [];

  if (!scan.capability.camera) {
    return (
      <div className={className}>
        <Alert tone="info" title="Live Scan isn't available here">
          {LIVE_SCAN_ERROR_COPY.camera_unavailable}
        </Alert>
        {fallback}
      </div>
    );
  }

  return (
    <div className={className}>
      {!active ? (
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center gap-3">
            <ScanLine className="size-5 shrink-0 text-signal" aria-hidden="true" />
            <div className="min-w-0">
              <h3 className="type-h3">SpaceFit Live Scan</h3>
              <p className="type-body-sm text-muted-foreground">{HEADLINE[mode]}</p>
            </div>
            <Badge variant="neutral" className="ml-auto">
              {scan.capability.liveVision ? "Live guidance" : "Camera only"}
            </Badge>
          </div>

          <p className="mt-3 type-body-sm text-muted-foreground">
            Your camera only turns on when you start the scan, the live view stays on your device,
            and only the photo you capture is sent for analysis.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              size="lg"
              onClick={() => void scan.start()}
              disabled={scan.status === "starting"}
            >
              {scan.status === "starting" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Camera className="size-4" aria-hidden="true" />
              )}
              Start Live Scan
            </Button>
          </div>

          {scan.error ? (
            <Alert tone="warning" className="mt-4" title="Live Scan unavailable">
              {LIVE_SCAN_ERROR_COPY[scan.error]}
            </Alert>
          ) : null}

          {fallback ? <div className="mt-4">{fallback}</div> : null}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-foreground/95">
          <div className="relative aspect-3/4 w-full sm:aspect-video">
            <video
              ref={scan.videoRef}
              playsInline
              muted
              autoPlay
              aria-label="Live camera view for SpaceFit Live Scan"
              className="size-full object-cover"
            />

            {/* Provisional overlays. Never canonical data. Boxes are expressed
                as a share of the analysed frame so they scale with the view. */}
            <div className="pointer-events-none absolute inset-0">
              {scan.frameSize.width > 0 &&
                scan.detections.map((detection) => (
                  <span
                    key={detection.id}
                    className="absolute rounded-lg border-2 border-signal bg-signal/10"
                    style={{
                      left: `${(detection.bbox[0] / scan.frameSize.width) * 100}%`,
                      top: `${(detection.bbox[1] / scan.frameSize.height) * 100}%`,
                      width: `${(detection.bbox[2] / scan.frameSize.width) * 100}%`,
                      height: `${(detection.bbox[3] / scan.frameSize.height) * 100}%`,
                    }}
                  >
                    <span className="absolute -top-6 left-0 whitespace-nowrap rounded-md bg-background/90 px-2 py-0.5 type-body-sm">
                      {liveDetectionLabel(detection.label, detection.confirmed)}
                    </span>
                  </span>
                ))}
            </div>


            <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-background/90 px-3 py-1.5 type-body-sm">
              <span className="size-2 rounded-full bg-destructive" aria-hidden="true" />
              Camera on
            </div>

            <button
              type="button"
              onClick={scan.stop}
              aria-label="Close the camera"
              className="absolute right-3 top-3 grid size-11 place-items-center rounded-full bg-background/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>

          <div className="bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex flex-wrap items-center gap-2">
              <p className="type-body font-medium">{scan.guidance.message}</p>
              <Badge variant="neutral" className="ml-auto">
                {scan.status === "preparing"
                  ? "Preparing SpaceFit Live Scan…"
                  : CAPTURE_READINESS_LABEL[scan.guidance.readiness]}
              </Badge>
            </div>

            {/* Text, not just boxes — guidance never depends on colour alone. */}
            <ul className="mt-2 grid gap-1 type-body-sm text-muted-foreground sm:grid-cols-2">
              {scan.guidance.checks.map((check) => (
                <li key={check.label}>
                  {check.met ? "✓" : "•"} {check.label}
                </li>
              ))}
              {scan.detections.map((detection) => (
                <li key={`text-${detection.id}`}>
                  {liveDetectionLabel(detection.label, detection.confirmed)} detected
                </li>
              ))}
            </ul>

            {mode === "host" ? (
              <div className="mt-2 type-body-sm text-muted-foreground">
                {obstructions.length > 0 ? (
                  <p>Possible fixed obstruction: {obstructions.join(", ")}.</p>
                ) : null}
                <p>
                  We can&apos;t measure in metres from a live camera view — SpaceFit works the
                  measurements out from the photo you capture, and you confirm them.
                </p>
              </div>
            ) : (
              <p className="mt-2 type-body-sm text-muted-foreground">
                These labels are provisional. We take a closer look at the photo you capture.
              </p>
            )}

            {scan.error ? (
              <Alert tone="info" className="mt-3" title="Live guidance limited">
                {LIVE_SCAN_ERROR_COPY[scan.error]}
              </Alert>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="lg"
                className="min-h-14 flex-1"
                onClick={() => void scan.capture()}
                disabled={scan.capturing}
              >
                {scan.capturing ? (
                  <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                ) : (
                  <Camera className="size-5" aria-hidden="true" />
                )}
                Capture
              </Button>
              {scan.canSwitchCamera ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  className="min-h-14"
                  onClick={() => void scan.switchCamera()}
                >
                  <RefreshCw className="size-5" aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only">Switch camera</span>
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="lg"
                className="min-h-14"
                onClick={scan.stop}
              >
                <CameraOff className="size-5" aria-hidden="true" />
                Close
              </Button>
            </div>

            {mode === "host" ? (
              <ul className="mt-3 grid gap-1 type-body-sm text-muted-foreground">
                {HOST_RESHOOT_TIPS.map((tip) => (
                  <li key={tip}>• {tip}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
