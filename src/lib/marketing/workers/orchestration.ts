/**
 * Video worker orchestration — the execution plan for one generation.
 *
 * This is the piece that turns a founder's worker choice into a concrete,
 * honest plan: which route actually runs the pixels, which stages the worker
 * performs and which stay with EarnRoom's own services, what it costs and
 * whether a confirmation is required first.
 *
 * Pure module: no network, no database, no clock. It never reaches a paid
 * route on its own and never claims a cost it cannot justify.
 */
import {
  checkSpend,
  costReport,
  type CostReport,
  type GenerationInitiator,
  type SpendCaps,
  type SpendCounts,
} from "./cost";
import type { JobPhase } from "./lifecycle";
import { selectWorker } from "./selection";
import { WORKER_LABEL } from "./types";
import type {
  CapabilityClass,
  GenerationRequest,
  WorkerDescriptor,
  WorkerMode,
  WorkerPreference,
} from "./types";

/** Who performs a stage of the pipeline. */
export type StageOwner = "WORKER" | "EARNROOM" | "SKIPPED";

export type ExecutionStage = {
  phase: JobPhase;
  owner: StageOwner;
  note: string;
};

export type PlanFailure =
  | "NO_WORKER_AVAILABLE"
  | "WORKER_UNAVAILABLE"
  | "PAID_CONFIRMATION_REQUIRED"
  | "PAID_GENERATION_DISABLED"
  | "SPEND_LIMIT_REACHED"
  | "GENERATION_PAUSED";

export type ExecutionPlan =
  | {
      ok: true;
      route: WorkerMode;
      workerId: string | null;
      workerLabel: string;
      provider: string | null;
      /** Why this route was chosen, in plain English. */
      reason: string;
      cost: CostReport;
      /** True only for a paid route the founder has already confirmed. */
      chargeable: boolean;
      stages: readonly ExecutionStage[];
    }
  | {
      ok: false;
      status: PlanFailure;
      message: string;
      /** True when the only remaining route would be a paid one. */
      offerPaid: boolean;
      rejections: readonly { mode: WorkerMode; reason: string }[];
    };

/**
 * Plain-English failure copy. The system always says what it actually knows —
 * never "something went wrong" when the cause is known.
 */
export function planFailureMessage(status: PlanFailure, mode?: WorkerMode): string {
  switch (status) {
    case "NO_WORKER_AVAILABLE":
      return "No free video-generation worker is currently available. Paid generation is disabled for automatic selection.";
    case "WORKER_UNAVAILABLE":
      return mode === "LOCAL"
        ? "Your local video worker is offline or has not checked in recently."
        : mode === "FREE_CLOUD"
          ? "No free cloud video worker is currently available."
          : "The chosen worker is not available.";
    case "PAID_CONFIRMATION_REQUIRED":
      return "This generation may be charged by the provider. Confirm before it runs.";
    case "PAID_GENERATION_DISABLED":
      return "Paid video generation is disabled.";
    case "SPEND_LIMIT_REACHED":
      return "This generation would go past one of your spending limits.";
    case "GENERATION_PAUSED":
      return "Video generation is paused.";
  }
}

/** Stages a worker of this mode performs itself, versus EarnRoom's services. */
function stagesFor(mode: WorkerMode, request: GenerationRequest): ExecutionStage[] {
  const workerComposes = mode !== "BROWSER";
  return [
    {
      phase: "GENERATING_VIDEO",
      owner: mode === "BROWSER" ? "EARNROOM" : "WORKER",
      note:
        mode === "BROWSER"
          ? "Drawn and encoded in this browser — no external service."
          : `Scenes generated on ${WORKER_LABEL[mode]}.`,
    },
    {
      phase: "GENERATING_VOICE",
      owner: request.voice ? (mode === "BROWSER" ? "SKIPPED" : "WORKER") : "SKIPPED",
      note: request.voice
        ? mode === "BROWSER"
          ? "This browser cannot generate a voiceover."
          : "Licensed British-English voice on the worker."
        : "No voiceover requested.",
    },
    {
      phase: "GENERATING_AUDIO",
      owner: request.music ? "EARNROOM" : "SKIPPED",
      note: request.music
        ? "Music chosen from the licensed EarnRoom library."
        : "No music requested.",
    },
    {
      phase: "COMPOSING",
      owner: workerComposes ? "WORKER" : "EARNROOM",
      note: workerComposes
        ? "Scenes, voice and music composed on the worker."
        : "Composed in the browser renderer.",
    },
    {
      phase: "RENDERING",
      owner: workerComposes ? "WORKER" : "EARNROOM",
      note: "Approved EarnRoom branding, call to action and end card applied.",
    },
    {
      phase: "VALIDATING_OUTPUT",
      owner: "EARNROOM",
      note: "The real file is measured and the branding checked before it is trusted.",
    },
    {
      phase: "UPLOADING_TO_EARNROOM",
      owner: "EARNROOM",
      note: "Stored privately in EarnRoom storage.",
    },
  ];
}

