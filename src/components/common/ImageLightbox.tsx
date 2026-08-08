/**
 * ImageLightbox — full-screen image viewer with pinch, wheel and double-tap
 * zoom.
 *
 * Used for the SpacePlanner result, where the detail people want to inspect
 * (does that actually look like my sofa?) is far too small inside a card.
 *
 * Zoom is multiplicative and scaled by the delta magnitude, and the point
 * under the cursor or between the fingers stays put, so a trackpad flick does
 * not slam straight to the zoom limit.
 */
import * as React from "react";
import { Minus, Plus, RotateCcw, X } from "lucide-react";

import { cn } from "@/lib/utils";

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

interface View {
  zoom: number;
  x: number;
  y: number;
}

const RESET: View = { zoom: 1, x: 0, y: 0 };

export function ImageLightbox({
  open,
  onClose,
  src,
  alt,
  caption,
}: {
  open: boolean;
  onClose: () => void;
  src: string;
  alt: string;
  caption?: string;
}) {
  const [view, setView] = React.useState<View>(RESET);
  const stage = React.useRef<HTMLDivElement>(null);
  const pointers = React.useRef(new Map<number, { x: number; y: number }>());
  const pinch = React.useRef<{ distance: number; zoom: number } | null>(null);
  const drag = React.useRef<{ x: number; y: number; view: View } | null>(null);
  const viewRef = React.useRef(view);
  viewRef.current = view;

  React.useEffect(() => {
    if (open) setView(RESET);
  }, [open, src]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  /** Zoom about a point, keeping that point stationary on screen. */
  const zoomAt = React.useCallback((next: number, clientX: number, clientY: number) => {
    const box = stage.current?.getBoundingClientRect();
    if (!box) return;
    const px = clientX - box.left - box.width / 2;
    const py = clientY - box.top - box.height / 2;
    setView((current) => {
      const target = clamp(next, MIN_ZOOM, MAX_ZOOM);
      const k = target / current.zoom;
      if (target === MIN_ZOOM) return RESET;
      return { zoom: target, x: px - (px - current.x) * k, y: py - (py - current.y) * k };
    });
  }, []);

  // React attaches onWheel passively, so preventDefault would be ignored.
  React.useEffect(() => {
    const element = stage.current;
    if (!element || !open) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const dy = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1);
      zoomAt(viewRef.current.zoom * Math.exp(-dy * 0.0018), event.clientX, event.clientY);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [open, zoomAt]);

  if (!open || typeof document === "undefined") return null;

  const down = (event: React.PointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    moved.current = false;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a!.x - b!.x, a!.y - b!.y), zoom: view.zoom };
      drag.current = null;
    } else if (view.zoom > 1) {
      drag.current = { x: event.clientX, y: event.clientY, view };
    }
  };

  const move = (event: React.PointerEvent) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size === 2 && pinch.current) {
      moved.current = true;
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (pinch.current.distance > 0) {
        zoomAt(
          pinch.current.zoom * (distance / pinch.current.distance),
          (a!.x + b!.x) / 2,
          (a!.y + b!.y) / 2,
        );
      }
      return;
    }

    if (drag.current) {
      const start = drag.current;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) moved.current = true;
      setView({
        zoom: start.view.zoom,
        x: start.view.x + (event.clientX - start.x),
        y: start.view.y + (event.clientY - start.y),
      });
    }
  };

  const up = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) drag.current = null;
  };

  const centreZoom = (factor: number) => {
    const box = stage.current?.getBoundingClientRect();
    if (!box) return;
    zoomAt(view.zoom * factor, box.left + box.width / 2, box.top + box.height / 2);
  };

  /**
   * Rendered into `document.body`.
   *
   * A `fixed` element is positioned against the nearest transformed ancestor,
   * and the result cards live inside animated (transformed) wrappers — which is
   * exactly why the viewer used to open half off-screen with a grey band. The
   * portal removes that whole class of bug.
   */
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="fixed inset-0 z-[100] flex h-[100dvh] w-screen flex-col overscroll-contain bg-scene-ink/95"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 p-3">
        <p className="min-w-0 truncate rounded-full bg-card/90 px-3 py-1.5 type-body-sm text-foreground">
          {caption ?? alt}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <ZoomButton label="Zoom out" onClick={() => centreZoom(1 / 1.4)}>
            <Minus className="size-4" aria-hidden="true" />
          </ZoomButton>
          <ZoomButton label="Zoom in" onClick={() => centreZoom(1.4)}>
            <Plus className="size-4" aria-hidden="true" />
          </ZoomButton>
          <ZoomButton label="Reset zoom" onClick={() => setView(RESET)}>
            <RotateCcw className="size-4" aria-hidden="true" />
          </ZoomButton>
          <ZoomButton label="Close" onClick={onClose}>
            <X className="size-4" aria-hidden="true" />
          </ZoomButton>
        </div>
      </div>

      <div
        ref={stage}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClick={() => {
          // Tapping the backdrop closes, but only when nothing was dragged and
          // the image is not zoomed in.
          if (!moved.current && viewRef.current.zoom === 1) onClose();
        }}
        onDoubleClick={(event) =>
          view.zoom > 1 ? setView(RESET) : zoomAt(2.5, event.clientX, event.clientY)
        }
        className={cn(
          "relative min-h-0 flex-1 touch-none overflow-hidden select-none",
          view.zoom > 1 ? "cursor-grab" : "cursor-zoom-in",
        )}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          onClick={(event) => event.stopPropagation()}
          className="absolute inset-0 m-auto max-h-full max-w-full object-contain"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
            transformOrigin: "center center",
          }}
        />
      </div>

      <p className="shrink-0 p-3 text-center type-body-xs">
        <span className="rounded-full bg-card/80 px-3 py-1 text-muted-foreground">
          Pinch, scroll or double-tap to zoom. Drag to pan.
        </span>
      </p>
    </div>,
    document.body,
  );
}


function ZoomButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-10 place-items-center rounded-full bg-card/90 text-foreground transition-colors hover:bg-card"
    >
      {children}
    </button>
  );
}
