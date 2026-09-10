/**
 * The two paid video presets.
 *
 * Standard is the configuration that produced EarnRoom's earlier real paid
 * generations: the hosted video service, 10 seconds, 720p, 9:16. Its recorded
 * estimate at the time was 120 pence per video, which is exactly
 * `estimatedCostPence("720p", 10)` — so the price here is derived from the same
 * calculation rather than written down as a number.
 *
 * Highest quality is the same route at the highest resolution the service
 * offers. It is a genuinely different configuration, not a label.
 *
 * Pure module: no provider is contacted from here.
 */
import { estimatedCostPence } from "./usage";

export type PaidQuality = "STANDARD" | "HIGHEST";

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
};

export const PAID_PRESETS: Record<PaidQuality, PaidPreset> = {
  STANDARD: {
    quality: "STANDARD",
    title: "Standard",
    description:
      "The configuration behind EarnRoom's earlier paid videos: 10 seconds, 720 × 1280, vertical.",
    resolution: "720p",
    seconds: 10,
    aspect: "9:16",
    width: 720,
    height: 1280,
  },
  HIGHEST: {
    quality: "HIGHEST",
    title: "Highest quality",
    description: "The same film at the highest resolution the service offers: 1080 × 1920.",
    resolution: "1080p",
    seconds: 10,
    aspect: "9:16",
    width: 1080,
    height: 1920,
  },
};

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
  return `Generate one ${preset.title.toLowerCase()} paid video (${paidPresetSpecLine(quality)})? ${paidPresetCostLine(quality)}. This is an estimate, not a confirmed charge.`;
}
