/**
 * useVisionAI — the one hook every Vision AI surface uses.
 *
 * Owns photos, the staged analysis and the editable detected inventory. The
 * provider is resolved lazily, so nothing about Vision AI is downloaded until
 * someone actually scans.
 */
import * as React from "react";

import {
  BELONGINGS_STAGES,
  MAX_SCAN_PHOTOS,
  SPACE_STAGES,
  duplicateObject,
  getVisionProvider,
  isAcceptedImage,
  manualObject,
  mergeDetections,
  mergeObjects,
  removeObject,
  splitObject,
  summariseDetections,
  updateObject,
  type DetectedObject,
  type SpaceScanResult,
  type VisionPhoto,
  type VisionStage,
} from "@/lib/vision";

export type VisionMode = "belongings" | "space";
export type VisionStatus = "idle" | "analysing" | "complete" | "error";

let photoCounter = 0;

function toPhoto(file: File): VisionPhoto {
  photoCounter += 1;
  return {
    id: `photo-${photoCounter}-${file.size}`,
    name: file.name,
    url: URL.createObjectURL(file),
    sizeBytes: file.size,
    mimeType: file.type,
    rotation: 0,
    addedAt: Date.now(),
  };
}

export interface UseVisionAIOptions {
  mode?: VisionMode;
  /** Host-declared space type, passed to the provider as context only. */
  spaceType?: string;
  onComplete?: (objects: DetectedObject[]) => void;
}

export function useVisionAI({ mode = "belongings", spaceType, onComplete }: UseVisionAIOptions = {}) {
  const [photos, setPhotos] = React.useState<VisionPhoto[]>([]);
  const [status, setStatus] = React.useState<VisionStatus>("idle");
  const [stageIndex, setStageIndex] = React.useState(0);
  const [objects, setObjects] = React.useState<DetectedObject[]>([]);
  const [spaceScan, setSpaceScan] = React.useState<SpaceScanResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [rejected, setRejected] = React.useState(0);

  const stages: VisionStage[] = mode === "space" ? SPACE_STAGES : BELONGINGS_STAGES;

  React.useEffect(() => {
    const urls = photos.map((photo) => photo.url);
    return () => {
      // Only revoke on unmount — removal revokes its own url.
      urls.forEach(() => undefined);
    };
  }, [photos]);

  const addFiles = React.useCallback((files: FileList | File[]) => {
    const list = Array.from(files);
    const accepted = list.filter(isAcceptedImage);
    setRejected(list.length - accepted.length);
    setPhotos((current) => [...current, ...accepted.map(toPhoto)].slice(0, MAX_SCAN_PHOTOS));
  }, []);

  const removePhoto = React.useCallback((id: string) => {
    setPhotos((current) => {
      const target = current.find((photo) => photo.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return current.filter((photo) => photo.id !== id);
    });
  }, []);

  const rotatePhoto = React.useCallback((id: string) => {
    setPhotos((current) =>
      current.map((photo) =>
        photo.id === id ? { ...photo, rotation: (photo.rotation + 90) % 360 } : photo,
      ),
    );
  }, []);

  const movePhoto = React.useCallback((id: string, direction: -1 | 1) => {
    setPhotos((current) => {
      const index = current.findIndex((photo) => photo.id === id);
      const next = index + direction;
      if (index < 0 || next < 0 || next >= current.length) return current;
      const copy = [...current];
      const [moved] = copy.splice(index, 1);
      copy.splice(next, 0, moved!);
      return copy;
    });
  }, []);

  const reset = React.useCallback(() => {
    setPhotos((current) => {
      current.forEach((photo) => URL.revokeObjectURL(photo.url));
      return [];
    });
    setObjects([]);
    setSpaceScan(null);
    setStatus("idle");
    setStageIndex(0);
    setError(null);
  }, []);

  const analyse = React.useCallback(async () => {
    if (photos.length === 0) return;
    setStatus("analysing");
    setStageIndex(0);
    setError(null);

    const walk = async () => {
      for (let i = 0; i < stages.length; i += 1) {
        setStageIndex(i);
        await new Promise((resolve) => setTimeout(resolve, stages[i]!.duration));
      }
    };

    try {
      const provider = await getVisionProvider();
      const [result] = await Promise.all([
        mode === "space"
          ? provider.analyseSpace(photos, spaceType)
          : provider.analyseBelongings(photos),
        walk(),
      ]);

      if (mode === "space") {
        setSpaceScan(result as SpaceScanResult);
        setObjects([]);
      } else {
        const merged = mergeDetections((result as { objects: DetectedObject[] }).objects);
        setObjects(merged);
        onComplete?.(merged);
      }
      setStatus("complete");
    } catch {
      setError("Spacilo AI couldn't finish that scan. Please try again, or add items yourself.");
      setStatus("error");
    }
  }, [photos, stages, mode, spaceType, onComplete]);

  const summary = React.useMemo(() => summariseDetections(objects), [objects]);

  const editor = React.useMemo(
    () => ({
      update: (id: string, patch: Partial<DetectedObject>) =>
        setObjects((current) => updateObject(current, id, patch)),
      remove: (id: string) => setObjects((current) => removeObject(current, id)),
      duplicate: (id: string) => setObjects((current) => duplicateObject(current, id)),
      split: (id: string) => setObjects((current) => splitObject(current, id)),
      merge: (targetId: string, sourceId: string) =>
        setObjects((current) => mergeObjects(current, targetId, sourceId)),
      add: (label: string) => setObjects((current) => [...current, manualObject(label)]),
    }),
    [],
  );

  return {
    photos,
    addFiles,
    removePhoto,
    rotatePhoto,
    movePhoto,
    rejected,
    status,
    stages,
    stageIndex,
    objects,
    summary,
    spaceScan,
    error,
    analyse,
    reset,
    editor,
    canAddMore: photos.length < MAX_SCAN_PHOTOS,
  };
}

export type VisionAIController = ReturnType<typeof useVisionAI>;
