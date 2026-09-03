import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/integrations/supabase/types";
import type { AuditEvent, GrowthInsight, GrowthOpportunity } from "./types";

export type GrowthPersistenceClient = SupabaseClient<Database>;

function json(value: unknown): Json {
  return value as Json;
}

export async function persistGrowthOpportunity(
  client: GrowthPersistenceClient,
  opportunity: GrowthOpportunity,
): Promise<void> {
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
      first_seen_at: new Date(opportunity.firstSeen).toISOString(),
      latest_seen_at: new Date(opportunity.latestSeen).toISOString(),
      frequency: opportunity.frequency,
      evidence: json(opportunity.evidence),
    },
    { onConflict: "key" },
  );
  if (error) throw new Error(error.message);
}

export async function persistGrowthInsight(
  client: GrowthPersistenceClient,
  insight: GrowthInsight,
): Promise<void> {
  const { error } = await client.from("growth_insights").upsert(
    {
      insight_key: insight.id,
      kind: insight.kind,
      title: insight.title,
      problem: insight.problem,
      audience: insight.audience,
      geography: insight.geography,
      evidence_count: insight.evidenceCount,
      supporting_keys: json(insight.supportingKeys),
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
