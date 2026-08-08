/**
 * PhotoArrangement — the user's actual photograph, with their belongings
 * arranged inside it.
 *
 * The photo is the foundation: walls, floor, door and everything already in
 * the room stay exactly as photographed. When Spacilo AI has produced a real
 * edited photograph it is shown as "AI arranged". When it has not, the panel
 * says so plainly and offers a retry — the geometric fit overlay is only ever
 * labelled as fit analysis, never as an AI visualisation.
 */
import * as React from "react";
import { AlertTriangle, Maximize2, MoveHorizontal, RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ImageLightbox } from "@/components/common/ImageLightbox";
import { projectPlacements, toPoints, DEFAULT_FLOOR_QUAD, type FloorQuad } from "@/lib/spaceplanner/photo";
import type { CoverageReport } from "@/lib/spaceplanner/photo/manifest";
import type { PackResult, StorageSpace } from "@/lib/spaceplanner";

export type ArrangementStatus = "idle" | "working" | "ready" | "incomplete" | "failed";

export interface PhotoArrangementProps {
  /** The user's own photograph of the space. */
  photoUrl: string;
  photoAlt?: string;
  space: StorageSpace;
  pack: PackResult;
  quad?: FloorQuad;
  /** Text alternative describing the arrangement for assistive technology. */
  description: string;
  /** The AI-edited photograph, when one has genuinely been produced. */
  arrangedUrl?: string | null;
  status?: ArrangementStatus;
  statusLabel?: string;
  /** How many required items the generated image was shown to contain. */
  coverage?: CoverageReport | null;
  onRetry?: () => void;
  className?: string;
}

function Overlay({
  space,
  pack,
  quad,
}: {
  space: StorageSpace;
  pack: PackResult;
  quad: FloorQuad;
}) {
  const boxes = React.useMemo(
    () => projectPlacements(pack.placements, space, quad),
    [pack.placements, space, quad],
  );

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 size-full"
      aria-hidden="true"
    >
      {boxes.map((box) => (
        <g key={box.key}>
          <polygon
            points={toPoints(box.front)}
            className="fill-[var(--color-signal)]/35 stroke-[var(--color-signal)]"
            strokeWidth={0.25}
          />
          <polygon
            points={toPoints(box.top)}
            className="fill-[var(--color-signal)]/55 stroke-[var(--color-signal)]"
            strokeWidth={0.25}
          />
        </g>
      ))}
    </svg>
  );
}

