/**
 * SpaceFit Live Scan — host boundary editor (frozen frame).
 *
 * Drawing happens on a STILL image, never on live video: the camera and the
 * local model are already stopped by the time this appears, which keeps phones
 * cool and the handles precise.
 *
 * The host outlines the part of the space they're actually letting, marks any
 * fixed obstructions, and — only if they give one real measurement from the
 * photo — sees estimated metres they then confirm. Without that reference, or
 * when the shot is too angled, we say so plainly and offer manual entry.
 */
import * as React from "react";
import { Circle, Pentagon, RectangleHorizontal, RotateCcw, Square, Trash2, Undo2 } from "lucide-react";

import { Alert } from "@/components/common/Alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/form/Field";
import {
  addPoint,
  BOUNDARY_TARGET_LABEL,
  boundaryPoints,
  defaultBoundary,
  handlePoints,
  isCircle,
  isValidBoundary,
  moveHandle,
  removePoint,
  type Boundary,
  type BoundaryShape,
  type BoundaryTarget,
  type FrameSize,
  type Point,
} from "@/lib/livescan/boundary";
import {
  deriveScale,
  measureBoundary,
  SCALE_REFUSAL_COPY,
  type BoundaryMeasurement,
} from "@/lib/livescan/boundary-scale";

const SHAPES: Array<{ shape: BoundaryShape; label: string; Icon: typeof Square }> = [
  { shape: "rectangle", label: "Rectangle", Icon: RectangleHorizontal },
  { shape: "square", label: "Square", Icon: Square },
  { shape: "circle", label: "Circle", Icon: Circle },
  { shape: "polygon", label: "Flexible", Icon: Pentagon },
];

const TARGETS: BoundaryTarget[] = ["floor", "wall_shelf", "volume"];

export interface BoundaryEditorProps {
  /** Frozen frame the host just captured, or an existing scan photo. */
  imageUrl: string;
  onConfirm: (measurement: BoundaryMeasurement) => void | Promise<void>;
  onCancel?: () => void;
  className?: string;
}

interface Drag {
  kind: "boundary" | "exclusion";
  exclusionIndex: number;
  handleIndex: number;
}

