/**
 * PhotoGallery — review, reorder, rotate, zoom and remove before analysing.
 */
import * as React from "react";
import {
  AlertTriangle,
  Camera,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Plus,
  RotateCw,
  Scissors,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PhotoQuality, VisionPhoto } from "@/lib/vision";

export function PhotoGallery({
  photos,
  onRemove,
  onRotate,
  onMove,
  onAddMore,
  onReplace,
  onSelectRegion,
  onUseWholePhoto,
  selectedPhotoIds,
  quality,
  canAddMore = true,
}: {
  photos: VisionPhoto[];
  onRemove: (id: string) => void;
  onRotate: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onAddMore?: () => void;
  /** Retake — swaps a photo in place, keeping its position in the list. */
  onReplace?: (id: string, file: File) => void;
  /** Opens the region selector for this photo. */
  onSelectRegion?: (id: string) => void;
  /** Clears any drawn area so the whole photo is analysed again. */
  onUseWholePhoto?: (id: string) => void;
  /** Photos that currently have a drawn area. */
  selectedPhotoIds?: string[];
  /** Advisory quality findings, keyed by photo id. */
  quality?: Record<string, PhotoQuality>;
  canAddMore?: boolean;
}) {
  const [zoomed, setZoomed] = React.useState<VisionPhoto | null>(null);
  const retakeRef = React.useRef<HTMLInputElement>(null);
  const replaceRef = React.useRef<HTMLInputElement>(null);
  const retakeFor = React.useRef<string | null>(null);

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
            {selectedPhotoIds?.includes(photo.id) ? (
              <p className="px-2 pt-2 type-body-xs text-muted-foreground">Area selected</p>
            ) : null}
            {quality?.[photo.id]?.advice.length ? (
              <p className="flex gap-1.5 px-2 pt-2 type-body-xs text-warning">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {quality[photo.id]!.advice[0]}
              </p>
            ) : null}
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
                {onSelectRegion ? (
                  <IconButton label="Select area" onClick={() => onSelectRegion(photo.id)}>
                    <Scissors className="size-4" aria-hidden="true" />
                  </IconButton>
                ) : null}
                {onUseWholePhoto ? (
                  <IconButton
                    label="Use entire photo"
                    onClick={() => onUseWholePhoto(photo.id)}
                    disabled={selectedPhotoIds ? !selectedPhotoIds.includes(photo.id) : false}
                  >
                    <Expand className="size-4" aria-hidden="true" />
                  </IconButton>
                ) : null}
                {onReplace ? (
                  <>
                    <IconButton
                      label="Retake photo"
                      onClick={() => {
                        retakeFor.current = photo.id;
                        retakeRef.current?.click();
                      }}
                    >
                      <Camera className="size-4" aria-hidden="true" />
                    </IconButton>
                    <IconButton
                      label="Replace photo"
                      onClick={() => {
                        retakeFor.current = photo.id;
                        replaceRef.current?.click();
                      }}
                    >
                      <Upload className="size-4" aria-hidden="true" />
                    </IconButton>
                  </>
                ) : null}
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

      {onReplace ? (
        <>
          <input
            ref={retakeRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              const id = retakeFor.current;
              if (file && id) onReplace(id, file);
              retakeFor.current = null;
              event.target.value = "";
            }}
          />
          <input
            ref={replaceRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              const id = retakeFor.current;
              if (file && id) onReplace(id, file);
              retakeFor.current = null;
              event.target.value = "";
            }}
          />
        </>
      ) : null}

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
