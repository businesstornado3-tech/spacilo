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
import { refreshGrowthRadar } from "@/lib/growth.functions";

export const growthKeys = {
  opportunities: () => ["growth", "opportunities"] as const,
  insights: () => ["growth", "insights"] as const,
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

export function useRefreshGrowthRadar() {
  const refresh = useServerFn(refreshGrowthRadar);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (days: number) => refresh({ data: { days } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: growthKeys.opportunities() });
      void qc.invalidateQueries({ queryKey: growthKeys.insights() });
    },
  });
}
