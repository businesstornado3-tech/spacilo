/**
 * Internal linking as an intent graph.
 *
 * Links follow real user progression — scan, then plan, then search — rather
 * than a generic "related pages" block. Every list is capped so a page carries
 * a few high-value links instead of a footer farm.
 */
import { CAPABILITIES, capability, capabilityBySlug, type CapabilityId } from "./capabilities";
import { CLUSTERS, type IntentCluster } from "./clusters";

export type DiscoveryLink = { label: string; to: string; reason: string };

export const MAX_CONTEXTUAL_LINKS = 4;

export function capabilityPath(id: CapabilityId): string {
  return `/tools/${capability(id).slug}`;
}

/** The next steps a person on a capability page genuinely needs. */
export function linksForCapability(id: CapabilityId, max = MAX_CONTEXTUAL_LINKS): DiscoveryLink[] {
  const cap = capability(id);
  const links: DiscoveryLink[] = cap.nextCapabilities.map((next) => ({
    label: capability(next).name,
    to: capabilityPath(next),
    reason: `${cap.name} usually leads to ${capability(next).name}.`,
  }));

  for (const cluster of CLUSTERS) {
    if (links.length >= max) break;
    if (!cluster.publish || !cluster.path.startsWith("/guides/")) continue;
    if (cluster.primary !== id && !cluster.secondary.includes(id)) continue;
    links.push({ label: cluster.title, to: cluster.path, reason: cluster.question });
  }

  return links.slice(0, max);
}

/** The capability path a guide should push people into, plus sibling needs. */
export function linksForCluster(cluster: IntentCluster, max = MAX_CONTEXTUAL_LINKS): DiscoveryLink[] {
  const links: DiscoveryLink[] = [
    {
      label: capability(cluster.primary).cta.label,
      to: capabilityPath(cluster.primary),
      reason: capability(cluster.primary).purpose,
    },
    ...cluster.secondary.map((id) => ({
      label: capability(id).name,
      to: capabilityPath(id),
      reason: capability(id).purpose,
    })),
  ];

  for (const other of CLUSTERS) {
    if (links.length >= max) break;
    if (other.id === cluster.id || !other.publish) continue;
    if (other.primary !== cluster.primary && !cluster.secondary.includes(other.primary)) continue;
    if (!other.path.startsWith("/guides/")) continue;
    links.push({ label: other.title, to: other.path, reason: other.question });
  }

  return links.slice(0, max);
}

/** Every capability page, for hub listings and the sitemap. */
export function capabilityIndex(): DiscoveryLink[] {
  return CAPABILITIES.map((cap) => ({
    label: cap.name,
    to: `/tools/${cap.slug}`,
    reason: cap.purpose,
  }));
}

export { capabilityBySlug };
