/**
 * Local frame-quality signals: brightness, sharpness (blur proxy) and motion.
 */
import { describe, expect, it } from "vitest";

import {
  FrameQualitySampler,
  computeFrameQuality,
  toLumaSample,
} from "@/lib/livescan/frame-quality";

function solid(value: number, width = 8, height = 8) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    pixels[i * 4] = value;
    pixels[i * 4 + 1] = value;
    pixels[i * 4 + 2] = value;
    pixels[i * 4 + 3] = 255;
  }
  return { pixels, width, height };
}

function stripes(width = 8, height = 8) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = x % 2 === 0 ? 0 : 255;
      const offset = (y * width + x) * 4;
      pixels[offset] = value;
      pixels[offset + 1] = value;
      pixels[offset + 2] = value;
      pixels[offset + 3] = 255;
    }
  }
  return { pixels, width, height };
}

describe("frame quality", () => {
  it("reports a dark frame", () => {
    const { pixels, width, height } = solid(10);
    const quality = computeFrameQuality(toLumaSample(pixels, width, height));
    expect(quality.brightness).toBeLessThan(0.1);
  });

  it("reports a bright frame", () => {
    const { pixels, width, height } = solid(250);
    const quality = computeFrameQuality(toLumaSample(pixels, width, height));
    expect(quality.brightness).toBeGreaterThan(0.9);
  });

  it("reports low sharpness for a flat frame", () => {
    const { pixels, width, height } = solid(128);
    const quality = computeFrameQuality(toLumaSample(pixels, width, height));
    expect(quality.sharpness).toBe(0);
  });

  it("reports high sharpness for a detailed frame", () => {
    const { pixels, width, height } = stripes();
    const quality = computeFrameQuality(toLumaSample(pixels, width, height));
    expect(quality.sharpness).toBe(1);
  });

  it("reports no motion on the first frame", () => {
    const { pixels, width, height } = stripes();
    const sampler = new FrameQualitySampler();
    expect(sampler.sample(pixels, width, height).motion).toBe(0);
  });

  it("reports motion when the scene changes", () => {
    const sampler = new FrameQualitySampler();
    const a = solid(20);
    const b = solid(220);
    sampler.sample(a.pixels, a.width, a.height);
    expect(sampler.sample(b.pixels, b.width, b.height).motion).toBeGreaterThan(0.5);
  });

  it("reports no motion for an identical frame", () => {
    const sampler = new FrameQualitySampler();
    const a = solid(120);
    sampler.sample(a.pixels, a.width, a.height);
    expect(sampler.sample(a.pixels, a.width, a.height).motion).toBe(0);
  });

  it("drops its retained buffer on reset", () => {
    const sampler = new FrameQualitySampler();
    const a = solid(20);
    const b = solid(220);
    sampler.sample(a.pixels, a.width, a.height);
    sampler.reset();
    expect(sampler.sample(b.pixels, b.width, b.height).motion).toBe(0);
  });
});
