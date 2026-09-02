/**
 * Photo quality checks.
 *
 * A bad photograph is the single biggest cause of a bad estimate, and it is
 * far kinder to say so before the scan than to explain it afterwards. These
 * checks describe what we can see; they never block the user.
 */

export interface PhotoStats {
  widthPx: number;
  heightPx: number;
  /** 0–1 average luminance. */
  meanLuminance: number;
  /** 0–1 rough measure of detail; low values suggest blur or a flat wall. */
  detail: number;
}

export type PhotoIssue = "too_small" | "too_dark" | "too_bright" | "low_detail";

export interface PhotoQuality {
  issues: PhotoIssue[];
  /** 0–1. Presented as guidance, never as a gate. */
  score: number;
  advice: string[];
}

export const QUALITY_ADVICE: Record<PhotoIssue, string> = {
  too_small: "This photo is quite low resolution — a larger photo helps EarnRoom AI see detail.",
  too_dark: "This photo looks dark. More light will improve the estimate.",
  too_bright: "This photo looks washed out. Try again without strong backlight.",
  low_detail: "This photo looks blurry or very plain. Hold steady and fill the frame.",
};

export function assessPhotoQuality(stats: PhotoStats): PhotoQuality {
  const issues: PhotoIssue[] = [];
  if (Math.min(stats.widthPx, stats.heightPx) < 480) issues.push("too_small");
  if (stats.meanLuminance < 0.18) issues.push("too_dark");
  if (stats.meanLuminance > 0.93) issues.push("too_bright");
  if (stats.detail < 0.05) issues.push("low_detail");

  const score = Math.max(0, Math.min(1, 1 - issues.length * 0.25));
  return { issues, score, advice: issues.map((issue) => QUALITY_ADVICE[issue]) };
}

/**
 * Measures a photo in the browser. Returns null where canvas is unavailable —
 * quality guidance is a nicety, never a requirement.
 */
export async function measurePhoto(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PhotoQuality | null> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return null;
  try {
    const blob = await (await fetchImpl(url)).blob();
    const bitmap = await createImageBitmap(blob);
    const sample = 64;
    const canvas = document.createElement("canvas");
    canvas.width = sample;
    canvas.height = sample;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      bitmap.close?.();
      return null;
    }
    context.drawImage(bitmap, 0, 0, sample, sample);
    const { data } = context.getImageData(0, 0, sample, sample);

    let sum = 0;
    const lum: number[] = [];
    for (let i = 0; i < data.length; i += 4) {
      const value =
        (0.2126 * (data[i] ?? 0) + 0.7152 * (data[i + 1] ?? 0) + 0.0722 * (data[i + 2] ?? 0)) / 255;
      lum.push(value);
      sum += value;
    }
    const mean = sum / (lum.length || 1);
    const variance =
      lum.reduce((total, value) => total + (value - mean) ** 2, 0) / (lum.length || 1);

    const quality = assessPhotoQuality({
      widthPx: bitmap.width,
      heightPx: bitmap.height,
      meanLuminance: mean,
      detail: Math.sqrt(variance),
    });
    bitmap.close?.();
    return quality;
  } catch {
    return null;
  }
}
