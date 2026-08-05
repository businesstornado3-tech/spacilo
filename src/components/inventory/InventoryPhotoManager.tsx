import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, ImagePlus, X, ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { LiveScanner } from "@/components/spacefit/live/LiveScanner";
import { Badge } from "@/components/ui/badge";
import {
  deleteInventoryPhoto,
  reorderInventoryPhotos,
  signedInventoryPhotoUrls,
  uploadInventoryPhoto,
} from "@/lib/inventory-api";
import { inventoryKeys } from "@/hooks/useInventory";
import type { InventoryPhoto } from "@/lib/inventory-model";

/**
 * Real uploads into a private bucket. No detection, no analysis, no fake
 * scanning — photos are stored with analysis_status "uploaded" ready for the
 * SpaceFit AI build.
 */
export function InventoryPhotoManager({
  inventoryId,
  photos,
}: {
  inventoryId: string;
  photos: InventoryPhoto[];
}) {
  const qc = useQueryClient();
  const [urls, setUrls] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const cameraRef = React.useRef<HTMLInputElement>(null);

  const paths = photos.map((photo) => photo.storage_path).join("|");
  React.useEffect(() => {
    let active = true;
    const list = paths ? paths.split("|") : [];
    if (list.length === 0) {
      setUrls({});
      return;
    }
    void signedInventoryPhotoUrls(list).then((map) => {
      if (active) setUrls(map);
    });
    return () => {
      active = false;
    };
  }, [paths]);

  const refresh = () => qc.invalidateQueries({ queryKey: inventoryKeys.photos(inventoryId) });

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setBusy(true);
    let uploaded = 0;
    for (const [index, file] of files.entries()) {
      try {
        await uploadInventoryPhoto(inventoryId, file, photos.length + index);
        uploaded += 1;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "That photo couldn't be uploaded.");
      }
    }
    await refresh();
    setBusy(false);
    if (uploaded > 0) toast.success(`${uploaded} ${uploaded === 1 ? "photo" : "photos"} uploaded.`);
  };

  const handleDelete = async (photo: InventoryPhoto) => {
    try {
      await deleteInventoryPhoto(photo);
      await refresh();
    } catch {
      toast.error("We couldn't remove that photo.");
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= photos.length) return;
    const next = [...photos];
    const a = next[index]!;
    const b = next[target]!;
    next[index] = b;
    next[target] = a;
    await reorderInventoryPhotos(next);
    await refresh();
  };

  return (
    <div className="space-y-4">
      {/* Live Scan sits in FRONT of this existing upload pipeline. */}
      <LiveScanner mode="renter" onCapture={(file) => handleFiles([file])} />

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => cameraRef.current?.click()} disabled={busy}>
          <Camera aria-hidden="true" />
          Take photo
        </Button>
        <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
          <ImagePlus aria-hidden="true" />
          Upload from device
        </Button>
        {busy ? (
          <span className="flex items-center gap-2 type-body-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Uploading…
          </span>
        ) : null}
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          void handleFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(e) => {
          void handleFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />

      {photos.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo, index) => (
            <li
              key={photo.id}
              className="relative overflow-hidden rounded-2xl border border-border bg-secondary"
            >
              <div className="aspect-square">
                {urls[photo.storage_path] ? (
                  <img
                    src={urls[photo.storage_path]}
                    alt={`Inventory photo ${index + 1}`}
                    className="size-full object-cover"
                    loading="lazy"
                  />
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => void handleDelete(photo)}
                className="absolute right-1.5 top-1.5 grid size-9 place-items-center rounded-full bg-card/90 shadow-card transition-colors hover:bg-card"
              >
                <X className="size-4" aria-hidden="true" />
                <span className="sr-only">Delete photo {index + 1}</span>
              </button>
              <div className="absolute bottom-1.5 left-1.5 flex gap-1">
                <button
                  type="button"
                  onClick={() => void move(index, -1)}
                  disabled={index === 0}
                  className="grid size-8 place-items-center rounded-full bg-card/90 shadow-card disabled:opacity-40"
                >
                  <ArrowLeft className="size-3.5" aria-hidden="true" />
                  <span className="sr-only">Move photo {index + 1} earlier</span>
                </button>
                <button
                  type="button"
                  onClick={() => void move(index, 1)}
                  disabled={index === photos.length - 1}
                  className="grid size-8 place-items-center rounded-full bg-card/90 shadow-card disabled:opacity-40"
                >
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                  <span className="sr-only">Move photo {index + 1} later</span>
                </button>
              </div>
              <Badge variant="neutral" size="sm" className="absolute bottom-1.5 right-1.5">
                Uploaded
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
