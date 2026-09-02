/**
 * Guest SpaceFit — client wiring.
 *
 * Holds the guest's temporary, in-browser working state and calls the three
 * guest server functions. No AI code and no credentials exist on this side.
 */
import * as React from "react";
import { useServerFn } from "@tanstack/react-start";

import { analyseGuestSpaceFit, startGuestSpaceFit } from "@/lib/spacefit-guest.functions";
import {
  base64ByteLength,
  isAllowedGuestMime,
  MAX_GUEST_PHOTOS,
  validateGuestUpload,
  type GuestKind,
} from "@/lib/spacefit-guest/config";
import type { GuestItem, GuestSpaceProposal } from "@/lib/spacefit-guest/preview";
import { readGuestRef, storeGuestRef } from "@/lib/spacefit-guest/session-store";

export interface PickedImage {
  mimeType: string;
  base64: string;
  previewUrl: string;
}

/** Reads a File into the base64 payload the server function expects. */
export async function readImageFile(file: File): Promise<PickedImage | null> {
  if (!isAllowedGuestMime(file.type)) return null;
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  const base64 = typeof btoa === "function" ? btoa(binary) : "";
  if (!base64) return null;
  return { mimeType: file.type, base64, previewUrl: URL.createObjectURL(file) };
}

export interface GuestScanState {
  images: PickedImage[];
  addFiles: (files: FileList | File[]) => Promise<void>;
  removeImage: (index: number) => void;
  /** Clears the picked photos so the visitor can capture the space again. */
  clearImages: () => void;
  analysing: boolean;
  error: string | null;
  items: GuestItem[] | null;
  setItems: React.Dispatch<React.SetStateAction<GuestItem[] | null>>;
  proposal: GuestSpaceProposal | null;
  setProposal: React.Dispatch<React.SetStateAction<GuestSpaceProposal | null>>;
  analyse: (spaceType?: string | null) => Promise<void>;
  hasResult: boolean;
}

export function useGuestSpaceFit(kind: GuestKind): GuestScanState {
  const start = useServerFn(startGuestSpaceFit);
  const analyseFn = useServerFn(analyseGuestSpaceFit);

  const [images, setImages] = React.useState<PickedImage[]>([]);
  const [analysing, setAnalysing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<GuestItem[] | null>(null);
  const [proposal, setProposal] = React.useState<GuestSpaceProposal | null>(null);
  const requestIdRef = React.useRef<string | null>(null);

  const addFiles = React.useCallback(async (files: FileList | File[]) => {
    setError(null);
    const list = Array.from(files);
    const read = (await Promise.all(list.map(readImageFile))).filter(
      (image): image is PickedImage => image !== null,
    );
    if (read.length < list.length) {
      setError("Some files weren't supported images and were skipped.");
    }
    setImages((current) => {
      const next = [...current, ...read].slice(0, MAX_GUEST_PHOTOS);
      const validation = validateGuestUpload(
        next.map((image) => ({
          mimeType: image.mimeType,
          byteLength: base64ByteLength(image.base64),
        })),
      );
      if (!validation.ok) {
        setError(validation.message);
        return current;
      }
      return next;
    });
  }, []);

  const removeImage = React.useCallback((index: number) => {
    setImages((current) => current.filter((_, i) => i !== index));
  }, []);

  const clearImages = React.useCallback(() => {
    setImages([]);
  }, []);

  const analyse = React.useCallback(
    async (spaceType: string | null = null) => {
      if (analysing || images.length === 0) return;
      setError(null);
      setAnalysing(true);
      try {
        let ref = readGuestRef();
        if (!ref || ref.kind !== kind) {
          const started = await start({ data: { kind } });
          if (!started.ok) {
            setError(started.message);
            return;
          }
          ref = { token: started.token, kind, expiresAt: started.expiresAt };
          storeGuestRef(ref);
          requestIdRef.current = null;
        }

        // One stable id per attempt: a repeated tap can never double-charge.
        if (!requestIdRef.current) {
          requestIdRef.current =
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        }

        const response = await analyseFn({
          data: {
            token: ref.token,
            kind,
            images: images.map((image) => ({ mimeType: image.mimeType, base64: image.base64 })),
            spaceType,
            clientRequestId: requestIdRef.current,
          },
        });

        if (!response.ok) {
          // A finished-but-failed attempt must never lock the next try.
          requestIdRef.current = null;
          setError(response.message);
          return;
        }
        requestIdRef.current = null;
        if (response.result.kind === "renter") setItems(response.result.items);
        else setProposal(response.result.proposal);
      } catch {
        requestIdRef.current = null;
        setError("We couldn't reach EarnRoom AI. Please try again, or add things manually.");
      } finally {
        setAnalysing(false);
      }
    },
    [analyseFn, analysing, images, kind, start],
  );

  return {
    images,
    addFiles,
    removeImage,
    clearImages,
    analysing,
    error,
    items,
    setItems,
    proposal,
    setProposal,
    analyse,
    hasResult: items !== null || proposal !== null,
  };
}
