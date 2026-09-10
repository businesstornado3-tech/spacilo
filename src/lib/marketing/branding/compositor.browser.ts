/**
 * Burns the approved EarnRoom branding into a generated video.
 *
 * The paid hosted provider returns cinematic but completely unbranded pixels.
 * This module takes that finished film and composes EarnRoom's own approved
 * artwork and approved wording on top of it — the real lock-up and wordmark
 * files, never a redrawn or model-generated logo — and re-encodes the result
 * as a single branded MP4, keeping the original soundtrack.
 *
 * It runs in the founder's own browser using the browser's built-in encoder,
 * so it adds no service, no provider call and no cost.
 *
 * Browser-only module. Nothing here is imported during server rendering.
 */
import { ArrayBufferTarget, Muxer } from "mp4-muxer";

import type { BrandCompositionPlan, CompositionReceipt } from "./composition";

const FONT_DISPLAY = 'Sora, "Segoe UI", system-ui, sans-serif';
const FONT_BODY = 'Manrope, "Segoe UI", system-ui, sans-serif';

export type CompositionSupport = { supported: boolean; reason: string };

/** Says plainly whether this browser can compose the branding. Never guesses. */
export function compositionSupport(): CompositionSupport {
  if (typeof window === "undefined")
    return { supported: false, reason: "Not running in a browser." };
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") {
    return {
      supported: false,
      reason:
        "This browser cannot compose video. Chrome or Edge on a computer can — Safari and Firefox cannot yet.",
    };
  }
  return { supported: true, reason: "This browser can add the EarnRoom branding locally." };
}

const CODECS = ["avc1.640028", "avc1.4d0032", "avc1.42003c", "avc1.42001f"] as const;

async function pickCodec(width: number, height: number, fps: number): Promise<string | null> {
  for (const codec of CODECS) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        framerate: fps,
        bitrate: 6_000_000,
      });
      if (support.supported) return codec;
    } catch {
      // An unsupported codec is not an error worth surfacing — try the next.
    }
  }
  return null;
}

