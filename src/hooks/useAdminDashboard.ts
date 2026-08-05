/**
 * React Query wiring for the founder/admin dashboard RPCs.
 *
 * `useIsPlatformAdmin` is a UX convenience only — every RPC below re-checks
 * `is_platform_admin(auth.uid())` in Postgres via SECURITY DEFINER functions
 * and refuses (42501 / "not_authorized") a non-admin caller regardless of
 * what this hook returns. See src/routes/_authenticated.admin.dashboard.tsx.
 */
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { DateRange } from "@/lib/admin/dashboard";

export const adminDashboardKeys = {
  isAdmin: () => ["admin-dashboard", "is-admin"] as const,
  kpis: (from: string, to: string) => ["admin-dashboard", "kpis", from, to] as const,
  trends: (from: string, to: string) => ["admin-dashboard", "trends", from, to] as const,
  breakdowns: (from: string, to: string) => ["admin-dashboard", "breakdowns", from, to] as const,
};

export function useIsPlatformAdmin() {
  const { user } = useAuth();
  return useQuery({
    queryKey: adminDashboardKeys.isAdmin(),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_platform_admin");
      if (error) return false;
      return Boolean(data);
    },
    enabled: Boolean(user),
    staleTime: 60_000,
  });
}

async function callAggregate(fn: "admin_dashboard_kpis" | "admin_dashboard_trends" | "admin_dashboard_breakdowns", range: DateRange) {
  const { data, error } = await supabase.rpc(fn, {
    p_from: range.from.toISOString(),
    p_to: range.to.toISOString(),
  });
  if (error) throw new Error(error.message === "not_authorized" ? "You don't have access to this area." : error.message);
  return data;
}

export function useAdminKpis(range: DateRange, previousRange: DateRange, enabled: boolean) {
  return useQuery({
    queryKey: adminDashboardKeys.kpis(range.from.toISOString(), range.to.toISOString()),
    queryFn: async () => {
      const [current, previous] = await Promise.all([
        callAggregate("admin_dashboard_kpis", range),
        callAggregate("admin_dashboard_kpis", previousRange),
      ]);
      return { current, previous };
    },
    enabled,
  });
}

export function useAdminTrends(range: DateRange, enabled: boolean) {
  return useQuery({
    queryKey: adminDashboardKeys.trends(range.from.toISOString(), range.to.toISOString()),
    queryFn: () => callAggregate("admin_dashboard_trends", range),
    enabled,
  });
}

export function useAdminBreakdowns(range: DateRange, enabled: boolean) {
  return useQuery({
    queryKey: adminDashboardKeys.breakdowns(range.from.toISOString(), range.to.toISOString()),
    queryFn: () => callAggregate("admin_dashboard_breakdowns", range),
    enabled,
  });
}
