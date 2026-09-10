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
  | "READY"
  | "CONNECTED"
  | "BUSY"
  | "OFFLINE"
  | "NOT INSTALLED"
  | "SETUP REQUIRED"
  | "INSTALLER NOT AVAILABLE"
  | "NOT AVAILABLE"
  | "CONFIGURATION REQUIRED"
  | "TEMPORARILY UNAVAILABLE";

/** The single action a card offers. Nothing technical is ever exposed. */
export type SimpleModeAction =
  | "SELECT"
  | "INSTALL"
  | "START"
  | "CONNECT_FREE"
  | "NONE";

export type SimpleModeCard = {
  mode: WorkerMode;
  title: string;
  description: string;
  status: SimpleModeStatus;
  /** Extra plain sentence under the status. Null when nothing to say. */
  statusNote: string | null;
  costLine: string;
  /** Honest note about what this mode is not suitable for. */
  limitation: string | null;
  available: boolean;
  selected: boolean;
  actionLabel: string;
  action: SimpleModeAction;
  /** Why this mode cannot run right now, in founder words. */
  blockedMessage: string | null;
};

export const SIMPLE_MODES: readonly WorkerMode[] = ["BROWSER", "LOCAL", "FREE_CLOUD", "PAID_CLOUD"];

const COPY: Record<
  WorkerMode,
  { title: string; description: string; cost: string; limitation: string | null }
> = {
  BROWSER: {
    title: "Browser",
    description:
      "Generate directly in your browser. Branded EarnRoom animation, made at no cost.",
    cost: "£0",
    limitation: "Animated EarnRoom film, not AI-generated live-action footage.",
  },
  LOCAL: {
    title: "Computer",
    description: "Generate using your computer with the EarnRoom Video Worker.",
    cost: "£0",
    limitation: null,
  },
  FREE_CLOUD: {
    title: "Free Cloud",
    description: "Generate using available free cloud capacity.",
    cost: "£0",
    limitation: null,
  },
  PAID_CLOUD: {
    title: "Paid Cloud",
    description: "Higher-quality cloud video generation, switched on by you.",
    cost: "May incur usage charges — the estimated cost is shown before you generate",
    limitation: null,
  },
};

export const BROWSER_UNAVAILABLE_MESSAGE =
  "Browser generation isn't available in this browser. Try Computer Mode or Free Cloud.";
export const FREE_CLOUD_UNAVAILABLE_MESSAGE =
  "No free cloud video worker is currently connected.";
export const PAID_CLOUD_DISABLED_MESSAGE = "Paid generation is switched off.";
export const PAID_CLOUD_CONFIGURATION_MESSAGE =
  "Paid Cloud is enabled, but the video provider is not configured.";
export const INSTALLER_UNAVAILABLE_MESSAGE =
  "The EarnRoom Video Worker installer has not been published yet.";
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
 *
 * Paid Cloud is deliberately NOT tied to a registered worker: it is a hosted
 * provider route, so it is ready when the founder has switched it on and the
 * provider is configured server-side. Checking that costs nothing.
 */
