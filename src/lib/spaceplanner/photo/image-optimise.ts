/**
 * Image preparation for SpacePlanner.
 *
 * Camera photographs are far larger than the models need. We downscale to a
 * sensible long edge and re-encode before anything leaves the device: faster
 * uploads, faster analysis, and still enough resolution for objects to stay
 * recognisable. EXIF orientation is honoured where the browser supports it.
 */
export interface PreparedImage {
  mimeType: string;
  base64: string;
}

/** Long edge, in pixels. Below this, objects start to lose their identity. */
export const MAX_EDGE_PX = 1280;
export const JPEG_QUALITY = 0.82;

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

/** Scale factor that brings the long edge down to `maxEdge`, never up. */
export function scaleFor(width: number, height: number, maxEdge = MAX_EDGE_PX): number {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest === 0) return 1;
  return maxEdge / longest;
}

/**
 * Blob/object URL → optimised bytes. Falls back to the original encoding when
 * canvas work is unavailable (older browsers, test environments).
 */
export async function prepareImage(
  url: string,
  maxEdge = MAX_EDGE_PX,
  fetchImpl: typeof fetch = fetch,
): Promise<PreparedImage> {
  const response = await fetchImpl(url);
  const blob = await response.blob();
  const original = { mimeType: blob.type || "image/jpeg", base64: await toBase64(blob) };

  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return original;

  try {
    const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
    const scale = scaleFor(bitmap.width, bitmap.height, maxEdge);
    if (scale === 1 && blob.size < 900_000) {
      bitmap.close?.();
      return original;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return original;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const encoded = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!encoded) return original;
    return { mimeType: "image/jpeg", base64: await toBase64(encoded) };
  } catch {
    return original;
  }
}
