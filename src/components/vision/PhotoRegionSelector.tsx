/**
 * PhotoRegionSelector — the user decides what Spacilo AI looks at.
 *
 * A photograph almost always contains more than the person wants to store, and
 * a room almost always contains more than the host wants to let out. Rather
 * than guessing, we let people draw round what they mean: a rectangle, a
 * square, an ellipse, a freehand outline, a tap, or the whole photo.
 *
 * The selection is normalised (0–1) so it survives resizing, rotation of the
 * layout and any later crop, and it is the same shape the detector receives.
 */
import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  boundingBox,
  ellipseSelection,
  fullSelection,
  isFullPhoto,
  isUsableSelection,
  lassoSelection,
  rectSelection,
  squareSelection,
  type PhotoSelection,
  type Point,
  type SelectionShape,
} from "@/lib/vision/selection";

const TOOLS: { id: Exclude<SelectionShape, "full">; label: string }[] = [
  { id: "rect", label: "Rectangle" },
  { id: "square", label: "Square" },
  { id: "ellipse", label: "Circle" },
  { id: "lasso", label: "Freehand" },
];

/** A tap with no drag proposes a boundary this wide, as a share of the photo. */
export const TAP_BOX = 0.34;

export function PhotoRegionSelector({
  photoId,
  photoUrl,
  rotation = 0,
  selection,
  onChange,
  title = "Select what you want to store",
  hint = "Draw round the item, or tap it. Everything outside your selection is ignored.",
  wholeLabel = "Use the whole photo",
  className,
}: {
  photoId: string;
  photoUrl: string;
  rotation?: number;
  selection: PhotoSelection | null;
  onChange: (selection: PhotoSelection | null) => void;
  title?: string;
  hint?: string;
  wholeLabel?: string;
  className?: string;
}) {
  const [tool, setTool] = React.useState<Exclude<SelectionShape, "full">>("rect");
  const [draft, setDraft] = React.useState<PhotoSelection | null>(null);
  /** Drawn but not yet committed. Nothing leaves this component until confirmed. */
  const [pending, setPending] = React.useState<PhotoSelection | null>(null);
  const frame = React.useRef<HTMLDivElement>(null);
  const origin = React.useRef<Point | null>(null);
  const trail = React.useRef<Point[]>([]);
  const moved = React.useRef(false);

  const shown = draft ?? pending ?? selection;


  const toPoint = (event: React.PointerEvent): Point => {
    const box = frame.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return { x: 0, y: 0 };
    return {
      x: (event.clientX - box.left) / box.width,
      y: (event.clientY - box.top) / box.height,
    };
  };

  const aspect = () => {
    const box = frame.current?.getBoundingClientRect();
    return box && box.height > 0 ? box.width / box.height : 1;
  };

  const build = (from: Point, to: Point): PhotoSelection => {
    if (tool === "square") return squareSelection(photoId, from, to, aspect());
    if (tool === "ellipse") return ellipseSelection(photoId, from, to);
    if (tool === "lasso") return lassoSelection(photoId, trail.current);
    return rectSelection(photoId, from, to);
  };

  const down = (event: React.PointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = toPoint(event);
    origin.current = point;
    trail.current = [point];
    moved.current = false;
    setDraft(null);
  };

  const move = (event: React.PointerEvent) => {
    if (!origin.current) return;
    const point = toPoint(event);
    const distance = Math.hypot(point.x - origin.current.x, point.y - origin.current.y);
    if (distance > 0.02) moved.current = true;
    if (tool === "lasso") trail.current.push(point);
    setDraft(build(origin.current, point));
  };

  const up = (event: React.PointerEvent) => {
    if (!origin.current) return;
    const point = toPoint(event);

    // Tap-to-select: no drag, so propose a boundary around the tap and let the
    // user adjust it rather than making them draw precisely on a small screen.
    if (!moved.current) {
      const half = TAP_BOX / 2;
      const proposal = rectSelection(
        photoId,
        { x: point.x - half, y: point.y - half },
        { x: point.x + half, y: point.y + half },
      );
      origin.current = null;
      setDraft(null);
      onChange(proposal);
      return;
    }

    const next = build(origin.current, point);
    origin.current = null;
    trail.current = [];
    setDraft(null);
    onChange(isUsableSelection(next) ? next : null);
  };

  const outline = shown && !isFullPhoto(shown) ? shown : null;
  const box = outline ? boundingBox(outline) : null;

  return (
    <div className={cn("rounded-2xl border border-border bg-card p-3", className)}>
      <p className="type-card-title">{title}</p>
      <p className="mt-0.5 type-body-xs text-muted-foreground">{hint}</p>

      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Selection tools">
        {TOOLS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={tool === entry.id}
            onClick={() => setTool(entry.id)}
            className={cn(
              "rounded-full px-3 py-1.5 type-badge transition-colors",
              tool === entry.id
                ? "bg-signal text-signal-foreground"
                : "bg-surface text-muted-foreground",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div
        ref={frame}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className="relative mt-3 aspect-4/3 touch-none overflow-hidden rounded-xl bg-muted select-none"
      >
        <img
          src={photoUrl}
          alt="Select the area to analyse"
          draggable={false}
          className="pointer-events-none size-full object-contain"
          style={{ transform: `rotate(${rotation}deg)` }}
        />
        {outline ? (
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 size-full"
          >
            <defs>
              <mask id={`sel-${photoId}`}>
                <rect x="0" y="0" width="100" height="100" fill="white" />
                <polygon
                  points={outline.points
                    .map((point) => `${point.x * 100},${point.y * 100}`)
                    .join(" ")}
                  fill="black"
                />
              </mask>
            </defs>
            <rect
              x="0"
              y="0"
              width="100"
              height="100"
              fill="oklch(0 0 0 / 0.55)"
              mask={`url(#sel-${photoId})`}
            />
            <polygon
              points={outline.points.map((point) => `${point.x * 100},${point.y * 100}`).join(" ")}
              fill="none"
              stroke="currentColor"
              strokeWidth="0.8"
              className="text-signal"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onChange(fullSelection(photoId))}
        >
          {wholeLabel}
        </Button>
        {selection ? (
          <Button type="button" variant="text" size="sm" onClick={() => onChange(null)}>
            Clear selection
          </Button>
        ) : null}
        <p className="type-body-xs text-muted-foreground" aria-live="polite">
          {!selection
            ? "Nothing selected yet."
            : isFullPhoto(selection)
              ? "Analysing the whole photo."
              : `Selected about ${Math.round((box?.width ?? 0) * (box?.height ?? 0) * 100)}% of the photo.`}
        </p>
      </div>
    </div>
  );
}
