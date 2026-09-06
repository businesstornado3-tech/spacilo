/**
 * Free animated renderer — runs in the founder's own browser.
 *
 * Frames are drawn on a canvas and encoded to MP4 with the browser's built-in
 * video encoder. There is no video API, no GPU rental and no per-video charge:
 * the only cost is the founder's own machine for the few seconds it runs.
 *
 * Browser-only module. Nothing here is imported during server rendering.
 */
import { ArrayBufferTarget, Muxer } from "mp4-muxer";

import { element } from "./library";
import type { AnimatedPlan, AnimatedScene, Motion, Paint, Shape } from "./types";

/* ------------------------------------------------------------------ paints */

const PALETTE: Record<Paint, string> = {
  ink: "#1d2733",
  inkSoft: "#5b6875",
  primary: "#128a68",
  primarySoft: "#cdeadf",
  canvas: "#fbfcfb",
  surface: "#eef3f1",
  line: "#d8e0dd",
  warning: "#d8963c",
  success: "#189661",
  white: "#ffffff",
};

const FONT_DISPLAY = '700 1px Sora, "Segoe UI", system-ui, sans-serif';
const FONT_BODY = '600 1px Manrope, "Segoe UI", system-ui, sans-serif';

/* -------------------------------------------------------------- capability */

export type RenderSupport = { supported: boolean; reason: string };

/** Says plainly whether this browser can make the video. Never guesses. */
export function animationSupport(): RenderSupport {
  if (typeof window === "undefined")
    return { supported: false, reason: "Not running in a browser." };
  if (typeof VideoEncoder === "undefined") {
    return {
      supported: false,
      reason:
        "This browser cannot record video on its own. Chrome or Edge on a computer can — Safari and Firefox cannot yet.",
    };
  }
  return { supported: true, reason: "This browser can make the video locally, at no cost." };
}

/* ------------------------------------------------------------------ easing */

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t), 3);
const easeBack = (t: number) => {
  const x = clamp(t);
  return 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2);
};

type Entry = { opacity: number; dx: number; dy: number; scale: number };

function entry(motion: Motion, progress: number): Entry {
  const t = easeOut(progress);
  switch (motion) {
    case "none":
      return { opacity: 1, dx: 0, dy: 0, scale: 1 };
    case "slide-left":
      return { opacity: t, dx: (1 - t) * -0.22, dy: 0, scale: 1 };
    case "slide-right":
      return { opacity: t, dx: (1 - t) * 0.22, dy: 0, scale: 1 };
    case "slide-up":
    case "rise":
      return { opacity: t, dx: 0, dy: (1 - t) * 0.14, scale: 1 };
    case "zoom":
    case "map-zoom":
      return { opacity: t, dx: 0, dy: 0, scale: 0.82 + 0.18 * t };
    case "pop":
      return { opacity: clamp(progress * 2), dx: 0, dy: 0, scale: easeBack(progress) };
    case "bounce":
      return { opacity: t, dx: 0, dy: (1 - easeBack(progress)) * 0.1, scale: 1 };
    case "reveal":
      return { opacity: t, dx: 0, dy: (1 - t) * 0.06, scale: 0.98 + 0.02 * t };
    case "fade":
    default:
      return { opacity: t, dx: 0, dy: 0, scale: 1 };
  }
}

/* ----------------------------------------------------------------- drawing */

function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  origin: { x: number; y: number; size: number },
) {
  const px = (v: number) => origin.x + v * origin.size;
  const py = (v: number) => origin.y + v * origin.size;
  ctx.beginPath();
  if (shape.kind === "rect") {
    const radius = (shape.radius ?? 0) * origin.size;
    const x = px(shape.x);
    const y = py(shape.y);
    const w = shape.w * origin.size;
    const h = shape.h * origin.size;
    if (radius > 0 && typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, radius);
    else ctx.rect(x, y, w, h);
  } else if (shape.kind === "circle") {
    ctx.arc(px(shape.x), py(shape.y), shape.r * origin.size, 0, Math.PI * 2);
  } else {
    shape.points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(px(point.x), py(point.y));
      else ctx.lineTo(px(point.x), py(point.y));
    });
    if (shape.closed) ctx.closePath();
  }
  if (shape.fill) {
    ctx.fillStyle = PALETTE[shape.fill];
    ctx.fill();
  }
  if (shape.stroke) {
    ctx.strokeStyle = PALETTE[shape.stroke];
    ctx.lineWidth = Math.max(1, (shape.lineWidth ?? 0.02) * origin.size);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  plan: AnimatedPlan,
  scene: AnimatedScene,
  elapsed: number,
) {
  const { width, height } = plan;
  ctx.fillStyle = PALETTE[scene.background];
  ctx.fillRect(0, 0, width, height);

  const brandDark = scene.background === "primary";

  for (const item of scene.items) {
    const progress = clamp((elapsed - item.delay) / 0.6);
    if (progress <= 0) continue;
    const motion = entry(item.motion, progress);
    const size = item.size * width * motion.scale;
    const originX = (item.x + motion.dx) * width - size / 2;
    const originY = (item.y + motion.dy) * height - size / 2;
    ctx.save();
    ctx.globalAlpha = motion.opacity;
    for (const shape of element(item.element).shapes) {
      drawShape(ctx, shape, { x: originX, y: originY, size });
    }
    ctx.restore();
  }

  // Caption block, always in the lower safe area so platform chrome never hides it.
  const captionMotion = entry(scene.caption.motion, clamp(elapsed / 0.55));
  const captionSize = Math.round(width * (scene.caption.emphasis === "hook" ? 0.075 : 0.058));
  ctx.save();
  ctx.globalAlpha = captionMotion.opacity;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = FONT_DISPLAY.replace("1px", `${captionSize}px`);
  ctx.fillStyle = brandDark ? PALETTE.white : PALETTE.ink;
  const lines = wrap(ctx, scene.caption.text, width * 0.84);
  const baseY =
    height * (scene.caption.emphasis === "brand" ? 0.46 : 0.76) + captionMotion.dy * height;
  lines.forEach((line, index) => {
    ctx.fillText(line, width / 2, baseY + index * captionSize * 1.25);
  });

  if (scene.subCaption) {
    const subMotion = entry(scene.subCaption.motion, clamp((elapsed - 0.4) / 0.6));
    ctx.globalAlpha = subMotion.opacity;
    const subSize = Math.round(width * 0.045);
    ctx.font = FONT_BODY.replace("1px", `${subSize}px`);
    ctx.fillStyle = brandDark ? PALETTE.primarySoft : PALETTE.primary;
    const subY = baseY + lines.length * captionSize * 1.25 + subSize * 0.9;
    wrap(ctx, scene.subCaption.text, width * 0.8).forEach((line, index) => {
      ctx.fillText(line, width / 2, subY + index * subSize * 1.3);
    });
  }
  ctx.restore();

  // Persistent wordmark, only where the platform allows one.
  if (plan.branding.showWatermark && !brandDark) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    const markSize = Math.round(width * 0.036);
    ctx.font = FONT_DISPLAY.replace("1px", `${markSize}px`);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = PALETTE.primary;
    ctx.fillText("EarnRoom", width * 0.06, height * 0.05);
    ctx.restore();
  }
}

