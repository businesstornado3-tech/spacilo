import * as React from "react";
import { ImagePlus, Star, Trash2, ArrowLeft, ArrowRight, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/overlay/toast";
import {
  deleteSpacePhoto,
  listSpacePhotos,
  reorderPhotos,
  setCoverPhoto,
  signedPhotoUrls,
  uploadSpacePhoto,
  validateImage,
  type SpacePhoto,
} from "@/lib/spaces-api";

const MAX_PHOTOS = 10;

export function PhotoManager({
  spaceId,
  photos,
  onPhotosChange,
}: {
  spaceId: string;
  photos: SpacePhoto[];
  onPhotosChange: (photos: SpacePhoto[]) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [urls, setUrls] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    const missing = photos.map((p) => p.storage_path).filter((p) => !urls[p]);
    if (missing.length === 0) return;
    void signedPhotoUrls(missing).then((map) => {
      if (active) setUrls((prev) => ({ ...prev, ...map }));
    });
    return () => {
      active = false;
    };
  }, [photos, urls]);

  const refresh = React.useCallback(async () => {
    onPhotosChange(await listSpacePhotos(spaceId));
  }, [spaceId, onPhotosChange]);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).slice(0, MAX_PHOTOS - photos.length);
    setBusy(true);
    try {
      let order = photos.length;
      for (const file of files) {
        const problem = validateImage(file);
        if (problem) {
          toast.error("Photo not added", problem);
          continue;
        }
        await uploadSpacePhoto(spaceId, file, order, order === 0 && photos.length === 0);
        order += 1;
      }
      await refresh();
    } catch (error) {
      toast.error("Upload failed", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(photo: SpacePhoto) {
    setBusy(true);
    try {
      await deleteSpacePhoto(photo);
      const rest = photos.filter((p) => p.id !== photo.id);
      if (photo.is_cover && rest[0]) await setCoverPhoto(spaceId, rest[0].id);
      await refresh();
    } catch {
      toast.error("Couldn't remove that photo");
    } finally {
      setBusy(false);
    }
  }

  async function makeCover(photo: SpacePhoto) {
    setBusy(true);
    try {
      await setCoverPhoto(spaceId, photo.id);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const next = [...photos];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const a = next[index];
    const b = next[target];
    if (!a || !b) return;
    next[index] = b;
    next[target] = a;
    onPhotosChange(next);
    setBusy(true);
    try {
      await reorderPhotos(next);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((photo, index) => (
          <figure
            key={photo.id}
            className="relative overflow-hidden rounded-2xl border border-border bg-muted"
          >
            <div className="aspect-4/3">
              {urls[photo.storage_path] ? (
                <img
                  src={urls[photo.storage_path]}
                  alt={photo.alt ?? "Photo of the storage space"}
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover"
                />
              ) : (
                <div className="grid size-full place-items-center">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
                </div>
              )}
            </div>

            {photo.is_cover ? (
              <span className="absolute left-2 top-2 rounded-full bg-primary px-2.5 py-1 type-badge text-primary-foreground">
                Cover
              </span>
            ) : null}

            <figcaption className="flex items-center justify-between gap-1 border-t border-border bg-card p-1.5">
              <div className="flex">
                <IconButton label="Move earlier" onClick={() => move(index, -1)} disabled={busy || index === 0}>
                  <ArrowLeft className="size-4" />
                </IconButton>
                <IconButton
                  label="Move later"
                  onClick={() => move(index, 1)}
                  disabled={busy || index === photos.length - 1}
                >
                  <ArrowRight className="size-4" />
                </IconButton>
              </div>
              <div className="flex">
                <IconButton
                  label="Make cover photo"
                  onClick={() => makeCover(photo)}
                  disabled={busy || photo.is_cover}
                >
                  <Star className={cn("size-4", photo.is_cover && "fill-current")} />
                </IconButton>
                <IconButton label="Delete photo" onClick={() => remove(photo)} disabled={busy}>
                  <Trash2 className="size-4 text-destructive" />
                </IconButton>
              </div>
            </figcaption>
          </figure>
        ))}

        {photos.length < MAX_PHOTOS ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex aspect-4/3 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong bg-card type-body-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {busy ? (
              <Loader2 className="size-6 animate-spin" aria-hidden="true" />
            ) : (
              <ImagePlus className="size-6" aria-hidden="true" />
            )}
            Add photos
          </button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        capture={undefined}
        className="sr-only"
        onChange={(event) => void handleFiles(event.target.files)}
      />

      <p className="type-body-sm text-muted-foreground">
        {photos.length} of {MAX_PHOTOS} photos added. We recommend at least 3, ideally 5–8.
      </p>

      <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()} disabled={busy}>
        Take or upload a photo
      </Button>
    </div>
  );
}

function IconButton({
  label,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      {...props}
    >
      {children}
    </button>
  );
}
