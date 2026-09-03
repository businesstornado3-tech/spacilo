import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/integrations/supabase/types";
import type {
  AuditEvent,
  Campaign,
  GrowthInsight,
  GrowthLearningSignal,
  GrowthOpportunity,
} from "./types";
import type { GrowthAttributionRecord } from "./attribution";

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
  opportunity: GrowthOpportunity & { learnedScore?: number },
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
      scores: json(
        opportunity.learnedScore === undefined
          ? opportunity.scores
          : { ...opportunity.scores, learnedScore: opportunity.learnedScore },
      ),
      intelligence: json(opportunity.intelligence ?? {}),
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
  campaign: Campaign,
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
    recipient_identity_hash: campaign.recipientIdentityHash,
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

/** Claims a campaign send lock atomically; a false result means another worker won. */
export async function claimGrowthCampaignLock(
  client: GrowthPersistenceClient,
  campaignId: string,
  lock: string,
  now: number,
): Promise<boolean> {
  const { data, error } = await client
    .from("growth_campaigns")
    .update({ send_lock: lock, locked_at: new Date(now).toISOString() })
    .eq("id", campaignId)
    .is("send_lock", null)
    .is("sent_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

/** Releases the worker's lock and persists the exact result of one adapter attempt. */
export async function persistGrowthCampaignResult(
  client: GrowthPersistenceClient,
  campaignId: string,
  lock: string,
  result: {
    state: Campaign["state"];
    attemptNumber: number;
    sentAt: number | null;
    lastError: string | null;
  },
): Promise<void> {
  const { data, error } = await client
    .from("growth_campaigns")
    .update({
      state: result.state,
      attempt_count: result.attemptNumber,
      sent_at: result.sentAt ? new Date(result.sentAt).toISOString() : null,
      last_error: result.lastError,
      send_lock: null,
      locked_at: null,
    })
    .eq("id", campaignId)
    .eq("send_lock", lock)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Campaign result could not release its send lock.");
}

export async function persistGrowthCampaignAttempt(
  client: GrowthPersistenceClient,
  input: {
    campaignId: string;
    attemptNumber: number;
    status: string;
    providerReference: string | null;
    errorCode?: string | null;
    attemptedAt: number;
    metadata?: unknown;
  },
): Promise<void> {
  const { error } = await client.from("growth_campaign_attempts").upsert(
    {
      campaign_id: input.campaignId,
      attempt_number: input.attemptNumber,
      status: input.status,
      provider_reference: input.providerReference,
      error_code: input.errorCode ?? null,
      attempted_at: new Date(input.attemptedAt).toISOString(),
      metadata: json(input.metadata ?? {}),
    },
    { onConflict: "campaign_id,attempt_number" },
  );
  if (error) throw new Error(error.message);
}

export async function persistGrowthLearningSignal(
  client: GrowthPersistenceClient,
  signal: GrowthLearningSignal,
  metadata: unknown = {},
  idempotencyKey?: string,
): Promise<void> {
  const { error } = await client.from("growth_learning_signals").insert({
    idempotency_key: idempotencyKey ?? null,
    opportunity_key: signal.opportunityKey,
    channel: signal.channel,
    outcome: signal.outcome,
    value_pence: signal.valuePence ?? null,
    occurred_at: new Date(signal.at).toISOString(),
    metadata: json(metadata),
  });
  // The unique partial index makes keyed retries safe while allowing
  // deliberately unkeyed internal observations to coexist.
  if (error && error.code !== "23505") throw new Error(error.message);
}

export async function persistGrowthAttribution(
  client: GrowthPersistenceClient,
  record: GrowthAttributionRecord,
): Promise<boolean> {
  const { data: existing, error: lookupError } = await client
    .from("growth_attributions")
    .select("id")
    .eq("attribution_key", record.idempotencyKey)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
  if (existing) return false;

  const { error } = await client.from("growth_attributions").insert({
    attribution_key: record.idempotencyKey,
    attribution_model: record.attributionModel,
    opportunity_key: record.opportunityKey,
    campaign_id: record.campaignId,
    event_name: record.eventName,
    destination: record.destination,
    source: record.source,
    audience: record.audience,
    geography: record.geography,
    occurred_at: new Date(record.occurredAt).toISOString(),
    metadata: json(record.metadata),
  });
  if (error && error.code !== "23505") throw new Error(error.message);
  return !error;
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