/**
 * Resolves a worker and produces the execution plan.
 *
 * "Choose for me" walks the free routes only and stops before paid compute.
 * An explicit paid choice still needs both the global switch and a
 * confirmation tied to this specific generation.
 */
export function planExecution(input: {
  preference: WorkerPreference;
  workers: readonly WorkerDescriptor[];
  request: GenerationRequest;
  paidComputeEnabled: boolean;
  confirmedPaid?: boolean;
  generationPaused?: boolean;
  requiredCapability?: CapabilityClass;
  spend?: { caps: SpendCaps; counts: SpendCounts };
  /** MANUAL by default: founder-initiated work is never budget-limited. */
  initiator?: GenerationInitiator;
  infrastructurePencePerGpuMinute?: number | null;
  gpuMinutes?: number | null;
}): ExecutionPlan {
  if (input.generationPaused === true) {
    return {
      ok: false,
      status: "GENERATION_PAUSED",
      message: planFailureMessage("GENERATION_PAUSED"),
      offerPaid: false,
      rejections: [],
    };
  }

  if (input.preference === "PAID_CLOUD" && !input.paidComputeEnabled) {
    return {
      ok: false,
      status: "PAID_GENERATION_DISABLED",
      message: planFailureMessage("PAID_GENERATION_DISABLED"),
      offerPaid: false,
      rejections: [],
    };
  }

  const selection = selectWorker({
    preference: input.preference,
    workers: input.workers,
    request: input.request,
    paidComputeEnabled: input.paidComputeEnabled,
    ...(input.confirmedPaid === undefined ? {} : { confirmedPaid: input.confirmedPaid }),
    ...(input.requiredCapability ? { requiredCapability: input.requiredCapability } : {}),
  });

  if (!selection.ok) {
    const status: PlanFailure =
      selection.status === "PAID_CONFIRMATION_REQUIRED"
        ? "PAID_CONFIRMATION_REQUIRED"
        : selection.status === "NO_WORKER_AVAILABLE"
          ? "NO_WORKER_AVAILABLE"
          : "WORKER_UNAVAILABLE";
    return {
      ok: false,
      status,
      message:
        status === "WORKER_UNAVAILABLE" && input.preference !== "AUTO"
          ? (selection.message ?? planFailureMessage(status, input.preference as WorkerMode))
          : selection.message,
      offerPaid: selection.offerPaid,
      rejections: selection.rejections,
    };
  }

  const worker = selection.worker;
  const cost = costReport({
    mode: worker.mode,
    provider: worker.provider ?? null,
    resolution: input.request.resolution,
    seconds: input.request.seconds,
    infrastructurePencePerGpuMinute: input.infrastructurePencePerGpuMinute ?? null,
    gpuMinutes: input.gpuMinutes ?? null,
  });

  if (input.spend) {
    const decision = checkSpend(cost, input.spend.counts, input.spend.caps);
    if (!decision.allowed) {
      return {
        ok: false,
        status: "SPEND_LIMIT_REACHED",
        message: decision.reason,
        offerPaid: false,
        rejections: [],
      };
    }
  }

  return {
    ok: true,
    route: worker.mode,
    workerId: worker.id,
    workerLabel: worker.label,
    provider: worker.provider ?? null,
    reason: selection.reason,
    cost,
    chargeable: cost.chargeable,
    stages: stagesFor(worker.mode, input.request),
  };
}