export function simpleModeCards(input: {
  workers: readonly WorkerDescriptor[];
  paidComputeEnabled: boolean;
  selected: WorkerMode | null;
  browserSupported: boolean | null;
  /** Server-side video provider configuration state. */
  paidProviderConfigured?: boolean;
  /** True only when a real Windows installer can be downloaded. */
  installerAvailable?: boolean;
}): SimpleModeCard[] {
  const find = (mode: WorkerMode) => input.workers.find((worker) => worker.mode === mode) ?? null;
  const paidConfigured = input.paidProviderConfigured === true;
  const installerAvailable = input.installerAvailable !== false;

  return SIMPLE_MODES.map((mode) => {
    const worker = find(mode);
    const copy = COPY[mode];
    const selected = input.selected === mode;
    const shell = {
      mode,
      title: copy.title,
      description: copy.description,
      costLine: copy.cost,
      limitation: copy.limitation,
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
          actionLabel: "Use Browser",
          blockedMessage: BROWSER_UNAVAILABLE_MESSAGE,
        });
      }
      return card({
        ...shell,
        status: selected ? "ACTIVE" : "AVAILABLE",
        available: true,
        action: "SELECT",
        actionLabel: "Use Browser",
        blockedMessage: null,
      });
    }

    if (mode === "LOCAL") {
      if (!worker) {
        if (!installerAvailable) {
          return card({
            ...shell,
            status: "INSTALLER NOT AVAILABLE",
            statusNote: INSTALLER_UNAVAILABLE_MESSAGE,
            available: false,
            action: "NONE",
            actionLabel: "Download & Install",
            blockedMessage: `Computer Mode is currently unavailable. ${INSTALLER_UNAVAILABLE_MESSAGE}`,
          });
        }
        return card({
          ...shell,
          status: "SETUP REQUIRED",
          statusNote:
            "No computer has been paired yet. Install the EarnRoom Video Worker, or pair a computer that already has it.",
          available: false,
          action: "INSTALL",
          actionLabel: "Set up my computer",
          blockedMessage:
            "Computer Mode is currently unavailable. Set up your computer, or choose another mode.",
        });
      }
      if (worker.status === "BUSY") {
        return card({
          ...shell,
          status: "BUSY",
          statusNote: "Your computer is finishing another video",
          available: false,
          action: "NONE",
          actionLabel: "Use Computer",
          blockedMessage:
            "Computer Mode is busy right now. Wait for it to finish, or choose another mode.",
        });
      }
      if (!ready(worker)) {
        return card({
          ...shell,
          status: "OFFLINE",
          statusNote: "Your computer is not connected",
          available: false,
          action: "START",
          actionLabel: "Check Connection",
          blockedMessage: `Computer Mode is currently unavailable. ${COMPUTER_START_MESSAGE}`,
        });
      }
      return card({
        ...shell,
        status: selected ? "ACTIVE" : "CONNECTED",
        statusNote: "Your computer is connected",
        available: true,
        action: "SELECT",
        actionLabel: "Use Computer",
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
          status: "NOT AVAILABLE",
          statusNote: FREE_CLOUD_UNAVAILABLE_MESSAGE,
          available: false,
          action: "NONE",
          actionLabel: "Use Free Cloud",
          blockedMessage: `Free Cloud is currently unavailable. ${FREE_CLOUD_UNAVAILABLE_MESSAGE}`,
        });
      }
      return card({
        ...shell,
        status: selected ? "ACTIVE" : "READY",
        statusNote: "Connected",
        available: true,
        action: "SELECT",
        actionLabel: "Use Free Cloud",
        blockedMessage: null,
      });
    }

    // PAID_CLOUD — a hosted provider route, never a machine to plug in.
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
    if (!paidConfigured) {
      return card({
        ...shell,
        status: "ENABLED — CONFIGURATION REQUIRED",
        statusNote: PAID_CLOUD_CONFIGURATION_MESSAGE,
        available: false,
        action: "DISABLE_PAID",
        actionLabel: "Disable Paid Cloud",
        blockedMessage: PAID_CLOUD_CONFIGURATION_MESSAGE,
      });
    }
    // A registered paid worker overrides the hosted route: if one exists and it
    // is not ready, the paid route really is unavailable right now.
    if (worker && !ready(worker)) {
      return card({
        ...shell,
        status: "ENABLED — TEMPORARILY UNAVAILABLE",
        statusNote: "Paid Cloud is temporarily unavailable.",
        available: false,
        action: "DISABLE_PAID",
        actionLabel: "Disable Paid Cloud",
        blockedMessage: "Paid Cloud is temporarily unavailable. Choose another mode or try later.",
      });
    }
    // Switched on and ready: the single switch is the only paid control, and
    // pressing Generate Paid Video is the confirmation.
    return card({
      ...shell,
      status: "ACTIVE",
      statusNote: "Generate Paid Video starts a paid generation.",
      available: true,
      action: "DISABLE_PAID",
      actionLabel: "Disable Paid Cloud",
      blockedMessage: null,
    });
  });
}

/**
 * One button for every mode. There is exactly one Generate Video action in the
 * studio, whichever route is chosen.
 */
export function generateButtonLabel(_selected: WorkerMode | null): string {
  return "Generate Video";
}

/**
 * The estimated cost line shown immediately before Generate Paid Video, so the
 * button itself is informed consent. There is no second confirmation step.
 */
export function estimatedCostLine(pence: number | null): string {
  if (pence === null || !Number.isFinite(pence)) {
    return "Estimated cost: not known for this video";
  }
  return `Estimated cost: £${(Math.max(0, Math.round(pence)) / 100).toFixed(2)}`;
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
  /** Estimated provider cost of the whole run, in pence. */
  estimatedPence?: number | null;
}): { modeLine: string; paidLine: string | null; costLine: string } {
  const chosen = input.cards.find((entry) => entry.mode === input.selected) ?? null;
  if (!chosen) {
    return {
      modeLine: "Selected generation mode: none selected",
      paidLine: null,
      costLine: "No generation can start until you choose a mode.",
    };
  }
  if (chosen.mode === "PAID_CLOUD") {
    return {
      modeLine: "Selected generation mode: Paid Cloud",
      paidLine: null,
      costLine: estimatedCostLine(input.estimatedPence ?? null),
    };
  }
  return {
    modeLine: `Selected generation mode: ${chosen.title}`,
    paidLine: null,
    costLine: "Cost: £0",
  };
}
