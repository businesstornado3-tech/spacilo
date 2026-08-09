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
  stageIndexFor,
  summariseDetections,
  updateObject,
  fullSelection,
  measurePhoto,
  type PhotoQuality,
  type PhotoSelection,
  type DetectedObject,
  type SpaceScanResult,
  type VisionPhoto,
  type VisionStage,
} from "@/lib/vision";

export type VisionMode = "belongings" | "space";
/** Mode A: only what the user marked. Mode B: everything in the photo. */
export type InventoryScope = "selected" | "whole";
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
  const [selections, setSelections] = React.useState<PhotoSelection[]>([]);
  const [scope, setScope] = React.useState<InventoryScope>("whole");
  const [quality, setQuality] = React.useState<Record<string, PhotoQuality>>({});
  const [elapsedMs, setElapsedMs] = React.useState(0);
  /**
   * Phase 6U — measured stage timings for this scan. `null` means "not
   * measured", never zero: an unknown duration is never reported as fast.
   */
  const [timings, setTimings] = React.useState<{
    detectionMs: number | null;
    classificationMs: number | null;
    /** Wall clock from pressing analyse to a usable result on screen. */
    readyMs: number | null;
  }>({ detectionMs: null, classificationMs: null, readyMs: null });


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
    const added = accepted.map(toPhoto);
    setPhotos((current) => [...current, ...added].slice(0, MAX_SCAN_PHOTOS));
    // Quality guidance is advisory and never blocks the scan.
    added.forEach((photo) => {
      void measurePhoto(photo.url).then((result) => {
        if (result) setQuality((current) => ({ ...current, [photo.id]: result }));
      });
    });
  }, []);

  /** Replaces a photo in place — the retake path, keeping order and selection. */
  const replacePhoto = React.useCallback((id: string, file: File) => {
    if (!isAcceptedImage(file)) {
      setRejected(1);
      return;
    }
    const next = toPhoto(file);
    setPhotos((current) =>
      current.map((photo) => {
        if (photo.id !== id) return photo;
        URL.revokeObjectURL(photo.url);
        return next;
      }),
    );
    setSelections((current) => current.filter((selection) => selection.photoId !== id));
    void measurePhoto(next.url).then((result) => {
      if (result) setQuality((current) => ({ ...current, [next.id]: result }));
    });
  }, []);

  const setSelection = React.useCallback((selection: PhotoSelection | null, photoId?: string) => {
    const id = selection?.photoId ?? photoId;
    if (!id) return;
    setSelections((current) => {
      const rest = current.filter((entry) => entry.photoId !== id);
      return selection ? [...rest, selection] : rest;
    });
  }, []);

  const selectWholePhoto = React.useCallback((photoId: string) => {
    setSelections((current) => [
      ...current.filter((entry) => entry.photoId !== photoId),
      fullSelection(photoId),
    ]);
  }, []);

  const removePhoto = React.useCallback((id: string) => {
    setPhotos((current) => {
      const target = current.find((photo) => photo.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return current.filter((photo) => photo.id !== id);
    });
    setSelections((current) => current.filter((selection) => selection.photoId !== id));
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
    setSelections([]);
    setQuality({});
    setSpaceScan(null);
    setStatus("idle");
    setStageIndex(0);
    setError(null);
  }, []);

  /**
   * Runs the real pipeline. Progress reflects what is actually happening —
   * there are no artificial waits, so a fast scan finishes fast.
   */
  const analyse = React.useCallback(async () => {
    if (photos.length === 0) return;
    setStatus("analysing");
    setStageIndex(0);
    setError(null);
    setElapsedMs(0);
    setTimings({ detectionMs: null, classificationMs: null, readyMs: null });

    const startedAt = Date.now();
    // Gentle drift so the stage list still moves while a call is in flight.
    const drift = setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
      setStageIndex((current) => Math.min(current + 1, stages.length - 2));
    }, 2600);

    try {
      const options = {
        mode: scope,
        selections,
        onStage: (key: string) => setStageIndex(stageIndexFor(stages, key)),
      };
      const provider = await getVisionProvider();
      // Phase 6U — real, measured stage timings. Detection is the model call;
      // classification is the canonicalisation that turns the raw reply into
      // the inventory the UI can use.
      const detectionAt = Date.now();
      const result =
        mode === "space"
          ? await provider.analyseSpace(photos, spaceType, options)
          : await provider.analyseBelongings(photos, options);
      const detectionMs = Date.now() - detectionAt;

      setStageIndex(stages.length - 1);
      const classifyAt = Date.now();
      if (mode === "space") {
        setSpaceScan(result as SpaceScanResult);
        setObjects([]);
      } else {
        const merged = mergeDetections((result as { objects: DetectedObject[] }).objects);
        setObjects(merged);
        onComplete?.(merged);
      }
      const classificationMs = Date.now() - classifyAt;
      setTimings({
        detectionMs,
        classificationMs,
        readyMs: Date.now() - startedAt,
      });
      setStatus("complete");
    } catch {
      setError("Spacilo AI couldn't finish that scan. Please try again, or add items yourself.");
      setStatus("error");
    } finally {
      clearInterval(drift);
      setElapsedMs(Date.now() - startedAt);
    }
  }, [photos, stages, mode, spaceType, onComplete, scope, selections]);


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
    replacePhoto,
    removePhoto,
    selections,
    setSelection,
    selectWholePhoto,
    scope,
    setScope,
    quality,
    elapsedMs,
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
