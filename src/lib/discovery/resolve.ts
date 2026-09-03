/**
 * The discovery pipeline.
 *
 * One entry point: a raw query in, a fully reasoned, explainable decision out.
 * Nothing here fetches, publishes or guesses — supply facts are passed in by
 * the caller, so the engine stays deterministic and testable.
 */
import { readIntent, type IntentReading } from "./intent";
import { planCapabilities, type CapabilityPlan } from "./matching";
import { matchCluster, type IntentCluster } from "./clusters";
import { scoreOpportunity, NO_SUPPLY, type OpportunityScore, type SupplyFacts } from "./scoring";
import { decideIndexation, type IndexationDecision } from "./indexation";
import { buildOpportunity, type OpportunityRecord } from "./opportunities";
import { capabilityPath, linksForCapability, linksForCluster, type DiscoveryLink } from "./linking";

export type DiscoveryResolution = {
  reading: IntentReading;
  plan: CapabilityPlan;
  /** The canonical cluster this need belongs to, when one exists. */
  cluster: IntentCluster | null;
  /** Where this person should actually be sent. */
  destination: string | null;
  score: OpportunityScore;
  indexation: IndexationDecision;
  links: readonly DiscoveryLink[];
  /** Recorded when the need is real but has no dedicated destination yet. */
  opportunity: OpportunityRecord | null;
  /** Human-readable trace of the decision. */
  explanation: readonly string[];
};

export type ResolveOptions = {
  supply?: SupplyFacts;
  /** True when the caller knows this reading duplicates an existing page. */
  duplicateOf?: string | null;
};

function locationDestination(reading: IntentReading): string | null {
  if (reading.location.kind === "place" && reading.role === "renter") {
    return `/storage/${reading.location.place.slug}`;
  }
  if (reading.location.kind === "near_me" || reading.location.kind === "postcode_district") {
    return "/search";
  }
  return null;
}

export function resolveDiscovery(query: string, options: ResolveOptions = {}): DiscoveryResolution {
  const reading = readIntent(query);
  const plan = planCapabilities(reading);
  const matched = matchCluster(reading);
  const cluster = matched?.cluster ?? null;
  const supply = options.supply ?? NO_SUPPLY;

  const score = scoreOpportunity({
    reading,
    plan,
    supply,
    duplicateOfExisting: Boolean(options.duplicateOf),
    contentCompleteness: cluster?.sections?.length ? 1 : cluster ? 0.5 : 0,
  });

  // Only a renter's location request claims current marketplace supply. A host
  // asking about a place is an acquisition need, not a supply result.
  const claimsSupply = reading.role === "renter" && reading.location.kind !== "none";
  // A generic capability can help an unfamiliar subject, but it is not a
  // dedicated experience for that subject. Keep the need in the opportunity
  // stream instead of pretending the generic page is a complete answer.
  const hasOpenEndedStorageSubject =
    reading.role === "renter" &&
    reading.problems.some((problem) => problem.value === "needs_somewhere_to_store") &&
    reading.belongings.length === 0 &&
    reading.spaces.length === 0;
  const hasDedicatedPage = Boolean(cluster?.publish) && !hasOpenEndedStorageSubject;
  const indexation = decideIndexation({
    hasDedicatedPage,
    hasReviewedContent: hasDedicatedPage,
    duplicateOf: options.duplicateOf ?? null,
    claimsSupply,
    publishedSpaces: supply.publishedSpaces,
    exposesPrivateData: false,
    score,
  });

  const destination = locationDestination(reading) ?? (cluster?.publish
    ? cluster.path
    : plan.primary
      ? capabilityPath(plan.primary.id)
      : null);

  const links = cluster
    ? linksForCluster(cluster)
    : plan.primary
      ? linksForCapability(plan.primary.id)
      : [];

  const opportunity =
    !hasDedicatedPage && plan.primary
      ? buildOpportunity({ reading, plan, score, decision: indexation })
      : null;

  const explanation = [
    `intent: ${reading.objectives.map((o) => o.value).join(", ") || "undetermined"} (confidence ${reading.confidence})`,
    `problem: ${reading.problems.map((problem) => problem.value).join(", ") || "undetermined"}, segment: ${reading.segment}`,
    `role: ${reading.role}, stage: ${reading.stage}, location: ${reading.location.kind}`, 
    plan.primary
      ? `capability: ${plan.primary.id} (${plan.primary.relevance}) via ${plan.primary.reasons.join(", ")}`
      : "capability: none above the relevance floor",
    cluster ? `cluster: ${cluster.id} → ${cluster.path}` : "cluster: none",
    `score: ${score.total}/100`,
    `indexation: ${indexation.status} (${indexation.reasons.join(", ")})`,
  ];

  return { reading, plan, cluster, destination, score, indexation, links, opportunity, explanation };
}
