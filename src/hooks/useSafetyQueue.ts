/**
 * Founder safety queue. `admin_safety_queue()` re-checks `is_support_staff()`
 * in Postgres, so this hook grants nothing on its own.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { SafetyQueue, SafetyScope, SafetySeverity, SafetySource } from "@/lib/admin/safety";

export const safetyKeys = {
  queue: () => ["admin-safety", "queue"] as const,
};

export function useSafetyQueue(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: safetyKeys.queue(),
    queryFn: async (): Promise<SafetyQueue> => {
      const { data, error } = await supabase.rpc("admin_safety_queue");
      if (error) {
        throw new Error(
          error.message.includes("not_support_staff")
            ? "You don't have access to this area."
            : error.message,
        );
      }
      return data as unknown as SafetyQueue;
    },
    enabled: Boolean(user && enabled),
  });
}

export function useSetCaseSafety() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      caseId: string;
      severity: SafetySeverity;
      source: SafetySource;
      note?: string;
    }) => {
      const { error } = await supabase.rpc("set_support_case_safety", {
        p_case_id: input.caseId,
        p_severity: input.severity,
        p_source: input.source,
        ...(input.note === undefined ? {} : { p_note: input.note }),
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: safetyKeys.queue() }),
  });
}

export function useApplySafetySuspension() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      scope: SafetyScope;
      subjectId: string;
      state: "safety_review" | "suspended";
      reason: string;
      source: SafetySource;
      caseId?: string;
    }) => {
      const { error } = await supabase.rpc("apply_safety_suspension", {
        p_scope: input.scope,
        p_subject_id: input.subjectId,
        p_state: input.state,
        p_reason: input.reason,
        p_source: input.source,
        ...(input.caseId === undefined ? {} : { p_case_id: input.caseId }),
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: safetyKeys.queue() }),
  });
}

export function useLiftSafetySuspension() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { suspensionId: string; reason: string }) => {
      const { error } = await supabase.rpc("lift_safety_suspension", {
        p_suspension_id: input.suspensionId,
        p_reason: input.reason,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: safetyKeys.queue() }),
  });
}
