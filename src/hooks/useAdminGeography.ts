/**
 * React Query wiring for the founder console's demand-geography and
 * data-health RPCs.
 *
 * Both RPCs are SECURITY DEFINER and re-check `is_platform_admin(auth.uid())`
 * in Postgres, so these hooks are convenience only — never the boundary.
 */
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { DateRange } from "@/lib/admin/dashboard";
import type { GeographyRow } from "@/lib/admin/geography";
import type { HealthInput } from "@/lib/admin/provenance";

export const adminGeographyKeys = {
  geography: (from: string, to: string) => ["admin-geography", from, to] as const,
  health: () => ["admin-data-health"] as const,
};

function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function timestamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export interface AdminGeographyResult {
  rows: GeographyRow[];
  /** True when the period genuinely produced no location intent at all. */
  empty: boolean;
}

export function useAdminGeography(range: DateRange, enabled: boolean) {
  return useQuery<AdminGeographyResult>({
    queryKey: adminGeographyKeys.geography(range.from.toISOString(), range.to.toISOString()),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_demand_geography", {
        p_from: range.from.toISOString(),
        p_to: range.to.toISOString(),
      });
      if (error) {
        throw new Error(
          error.message === "not_authorized" ? "You don't have access to this area." : error.message,
        );
      }
      const payload = (data ?? {}) as Record<string, unknown>;
      const raw = Array.isArray(payload["places"]) ? (payload["places"] as unknown[]) : [];
      const rows: GeographyRow[] = raw.map((entry) => {
        const row = (entry ?? {}) as Record<string, unknown>;
        return {
          location_slug: String(row["location_slug"] ?? ""),
          demand_visitors: number(row["demand_visitors"]),
          demand_events: number(row["demand_events"]),
          storage_requests: number(row["storage_requests"]),
          bookings: number(row["bookings"]),
          published_spaces: number(row["published_spaces"]),
          previous_demand_events: number(row["previous_demand_events"]),
        };
      });
      return { rows: rows.filter((row) => row.location_slug), empty: rows.length === 0 };
    },
    enabled,
  });
}

export type AdminDataHealthResult = Omit<HealthInput, "now">;

export function useAdminDataHealth(enabled: boolean) {
  return useQuery<AdminDataHealthResult>({
    queryKey: adminGeographyKeys.health(),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_data_health");
      if (error) {
        throw new Error(
          error.message === "not_authorized" ? "You don't have access to this area." : error.message,
        );
      }
      const payload = (data ?? {}) as Record<string, unknown>;
      return {
        lastEventAt: timestamp(payload["last_event_at"]),
        lastRollupAt: timestamp(payload["last_rollup_at"]),
        lastOpportunityAt: timestamp(payload["last_opportunity_at"]),
        conversionEvents: number(payload["conversion_events"]),
        geographyPlaces: number(payload["geography_places"]),
        mockCampaignAttempts: number(payload["mock_campaign_attempts"]),
        liveCampaignAttempts: number(payload["live_campaign_attempts"]),
        failedCampaignAttempts: number(payload["failed_campaign_attempts"]),
      };
    },
    enabled,
    staleTime: 60_000,
  });
}
