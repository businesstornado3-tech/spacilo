/**
 * Hardware-adaptive model selection.
 *
 * The founder never picks a model. The orchestrator picks the best model the
 * chosen worker can actually run, from the existing licence-verified record in
 * `video-model.ts` — this module adds the fit rules, not a second registry.
 *
 * Nothing here downloads anything. A model that is not installed is reported
 * as not installed, with its disk requirement, so installation stays an
 * explicit founder action.
 */
import { EVALUATED_VIDEO_MODELS, type VideoModelRecord } from "../video-model";
import type { CapabilityClass, GenerationRequest, HardwareProfile } from "./types";

export type ModelRequirement = {
  id: string;
  family: string;
  version: string;
  licence: string;
  licenceUrl: string;
  commercialUse: string;
  productionEligible: boolean;
  minVramGb: number;
  recommendedVramGb: number;
  minRamGb: number;
  maxSeconds: number;
  aspects: readonly ("9:16" | "16:9" | "1:1")[];
  /** Approximate download size on disk. */
  installSizeGb: number;
  checkpointRepo: string | null;
  checkpointRevision: string | null;
  quality: VideoModelRecord["quality"];
};

/** Disk footprint per family, from the published checkpoint sizes. */
const INSTALL_SIZE_GB: Record<string, number> = {
  Wan: 32,
  LTX: 28,
  Hunyuan: 45,
  CogVideoX: 20,
};

export function modelRequirements(): readonly ModelRequirement[] {
  return EVALUATED_VIDEO_MODELS.map((model) => ({
    id: model.id,
    family: model.family,
    version: model.version,
    licence: model.licence.name,
    licenceUrl: model.licence.url,
    commercialUse: model.licence.commercialUse,
    productionEligible: model.licence.productionDefaultEligible,
    minVramGb: model.hardware.minVramGb,
    recommendedVramGb: model.hardware.recommendedVramGb,
    // Offloading to system memory needs roughly twice the card's minimum.
    minRamGb: Math.max(16, model.hardware.minVramGb * 2),
    maxSeconds: model.capabilities.maxSeconds,
    aspects: model.capabilities.aspects,
    installSizeGb: INSTALL_SIZE_GB[model.family] ?? 30,
    checkpointRepo: model.checkpoint?.repo ?? null,
    checkpointRevision: model.checkpoint?.revision ?? null,
    quality: model.quality,
  }));
}

export function modelRequirement(id: string): ModelRequirement | null {
  return modelRequirements().find((model) => model.id === id) ?? null;
}

export type ModelFit =
  | { fits: true; model: ModelRequirement; installed: boolean; note: string }
  | { fits: false; model: ModelRequirement; reason: string };

export function fitModel(
  model: ModelRequirement,
  hardware: HardwareProfile,
  request: GenerationRequest,
): ModelFit {
  if (!model.productionEligible) {
    return {
      fits: false,
      model,
      reason: `${model.family} ${model.version} is not cleared for production use (${model.licence}).`,
    };
  }
  const vram = hardware.dedicatedVramGb ?? 0;
  if (vram < model.minVramGb) {
    return {
      fits: false,
      model,
      reason: `Needs at least ${model.minVramGb} GB of dedicated graphics memory; this worker has ${
        vram > 0 ? `${vram} GB` : "none"
      }.`,
    };
  }
  if (hardware.ramGb !== null && hardware.ramGb < model.minRamGb) {
    return {
      fits: false,
      model,
      reason: `Needs at least ${model.minRamGb} GB of system memory.`,
    };
  }
  if (!model.aspects.includes(request.aspect)) {
    return { fits: false, model, reason: `Does not support ${request.aspect} video.` };
  }
  if (request.seconds > model.maxSeconds) {
    return {
      fits: false,
      model,
      reason: `Produces at most ${model.maxSeconds}s; ${request.seconds}s was requested.`,
    };
  }
  const installed = hardware.installedModels.includes(model.id);
  return {
    fits: true,
    model,
    installed,
    note: installed
      ? `Ready on this worker (${model.licence}).`
      : `Required model is not installed on this worker. About ${model.installSizeGb} GB to download.`,
  };
}

export type ModelSelection =
  | { ok: true; model: ModelRequirement; installed: boolean; note: string }
  | { ok: false; status: "MODEL_UNAVAILABLE"; reason: string; candidates: readonly ModelFit[] };

/**
 * Best model for this worker and this request.
 *
 * An installed model always wins over a better one that would have to be
 * downloaded, because EarnRoom never starts a multi-gigabyte download by itself.
 */
export function selectModel(
  hardware: HardwareProfile,
  request: GenerationRequest,
  options?: { preferredModelId?: string | null },
): ModelSelection {
  const fits = modelRequirements().map((model) => fitModel(model, hardware, request));
  const usable = fits.filter((fit): fit is Extract<ModelFit, { fits: true }> => fit.fits);

  if (usable.length === 0) {
    return {
      ok: false,
      status: "MODEL_UNAVAILABLE",
      reason: "No compatible video model can run on this worker for the requested video.",
      candidates: fits,
    };
  }

  const preferred = options?.preferredModelId
    ? usable.find((fit) => fit.model.id === options.preferredModelId)
    : undefined;
  const ranked = [...usable].sort((a, b) => {
    if (a.installed !== b.installed) return a.installed ? -1 : 1;
    return b.model.recommendedVramGb - a.model.recommendedVramGb;
  });
  const chosen = preferred ?? ranked[0]!;
  return { ok: true, model: chosen.model, installed: chosen.installed, note: chosen.note };
}

/** Capability class a model realistically needs. Used for worker listings. */
export function requiredCapability(model: ModelRequirement): CapabilityClass {
  if (model.minVramGb >= 24) return "VERY_HIGH";
  if (model.minVramGb >= 12) return "HIGH";
  if (model.minVramGb >= 6) return "MEDIUM";
  return "LIMITED";
}