async function loadBitmap(url: string): Promise<ImageBitmap> {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Could not load the EarnRoom artwork (${response.status}).`);
  return createImageBitmap(await response.blob());
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  centreX: number,
  topY: number,
  fontSize: number,
  options: { background: boolean } = { background: true },
) {
  const lineHeight = fontSize * 1.28;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  if (options.background) {
    const widest = Math.max(...lines.map((line) => ctx.measureText(line).width));
    const padX = fontSize * 0.6;
    const padY = fontSize * 0.36;
    ctx.save();
    ctx.fillStyle = "rgba(12, 22, 28, 0.52)";
    const boxWidth = widest + padX * 2;
    const boxHeight = lines.length * lineHeight + padY * 2 - (lineHeight - fontSize);
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(centreX - boxWidth / 2, topY - padY, boxWidth, boxHeight, fontSize * 0.34);
      ctx.fill();
    } else {
      ctx.fillRect(centreX - boxWidth / 2, topY - padY, boxWidth, boxHeight);
    }
    ctx.restore();
  }
  ctx.fillStyle = "#ffffff";
  lines.forEach((line, index) => {
    ctx.fillText(line, centreX, topY + index * lineHeight);
  });
}

type Art = { lockup: ImageBitmap; wordmark: ImageBitmap | null };

function drawBranding(
  ctx: CanvasRenderingContext2D,
  plan: BrandCompositionPlan,
  art: Art,
  time: number,
  tally: { watermark: number; tagline: number; cta: number; endCard: number },
) {
  const { width, height, safeArea } = plan;

  /* -------------------------------------------------- body of the film */
  if (time < plan.endCard.fromSeconds) {
    if (plan.watermark && art.wordmark) {
      const markWidth = Math.max(72, width * plan.watermark.widthFraction);
      const markHeight = (markWidth / art.wordmark.width) * art.wordmark.height;
      ctx.save();
      ctx.globalAlpha = plan.watermark.opacity;
      ctx.drawImage(
        art.wordmark,
        width - markWidth - width * safeArea.right * 0.6,
        height - markHeight - height * (safeArea.bottom + 0.02),
        markWidth,
        markHeight,
      );
      ctx.restore();
      tally.watermark += 1;
    }

    if (plan.persistentTagline) {
      const size = Math.round(height * 0.042);
      ctx.font = `700 ${size}px ${FONT_DISPLAY}`;
      const lines = wrapLines(ctx, plan.persistentTagline.text, width * (1 - safeArea.left * 2));
      drawTextBlock(
        ctx,
        lines,
        width / 2,
        height - height * (safeArea.bottom + 0.055) - lines.length * size * 1.28,
        size,
      );
      tally.tagline += 1;
    }

    if (plan.cta && time >= plan.cta.fromSeconds) {
      const size = Math.round(height * 0.032);
      ctx.font = `600 ${size}px ${FONT_BODY}`;
      const lines = wrapLines(ctx, plan.cta.text, width * (1 - safeArea.left * 2));
      drawTextBlock(ctx, lines, width / 2, height * (safeArea.top + 0.02), size);
      tally.cta += 1;
    }
    return;
  }

  /* ------------------------------------------------------- closing card */
  const fade = Math.min(1, (time - plan.endCard.fromSeconds) / 0.5);
  ctx.save();
  ctx.globalAlpha = 0.82 * fade + 0.12;
  ctx.fillStyle = "#0e1a20";
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  const logoWidth = width * plan.endCard.widthFraction;
  const logoHeight = (logoWidth / art.lockup.width) * art.lockup.height;
  ctx.drawImage(
    art.lockup,
    (width - logoWidth) / 2,
    height / 2 - logoHeight - height * 0.06,
    logoWidth,
    logoHeight,
  );

  const taglineSize = Math.round(height * 0.05);
  ctx.font = `700 ${taglineSize}px ${FONT_DISPLAY}`;
  const taglineLines = wrapLines(ctx, plan.endCard.tagline, width * 0.82);
  drawTextBlock(ctx, taglineLines, width / 2, height / 2 - height * 0.01, taglineSize, {
    background: false,
  });

  if (plan.endCard.website) {
    const size = Math.round(height * 0.034);
    ctx.font = `600 ${size}px ${FONT_BODY}`;
    drawTextBlock(
      ctx,
      [plan.endCard.website],
      width / 2,
      height / 2 + taglineLines.length * taglineSize * 1.28 + height * 0.02,
      size,
      { background: false },
    );
  }
  tally.endCard += 1;
}

/* ------------------------------------------------------------------ audio */

async function encodeOriginalAudio(
  source: ArrayBuffer,
  muxer: Muxer<ArrayBufferTarget>,
): Promise<boolean> {
  if (typeof AudioEncoder === "undefined" || typeof AudioData === "undefined") return false;
  const AudioCtx =
    (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ?? null;
  if (!AudioCtx) return false;

  let buffer: AudioBuffer;
  const context = new AudioCtx();
  try {
    buffer = await context.decodeAudioData(source.slice(0));
  } catch {
    await context.close();
    return false;
  }
  await context.close();
  if (buffer.length === 0 || buffer.numberOfChannels === 0) return false;

  const channels = Math.min(2, buffer.numberOfChannels);
  const config = {
    codec: "mp4a.40.2",
    sampleRate: buffer.sampleRate,
    numberOfChannels: channels,
    bitrate: 128_000,
  };
  try {
    const support = await AudioEncoder.isConfigSupported(config);
    if (!support.supported) return false;
  } catch {
    return false;
  }

  let failed = false;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: () => {
      failed = true;
    },
  });
  encoder.configure(config);

  const chunkFrames = 1024;
  const planar = new Float32Array(chunkFrames * channels);
  for (let offset = 0; offset < buffer.length; offset += chunkFrames) {
    if (failed) break;
    const frames = Math.min(chunkFrames, buffer.length - offset);
    for (let channel = 0; channel < channels; channel += 1) {
      const data = buffer.getChannelData(channel);
      planar.set(data.subarray(offset, offset + frames), channel * frames);
    }
    const audio = new AudioData({
      format: "f32-planar",
      sampleRate: buffer.sampleRate,
      numberOfFrames: frames,
      numberOfChannels: channels,
      timestamp: Math.round((offset / buffer.sampleRate) * 1_000_000),
      data: planar.slice(0, frames * channels),
    });
    encoder.encode(audio);
    audio.close();
  }
  if (failed) return false;
  await encoder.flush();
  encoder.close();
  return !failed;
}

/* -------------------------------------------------------------- compositor */

export type CompositionResult = { blob: Blob; receipt: CompositionReceipt };

/**
 * Composes the branding onto the supplied film. Resolves with a real branded
 * MP4 and an honest receipt of what was drawn, or rejects with a plain-English
 * reason — it never returns a file it did not actually compose.
 */
export async function composeBranding(
  sourceUrl: string,
  plan: BrandCompositionPlan,
  options: { onProgress?: (fraction: number) => void } = {},
): Promise<CompositionResult> {
  const support = compositionSupport();
  if (!support.supported) throw new Error(support.reason);

  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error("The generated video could not be downloaded for branding.");
  const sourceBytes = await response.arrayBuffer();
  const objectUrl = URL.createObjectURL(new Blob([sourceBytes], { type: "video/mp4" }));

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = objectUrl;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("The generated video could not be opened."));
    });

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) throw new Error("The generated video has no picture to brand.");
    if (width !== plan.width || height !== plan.height) {
      throw new Error(
        `The generated video is ${width}×${height} but the branding plan expects ${plan.width}×${plan.height}.`,
      );
    }

    const fps = plan.fps;
    const codec = await pickCodec(width, height, fps);
    if (!codec) throw new Error("This browser cannot encode video at this size.");

    const lockup = await loadBitmap(plan.endCard.logoUrl);
    const wordmark = plan.watermark ? await loadBitmap(plan.watermark.url) : null;
    if (typeof document !== "undefined" && document.fonts?.ready) await document.fonts.ready;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not open a drawing surface in this browser.");

    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: "avc", width, height, frameRate: fps },
      audio: { codec: "aac", numberOfChannels: 2, sampleRate: 48_000 },
      fastStart: "in-memory",
    });

    let encodeError: Error | null = null;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (error) => {
        encodeError = error instanceof Error ? error : new Error(String(error));
      },
    });
    encoder.configure({ codec, width, height, framerate: fps, bitrate: 6_000_000 });

    const duration = Number.isFinite(video.duration) ? video.duration : plan.seconds;
    const totalFrames = Math.max(1, Math.round(Math.min(duration, plan.seconds + 0.5) * fps));
    const tally = { watermark: 0, tagline: 0, cta: 0, endCard: 0 };
    const seekTo = (time: number) =>
      new Promise<void>((resolve) => {
        const done = () => {
          video.removeEventListener("seeked", done);
          resolve();
        };
        video.addEventListener("seeked", done);
        video.currentTime = Math.min(time, Math.max(0, duration - 0.001));
      });

    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
      if (encodeError) throw encodeError;
      const time = frameIndex / fps;
      await seekTo(time);
      ctx.drawImage(video, 0, 0, width, height);
      drawBranding(ctx, plan, { lockup, wordmark }, time, tally);

      const frame = new VideoFrame(canvas, {
        timestamp: Math.round((frameIndex * 1_000_000) / fps),
        duration: Math.round(1_000_000 / fps),
      });
      encoder.encode(frame, { keyFrame: frameIndex % (fps * 2) === 0 });
      frame.close();

      if (frameIndex % fps === 0) {
        options.onProgress?.(frameIndex / totalFrames);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    await encoder.flush();
    encoder.close();
    if (encodeError) throw encodeError;

    const audioCopied = await encodeOriginalAudio(sourceBytes, muxer);
    muxer.finalize();

    const buffer = (muxer.target as ArrayBufferTarget).buffer;
    if (!buffer || buffer.byteLength === 0)
      throw new Error("The branded film finished empty — nothing was composed.");

    const artworkUrls = [plan.endCard.logoUrl];
    if (plan.watermark && tally.watermark > 0) artworkUrls.push(plan.watermark.url);

    options.onProgress?.(1);
    return {
      blob: new Blob([buffer], { type: "video/mp4" }),
      receipt: {
        planDigest: plan.digest,
        width,
        height,
        fps,
        seconds: totalFrames / fps,
        framesDrawn: totalFrames,
        watermarkFrames: tally.watermark,
        taglineFrames: tally.tagline,
        ctaFrames: tally.cta,
        endCardFrames: tally.endCard,
        artworkUrls,
        audio: audioCopied ? "copied" : "none",
        bytes: buffer.byteLength,
      },
    };
  } finally {
    video.src = "";
    URL.revokeObjectURL(objectUrl);
  }
}
