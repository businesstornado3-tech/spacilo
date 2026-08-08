/**
 * Shared UI for both guest SpaceFit previews.
 *
 * Deliberately limited: photos are analysed, results are shown, and nothing is
 * ever saved. Every permanent action lives behind account creation.
 */
import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Camera, ImagePlus, Lock, Trash2 } from "lucide-react";

import { Alert } from "@/components/common/Alert";
import { Button } from "@/components/ui/button";
import { LiveScanner } from "@/components/spacefit/live/LiveScanner";
import { HostSpaceCapture } from "@/components/spacefit/live/HostSpaceCapture";
import type { BoundaryMeasurement } from "@/lib/livescan/boundary-scale";
import { SpaceFitAiMark, SpaceFitScanning } from "@/components/trust/SpaceFitAI";
import {
  GUEST_ALLOWED_MIME_TYPES,
  GUEST_PREVIEW_DISCLAIMER,
  GUEST_SESSION_TTL_MINUTES,
  MAX_GUEST_PHOTOS,
} from "@/lib/spacefit-guest/config";
import type { GuestKind } from "@/lib/spacefit-guest/config";
import type { PickedImage } from "@/hooks/useGuestSpaceFit";

export function GuestPhotoPicker({
  images,
  onAdd,
  onRemove,
  disabled,
  mode = "renter",
  onBoundary,
  onManualEntry,
}: {
  images: PickedImage[];
  onAdd: (files: FileList | File[]) => void;
  onRemove: (index: number) => void;
  disabled?: boolean;
  /** Which live experience to offer: "Scan my stuff" or "Scan my space". */
  mode?: GuestKind;
  /** Host only: a boundary the visitor drew and confirmed on the frozen frame. */
  onBoundary?: (measurement: BoundaryMeasurement) => void;
  onManualEntry?: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const cameraRef = React.useRef<HTMLInputElement | null>(null);
  const full = images.length >= MAX_GUEST_PHOTOS;

  return (
    <div>
      {/* Progressive enhancement: the upload path below always remains. */}
      {full ? null : mode === "host" ? (
        <HostSpaceCapture
          className="mb-4"
          onCaptured={(file: File) => onAdd([file])}
          onMeasured={(measurement) => onBoundary?.(measurement)}
          {...(onManualEntry ? { onManualEntry } : {})}
        />
      ) : (
        <LiveScanner
          mode={mode}
          className="mb-4"
          onCapture={(file: File) => onAdd([file])}
        />
      )}


      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || full}
          onClick={() => cameraRef.current?.click()}
        >
          <Camera className="size-4" aria-hidden="true" />
          Take a photo
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || full}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus className="size-4" aria-hidden="true" />
          Choose photos
        </Button>
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept={GUEST_ALLOWED_MIME_TYPES.join(",")}
        capture="environment"
        className="sr-only"
        onChange={(event) => {
          if (event.target.files) onAdd(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={GUEST_ALLOWED_MIME_TYPES.join(",")}
        className="sr-only"
        onChange={(event) => {
          if (event.target.files) onAdd(event.target.files);
          event.target.value = "";
        }}
      />

      {images.length > 0 ? (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((image, index) => (
            <li
              key={image.previewUrl}
              className="relative overflow-hidden rounded-2xl border border-border"
            >
              <img src={image.previewUrl} alt="" loading="lazy" decoding="async" className="aspect-square w-full object-cover" />
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="absolute right-1.5 top-1.5 rounded-full bg-card/90 p-1.5 text-muted-foreground"
                aria-label={`Remove photo ${index + 1}`}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-3 type-body-sm text-muted-foreground">
        Up to {MAX_GUEST_PHOTOS} photos, 8 MB each. Photos are sent only when you tap analyse, are
        never shown publicly, and are deleted as soon as the scan finishes.
      </p>
    </div>
  );
}

export function GuestScanningState({ label }: { label: string }) {
  return (
    <div className="mt-4">
      <SpaceFitScanning label={label} />
    </div>
  );
}

/** The conversion boundary, stated plainly rather than hidden behind a wall. */
export function GuestConversionCta({
  mode,
  headline,
  body,
  withheld,
}: {
  mode: "renter" | "host";
  headline: string;
  body: string;
  withheld: string[];
}) {
  return (
    <section className="mt-6 rounded-3xl border border-signal/25 bg-signal-soft/45 p-5">
      <SpaceFitAiMark size="sm" />
      <h2 className="mt-3 type-h3">{headline}</h2>
      <p className="mt-1.5 type-body text-muted-foreground">{body}</p>

      <ul className="mt-4 grid gap-1.5">
        {withheld.map((line) => (
          <li key={line} className="flex items-start gap-2 type-body-sm text-muted-foreground">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {line}
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link to="/signup" search={{ mode }}>
            Create a free account
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link to="/login">Log in</Link>
        </Button>
      </div>

      <p className="mt-3 type-body-sm text-muted-foreground">
        We&apos;ll keep this scan for {Math.round(GUEST_SESSION_TTL_MINUTES / 60)} hours so you
        don&apos;t have to do it again.
      </p>
    </section>
  );
}

export function GuestDisclaimer() {
  return (
    <Alert tone="info" className="mt-6" title="Estimates, not measurements">
      {GUEST_PREVIEW_DISCLAIMER}
    </Alert>
  );
}
