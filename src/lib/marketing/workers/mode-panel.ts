/**
 * The four founder-facing video generation modes.
 *
 * This is the simple layer on top of the existing worker registry: it turns
 * real worker descriptors into four plain cards — Browser, Computer, Free
 * Cloud, Paid Cloud — with human statuses and a single action each. It adds no
 * new execution route: every mode maps onto an existing `WorkerMode`.
 *
 * Honesty rules kept from the registry: a card is only available when a real
 * worker has reported a usable status, paid cloud is never available while it
 * is switched off, and nothing here ever falls back to a paid route.
 *
 * Pure module: no clock, no network, no database.
 */
import { READY_STATUSES } from "./types";
import type { WorkerDescriptor, WorkerMode } from "./types";

export type SimpleModeStatus =
  | "ACTIVE"
  | "AVAILABLE"
  | "CONNECTED"
  | "BUSY"
  | "OFFLINE"
  | "NOT INSTALLED"
  | "NOT AVAILABLE"
  | "DISABLED";

/** The single action a card offers. Nothing technical is ever exposed. */
export type SimpleModeAction = "SELECT" | "INSTALL" | "START" | "ENABLE_PAID" | "NONE";

export type SimpleModeCard = {
  mode: WorkerMode;
  title: string;
  description: string;
  status: SimpleModeStatus;
  /** Extra plain sentence under the status. Null when nothing to say. */
  statusNote: string | null;
  costLine: string;
  available: boolean;
  selected: boolean;
  actionLabel: string;
  action: SimpleModeAction;
  /** Why this mode cannot run right now, in founder words. */
  blockedMessage: string | null;
};

export const SIMPLE_MODES: readonly WorkerMode[] = ["BROWSER", "LOCAL", "FREE_CLOUD", "PAID_CLOUD"];

const COPY: Record<WorkerMode, { title: string; description: string; cost: string }> = {
  BROWSER: {
    title: "Browser Mode",
    description: "Generate directly in this browser at no cloud cost.",
    cost: "£0 generation cost",
  },
  LOCAL: {
    title: "Computer Mode",
    description:
      "Use the EarnRoom Video Worker on your computer for higher-quality local generation.",
    cost: "£0 generation cost",
  },
  FREE_CLOUD: {
    title: "Free Cloud",
    description: "Generate using an available free cloud worker. No paid generation.",
    cost: "£0 generation cost",
  },
  PAID_CLOUD: {
    title: "Paid Cloud",
    description: "Use higher-performance cloud generation when enabled.",
    cost: "Confirmation required before every paid video",
  },
};

export const BROWSER_UNAVAILABLE_MESSAGE =
  "Browser Mode isn't available in this browser. Try Computer Mode or Free Cloud.";
export const FREE_CLOUD_UNAVAILABLE_MESSAGE = "Free Cloud is currently unavailable.";
export const PAID_CLOUD_DISABLED_MESSAGE = "Paid cloud generation is currently disabled.";
export const COMPUTER_START_MESSAGE = "Start the EarnRoom Video Worker on your computer.";

function ready(worker: WorkerDescriptor | null): boolean {
  return Boolean(worker && worker.enabled && READY_STATUSES.includes(worker.status));
}

function card(base: SimpleModeCard): SimpleModeCard {
  return base;
}

/**
 * Builds the four cards. `browserSupported` comes from the device itself; a
 * missing probe is treated as "not yet known", never as supported.
 */
