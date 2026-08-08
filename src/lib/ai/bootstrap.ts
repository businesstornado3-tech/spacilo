/**
 * AI start-up.
 *
 * One idempotent call wires the platform's engines into the orchestrator.
 * Phase 6B adds remote vendors here and nowhere else.
 */
import { installLocalAiProviders } from "./providers/local";

let installed = false;

export function installSpaciloAi(): void {
  if (installed) return;
  installLocalAiProviders();
  installed = true;
}

export function isAiInstalled(): boolean {
  return installed;
}

/** Test helper — allows a clean re-install after `resetAiProviders()`. */
export function markAiUninstalled(): void {
  installed = false;
}