export function PhotoArrangement({
  photoUrl,
  photoAlt = "The space you photographed",
  space,
  pack,
  quad = DEFAULT_FLOOR_QUAD,
  description,
  arrangedUrl = null,
  status = "idle",
  statusLabel,
  coverage = null,
  onRetry,
  className,
}: PhotoArrangementProps) {
  const hasVisual = (status === "ready" || status === "incomplete") && Boolean(arrangedUrl);
  const [showArranged, setShowArranged] = React.useState(true);
  const [position, setPosition] = React.useState(100);
  const [showOverlay, setShowOverlay] = React.useState(false);
  const [zoomed, setZoomed] = React.useState(false);

  React.useEffect(() => {
    if (hasVisual) {
      setShowArranged(true);
      setPosition(100);
    }
  }, [hasVisual]);

  const arranged = hasVisual && showArranged;

  return (
    <figure className={cn("min-w-0", className)}>
      <div className="relative overflow-hidden rounded-2xl border border-border bg-surface">
        <img
          src={photoUrl}
          alt={photoAlt}
          loading="lazy"
          decoding="async"
          className="block aspect-[4/3] w-full object-cover"
        />

        {arranged ? (
          <div
            className="absolute inset-0"
            style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
          >
            <img
              src={arrangedUrl ?? ""}
              alt={description}
              decoding="async"
              className="block size-full object-cover"
            />
          </div>
        ) : null}

        {!hasVisual && showOverlay ? (
          <div className="absolute inset-0">
            <Overlay space={space} pack={pack} quad={quad} />
          </div>
        ) : null}

        {status === "working" ? (
          <div
            role="status"
            aria-live="polite"
            className="absolute inset-0 grid place-items-center bg-scene-ink/45 px-4 text-center"
          >
            <span className="max-w-[18rem] rounded-2xl bg-card/95 px-4 py-3 type-body-sm">
              <span className="mx-auto mb-2 block size-5 animate-spin rounded-full border-2 border-signal border-t-transparent" />
              {statusLabel ?? "Creating your SpacePlanner visualisation…"}
            </span>
          </div>
        ) : null}

        <span className="absolute left-3 top-3 rounded-full bg-card/90 px-2.5 py-1 type-badge">
          {arranged ? "AI arranged" : "Original"}
        </span>

        <button
          type="button"
          onClick={() => setZoomed(true)}
          aria-label="Maximise and zoom this view"
          className="absolute right-3 top-3 grid size-10 place-items-center rounded-full bg-card/90 text-foreground shadow-card transition-colors hover:bg-card"
        >
          <Maximize2 className="size-4" aria-hidden="true" />
        </button>

        {arranged && position > 2 && position < 98 ? (
          <span
            className="pointer-events-none absolute inset-y-0 w-px bg-signal"
            style={{ left: `${position}%` }}
            aria-hidden="true"
          >
            <span className="absolute left-1/2 top-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-signal text-signal-foreground shadow-raised">
              <MoveHorizontal className="size-4" aria-hidden="true" />
            </span>
          </span>
        ) : null}
      </div>

      {hasVisual ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div
            className="inline-flex rounded-full bg-surface p-1"
            role="group"
            aria-label="Compare original and AI arranged"
          >
            <button
              type="button"
              onClick={() => setShowArranged(false)}
              aria-pressed={!showArranged}
              className={cn(
                "rounded-full px-3 py-1.5 type-badge",
                !showArranged && "bg-card shadow-card",
              )}
            >
              Original
            </button>
            <button
              type="button"
              onClick={() => setShowArranged(true)}
              aria-pressed={showArranged}
              className={cn(
                "rounded-full px-3 py-1.5 type-badge",
                showArranged && "bg-card shadow-card",
              )}
            >
              AI arranged
            </button>
          </div>

          <label className="min-w-[10rem] flex-1">
            <span className="sr-only">Reveal the AI arrangement</span>
            <input
              type="range"
              min={0}
              max={100}
              value={position}
              disabled={!showArranged}
              onChange={(event) => setPosition(Number(event.target.value))}
              className="h-11 w-full accent-[var(--color-signal)]"
              aria-label="Reveal the AI arrangement across your photo"
            />
          </label>
        </div>
      ) : null}

      {hasVisual && coverage ? (
        <p
          className="mt-3 flex items-start gap-2 type-body-sm"
          aria-live="polite"
        >
          {coverage.complete ? (
            <>
              <span className="rounded-full bg-signal-soft px-2 py-0.5 type-badge text-signal-soft-foreground">
                {coverage.present} of {coverage.expected} items included
              </span>
              <span className="text-muted-foreground">Based on your photos.</span>
            </>
          ) : (
            <>
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
              <span>
                Visualisation could not reliably include every item
                {coverage.missing.length ? ` (${coverage.missing.join(", ")})` : ""}. Your fit
                analysis is unaffected.
              </span>
            </>
          )}
        </p>
      ) : null}

      {status === "incomplete" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {onRetry ? (
            <Button type="button" size="sm" variant="secondary" onClick={onRetry}>
              <RefreshCw aria-hidden="true" />
              Retry visualisation
            </Button>
          ) : null}
        </div>
      ) : null}

      {status === "failed" ? (
        <div className="mt-3 rounded-2xl border border-border bg-surface p-3">

          <p className="flex items-start gap-2 type-body-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            We couldn&apos;t create the visual arrangement this time. Your fit analysis below is
            unaffected.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {onRetry ? (
              <Button type="button" size="sm" variant="secondary" onClick={onRetry}>
                <RefreshCw aria-hidden="true" />
                Retry visualisation
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setShowOverlay((current) => !current)}
            >
              {showOverlay ? "Hide fit analysis overlay" : "Show fit analysis overlay"}
            </Button>
          </div>
        </div>
      ) : null}

      <figcaption className="mt-2 type-body-xs text-muted-foreground">
        {hasVisual
          ? `AI visualisation. ${description}`
          : showOverlay
            ? `AI fit analysis — estimated positions, not a photo-realistic visualisation. ${description}`
            : description}
      </figcaption>
      <ImageLightbox
        open={zoomed}
        onClose={() => setZoomed(false)}
        src={arranged && arrangedUrl ? arrangedUrl : photoUrl}
        alt={arranged ? description : photoAlt}
        caption={arranged ? "AI arranged" : "Your original photo"}
      />
    </figure>
  );
}
