/**
 * "Set up my computer" — the founder-facing setup journey.
 *
 * Pure module. It turns real signals (was a setup session created, was the
 * installer downloaded, did a machine claim the session, did it report in,
 * did it describe its hardware) into the plain wording shown on screen.
 *
 * Nothing here invents progress: every stage below is entered only when the
 * signal that proves it has actually arrived.
 */
import { CAPABILITY_ORDER, type CapabilityClass, type HardwareProfile } from "./types";

export type SetupStage =
  | "IDLE"
  | "PREPARING"
  | "DOWNLOADING"
  | "INSTALLING"
  | "STARTING"
  | "CONNECTING"
  | "DETECTING"
  | "CONNECTED"
  | "EXPIRED"
  | "UNAVAILABLE";

export const SETUP_STAGE_LABEL: Record<SetupStage, string> = {
  IDLE: "Set up my computer",
  PREPARING: "Preparing your computer…",
  DOWNLOADING: "Downloading EarnRoom Video Worker…",
  INSTALLING: "Installing EarnRoom Video Worker…",
  STARTING: "Starting worker…",
  CONNECTING: "Connecting to EarnRoom…",
  DETECTING: "Detecting hardware…",
  CONNECTED: "Computer connected.",
  EXPIRED: "Setup timed out.",
  UNAVAILABLE: "Installer not available.",
};

/** The ordered journey shown as a checklist while setup runs. */
export const SETUP_JOURNEY: readonly SetupStage[] = [
  "PREPARING",
  "DOWNLOADING",
  "INSTALLING",
  "STARTING",
  "CONNECTING",
  "DETECTING",
  "CONNECTED",
];

/** How long a setup session may sit unclaimed before we stop waiting. */
export const SETUP_WINDOW_MINUTES = 30;

const CODE_PATTERN = /^EarnRoom-Video-Worker-Setup-([A-Z0-9]{6,16})\.exe$/;

/**
 * The download is named after the setup session, so the installer can pair
 * itself from its own filename. The founder never reads, types or copies the
 * code, and it stops working the moment it is used or expires.
 */
export function installerFileName(code: string): string {
  return `EarnRoom-Video-Worker-Setup-${code.toUpperCase().replace(/[^A-Z0-9]/g, "")}.exe`;
}

/** Reads the setup code back out of an installer filename. */
export function pairingCodeFromFileName(fileName: string): string | null {
  const match = CODE_PATTERN.exec(fileName.trim());
  return match ? match[1]! : null;
}

export type SetupSignals = {
  /** The founder has pressed the button and a session exists. */
  sessionCreated: boolean;
  /** The browser was handed the real installer file. */
  downloadStarted: boolean;
  /** A machine exchanged the session for its own key. */
  claimed: boolean;
  /** The worker has reported in at least once. */
  heartbeatAt: string | null;
  /** The worker described its hardware. */
  hardware: HardwareProfile | null;
  /** The session window has passed without a machine claiming it. */
  expired: boolean;
  /** A real installer file is published and downloadable. */
  installerAvailable: boolean;
};

export type SetupView = {
  stage: SetupStage;
  label: string;
  detail: string;
  /** Stages already passed, for the checklist. */
  completed: readonly SetupStage[];
  /** True once a real machine is connected and describable. */
  connected: boolean;
};

/** Turns the signals into exactly one honest stage. */
export function setupView(signals: SetupSignals): SetupView {
  const at = (stage: SetupStage, detail: string): SetupView => ({
    stage,
    label: SETUP_STAGE_LABEL[stage],
    detail,
    completed: SETUP_JOURNEY.slice(0, Math.max(0, SETUP_JOURNEY.indexOf(stage))),
    connected: stage === "CONNECTED",
  });

  if (!signals.installerAvailable) {
    return at(
      "UNAVAILABLE",
      "The Windows installer has not been published yet, so there is nothing genuine to download. Nothing is pretended here.",
    );
  }
  if (!signals.sessionCreated) {
    return at("IDLE", "Connect this computer, or another Windows computer, to make videos here.");
  }
  if (signals.heartbeatAt && signals.hardware) {
    return at("CONNECTED", "Your computer has reported in with what it can actually do.");
  }
  if (signals.heartbeatAt) {
    return at("DETECTING", "The worker is reading this machine's graphics card and memory.");
  }
  if (signals.claimed) {
    return at("CONNECTING", "The worker has started and is connecting to EarnRoom.");
  }
  if (signals.expired) {
    return at(
      "EXPIRED",
      "No computer connected within 30 minutes. Start setup again when you are at the machine.",
    );
  }
  if (signals.downloadStarted) {
    return at(
      "INSTALLING",
      "Open the downloaded EarnRoom Video Worker installer to continue. This page updates by itself once the worker starts.",
    );
  }
  return at("DOWNLOADING", "Your download is starting.");
}

export type CapabilityVerdict = {
  word: "READY" | "LIMITED";
  headline: string;
  detail: string;
};

/**
 * What the connected machine can honestly do. A machine without usable
 * graphics memory is connected and useful for short clips, but it is never
 * described as ready for cinematic generation.
 */
export function capabilityVerdict(profile: HardwareProfile): CapabilityVerdict {
  const ready = CAPABILITY_ORDER[profile.capability] >= CAPABILITY_ORDER["MEDIUM" as CapabilityClass];
  return {
    word: ready ? "READY" : "LIMITED",
    headline: ready ? "Capability: READY" : "Capability: LIMITED",
    detail: ready
      ? `${profile.capabilityReason} This computer can make videos here.`
      : `${profile.capabilityReason} This computer can still make short, simple animated videos, but not cinematic ones — those will use another route.`,
  };
}
