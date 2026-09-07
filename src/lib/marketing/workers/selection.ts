/**
 * Worker orchestration — which engine runs this generation.
 *
 * The non-negotiable rule lives here: a paid cloud worker is never reached
 * automatically. If every free route is unavailable and paid compute is off,
 * the orchestrator stops and says so. It does not "fall back".
 */
import { CAPABILITY_ORDER, READY_STATUSES, WORKER_LABEL } from "./types";
import type {
  CapabilityClass,
  GenerationRequest,
  WorkerDescriptor,
  WorkerMode,
  WorkerPreference,
} from "./types";

/** Preference order when the founder chose AUTO: cheapest and closest first. */
export const AUTO_PRIORITY: readonly WorkerMode[] = [
  "BROWSER",
  "LOCAL",
  "FREE_CLOUD",
  "PAID_CLOUD",
];

export const NO_FREE_WORKER_MESSAGE =
  "No free video-generation worker is currently available. Paid generation is disabled.";

export type Eligibility = { eligible: true } | { eligible: false; reason: string };

export function workerEligibility(
  worker: WorkerDescriptor,
  request: GenerationRequest,
  options: { paidComputeEnabled: boolean; requiredCapability?: CapabilityClass },
): Eligibility {
  if (worker.mode === "PAID_CLOUD" && !options.paidComputeEnabled) {
    return { eligible: false, reason: "Paid generation is switched off." };
  }
  if (!worker.enabled) {
    return { eligible: false, reason: `${worker.label} is switched off.` };
  }
  if (worker.status === "QUOTA_EXHAUSTED") {
    return { eligible: false, reason: `${worker.label} has used up its free allowance.` };
  }
  if (!READY_STATUSES.includes(worker.status) && worker.status !== "BUSY") {
    return { eligible: false, reason: `${worker.label} is not available (${worker.detail}).` };
  }
  const needed = options.requiredCapability;
  if (needed && CAPABILITY_ORDER[worker.capability] < CAPABILITY_ORDER[needed]) {
    return {
      eligible: false,
      reason: `${worker.label} does not have enough capacity for this video.`,
    };
  }
  if (request.voice && worker.mode === "BROWSER") {
    return {
      eligible: false,
      reason: "Browser Local cannot generate a voiceover.",
    };
  }
  return { eligible: true };
}

export type WorkerSelection =
  | { ok: true; worker: WorkerDescriptor; reason: string; chargeable: boolean }
  | {
      ok: false;
      status: "NO_WORKER_AVAILABLE" | "PAID_CONFIRMATION_REQUIRED" | "WORKER_UNAVAILABLE";
      message: string;
      /** Set when the only remaining route would be paid. */
      offerPaid: boolean;
      rejections: readonly { mode: WorkerMode; reason: string }[];
    };

/**
 * Chooses a worker.
 *
 * An explicit founder choice is honoured exactly — never quietly swapped for
 * another mode. AUTO walks the free routes in order and stops before paid.
 */
export function selectWorker(input: {
  preference: WorkerPreference;
  workers: readonly WorkerDescriptor[];
  request: GenerationRequest;
  paidComputeEnabled: boolean;
  /** Founder confirmed this specific paid generation may be charged. */
  confirmedPaid?: boolean;
  requiredCapability?: CapabilityClass;
}): WorkerSelection {
  const options = {
    paidComputeEnabled: input.paidComputeEnabled,
    ...(input.requiredCapability ? { requiredCapability: input.requiredCapability } : {}),
  };
  const rejections: { mode: WorkerMode; reason: string }[] = [];

  const consider = (worker: WorkerDescriptor): WorkerSelection | null => {
    const check = workerEligibility(worker, input.request, options);
    if (!check.eligible) {
      rejections.push({ mode: worker.mode, reason: check.reason });
      return null;
    }
    if (worker.mode === "PAID_CLOUD" && input.confirmedPaid !== true) {
      return {
        ok: false,
        status: "PAID_CONFIRMATION_REQUIRED",
        message: "This generation may be charged by the provider. Confirm before it runs.",
        offerPaid: true,
        rejections,
      };
    }
    return {
      ok: true,
      worker,
      chargeable: worker.chargeable,
      reason:
        worker.mode === "PAID_CLOUD"
          ? "Paid generation, explicitly confirmed."
          : `Running on ${worker.label}. No third-party generation fee.`,
    };
  };

  if (input.preference !== "AUTO") {
    const chosen = input.workers.find((worker) => worker.mode === input.preference);
    if (!chosen) {
      return {
        ok: false,
        status: "WORKER_UNAVAILABLE",
        message: `${WORKER_LABEL[input.preference]} is not connected.`,
        offerPaid: false,
        rejections,
      };
    }
    const outcome = consider(chosen);
    if (outcome) return outcome;
    return {
      ok: false,
      status: "WORKER_UNAVAILABLE",
      message: rejections[0]?.reason ?? `${chosen.label} is not available.`,
      offerPaid: false,
      rejections,
    };
  }

  for (const mode of AUTO_PRIORITY) {
    if (mode === "PAID_CLOUD") break; // AUTO never reaches paid compute.
    const worker = input.workers.find((entry) => entry.mode === mode);
    if (!worker) {
      rejections.push({ mode, reason: `${WORKER_LABEL[mode]} is not connected.` });
      continue;
    }
    const outcome = consider(worker);
    if (outcome) return outcome;
  }

  return {
    ok: false,
    status: "NO_WORKER_AVAILABLE",
    message: NO_FREE_WORKER_MESSAGE,
    offerPaid: input.workers.some((worker) => worker.mode === "PAID_CLOUD"),
    rejections,
  };
}
