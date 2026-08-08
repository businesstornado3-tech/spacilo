/**
 * ScanUploader — one uploader for every Vision AI surface.
 *
 * Camera on mobile, camera or file picker on desktop, drag and drop anywhere.
 * Photos are held in the browser for this phase; nothing is uploaded until a
 * real provider is registered.
 */
import * as React from "react";
import { Camera, ImagePlus, UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CoachMark } from "@/components/onboarding/CoachMark";
import { track } from "@/lib/analytics/tracker";
import { cn } from "@/lib/utils";
import { ACCEPT_ATTRIBUTE, MAX_SCAN_PHOTOS } from "@/lib/vision";

export function ScanUploader({
  onFiles,
  disabled = false,
  rejected = 0,
  title = "Show Spacilo AI your belongings",
  hint = "Photograph each room or corner. More angles, better estimates.",
  className,
}: {
  onFiles: (files: FileList | File[]) => void;
  disabled?: boolean;
  rejected?: number;
  title?: string;
  hint?: string;
  className?: string;
}) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const announced = React.useRef(false);

  /** Passes files straight through; records the milestone once per mount. */
  const accept = (files: FileList | File[], source: "drop" | "browse" | "camera") => {
    if (!announced.current) {
      announced.current = true;
      track("vision_upload_started", { props: { source } });
    }
    onFiles(files);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    if (event.dataTransfer.files?.length) accept(event.dataTransfer.files, "drop");
  };

  return (
    <div className={className}>
      <CoachMark id="vision_upload" className="mb-3" />
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "rounded-2xl border-2 border-dashed p-5 text-center transition-colors sm:p-7",
          dragging ? "border-primary bg-primary-soft/40" : "border-border bg-card",
          disabled && "opacity-60",
        )}
      >
        <UploadCloud className="mx-auto size-8 text-primary" aria-hidden="true" />
        <h3 className="mt-2 type-h4">{title}</h3>
        <p className="mx-auto mt-1 max-w-sm type-body-sm text-muted-foreground">{hint}</p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button type="button" onClick={() => cameraRef.current?.click()} disabled={disabled}>
            <Camera aria-hidden="true" />
            Take photos
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={disabled}
          >
            <ImagePlus aria-hidden="true" />
            Browse files
          </Button>
        </div>

        <p className="mt-3 type-body-xs text-muted-foreground">
          JPG, PNG, WEBP or HEIC · up to {MAX_SCAN_PHOTOS} photos · drag and drop supported
        </p>
        {rejected > 0 ? (
          <p className="mt-1 type-body-xs text-warning" role="status">
            {rejected} file{rejected === 1 ? " was" : "s were"} skipped — images only.
          </p>
        ) : null}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        multiple
        className="sr-only"
        aria-label="Browse photos"
        onChange={(event) => {
          if (event.target.files?.length) accept(event.target.files, "browse");
          event.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="sr-only"
        aria-label="Take a photo"
        onChange={(event) => {
          if (event.target.files?.length) accept(event.target.files, "camera");
          event.target.value = "";
        }}
      />
    </div>
  );
}
