/**
 * AI start-up.
 *
 * One idempotent call wires the platform's engines into the orchestrator.
 * Phase 6B adds remote vendors here and nowhere else.
 */
import { installDiscoveryProviders } from "./providers/discovery";
import { installFraudProvider } from "./providers/fraud";
import { installGuidanceProviders } from "./providers/guidance";
import { installHostProviders } from "./providers/host";
import { installLocalAiProviders } from "./providers/local";
import { installSuitabilityProviders } from "./providers/suitability";
import { installVisionProProviders } from "./providers/vision-pro";

let installed = false;

export function installSpaciloAi(): void {
  if (installed) return;
  installLocalAiProviders();
  installVisionProProviders();
  installSuitabilityProviders();
  installHostProviders();
  installDiscoveryProviders();
  installGuidanceProviders();
  installFraudProvider();
  installed = true;
}


export function isAiInstalled(): boolean {
  return installed;
}

/** Test helper — allows a clean re-install after `resetAiProviders()`. */
export function markAiUninstalled(): void {
  installed = false;
}
