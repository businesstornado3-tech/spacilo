/**
 * React Query wiring for the Phase 11 growth radar.
 *
 * Every read below is a plain table read protected by the growth tables'
 * platform-admin RLS policies, and the refresh is a server function that
 * re-checks `is_platform_admin` before it does anything at all.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";
import { dispatchGrowthCampaigns, refreshGrowthRadar } from "@/lib/growth.functions";

export const growthKeys = {
  opportunities: () => ["growth", "opportunities"] as const,
  insights: () => ["growth", "insights"] as const,
  campaigns: () => ["growth", "campaigns"] as const,
  recommendations: () => ["growth", "recommendations"] as const,
};

export interface GrowthOpportunityRow {
  key: string;
  status: string;
  frequency: number;
  latest_seen_at: string;
  scores: Record<string, unknown> | null;
  situation: Record<string, unknown> | null;
  audience: Record<string, unknown> | null;
  fit: Record<string, unknown> | null;
}

export interface GrowthInsightRow {
  insight_key: string;
  kind: string;
  title: string;
  audience: string;
  geography: string | null;
  evidence_count: number;
  recommendation: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export interface GrowthCampaignRow {
  id: string;
  opportunity_key: string;
  channel: string | null;
  state: string;
  decision: Record<string, unknown> | null;
  attempt_count: number;
  sent_at: string | null;
  expires_at: string | null;
}

export interface GrowthRecommendationRow {
  opportunity_key: string;
  kind: string;
  title: string;
  audience: string;
  geography: string | null;
  evidence_count: number;
  conversion_count: number;
  priority_score: number;
  recommendation: string;
}

export function useGrowthOpportunities(enabled: boolean) {
  return useQuery<GrowthOpportunityRow[]>({
    queryKey: growthKeys.opportunities(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("growth_opportunities")
        .select("key,status,frequency,latest_seen_at,scores,situation,audience,fit")
        .order("latest_seen_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        key: row.key,
        status: row.status,
        frequency: row.frequency,
        latest_seen_at: row.latest_seen_at,
        scores: record(row.scores),
        situation: record(row.situation),
        audience: record(row.audience),
        fit: record(row.fit),
      }));
    },
    enabled,
  });
}

export function useGrowthInsights(enabled: boolean) {
  return useQuery<GrowthInsightRow[]>({
    queryKey: growthKeys.insights(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("growth_insights")
        .select("insight_key,kind,title,audience,geography,evidence_count,recommendation")
        .order("evidence_count", { ascending: false })
        .limit(25);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled,
  });
}

export function useGrowthCampaigns(enabled: boolean) {
  return useQuery<GrowthCampaignRow[]>({
    queryKey: growthKeys.campaigns(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("growth_campaigns")
        .select("id,opportunity_key,channel,state,decision,attempt_count,sent_at,expires_at")
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        id: row.id,
        opportunity_key: row.opportunity_key,
        channel: row.channel,
        state: row.state,
        decision: record(row.decision),
        attempt_count: row.attempt_count,
        sent_at: row.sent_at,
        expires_at: row.expires_at,
      }));
    },
    enabled,
  });
}

export function useGrowthRecommendations(enabled: boolean) {
  return useQuery<GrowthRecommendationRow[]>({
    queryKey: growthKeys.recommendations(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("growth_innovation_opportunities")
        .select(
          "opportunity_key,kind,title,audience,geography,evidence_count,conversion_count,priority_score,recommendation",
        )
        .order("priority_score", { ascending: false })
        .limit(25);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled,
  });
}

function invalidateGrowthQueries(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: growthKeys.opportunities() });
  void qc.invalidateQueries({ queryKey: growthKeys.insights() });
  void qc.invalidateQueries({ queryKey: growthKeys.campaigns() });
  void qc.invalidateQueries({ queryKey: growthKeys.recommendations() });
}

export function useRefreshGrowthRadar() {
  const refresh = useServerFn(refreshGrowthRadar);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (days: number) => refresh({ data: { days } }),
    onSuccess: () => invalidateGrowthQueries(qc),
  });
}

export function useDispatchGrowthCampaigns() {
  const dispatch = useServerFn(dispatchGrowthCampaigns);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (limit: number) => dispatch({ data: { limit } }),
    onSuccess: () => invalidateGrowthQueries(qc),
  });
}
