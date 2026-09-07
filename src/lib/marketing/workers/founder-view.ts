/**
 * Founder-facing view of the four video routes.
 *
 * Pure module: it turns a real worker descriptor into the words the founder
 * reads. It never invents a connection — a card only says READY when a real
 * worker has checked in and reported a usable status, and a paid route is
 * never described as free or automatically selectable.
 */
import { CAPABILITY_LABEL, READY_STATUSES } from "./types";
import type { WorkerDescriptor, WorkerMode } from "./types";

export type CardStatus =
  | "READY"
  | "CONNECTED"
  | "BUSY"
  | "LIMITED"
  | "PAUSED"
  | "NOT CONNECTED"
  | "ACTION REQUIRED"
  | "DISABLED"
  | "ENABLED";

export type FounderCard = {
  mode: WorkerMode;
  title: string;
  badge: string;
  /** What this route produces, in plain words. */
  output: string;
  description: string;
  costLine: string;
  status: CardStatus;
  /** True when "Generate video" may run on this route right now. */
  selectable: boolean;
  actionLabel: string;
  /** Why generation cannot run, and what to do. Null when it can. */
  blockedMessage: string | null;
  capabilityNote: string | null;
};

const COPY: Record<
  WorkerMode,
  { title: string; badge: string; output: string; description: string; cost: string }
> = {
  BROWSER: {
    title: "Browser",
    badge: "Free",
    output: "Animated video",
    description:
      "Make an animated video directly in this browser. No installation and no third-party video-generation service required.",
    cost: "Third-party video-generation cost: £0",
  },
  LOCAL: {
    title: "My computer",
    badge: "Free",
    output: "Local AI video",
    description:
      "Generate videos using your own computer locally. No third-party video-generation fee.",
    cost: "Third-party video-generation cost: £0",
  },
  FREE_CLOUD: {
    title: "Free cloud",
    badge: "Free",
    output: "AI video",
    description:
      "Use a connected free GPU worker to generate AI video while its free allowance is available.",
    cost: "Third-party video-generation cost: £0 while within the worker's free allowance.",
  },
  PAID_CLOUD: {
    title: "Paid cloud",
    badge: "Optional",
    output: "Paid AI video",
    description: "Use a paid GPU service for video generation.",
    cost: "Estimated generation cost only — never shown as a charge until the provider confirms one.",
  },
};

/** Plain-English guidance when a chosen route cannot run. */
export function connectGuidance(mode: WorkerMode): string {
  switch (mode) {
    case "LOCAL":
      return "My computer isn't connected yet. Connect the EarnRoom Video Worker on your computer before generating with this option.";
    case "FREE_CLOUD":
      return "No free cloud worker is connected yet. Connect a free cloud worker before generating with this option.";
    case "PAID_CLOUD":
      return "Paid generation is disabled. Enable paid cloud, then confirm each paid video on its own.";
    case "BROWSER":
      return "Animated video cannot be made in this browser.";
  }
}

/**
 * The card for one route. `worker` is the real registry/probe descriptor, or
 * null when nothing has ever checked in for that mode.
 */
export function founderCard(input: {
  mode: WorkerMode;
  worker: WorkerDescriptor | null;
  paidComputeEnabled: boolean;
  costLine?: string;
}): FounderCard {
  const { mode, worker, paidComputeEnabled } = input;
  const copy = COPY[mode];
  const base = {
    mode,
    title: copy.title,
    badge: copy.badge,
    output: copy.output,
    description: copy.description,
    costLine: input.costLine?.trim() ? input.costLine : copy.cost,
    capabilityNote: worker ? `Capability: ${CAPABILITY_LABEL[worker.capability]}` : null,
  };

  if (mode === "PAID_CLOUD" && !paidComputeEnabled) {
    return {
      ...base,
      status: "DISABLED",
      selectable: false,
      actionLabel: "Enable paid cloud",
      blockedMessage: connectGuidance("PAID_CLOUD"),
    };
  }

  if (!worker) {
    return {
      ...base,
      status: "NOT CONNECTED",
      selectable: false,
      actionLabel: mode === "LOCAL" ? "Set up my computer" : "Set up free cloud",
      blockedMessage: connectGuidance(mode),
    };
  }

  if (!worker.enabled) {
    return {
      ...base,
      status: "PAUSED",
      selectable: false,
      actionLabel: "Switch it back on",
      blockedMessage: `${copy.title} is switched off in advanced administration.`,
    };
  }

  if (READY_STATUSES.includes(worker.status)) {
    const limited = worker.capability === "LIMITED";
    return {
      ...base,
      status: mode === "PAID_CLOUD" ? "ENABLED" : limited ? "LIMITED" : "READY",
      selectable: true,
      actionLabel: `Select ${copy.title}`,
      blockedMessage: null,
      capabilityNote: limited
        ? `Connected — Limited. This machine can run lightweight local generation, but does not meet the recommended hardware for cinematic generation.`
        : base.capabilityNote,
    };
  }

  if (worker.status === "BUSY") {
    return {
      ...base,
      status: "BUSY",
      selectable: false,
      actionLabel: "Wait for it to finish",
      blockedMessage: `${copy.title} is connected but currently busy.`,
    };
  }

  if (worker.status === "QUOTA_EXHAUSTED") {
    return {
      ...base,
      status: "ACTION REQUIRED",
      selectable: false,
      actionLabel: "Choose another worker",
      blockedMessage:
        mode === "FREE_CLOUD"
          ? "Free cloud allowance is currently unavailable."
          : `${copy.title} has used up its allowance.`,
    };
  }

  if (worker.status === "AUTHENTICATION_FAILED" || worker.status === "ERROR") {
    return {
      ...base,
      status: "ACTION REQUIRED",
      selectable: false,
      actionLabel: "Check the worker",
      blockedMessage: worker.detail || `${copy.title} reported an error.`,
    };
  }

  return {
    ...base,
    status: "NOT CONNECTED",
    selectable: false,
    actionLabel: mode === "LOCAL" ? "Set up my computer" : "Set up free cloud",
    blockedMessage: worker.detail || connectGuidance(mode),
  };
}

export const CARD_ORDER: readonly WorkerMode[] = ["BROWSER", "LOCAL", "FREE_CLOUD", "PAID_CLOUD"];

/** Cards in founder order, one per mode. */
export function founderCards(input: {
  workers: readonly WorkerDescriptor[];
  paidComputeEnabled: boolean;
  costLines?: readonly { mode: WorkerMode; line: string }[];
}): FounderCard[] {
  return CARD_ORDER.map((mode) => {
    const all = input.workers.filter((worker) => worker.mode === mode);
    const worker =
      all.find((entry) => entry.enabled && READY_STATUSES.includes(entry.status)) ?? all[0] ?? null;
    const costLine = input.costLines?.find((entry) => entry.mode === mode)?.line;
    return founderCard({
      mode,
      worker,
      paidComputeEnabled: input.paidComputeEnabled,
      ...(costLine ? { costLine } : {}),
    });
  });
}
