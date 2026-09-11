/**
 * The paid video presets.
 *
 * Short is the configuration behind EarnRoom's earlier real paid generations:
 * the hosted video service, 10 seconds, 720p, 9:16. Its recorded estimate at
 * the time was 120 pence, which is exactly `estimatedCostPence("720p", 10)` —
 * so every price here is derived from the same internal calculation rather
 * than written down as a number.
 *
 * Standard and Highest quality are 30-second films. The hosted service makes
 * at most `PROVIDER_MAX_SEGMENT_SECONDS` of footage in one job, so a 30-second
 * film is produced as a chain of continuations of the same scene — recorded
 * here as `segments`, never assumed elsewhere.
 *
 * Every money figure is an ESTIMATE from EarnRoom's own rate, never a provider
 * invoice.
 *
 * Pure module: no provider is contacted from here.
 */
import { estimatedCostPence } from "./usage";

/** The longest single generation the hosted service will make. */
export const PROVIDER_MAX_SEGMENT_SECONDS = 10;

export type PaidQuality = "SHORT" | "STANDARD" | "HIGHEST";

export type PaidPreset = {
  quality: PaidQuality;
  title: string;
  description: string;
  /** Sent to the hosted service. */
  resolution: "720p" | "1080p";
  seconds: number;
  aspect: "9:16";
  width: number;
  height: number;
  /** How many chained generations make up this film. */
  segments: number;
};

function segmentsFor(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / PROVIDER_MAX_SEGMENT_SECONDS));
}

export const PAID_PRESETS: Record<PaidQuality, PaidPreset> = {
  SHORT: {
    quality: "SHORT",
    title: "Short",
    description:
      "The configuration behind EarnRoom's earlier paid videos: 10 seconds, 720 × 1280, vertical.",
    resolution: "720p",
    seconds: 10,
    aspect: "9:16",
    width: 720,
    height: 1280,
    segments: segmentsFor(10),
  },
  STANDARD: {
    quality: "STANDARD",
    title: "Standard",
    description:
      "A complete 30-second film with a beginning, middle and ending: 720 × 1280, vertical.",
    resolution: "720p",
    seconds: 30,
    aspect: "9:16",
    width: 720,
    height: 1280,
    segments: segmentsFor(30),
  },
  HIGHEST: {
    quality: "HIGHEST",
    title: "Highest quality",
    description: "The same 30-second film at the highest resolution the service offers: 1080 × 1920.",
    resolution: "1080p",
    seconds: 30,
    aspect: "9:16",
    width: 1080,
    height: 1920,
    segments: segmentsFor(30),
  },
};

export const PAID_QUALITIES: readonly PaidQuality[] = ["SHORT", "STANDARD", "HIGHEST"];

export function paidPresetCostPence(quality: PaidQuality): number | null {
  const preset = PAID_PRESETS[quality];
  return estimatedCostPence(preset.resolution, preset.seconds);
}

/** "Estimated cost: £1.20" — or an honest unknown, never a guessed number. */
export function paidPresetCostLine(quality: PaidQuality): string {
  const pence = paidPresetCostPence(quality);
  return pence === null
    ? "Estimated cost: not known for this configuration."
    : `Estimated cost: £${(pence / 100).toFixed(2)}`;
}

export function paidPresetSpecLine(quality: PaidQuality): string {
  const preset = PAID_PRESETS[quality];
  return `${preset.seconds} seconds · ${preset.width} × ${preset.height} · ${preset.aspect}`;
}

/** The single confirmation the founder sees before anything is charged. */
export function paidConfirmationMessage(quality: PaidQuality): string {
  const preset = PAID_PRESETS[quality];
  const chain =
    preset.segments > 1
      ? ` It is filmed as ${preset.segments} continuous parts, because the service makes at most ${PROVIDER_MAX_SEGMENT_SECONDS} seconds at a time.`
      : "";
  return `Generate one ${preset.title.toLowerCase()} paid video (${paidPresetSpecLine(quality)})? ${paidPresetCostLine(quality)}.${chain} This is an estimate, not a confirmed charge.`;
}