/* --------------------------------------------------------------- rendering */

/**
 * Preference order. H.264 is what every platform wants, so it is tried first;
 * the others exist only so a browser without an H.264 encoder can still make a
 * usable file rather than failing outright.
 */
const CODECS: readonly { codec: string; container: "avc" | "av1" | "vp9" }[] = [
  { codec: "avc1.640028", container: "avc" },
  { codec: "avc1.4d0032", container: "avc" },
  { codec: "avc1.42003c", container: "avc" },
  { codec: "avc1.42001f", container: "avc" },
  { codec: "av01.0.08M.08", container: "av1" },
  { codec: "vp09.00.51.08", container: "vp9" },
];

async function pickCodec(
  width: number,
  height: number,
  fps: number,
): Promise<{ codec: string; container: "avc" | "av1" | "vp9" } | null> {
  for (const candidate of CODECS) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec: candidate.codec,
        width,
        height,
        framerate: fps,
        bitrate: 3_200_000,
      });
      if (support.supported) return candidate;
    } catch {
      // Try the next one — an unsupported codec is not an error worth surfacing.
    }
  }
  return null;
}

export type RenderResult = {
  blob: Blob;
  bytes: number;
  seconds: number;
  frames: number;
  codec: string;
};

/**
 * Draws and encodes the whole plan. Resolves with a real MP4, or rejects with a
 * plain-English reason — it never returns a file it did not actually produce.
 */
export async function renderAnimatedPlan(
  plan: AnimatedPlan,
  options: { onProgress?: (fraction: number) => void } = {},
): Promise<RenderResult> {
  const support = animationSupport();
  if (!support.supported) throw new Error(support.reason);

  const { width, height, fps } = plan;
  const chosen = await pickCodec(width, height, fps);
  if (!chosen) throw new Error("This browser cannot record video at this size.");

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not open a drawing surface in this browser.");

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: chosen.container, width, height, frameRate: fps },
    fastStart: "in-memory",
  });

  let encodeError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (error) => {
      encodeError = error instanceof Error ? error : new Error(String(error));
    },
  });
  encoder.configure({ codec: chosen.codec, width, height, framerate: fps, bitrate: 3_200_000 });

  const totalFrames = Math.max(1, Math.round(plan.seconds * fps));
  let frameIndex = 0;

  for (const scene of plan.scenes) {
    const sceneFrames = Math.max(1, Math.round(scene.seconds * fps));
    for (let f = 0; f < sceneFrames; f += 1) {
      if (encodeError) throw encodeError;
      const elapsed = f / fps;
      drawScene(ctx, plan, scene, elapsed);

      // Cross-fade the first few frames of a scene into the previous one.
      if (scene.transition === "fade" && f < fps * 0.25) {
        ctx.save();
        ctx.globalAlpha = 1 - f / (fps * 0.25);
        ctx.fillStyle = PALETTE.canvas;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }

      const frame = new VideoFrame(canvas, {
        timestamp: Math.round((frameIndex * 1_000_000) / fps),
        duration: Math.round(1_000_000 / fps),
      });
      encoder.encode(frame, { keyFrame: frameIndex % (fps * 2) === 0 });
      frame.close();
      frameIndex += 1;

      if (frameIndex % fps === 0) {
        options.onProgress?.(frameIndex / totalFrames);
        // Yield so the founder's browser stays responsive while it works.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  }

  await encoder.flush();
  encoder.close();
  if (encodeError) throw encodeError;
  muxer.finalize();

  const buffer = (muxer.target as ArrayBufferTarget).buffer;
  if (!buffer || buffer.byteLength === 0)
    throw new Error("The recording finished empty — nothing was saved.");

  options.onProgress?.(1);
  return {
    blob: new Blob([buffer], { type: "video/mp4" }),
    bytes: buffer.byteLength,
    seconds: frameIndex / fps,
    frames: frameIndex,
    codec: chosen.codec,
  };
}
