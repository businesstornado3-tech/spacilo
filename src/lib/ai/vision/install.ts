/**
 * Vision backend installation.
 *
 * Registration order is preference order. The local engine is always present
 * as the final fallback; hosted models are added ahead of it by the AI layer
 * that owns their credentials, using `createRemoteVisionBackend`.
 */
import { localVisionBackend } from "./backend-local";
import { registerVisionBackend, type VisionBackend } from "./backends";

let installed = false;

export function installVisionBackends(hosted: VisionBackend[] = []): void {
  if (installed && hosted.length === 0) return;
  for (const backend of hosted) registerVisionBackend(backend);
  registerVisionBackend(localVisionBackend);
  installed = true;
}

/** Test helper — allows a clean re-install after `clearVisionBackends()`. */
export function markVisionBackendsUninstalled(): void {
  installed = false;
}
