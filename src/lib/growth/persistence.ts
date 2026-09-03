import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/integrations/supabase/types";
import type { AuditEvent, GrowthInsight, GrowthOpportunity } from "./types";

export type GrowthPersistenceClient = SupabaseClient<Database>;

function json(value: unknown): Json {
  return value as Json;
}

function jsonArray(value: unknown): Json[] {
  return Array.isArray(value) ? (value as Json[]) : [];
}

/**
 * Upserts a need while preserving the durable aggregate already found by an
 * earlier refresh. The audit event for each source signal is the idempotency
 * boundary; this merge protects the aggregate if a later run sees new events
 * for the same underlying need.
 */
export async function persistGrowthOpportunity(
  client: GrowthPersistenceClient,
  opportunity: GrowthOpportunity,
): Promise<void> {
  const { data: previous, error: lookupError } = await client
    .from("growth_opportunities")
    .select("first_seen_at,latest_seen_at,frequency,evidence")
    .eq("key", opportunity.key)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);

  const firstSeen = previous
    ? Math.min(Date.parse(previous.first_seen_at), opportunity.firstSeen)
    : opportunity.firstSeen;
  const latestSeen = previous
    ? Math.max(Date.parse(previous.latest_seen_at), opportunity.latestSeen)
    : opportunity.latestSeen;
  const frequency = previous ? previous.frequency + opportunity.frequency : opportunity.frequency;
  const evidence = [
    ...jsonArray(previous?.evidence),
    ...opportunity.evidence.map((item) => json(item)),
  ].slice(-12);

  const { error } = await client.from("growth_opportunities").upsert(
    {
      key: opportunity.key,
      signal_id: opportunity.signalId,
      connector_id: opportunity.connectorId,
      situation: json(opportunity.situation),
      pain_points: json(opportunity.painPoints),
      audience: json(opportunity.audience),
      fit: json(opportunity.fit),
      supply: json(opportunity.supply),
      scores: json(opportunity.scores),
      campaign_decision: json(opportunity.decision),
      status: opportunity.status,
      first_seen_at: new Date(firstSeen).toISOString(),
      latest_seen_at: new Date(latestSeen).toISOString(),
      frequency,
      evidence: json(evidence),
    },
    { onConflict: "key" },
  );
  if (error) throw new Error(error.message);
}

/** Preserves insight evidence counts/supporting keys across refreshes. */
export async function persistGrowthInsight(
  client: GrowthPersistenceClient,
  insight: GrowthInsight,
): Promise<void> {
  const { data: previous, error: lookupError } = await client
    .from("growth_insights")
    .select("evidence_count,supporting_keys")
    .eq("insight_key", insight.id)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);

  const previousKeys = jsonArray(previous?.supporting_keys).filter(
    (value): value is string => typeof value === "string",
  );
  const supportingKeys = [...new Set([...previousKeys, ...insight.supportingKeys])];
  const evidenceCount = previous
    ? previous.evidence_count + insight.evidenceCount
    : insight.evidenceCount;

  const { error } = await client.from("growth_insights").upsert(
    {
      insight_key: insight.id,
      kind: insight.kind,
      title: insight.title,
      problem: insight.problem,
      audience: insight.audience,
      geography: insight.geography,
      evidence_count: evidenceCount,
      supporting_keys: json(supportingKeys),
      recommendation: insight.recommendation,
      components: json(insight.components),
      confidence: insight.confidence,
      status: insight.status,
    },
    { onConflict: "insight_key" },
  );
  if (error) throw new Error(error.message);
}

export async function persistGrowthAudit(
  client: GrowthPersistenceClient,
  event: AuditEvent,
): Promise<void> {
  const { error } = await client.from("growth_audit_events").upsert(
    {
      event_key: event.id,
      occurred_at: new Date(event.at).toISOString(),
      actor: event.actor,
      action: event.action,
      reason: event.reason,
      source: event.source,
      reference_id: event.referenceId,
      detail: json(event.detail ?? {}),
    },
    { onConflict: "event_key", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
}

/**
 * Persists a generated campaign without reopening an already-created campaign.
 * The idempotency key is the durable send boundary; retries must never reset its
 * state, attempt count or delivery timestamps.
 */
export async function persistGrowthCampaign(
  client: GrowthPersistenceClient,
  campaign: import("./types").Campaign,
  sourceIdentity: string,
): Promise<void> {
  const { data: existing, error: lookupError } = await client
    .from("growth_campaigns")
    .select("id")
    .eq("idempotency_key", campaign.idempotencyKey)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
  if (existing) return;

  const { error } = await client.from("growth_campaigns").insert({
    opportunity_key: campaign.opportunityKey,
    idempotency_key: campaign.idempotencyKey,
    campaign_fingerprint: campaign.idempotencyKey,
    source_identity: sourceIdentity,
    channel: campaign.channel,
    message: json(campaign.message),
    state: campaign.state,
    decision: json(campaign.decision),
    policy: json(campaign.policy),
    sent_at: campaign.sentAt ? new Date(campaign.sentAt).toISOString() : null,
    expires_at: campaign.expiresAt ? new Date(campaign.expiresAt).toISOString() : null,
  });
  if (error && error.code !== "23505") throw new Error(error.message);
}

/** Persists a human-review innovation recommendation idempotently. */
export async function persistInnovationRecommendation(
  client: GrowthPersistenceClient,
  recommendation: import("./learning").InnovationRecommendation,
): Promise<void> {
  const { error } = await client.from("growth_innovation_opportunities").upsert(
    {
      opportunity_key: recommendation.opportunityKey,
      kind: recommendation.kind,
      title: recommendation.title,
      problem: recommendation.problem,
      audience: recommendation.audience,
      geography: recommendation.geography,
      evidence_count: recommendation.evidenceCount,
      conversion_count: recommendation.conversionCount,
      priority_score: recommendation.priorityScore,
      recommendation: recommendation.recommendation,
      components: json(recommendation.components),
      status: "RECOMMENDED",
    },
    { onConflict: "opportunity_key,kind" },
  );
  if (error) throw new Error(error.message);
}
