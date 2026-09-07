/**
 * EarnRoom Video Worker — shared contracts.
 *
 * A "worker" is an execution engine for one video generation job. Four modes
 * exist and they are never interchangeable in the record: what is persisted is
 * the route the pixels were actually made on, never the route we hoped for.
 *
 * Pure module: types and constants only, no clock, no network, no vendor SDK.
 */

/** The four execution modes. Nothing else may be persisted. */
export type WorkerMode = "BROWSER" | "LOCAL" | "FREE_CLOUD" | "PAID_CLOUD";

export const WORKER_MODES: readonly WorkerMode[] = [
  "BROWSER",
  "LOCAL",
  "FREE_CLOUD",
  "PAID_CLOUD",
];

/** Founder-facing preference. AUTO lets the orchestrator decide. */
export type WorkerPreference = "AUTO" | WorkerMode;

export const WORKER_LABEL: Record<WorkerMode, string> = {
  BROWSER: "Browser Local",
  LOCAL: "EarnRoom Local Worker",
  FREE_CLOUD: "Free Cloud Worker",
  PAID_CLOUD: "Paid Cloud Worker",
};

/**
 * Normalised hardware capability. Deterministic rules decide this — never a
 * model's opinion — so the same machine always reports the same class.
 */
export type CapabilityClass = "LIMITED" | "MEDIUM" | "HIGH" | "VERY_HIGH";

export const CAPABILITY_ORDER: Record<CapabilityClass, number> = {
  LIMITED: 1,
  MEDIUM: 2,
  HIGH: 3,
  VERY_HIGH: 4,
};

export const CAPABILITY_LABEL: Record<CapabilityClass, string> = {
  LIMITED: "Limited",
  MEDIUM: "Medium",
  HIGH: "High",
  VERY_HIGH: "Very high",
};

/** Live state a worker reports about itself. */
export type WorkerRuntimeStatus =
  | "ONLINE"
  | "IDLE"
  | "BUSY"
  | "LOADING_MODEL"
  | "MODEL_READY"
  | "OFFLINE"
  | "ERROR"
  | "AUTHENTICATION_FAILED"
  | "QUOTA_EXHAUSTED"
  | "PAUSED";

export const RUNTIME_STATUS_LABEL: Record<WorkerRuntimeStatus, string> = {
  ONLINE: "Online",
  IDLE: "Ready",
  BUSY: "Busy",
  LOADING_MODEL: "Loading the model",
  MODEL_READY: "Ready",
  OFFLINE: "Offline",
  ERROR: "Worker error",
  AUTHENTICATION_FAILED: "Authentication failed",
  QUOTA_EXHAUSTED: "Free allowance used up",
  PAUSED: "Paused",
};

/** Statuses that can accept a new job right now. */
export const READY_STATUSES: readonly WorkerRuntimeStatus[] = [
  "ONLINE",
  "IDLE",
  "MODEL_READY",
];

/**
 * Raw hardware as a worker reports it. Every field is optional because a
 * machine may not expose it, and an unknown value is never invented.
 */
export type HardwareReport = {
  os?: string | null;
  cpu?: string | null;
  cpuCores?: number | null;
  ramGb?: number | null;
  gpuVendor?: string | null;
  gpuModel?: string | null;
  /** Memory physically on the card. */
  dedicatedVramGb?: number | null;
  /** System memory the GPU may borrow. Never counted as VRAM. */
  sharedGpuMemoryGb?: number | null;
  accelerator?: string | null;
  precisions?: readonly string[] | null;
  diskFreeGb?: number | null;
  installedModels?: readonly string[] | null;
};

export type HardwareProfile = {
  os: string | null;
  cpu: string | null;
  cpuCores: number | null;
  ramGb: number | null;
  gpuVendor: string | null;
  gpuModel: string | null;
  dedicatedVramGb: number | null;
  sharedGpuMemoryGb: number | null;
  accelerator: string | null;
  precisions: readonly string[];
  diskFreeGb: number | null;
  installedModels: readonly string[];
  capability: CapabilityClass;
  /** Plain-English reason for the capability class. */
  capabilityReason: string;
  /** True when the only GPU memory available is borrowed system memory. */
  sharedMemoryOnly: boolean;
};

/** What a job asks for. */
export type GenerationRequest = {
  seconds: number;
  resolution: string;
  aspect: "9:16" | "16:9" | "1:1";
  /** Voiceover wanted for this generation. */
  voice: boolean;
  /** Music bed wanted for this generation. */
  music: boolean;
};

/** A worker as the orchestrator sees it. */
export type WorkerDescriptor = {
  mode: WorkerMode;
  /** Row id for a registered local worker; null for built-in modes. */
  id: string | null;
  label: string;
  status: WorkerRuntimeStatus;
  detail: string;
  capability: CapabilityClass;
  hardware: HardwareProfile | null;
  /** Provider name where a third party runs the compute. */
  provider: string | null;
  /** Models this worker can actually run right now. */
  installedModels: readonly string[];
  /** Enabled by founder settings (paid compute is off by default). */
  enabled: boolean;
  /** True when using this worker can produce a third-party charge. */
  chargeable: boolean;
  queued: number;
  lastHeartbeatAt: string | null;
};
