/**
 * Hardware normalisation and capability classification.
 *
 * Deterministic rules only. Shared (borrowed) GPU memory is never treated as
 * dedicated VRAM, because a machine that reports 16 GB of "shared" memory
 * cannot in practice hold a cinematic video model.
 */
import type { CapabilityClass, HardwareProfile, HardwareReport } from "./types";

function positive(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Capability class from measured hardware.
 *
 * VRAM leads, because it decides which model fits at all. RAM and cores only
 * lift a machine that already has a usable card.
 */
export function capabilityClass(input: {
  dedicatedVramGb: number | null;
  ramGb: number | null;
  accelerator: string | null;
}): { capability: CapabilityClass; reason: string } {
  const vram = input.dedicatedVramGb ?? 0;
  const ram = input.ramGb ?? 0;

  if (vram >= 24) {
    return {
      capability: "VERY_HIGH",
      reason: `${vram} GB of dedicated graphics memory — full-length, high-resolution generation.`,
    };
  }
  if (vram >= 12) {
    return {
      capability: "HIGH",
      reason: `${vram} GB of dedicated graphics memory — good quality generation.`,
    };
  }
  if (vram >= 6) {
    return {
      capability: "MEDIUM",
      reason: `${vram} GB of dedicated graphics memory — short, lower-resolution generation.`,
    };
  }
  if (vram > 0) {
    return {
      capability: "LIMITED",
      reason: `Only ${vram} GB of dedicated graphics memory — not enough for film generation.`,
    };
  }
  return {
    capability: "LIMITED",
    reason:
      ram > 0
        ? `No dedicated graphics memory detected; ${ram} GB of system memory alone is not enough for film generation.`
        : "No dedicated graphics memory detected.",
  };
}

/** Normalises whatever a worker reported into a stable profile. */
export function normaliseHardware(report: HardwareReport | null | undefined): HardwareProfile {
  const source = report ?? {};
  const dedicatedVramGb = positive(source.dedicatedVramGb);
  const sharedGpuMemoryGb = positive(source.sharedGpuMemoryGb);
  const ramGb = positive(source.ramGb);
  const accelerator = text(source.accelerator);
  const { capability, reason } = capabilityClass({ dedicatedVramGb, ramGb, accelerator });

  return {
    os: text(source.os),
    cpu: text(source.cpu),
    cpuCores: positive(source.cpuCores),
    ramGb,
    gpuVendor: text(source.gpuVendor),
    gpuModel: text(source.gpuModel),
    dedicatedVramGb,
    sharedGpuMemoryGb,
    accelerator,
    precisions: (source.precisions ?? []).filter((entry): entry is string => Boolean(entry)),
    diskFreeGb: positive(source.diskFreeGb),
    installedModels: (source.installedModels ?? []).filter((entry): entry is string =>
      Boolean(entry),
    ),
    capability,
    capabilityReason: reason,
    sharedMemoryOnly: dedicatedVramGb === null && sharedGpuMemoryGb !== null,
  };
}

/** One line describing the machine, for the founder console. */
export function hardwareSummary(profile: HardwareProfile): string {
  const parts: string[] = [];
  if (profile.gpuModel) parts.push(profile.gpuModel);
  if (profile.dedicatedVramGb !== null) parts.push(`${profile.dedicatedVramGb} GB graphics memory`);
  else if (profile.sharedGpuMemoryGb !== null) {
    parts.push(`${profile.sharedGpuMemoryGb} GB shared memory (not dedicated)`);
  }
  if (profile.ramGb !== null) parts.push(`${profile.ramGb} GB memory`);
  if (profile.cpu) parts.push(profile.cpu);
  return parts.length > 0 ? parts.join(" · ") : "Hardware not reported.";
}
