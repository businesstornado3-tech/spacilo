/**
 * Free animated renderer — runs in the founder's own browser.
 *
 * Frames are drawn on a canvas and encoded to MP4 with the browser's built-in
 * video encoder. There is no video API, no GPU rental and no per-video charge:
 * the only cost is the founder's own machine for the few seconds it runs.
 *
 * The real EarnRoom artwork is loaded from the app's own approved asset files
 * and painted into the frames. It is never redrawn, retyped or approximated —
 * if the artwork cannot be loaded, the render fails rather than shipping a
 * video with a fake logo in it.
 *
 * Browser-only module. Nothing here is imported during server rendering.
 */
import { ArrayBufferTarget, Muxer } from "mp4-muxer";

import { drawCharacterFigure, drawEnvironmentLayer, groundLine } from "./draw.browser";
import { element } from "./library";
import type { AnimatedPlan, AnimatedScene, Motion, Paint, Shape } from "./types";
import type { RenderOutcome } from "./validation";

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
const easeInOut = (t: number) => {
  const x = clamp(t);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
};
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

/* ----------------------------------------------------------------- artwork */

export type Artwork = { icon: ImageBitmap; wordmark: ImageBitmap };

/**
 * Loads the approved EarnRoom artwork. Rejects rather than substituting text,
 * so a clip can never be published with an invented logo.
 */
