/**
 * AI provider manager.
 *
 * The only place that knows which engine serves which capability. Order comes
 * from configuration, so switching or adding a vendor is a config change plus
 * one `registerAiProvider` call — never a UI change.
 */
import { capabilityConfig } from "./config";
import { AiError } from "./errors";
import { isFlagEnabled } from "./flags";
import type { AiCapability, AiProvider } from "./types";

const registry = new Map<string, AiProvider<never, never>>();
const disabled = new Set<string>();

export function registerAiProvider<I, O>(provider: AiProvider<I, O>): void {
  registry.set(provider.id, provider as unknown as AiProvider<never, never>);
}

export function unregisterAiProvider(id: string): void {
  registry.delete(id);
}

export function getAiProvider(id: string): AiProvider | undefined {
  return registry.get(id) as AiProvider | undefined;
}

export function setProviderEnabled(id: string, enabled: boolean): void {
  if (enabled) disabled.delete(id);
  else disabled.add(id);
}

export function listAiProviders(): AiProvider[] {
  return [...registry.values()] as AiProvider[];
}

/**
 * Providers that can serve a capability, most preferred first. Anything not
 * registered, disabled, or remote while remote calls are off is filtered out.
 */
export function providersFor(capability: AiCapability): AiProvider[] {
  const config = capabilityConfig(capability);
  const allowRemote = isFlagEnabled("remoteProviders");
  const ordered: AiProvider[] = [];

  for (const id of config.providers) {
    const provider = registry.get(id) as AiProvider | undefined;
    if (!provider || disabled.has(id)) continue;
    if (provider.remote && !allowRemote) continue;
    if (!provider.capabilities.includes(capability)) continue;
    ordered.push(provider);
  }

  // Anything registered for the capability but not named in config becomes a
  // last-resort fallback, so a newly registered engine is never stranded.
  for (const provider of registry.values() as Iterable<AiProvider>) {
    if (ordered.some((entry) => entry.id === provider.id)) continue;
    if (disabled.has(provider.id)) continue;
    if (provider.remote && !allowRemote) continue;
    if (provider.kind !== config.kind) continue;
    if (!provider.capabilities.includes(capability)) continue;
    ordered.push(provider);
  }

  return ordered;
}

export function requireProvidersFor(capability: AiCapability): AiProvider[] {
  const providers = providersFor(capability);
  if (providers.length === 0) throw new AiError("provider_unavailable", `no provider for ${capability}`);
  return providers;
}

export function resetAiProviders(): void {
  registry.clear();
  disabled.clear();
}
