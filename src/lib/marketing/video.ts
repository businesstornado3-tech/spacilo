/**
 * Provider-neutral video generation.
 *
 * No provider is hard-wired. When nothing is configured the engine reports
 * `PROVIDER_NOT_CONFIGURED` and the founder console says so plainly — it never
 * claims a video exists when it does not.
 */
import type { VideoGenerationProvider, VideoRequest, VideoResult, ProviderState } from "./types";

const registry = new Map<string, VideoGenerationProvider>();

export function registerVideoProvider(provider: VideoGenerationProvider): void {
  registry.set(provider.id, provider);
}

export function unregisterVideoProvider(id: string): void {
  registry.delete(id);
}

export function resetVideoProviders(): void {
  registry.clear();
}

export function listVideoProviders(): VideoGenerationProvider[] {
  return [...registry.values()];
}

/** The first provider that is actually connected, or null. */
export function activeVideoProvider(): VideoGenerationProvider | null {
  for (const provider of registry.values()) {
    if (provider.state === "CONNECTED" && provider.capabilities.video) return provider;
  }
  return null;
}

export function videoProviderState(): { state: ProviderState; detail: string } {
  const providers = listVideoProviders();
  if (providers.length === 0) {
    return { state: "NOT_CONFIGURED", detail: "No video generation provider is configured." };
  }
  const connected = activeVideoProvider();
  if (connected) return { state: "CONNECTED", detail: `${connected.name} is connected.` };
  const errored = providers.find((provider) => provider.state === "ERROR");
  if (errored) return { state: "ERROR", detail: `${errored.name} reported an error.` };
  return { state: "NOT_CONFIGURED", detail: "A provider is registered but not connected." };
}

/**
 * Requests a render. Returns an honest failure when no provider is available —
 * never a placeholder URL presented as a finished video.
 */
export async function generateVideo(request: VideoRequest): Promise<VideoResult> {
  const provider = activeVideoProvider();
  if (!provider) {
    return {
      ok: false,
      status: "PROVIDER_NOT_CONFIGURED",
      providerId: null,
      reason: "Video generation provider not configured.",
    };
  }
  try {
    return await provider.generate(request);
  } catch (error) {
    return {
      ok: false,
      status: "FAILED",
      providerId: provider.id,
      reason: error instanceof Error ? error.message : "Video generation failed.",
    };
  }
}
