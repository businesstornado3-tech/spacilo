/**
 * Founder safety incident dossier.
 *
 * `admin_safety_incident()` re-checks `is_support_staff()` in Postgres and is
 * not executable by signed-out callers, so this hook grants nothing on its
 * own. Everything arrives in one round trip — no per-section queries.
 */
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { IncidentDossier } from "@/lib/admin/incident";

export const incidentKeys = {
  dossier: (caseId: string) => ["admin-safety", "incident", caseId] as const,
};

export function useSafetyIncident(caseId: string, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: incidentKeys.dossier(caseId),
    queryFn: async (): Promise<IncidentDossier> => {
      const { data, error } = await supabase.rpc("admin_safety_incident", {
        p_case_id: caseId,
      });
      if (error) {
        throw new Error(
          error.message.includes("not_support_staff")
            ? "You don't have access to this area."
            : error.message.includes("case_not_found")
              ? "We couldn't find that safety case."
              : error.message,
        );
      }
      return data as unknown as IncidentDossier;
    },
    enabled: Boolean(user && caseId && enabled),
  });
}