export async function loadArtwork(plan: AnimatedPlan): Promise<Artwork> {
  const fetchBitmap = async (url: string) => {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Could not load the EarnRoom artwork (${response.status}).`);
    return createImageBitmap(await response.blob());
  };
  const [icon, wordmark] = await Promise.all([
    fetchBitmap(plan.brand.logoUrl),
    fetchBitmap(plan.brand.wordmarkUrl),
  ]);
  return { icon, wordmark };
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

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): { text: string; words: string[] }[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[][] = [];
  let line: string[] = [];
  for (const word of words) {
    const candidate = [...line, word].join(" ");
    if (ctx.measureText(candidate).width > maxWidth && line.length) {
      lines.push(line);
      line = [word];
    } else {
      line = [...line, word];
    }
  }
  if (line.length) lines.push(line);
  return lines.slice(0, 4).map((entryLine) => ({ text: entryLine.join(" "), words: entryLine }));
}

/** Soft drifting shapes and a faint horizon over the environment, for depth. */
function drawAmbience(
  ctx: CanvasRenderingContext2D,
  plan: AnimatedPlan,
  scene: AnimatedScene,
  t: number,
) {
  const { width, height } = plan;
  ctx.save();
  ctx.globalAlpha = scene.backdrop.base === "primary" ? 0.14 : 0.16;
  ctx.fillStyle = PALETTE[scene.backdrop.tint];
  for (let i = 0; i < scene.backdrop.motes; i += 1) {
    // Deterministic positions: the same scene always drifts the same way.
    const seed = (i + 1) * (scene.index + 2);
    const x = ((Math.sin(seed * 12.9898) + 1) / 2) * width;
    const y = ((Math.sin(seed * 78.233) + 1) / 2) * height * 0.7;
    const r = width * (0.05 + ((seed % 5) / 5) * 0.1);
    ctx.beginPath();
    ctx.arc(
      x + Math.sin(t * 0.6 + seed) * width * 0.02,
      y + Math.cos(t * 0.5 + seed) * height * 0.015,
      r,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}

/** Kinetic typography: words settle in one after another, not all at once. */
function drawText(
  ctx: CanvasRenderingContext2D,
  plan: AnimatedPlan,
  options: {
    text: string;
    motion: Motion;
    elapsed: number;
    startAt: number;
    size: number;
    colour: string;
    centreY: number;
    maxWidth: number;
    font: string;
  },
): number {
  const motion = entry(options.motion, clamp((options.elapsed - options.startAt) / 0.6));
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = options.font.replace("1px", `${options.size}px`);
  ctx.fillStyle = options.colour;
  const lines = wrap(ctx, options.text, options.maxWidth);
  const lineHeight = options.size * 1.24;
  let y = options.centreY + motion.dy * plan.height;
  let wordIndex = 0;
  for (const line of lines) {
    const lineWidth = ctx.measureText(line.text).width;
    let x = plan.width / 2 - lineWidth / 2;
    for (const word of line.words) {
      const wordProgress = clamp(
        (options.elapsed - options.startAt - wordIndex * 0.07) / 0.4,
      );
      const wordWidth = ctx.measureText(`${word} `).width;
      ctx.globalAlpha = motion.opacity * easeOut(wordProgress);
      ctx.fillText(word, x + wordWidth / 2, y + (1 - easeOut(wordProgress)) * options.size * 0.3);
      x += wordWidth;
      wordIndex += 1;
    }
    y += lineHeight;
  }
  ctx.restore();
  return y;
}

type DrawStats = { logoFrames: number; smallestLogoPx: number; characterFrames: number };

function drawScene(
  ctx: CanvasRenderingContext2D,
  plan: AnimatedPlan,
  scene: AnimatedScene,
  elapsed: number,
  art: Artwork,
  stats: DrawStats,
) {
  const { width, height } = plan;
  const comp = plan.composition;
  const progress = scene.seconds > 0 ? clamp(elapsed / scene.seconds) : 1;
  const dark = scene.backdrop.base === "primary";
  let logoDrawn = false;

  /* ---------------------------------------------------- camera + environment */
  const move = scene.camera;
  const eased = easeInOut(progress);
  const scale = move.fromScale + (move.toScale - move.fromScale) * eased;
  const panX = (move.fromX + (move.toX - move.fromX) * eased) * width;
  const panY = (move.fromY + (move.toY - move.fromY) * eased) * height;
  const camera = { scale, panX, panY };

  drawEnvironmentLayer(ctx, scene.environment, "back", { width, height, camera });
  drawEnvironmentLayer(ctx, scene.environment, "mid", { width, height, camera });
  drawAmbience(ctx, plan, scene, elapsed);

  for (const item of scene.items) {
    const itemProgress = clamp((elapsed - item.delay) / 0.6);
    if (itemProgress <= 0) continue;
    const motion = entry(item.motion, itemProgress);
    // Parallax: nearer items travel further with the camera.
    const depthScale = 1 + (scale - 1) * (0.5 + item.depth);
    const size = item.size * width * motion.scale * depthScale;
    const originX =
      (item.x + motion.dx) * width - size / 2 + panX * (0.4 + item.depth) + (item.depth - 0.6) * Math.sin(elapsed * 0.9) * width * 0.004;
    const originY = (item.y + motion.dy) * height - size / 2 + panY * (0.4 + item.depth);

    ctx.save();
    // A soft contact shadow, so illustrations sit in the scene rather than on it.
    ctx.globalAlpha = motion.opacity * 0.16;
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.ellipse(originX + size / 2, originY + size * 0.98, size * 0.34, size * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = motion.opacity;
    for (const shape of element(item.element).shapes) {
      drawShape(ctx, shape, { x: originX, y: originY, size });
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------ characters */
  const ground = height * groundLine(scene.environment);
  for (const member of scene.cast) {
    const since = elapsed - member.delay;
    if (since <= 0) continue;
    const depth = 0.9;
    const figureHeight = member.scale * height * (1 + (scale - 1) * depth);
    drawCharacterFigure(ctx, {
      characterId: member.character,
      pose: member.pose,
      expression: member.expression,
      motion: member.motion,
      x: member.x * width + panX * depth,
      groundY: ground + panY * depth,
      height: figureHeight,
      facing: member.facing,
      elapsed: since,
      opacity: easeOut(since / 0.5),
    });
    stats.characterFrames += 1;
  }

  drawEnvironmentLayer(ctx, scene.environment, "fore", { width, height, camera });

  /* ----------------------------------------------------------- end card */
  if (scene.logo === "endcard") {
    const reveal = entry("zoom", clamp(elapsed / 0.7));
    const markWidth = width * comp.logoScale * reveal.scale;
    const markHeight = (markWidth / art.wordmark.width) * art.wordmark.height;
    ctx.save();
    ctx.globalAlpha = reveal.opacity;
    ctx.drawImage(
      art.wordmark,
      width / 2 - markWidth / 2,
      height * 0.34 - markHeight / 2,
      markWidth,
      markHeight,
    );
    ctx.restore();
    logoDrawn = true;
    stats.smallestLogoPx =
      stats.smallestLogoPx === 0 ? markWidth : Math.min(stats.smallestLogoPx, markWidth);
  }

  /* -------------------------------------------------------------- captions */
  // A soft scrim under the caption band, so type stays readable over artwork
  // without hiding the scene behind a solid slab.
  if (scene.logo !== "endcard") {
    const bandTop = height * (comp.captionY - 0.14);
    const scrim = ctx.createLinearGradient(0, bandTop, 0, height);
    const base = dark ? "0,0,0" : "255,255,255";
    scrim.addColorStop(0, `rgba(${base},0)`);
    scrim.addColorStop(0.45, `rgba(${base},0.72)`);
    scrim.addColorStop(1, `rgba(${base},0.9)`);
    ctx.save();
    ctx.fillStyle = scrim;
    ctx.fillRect(0, bandTop, width, height - bandTop);
    ctx.restore();
  }

  const captionScale =
    scene.caption.emphasis === "hook"
      ? comp.hookScale
      : scene.caption.emphasis === "brand"
        ? comp.hookScale * 0.9
        : comp.bodyScale;
  const captionSize = Math.round(width * captionScale);
  const captionY =
    height * (scene.logo === "endcard" ? 0.6 : comp.captionY) - captionSize * 0.4;

  const afterCaption = drawText(ctx, plan, {
    text: scene.caption.text,
    motion: scene.caption.motion,
    elapsed,
    startAt: 0.1,
    size: captionSize,
    colour: dark ? PALETTE.white : PALETTE.ink,
    centreY: captionY,
    maxWidth: width * comp.textWidth,
    font: FONT_DISPLAY,
  });

  if (scene.subCaption) {
    const subSize = Math.round(width * comp.ctaScale);
    drawText(ctx, plan, {
      text: scene.subCaption.text,
      motion: scene.subCaption.motion,
      elapsed,
      startAt: 0.5,
      size: subSize,
      colour: dark ? PALETTE.primarySoft : PALETTE.primary,
      centreY: afterCaption + subSize * 0.6,
      maxWidth: width * (comp.textWidth - 0.04),
      font: FONT_BODY,
    });
  }

  /* ------------------------------------------------------------- watermark */
  if (scene.logo === "watermark") {
    const markWidth = Math.max(64, width * 0.19);
    const markHeight = (markWidth / art.wordmark.width) * art.wordmark.height;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.drawImage(
      art.wordmark,
      width * comp.safe.side,
      height * (comp.safe.top * 0.55),
      markWidth,
      markHeight,
    );
    ctx.restore();
    logoDrawn = true;
    stats.smallestLogoPx =
      stats.smallestLogoPx === 0 ? markWidth : Math.min(stats.smallestLogoPx, markWidth);
  }

  if (logoDrawn) stats.logoFrames += 1;
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
        bitrate: 4_500_000,
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
  /** What was actually drawn, for the deterministic quality gate. */
  outcome: RenderOutcome;
  /**
   * Narration and music are not produced in the browser at £0; the campaign
   * narration is carried in the plan for the local worker's audio pipeline.
   */
  audio: "none";
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

  const art = await loadArtwork(plan);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not open a drawing surface in this browser.");

  // Holds the last frame of the previous scene, so scenes dissolve into each
  // other instead of flashing through a blank background.
  const previous = document.createElement("canvas");
  previous.width = width;
  previous.height = height;
  const previousCtx = previous.getContext("2d");

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
  encoder.configure({ codec: chosen.codec, width, height, framerate: fps, bitrate: 4_500_000 });

  const totalFrames = Math.max(1, Math.round(plan.seconds * fps));
  const stats: DrawStats = { logoFrames: 0, smallestLogoPx: 0, characterFrames: 0 };
  let frameIndex = 0;
  let hasPrevious = false;

  for (const scene of plan.scenes) {
    const sceneFrames = Math.max(1, Math.round(scene.seconds * fps));
    const fadeFrames = Math.round(fps * 0.35);
    for (let f = 0; f < sceneFrames; f += 1) {
      if (encodeError) throw encodeError;
      const elapsed = f / fps;
      drawScene(ctx, plan, scene, elapsed, art, stats);

      if (scene.transition === "fade" && hasPrevious && f < fadeFrames) {
        ctx.save();
        ctx.globalAlpha = 1 - easeInOut(f / fadeFrames);
        ctx.drawImage(previous, 0, 0);
        ctx.restore();
      }

      if (previousCtx && f === sceneFrames - 1) {
        previousCtx.clearRect(0, 0, width, height);
        previousCtx.drawImage(canvas, 0, 0);
        hasPrevious = true;
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
    audio: "none",
    outcome: {
      width,
      height,
      seconds: frameIndex / fps,
      bytes: buffer.byteLength,
      frames: frameIndex,
      logoFrames: stats.logoFrames,
      characterFrames: stats.characterFrames,
      smallestLogoPx: Math.round(stats.smallestLogoPx),
      artworkLoaded: true,
    },
  };
}
