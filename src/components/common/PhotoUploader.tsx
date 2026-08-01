import * as React from "react";
import { ImagePlus, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface UploadedPhoto {
  id: string;
  url: string;
  alt: string;
}

interface PhotoUploaderProps {
  label?: string;
  hint?: string;
  photos?: UploadedPhoto[];
  maxPhotos?: number;
  onAdd?: (files: File[]) => void;
  onRemove?: (id: string) => void;
  className?: string;
}

/**
 * Presentation-only uploader. Storage/upload wiring is added later.
 * Every photo requires alt text to keep the alt-text architecture intact.
 */
export function PhotoUploader({
  label = "Photos",
  hint = "JPG or PNG, up to 10 photos. Clear, well-lit photos get more bookings.",
  photos = [],
  maxPhotos = 10,
  onAdd,
  onRemove,
  className,
}: PhotoUploaderProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const inputId = React.useId();

  return (
    <div className={cn("space-y-3", className)}>
      <div>
        <p className="type-label" id={`${inputId}-label`}>
          {label}
        </p>
        <p className="mt-1 type-body-sm text-muted-foreground">{hint}</p>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {photos.map((photo) => (
          <div key={photo.id} className="relative aspect-square overflow-hidden rounded-xl border border-border">
            <img src={photo.url} alt={photo.alt} className="size-full object-cover" loading="lazy" />
            <button
              type="button"
              onClick={() => onRemove?.(photo.id)}
              className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-full bg-card/90 text-foreground shadow-card transition-colors hover:bg-card"
            >
              <X className="size-4" aria-hidden="true" />
              <span className="sr-only">Remove photo: {photo.alt}</span>
            </button>
          </div>
        ))}

        {photos.length < maxPhotos ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            aria-labelledby={`${inputId}-label`}
            className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border-strong bg-card text-muted-foreground transition-colors hover:border-primary hover:bg-primary-soft hover:text-primary-soft-foreground"
          >
            <ImagePlus className="size-6" aria-hidden="true" />
            <span className="type-body-sm">Add photo</span>
          </button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(e) => onAdd?.(Array.from(e.target.files ?? []))}
      />

      <Button type="button" variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
        <ImagePlus aria-hidden="true" />
        Upload photos
      </Button>
    </div>
  );
}
