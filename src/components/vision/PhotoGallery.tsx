/**
 * PhotoGallery — review, reorder, rotate, zoom and remove before analysing.
 */
import * as React from "react";
import { ChevronLeft, ChevronRight, Maximize2, Plus, RotateCw, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { VisionPhoto } from "@/lib/vision";

export function PhotoGallery({
  photos,
  onRemove,
  onRotate,
  onMove,
  onAddMore,
  canAddMore = true,
}: {
  photos: VisionPhoto[];
  onRemove: (id: string) => void;
  onRotate: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onAddMore?: () => void;
  canAddMore?: boolean;
}) {
  const [zoomed, setZoomed] = React.useState<VisionPhoto | null>(null);

  if (photos.length === 0) return null;

  return (
    <section aria-label="Your photos">
      <div className="flex items-center justify-between">
        <h3 className="type-h4">
          {photos.length} photo{photos.length === 1 ? "" : "s"}
        </h3>
        {onAddMore && canAddMore ? (
          <Button type="button" variant="text" size="sm" onClick={onAddMore}>
            <Plus aria-hidden="true" />
            Add more
          </Button>
        ) : null}
      </div>

      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((photo, index) => (
          <li
            key={photo.id}
            className="overflow-hidden rounded-xl border border-border bg-card shadow-card"
          >
            <div className="relative aspect-4/3 overflow-hidden bg-muted">
              <img
                src={photo.url}
                alt={`Uploaded photo ${index + 1}`}
                loading="lazy"
                className="size-full object-cover transition-transform"
                style={{ transform: `rotate(${photo.rotation}deg)` }}
              />
            </div>
            <div className="flex items-center justify-between gap-1 p-1.5">
              <div className="flex">
                <IconButton
                  label="Move earlier"
                  onClick={() => onMove(photo.id, -1)}
                  disabled={index === 0}
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                </IconButton>
                <IconButton
                  label="Move later"
                  onClick={() => onMove(photo.id, 1)}
                  disabled={index === photos.length - 1}
                >
                  <ChevronRight className="size-4" aria-hidden="true" />
                </IconButton>
              </div>
              <div className="flex">
                <IconButton label="Rotate photo" onClick={() => onRotate(photo.id)}>
                  <RotateCw className="size-4" aria-hidden="true" />
                </IconButton>
                <IconButton label="Zoom photo" onClick={() => setZoomed(photo)}>
                  <Maximize2 className="size-4" aria-hidden="true" />
                </IconButton>
                <IconButton label="Delete photo" onClick={() => onRemove(photo.id)}>
                  <Trash2 className="size-4 text-destructive" aria-hidden="true" />
                </IconButton>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {zoomed ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Photo preview"
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/80 p-4"
          onClick={() => setZoomed(null)}
        >
          <img
            src={zoomed.url}
            alt="Zoomed photo"
            decoding="async"
            className="max-h-full max-w-full rounded-xl object-contain"
            style={{ transform: `rotate(${zoomed.rotation}deg)` }}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="absolute right-4 top-4"
            onClick={() => setZoomed(null)}
          >
            <X aria-hidden="true" />
            Close
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted",
        disabled && "opacity-40",
      )}
    >
      {children}
    </button>
  );
}
