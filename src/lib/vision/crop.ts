/**
 * Selection-aware image preparation.
 *
 * When someone has drawn round what they want to store, the bytes we send are
 * cropped to that region and everything outside it is dimmed. The model cannot
 * report an object it was never shown, which is the strongest possible defence
 * against inventory the user never asked for.
 *
 * Lasso and ellipse selections are masked, not just cropped, so surrounding
 * clutter inside the bounding box is suppressed too.
 */
import { prepareImage, scaleFor, type PreparedImage } from "@/lib/spaceplanner/photo/image-optimise";

import {
  boundingBox,
  isFullPhoto,
  padBox,
  type PhotoSelection,
} from "./selection";

/** Context kept around a selection so the model can still judge scale. */
export const SELECTION_PADDING = 0.04;
/** Crops smaller than this are upscaled towards it to stay recognisable. */
export const MIN_CROP_EDGE_PX = 640;
export const MAX_CROP_EDGE_PX = 1280;
/** How much of the photo outside a masked selection remains visible. */
export const OUTSIDE_ALPHA = 0.12;

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_failed"));
    reader.onload = () => {
      const value = String(reader.result ?? "");
      resolve(value.slice(value.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Photo + selection → the bytes the model should see.
 *
 * Falls back to the whole prepared photo whenever canvas work is unavailable,
 * so tests and older browsers still function (accuracy degrades, nothing
 * breaks).
 */
export async function prepareSelection(
  url: string,
  selection: PhotoSelection | null,
  fetchImpl: typeof fetch = fetch,
): Promise<PreparedImage> {
  if (!selection || isFullPhoto(selection)) return prepareImage(url, MAX_CROP_EDGE_PX, fetchImpl);
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    return prepareImage(url, MAX_CROP_EDGE_PX, fetchImpl);
  }

  try {
    const blob = await (await fetchImpl(url)).blob();
    const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
    const box = padBox(boundingBox(selection), SELECTION_PADDING);

    const sx = Math.round(box.x * bitmap.width);
    const sy = Math.round(box.y * bitmap.height);
    const sw = Math.max(1, Math.round(box.width * bitmap.width));
    const sh = Math.max(1, Math.round(box.height * bitmap.height));

    // Keep small crops legible, but never blow them up beyond the source.
    const longest = Math.max(sw, sh);
    const upscale = longest < MIN_CROP_EDGE_PX ? Math.min(2, MIN_CROP_EDGE_PX / longest) : 1;
    const downscale = scaleFor(sw * upscale, sh * upscale, MAX_CROP_EDGE_PX);
    const scale = upscale * downscale;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sw * scale));
    canvas.height = Math.max(1, Math.round(sh * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close?.();
      return prepareImage(url, MAX_CROP_EDGE_PX, fetchImpl);
    }

    context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

    if (selection.shape !== "rect" && selection.shape !== "square" && selection.points.length > 2) {
      // Dim everything outside the drawn outline rather than deleting it, so
      // the model still sees context but knows what it was asked about.
      context.save();
      context.beginPath();
      selection.points.forEach((point, index) => {
        const x = ((point.x - box.x) / box.width) * canvas.width;
        const y = ((point.y - box.y) / box.height) * canvas.height;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.closePath();
      context.globalCompositeOperation = "destination-out";
      context.globalAlpha = 1 - OUTSIDE_ALPHA;
      context.rect(canvas.width, 0, -canvas.width, canvas.height);
      context.fill("evenodd");
      context.restore();

      // Flatten onto white so the transparency does not confuse the encoder.
      const flat = document.createElement("canvas");
      flat.width = canvas.width;
      flat.height = canvas.height;
      const flatContext = flat.getContext("2d");
      if (flatContext) {
        flatContext.fillStyle = "#ffffff";
        flatContext.fillRect(0, 0, flat.width, flat.height);
        flatContext.drawImage(canvas, 0, 0);
        const encoded = await new Promise<Blob | null>((resolve) =>
          flat.toBlob(resolve, "image/jpeg", 0.84),
        );
        bitmap.close?.();
        if (encoded) return { mimeType: "image/jpeg", base64: await toBase64(encoded) };
      }
    }

    const encoded = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.84),
    );
    bitmap.close?.();
    if (!encoded) return prepareImage(url, MAX_CROP_EDGE_PX, fetchImpl);
    return { mimeType: "image/jpeg", base64: await toBase64(encoded) };
  } catch {
    return prepareImage(url, MAX_CROP_EDGE_PX, fetchImpl);
  }
}