export function BoundaryEditor({ imageUrl, onConfirm, onCancel, className }: BoundaryEditorProps) {
  const surfaceRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<Drag | null>(null);

  const [frame, setFrame] = React.useState<FrameSize>({ width: 1000, height: 750 });
  const [shape, setShape] = React.useState<BoundaryShape>("rectangle");
  const [boundary, setBoundary] = React.useState<Boundary>(() => defaultBoundary("rectangle"));
  const [exclusions, setExclusions] = React.useState<Boundary[]>([]);
  const [history, setHistory] = React.useState<Array<{ boundary: Boundary; exclusions: Boundary[] }>>([]);
  const [target, setTarget] = React.useState<BoundaryTarget>("floor");
  const [referenceEdge, setReferenceEdge] = React.useState(0);
  const [referenceText, setReferenceText] = React.useState("");
  const [heightText, setHeightText] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const points = boundaryPoints(boundary, frame);
  const handles = handlePoints(boundary, frame);
  const valid = isValidBoundary(boundary);

  const referenceMetres = Number.parseFloat(referenceText);
  const scale = deriveScale(
    boundary,
    frame,
    Number.isFinite(referenceMetres)
      ? { edgeIndex: referenceEdge, metres: referenceMetres, label: "Host reference" }
      : null,
  );

  const heightM = Number.parseFloat(heightText);
  const measurement: BoundaryMeasurement | null =
    valid && scale.ok
      ? measureBoundary({
          boundary,
          frame,
          scale,
          target,
          exclusions,
          heightM: Number.isFinite(heightM) ? heightM : null,
        })
      : null;

  function snapshot() {
    setHistory((prev) => [...prev.slice(-19), { boundary, exclusions }]);
  }

  function pickShape(next: BoundaryShape) {
    snapshot();
    setShape(next);
    setBoundary(defaultBoundary(next));
    setReferenceEdge(0);
  }

  function pointFromEvent(event: React.PointerEvent): Point | null {
    const surface = surfaceRef.current;
    if (!surface) return null;
    const rect = surface.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  }

  function startDrag(event: React.PointerEvent, drag: Drag) {
    event.preventDefault();
    event.stopPropagation();
    (event.target as Element).setPointerCapture?.(event.pointerId);
    snapshot();
    dragRef.current = drag;
  }

  function onPointerMove(event: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const point = pointFromEvent(event);
    if (!point) return;
    event.preventDefault();
    if (drag.kind === "boundary") {
      setBoundary((current) => moveHandle(current, drag.handleIndex, point));
      return;
    }
    setExclusions((current) =>
      current.map((item, index) =>
        index === drag.exclusionIndex ? moveHandle(item, drag.handleIndex, point) : item,
      ),
    );
  }

  function endDrag() {
    dragRef.current = null;
  }

  function undo() {
    setHistory((prev) => {
      const last = prev[prev.length - 1];
      if (!last) return prev;
      setBoundary(last.boundary);
      setExclusions(last.exclusions);
      return prev.slice(0, -1);
    });
  }

  function reset() {
    snapshot();
    setBoundary(defaultBoundary(shape));
    setExclusions([]);
  }

  function addExclusion() {
    snapshot();
    setExclusions((current) => [
      ...current,
      {
        shape: "rectangle",
        points: [
          { x: 0.35, y: 0.55 },
          { x: 0.6, y: 0.55 },
          { x: 0.6, y: 0.78 },
          { x: 0.35, y: 0.78 },
        ],
      },
    ]);
  }

  const edgeCount = isCircle(boundary) ? 0 : boundary.points.length;

  return (
    <section className={className}>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div
          ref={surfaceRef}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="relative touch-none select-none bg-foreground/95"
        >
          <img
            src={imageUrl}
            alt="The photo you captured, used to outline the space you're letting"
            onLoad={(event) => {
              const image = event.currentTarget;
              if (image.naturalWidth > 0) {
                setFrame({ width: image.naturalWidth, height: image.naturalHeight });
              }
            }}
            className="block w-full"
          />

          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 size-full"
          >
            <polygon
              points={points.map((point) => `${point.x * 100},${point.y * 100}`).join(" ")}
              className={valid ? "fill-signal/20 stroke-signal" : "fill-destructive/20 stroke-destructive"}
              strokeWidth={0.6}
              vectorEffect="non-scaling-stroke"
            />
            {exclusions.map((exclusion, index) => (
              <polygon
                key={`exclusion-${index}`}
                points={boundaryPoints(exclusion, frame)
                  .map((point) => `${point.x * 100},${point.y * 100}`)
                  .join(" ")}
                className="fill-warning/25 stroke-warning"
                strokeWidth={0.6}
                strokeDasharray="2 2"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>

          {/* Generous 44px touch targets, positioned on each handle. */}
          {handles.map((point, index) => (
            <button
              key={`handle-${index}`}
              type="button"
              aria-label={
                isCircle(boundary)
                  ? index === 0
                    ? "Move the circle"
                    : "Resize the circle"
                  : `Move corner ${index + 1}`
              }
              onPointerDown={(event) =>
                startDrag(event, { kind: "boundary", exclusionIndex: -1, handleIndex: index })
              }
              style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
              className="absolute -ml-6 -mt-6 grid size-12 touch-none place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="size-5 rounded-full border-2 border-background bg-signal shadow-card" />
            </button>
          ))}

          {exclusions.map((exclusion, exclusionIndex) =>
            handlePoints(exclusion, frame).map((point, index) => (
              <button
                key={`exclusion-${exclusionIndex}-${index}`}
                type="button"
                aria-label={`Move corner ${index + 1} of excluded area ${exclusionIndex + 1}`}
                onPointerDown={(event) =>
                  startDrag(event, { kind: "exclusion", exclusionIndex, handleIndex: index })
                }
                style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
                className="absolute -ml-6 -mt-6 grid size-12 touch-none place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="size-4 rounded-sm border-2 border-background bg-warning shadow-card" />
              </button>
            )),
          )}
        </div>

        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="type-h3">Outline the space you're letting</h3>
            <Badge variant="neutral" className="ml-auto">
              Frozen photo
            </Badge>
          </div>
          <p className="mt-1 type-body-sm text-muted-foreground">
            Drag the corners around the area you're offering. Anything you leave outside isn't
            counted.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {SHAPES.map(({ shape: option, label, Icon }) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={shape === option ? "default" : "secondary"}
                onClick={() => pickShape(option)}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </Button>
            ))}
          </div>

          {shape === "polygon" && !isCircle(boundary) ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  snapshot();
                  setBoundary((current) => addPoint(current, 0));
                }}
              >
                Add a point
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  snapshot();
                  setBoundary((current) => removePoint(current, current.shape === "circle" ? 0 : current.points.length - 1));
                }}
              >
                Remove last point
              </Button>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={undo} disabled={history.length === 0}>
              <Undo2 className="size-4" aria-hidden="true" />
              Undo
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={reset}>
              <RotateCcw className="size-4" aria-hidden="true" />
              Start again
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={addExclusion}>
              Mark a fixed obstruction
            </Button>
            {exclusions.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  snapshot();
                  setExclusions((current) => current.slice(0, -1));
                }}
              >
                <Trash2 className="size-4" aria-hidden="true" />
                Remove last obstruction
              </Button>
            ) : null}
          </div>

          <fieldset className="mt-4">
            <legend className="type-body-sm font-medium">What have you outlined?</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {TARGETS.map((option) => (
                <Button
                  key={option}
                  type="button"
                  size="sm"
                  variant={target === option ? "default" : "secondary"}
                  onClick={() => setTarget(option)}
                >
                  {BOUNDARY_TARGET_LABEL[option]}
                </Button>
              ))}
            </div>
          </fieldset>

          {!valid ? (
            <Alert tone="warning" className="mt-4" title="That outline crosses itself">
              {SCALE_REFUSAL_COPY.invalid_boundary}
            </Alert>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field
              label="One real measurement (m)"
              htmlFor="boundary-reference"
              hint="Measure something in the photo — a doorway, a wall, a shelf edge."
            >
              <TextInput
                id="boundary-reference"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.1"
                value={referenceText}
                onChange={(event) => setReferenceText(event.target.value)}
              />
            </Field>
            <Field label="Usable height (m), optional" htmlFor="boundary-height">
              <TextInput
                id="boundary-height"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.1"
                value={heightText}
                onChange={(event) => setHeightText(event.target.value)}
              />
            </Field>
          </div>

          {edgeCount > 0 ? (
            <div className="mt-3">
              <p className="type-body-sm font-medium">Which edge did you measure?</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {Array.from({ length: edgeCount }, (_, index) => (
                  <Button
                    key={`edge-${index}`}
                    type="button"
                    size="sm"
                    variant={referenceEdge === index ? "default" : "secondary"}
                    onClick={() => setReferenceEdge(index)}
                  >
                    Edge {index + 1}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          {measurement ? (
            <div className="mt-4 rounded-2xl border border-primary/30 bg-primary/5 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="type-h3">Estimated from your outline</h4>
                <Badge variant="neutral" className="ml-auto">
                  Estimate — you confirm
                </Badge>
              </div>
              <dl className="mt-3 grid gap-2 type-body-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">{BOUNDARY_TARGET_LABEL[measurement.target]}</dt>
                  <dd className="type-body font-medium">{measurement.areaM2} m²</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Usable after obstructions</dt>
                  <dd className="type-body font-medium">{measurement.usableM2} m²</dd>
                </div>
                {measurement.widthM && measurement.depthM ? (
                  <div>
                    <dt className="text-muted-foreground">Width × depth</dt>
                    <dd className="type-body font-medium">
                      {measurement.widthM} m × {measurement.depthM} m
                    </dd>
                  </div>
                ) : null}
                {measurement.volumeM3 ? (
                  <div>
                    <dt className="text-muted-foreground">Volume</dt>
                    <dd className="type-body font-medium">{measurement.volumeM3} m³</dd>
                  </div>
                ) : null}
              </dl>
              <p className="mt-3 type-body-sm text-muted-foreground">
                Worked out from the measurement you gave us, so it's only as accurate as that. Check
                it against the real space before you publish.
              </p>
            </div>
          ) : (
            <Alert tone="info" className="mt-4" title="We can't size this yet">
              {valid ? SCALE_REFUSAL_COPY[scale.ok ? "no_reference" : scale.reason] : SCALE_REFUSAL_COPY.invalid_boundary}
            </Alert>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              size="lg"
              className="min-h-14 flex-1"
              disabled={!measurement || saving}
              onClick={async () => {
                if (!measurement) return;
                setSaving(true);
                try {
                  await onConfirm(measurement);
                } finally {
                  setSaving(false);
                }
              }}
            >
              Use these measurements
            </Button>
            {onCancel ? (
              <Button type="button" size="lg" variant="ghost" className="min-h-14" onClick={onCancel}>
                Skip
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
