/**
 * Local frame-quality signals.
 *
 * Everything here runs in the browser on a tiny downscaled copy of the preview
 * frame. Pixels are read, reduced to three numbers, and thrown away — nothing
 * is stored, and nothing leaves the device.
 */
import type { FrameQuality } from "@/lib/livescan/types";

export interface LumaSample {
  /** Downsampled luminance grid, 0–1. */
  values: number[];
  width: number;
  height: number;
}

/** Reduces RGBA pixels to a small luminance grid. */
export function toLumaSample(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
): LumaSample {
  const values: number[] = new Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4;
    const r = pixels[offset] ?? 0;
    const g = pixels[offset + 1] ?? 0;
    const b = pixels[offset + 2] ?? 0;
    values[i] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }
  return { values, width, height };
}

function meanBrightness(sample: LumaSample): number {
  if (sample.values.length === 0) return 0;
  let total = 0;
  for (const value of sample.values) total += value;
  return total / sample.values.length;
}

/** Normalised mean absolute gradient — a cheap, robust blur proxy. */
function sharpness(sample: LumaSample): number {
  const { values, width, height } = sample;
  if (width < 2 || height < 2) return 0;
  let total = 0;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 1; x < width; x += 1) {
      const index = y * width + x;
      total += Math.abs((values[index] ?? 0) - (values[index - 1] ?? 0));
      count += 1;
    }
  }
  const mean = count === 0 ? 0 : total / count;
  // 0.15 mean gradient is already a crisp indoor frame.
  return Math.min(1, mean / 0.15);
}

function motion(current: LumaSample, previous: LumaSample | null): number {
  if (!previous || previous.values.length !== current.values.length) return 0;
  let total = 0;
  for (let i = 0; i < current.values.length; i += 1) {
    total += Math.abs((current.values[i] ?? 0) - (previous.values[i] ?? 0));
  }
  const mean = total / current.values.length;
  return Math.min(1, mean / 0.1);
}

export function computeFrameQuality(
  current: LumaSample,
  previous: LumaSample | null = null,
): FrameQuality {
  return {
    brightness: meanBrightness(current),
    sharpness: sharpness(current),
    motion: motion(current, previous),
  };
}

/** Keeps one previous frame in memory so motion can be measured. */
export class FrameQualitySampler {
  private previous: LumaSample | null = null;

  sample(pixels: ArrayLike<number>, width: number, height: number): FrameQuality {
    const luma = toLumaSample(pixels, width, height);
    const quality = computeFrameQuality(luma, this.previous);
    this.previous = luma;
    return quality;
  }

  /** Drops the retained buffer — called whenever the scanner closes. */
  reset(): void {
    this.previous = null;
  }
}

export const QUALITY_THRESHOLDS = {
  darkBelow: 0.18,
  brightAbove: 0.92,
  blurryBelow: 0.25,
  movingAbove: 0.35,
} as const;