export function simpleModeCards(input: {
  workers: readonly WorkerDescriptor[];
  paidComputeEnabled: boolean;
  selected: WorkerMode | null;
  browserSupported: boolean | null;
}): SimpleModeCard[] {
  const find = (mode: WorkerMode) => input.workers.find((worker) => worker.mode === mode) ?? null;

  return SIMPLE_MODES.map((mode) => {
    const worker = find(mode);
    const copy = COPY[mode];
    const selected = input.selected === mode;
    const shell = {
      mode,
      title: copy.title,
      description: copy.description,
      costLine: copy.cost,
      selected,
      statusNote: null as string | null,
    };

    if (mode === "BROWSER") {
      const supported = input.browserSupported !== false && ready(worker);
      if (!supported) {
        return card({
          ...shell,
          status: "NOT AVAILABLE",
          available: false,
          action: "NONE",
          actionLabel: "Use Browser Mode",
          blockedMessage: BROWSER_UNAVAILABLE_MESSAGE,
        });
      }
      return card({
        ...shell,
        status: selected ? "ACTIVE" : "AVAILABLE",
        available: true,
        action: "SELECT",
        actionLabel: "Use Browser Mode",
        blockedMessage: null,
      });
    }

    if (mode === "LOCAL") {
      if (!worker) {
        return card({
          ...shell,
          status: "NOT INSTALLED",
          statusNote: "Computer Worker not installed",
          available: false,
          action: "INSTALL",
          actionLabel: "Install Computer Worker",
          blockedMessage:
            "Computer Mode is currently unavailable. Install the EarnRoom Video Worker or choose another mode.",
        });
      }
      if (worker.status === "BUSY") {
        return card({
          ...shell,
          status: "BUSY",
          statusNote: "Computer Worker is finishing another video",
          available: false,
          action: "NONE",
          actionLabel: "Use Computer Mode",
          blockedMessage:
            "Computer Mode is busy right now. Wait for it to finish, or choose another mode.",
        });
      }
      if (!ready(worker)) {
        return card({
          ...shell,
          status: "OFFLINE",
          statusNote: "Computer Worker offline",
          available: false,
          action: "START",
          actionLabel: "Start Computer Worker",
          blockedMessage: `Computer Mode is currently unavailable. ${COMPUTER_START_MESSAGE}`,
        });
      }
      return card({
        ...shell,
        status: selected ? "ACTIVE" : "CONNECTED",
        statusNote: "Computer Worker connected",
        available: true,
        action: "SELECT",
        actionLabel: "Use Computer Mode",
        blockedMessage: null,
      });
    }

    if (mode === "FREE_CLOUD") {
      if (worker && worker.status === "BUSY") {
        return card({
          ...shell,
          status: "BUSY",
          available: false,
          action: "NONE",
          actionLabel: "Use Free Cloud",
          blockedMessage: "The free cloud worker is busy right now. Choose another mode or wait.",
        });
      }
      if (!ready(worker)) {
        return card({
          ...shell,
          status: worker ? "NOT AVAILABLE" : "NOT AVAILABLE",
          statusNote: FREE_CLOUD_UNAVAILABLE_MESSAGE,
          available: false,
          action: "NONE",
          actionLabel: "Use Free Cloud",
          blockedMessage:
            "Free Cloud is currently unavailable. Choose Browser Mode, Computer Mode, or enable Paid Cloud.",
        });
      }
      return card({
        ...shell,
        status: selected ? "ACTIVE" : "AVAILABLE",
        statusNote: "Connected",
        available: true,
        action: "SELECT",
        actionLabel: "Use Free Cloud",
        blockedMessage: null,
      });
    }

    // PAID_CLOUD
    if (!input.paidComputeEnabled) {
      return card({
        ...shell,
        status: "DISABLED",
        statusNote: PAID_CLOUD_DISABLED_MESSAGE,
        available: false,
        action: "ENABLE_PAID",
        actionLabel: "Enable Paid Cloud",
        blockedMessage: "Paid Cloud is disabled. Enable Paid Cloud before using this mode.",
      });
    }
    if (!ready(worker)) {
      return card({
        ...shell,
        status: "NOT AVAILABLE",
        statusNote:
          "High-performance cloud generation is available once a paid worker is connected.",
        available: false,
        action: "NONE",
        actionLabel: "Use Paid Cloud",
        blockedMessage: "Paid Cloud is currently unavailable. Choose another mode.",
      });
    }
    return card({
      ...shell,
      status: selected ? "ACTIVE" : "AVAILABLE",
      statusNote: "High-performance cloud generation is available.",
      available: true,
      action: "SELECT",
      actionLabel: "Use Paid Cloud",
      blockedMessage: null,
    });
  });
}

/**
 * Gate run before a generation starts. It never switches mode on the founder's
 * behalf and never promotes a free choice to a paid one.
 */
export function validateModeSelection(
  cards: readonly SimpleModeCard[],
  selected: WorkerMode | null,
): { ok: boolean; message: string | null } {
  if (!selected) return { ok: false, message: "Choose a video generation mode first." };
  const chosen = cards.find((entry) => entry.mode === selected) ?? null;
  if (!chosen) return { ok: false, message: "Choose a video generation mode first." };
  if (!chosen.available) return { ok: false, message: chosen.blockedMessage };
  return { ok: true, message: null };
}

/** The two short lines shown immediately above the Generate video button. */
export function generationSummary(input: {
  cards: readonly SimpleModeCard[];
  selected: WorkerMode | null;
  paidComputeEnabled: boolean;
}): { modeLine: string; paidLine: string | null; costLine: string } {
  const chosen = input.cards.find((entry) => entry.mode === input.selected) ?? null;
  if (!chosen) {
    return {
      modeLine: "Generation mode: none selected",
      paidLine: null,
      costLine: "Cost protection: no generation can start",
    };
  }
  if (chosen.mode === "PAID_CLOUD") {
    return {
      modeLine: "Generation mode: Paid Cloud",
      paidLine: `Paid Cloud: ${input.paidComputeEnabled ? "ENABLED" : "DISABLED"}`,
      costLine: "Cost protection: Confirmation required",
    };
  }
  return {
    modeLine: `Generation mode: ${chosen.title}`,
    paidLine: null,
    costLine: "Cost protection: £0",
  };
}
