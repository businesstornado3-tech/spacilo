/**
 * The hosted paid video service as a worker.
 *
 * Paid Cloud on EarnRoom is a hosted provider route, not a machine somebody
 * has to plug in. When the provider is configured server-side there is a real
 * execution route available, so it is described here as an ordinary worker
 * descriptor with no registry row, no endpoint and no token.
 *
 * Two honesty rules are kept: the descriptor only exists when the provider is
 * genuinely configured, and it is always marked chargeable so every existing
 * paid gate (switch on, confirm each video) still applies unchanged.
 *
 * Pure module: no network, no database, no clock.
 */
import { WORKER_LABEL } from "./types";
import type { WorkerDescriptor } from "./types";

export const HOSTED_PAID_PROVIDER_DETAIL =
  "Hosted video generation service, configured server-side.";

/** The paid hosted route, as the orchestrator sees it. */
export function hostedPaidCloudDescriptor(provider: string | null = null): WorkerDescriptor {
  return {
    mode: "PAID_CLOUD",
    id: null,
    label: WORKER_LABEL.PAID_CLOUD,
    status: "IDLE",
    detail: HOSTED_PAID_PROVIDER_DETAIL,
    capability: "HIGH",
    hardware: null,
    provider,
    installedModels: [],
    enabled: true,
    chargeable: true,
    queued: 0,
    lastHeartbeatAt: null,
  };
}

/**
 * Adds the hosted paid route to a worker list.
 *
 * A registered paid worker always wins: if one exists it is the paid route and
 * nothing is added. Nothing is added either when the provider is not
 * configured, so the founder is never told a paid route is ready when it isn't.
 */
export function withHostedPaidCloud(
  workers: readonly WorkerDescriptor[],
  input: { providerConfigured: boolean; provider?: string | null },
): WorkerDescriptor[] {
  const list = [...workers];
  if (!input.providerConfigured) return list;
  if (list.some((worker) => worker.mode === "PAID_CLOUD")) return list;
  list.push(hostedPaidCloudDescriptor(input.provider ?? null));
  return list;
}
