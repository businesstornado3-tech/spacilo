/**
 * React Query bindings for the storage safety layer.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  confirmItemPolicy,
  getActivePolicy,
  getSuitabilityProfile,
  listPolicyRules,
  listPolicyVersions,
  saveSuitabilityProfile,
  screenInventory,
} from "@/lib/policy-api";

export const policyKeys = {
  active: ["policy", "active"] as const,
  versions: ["policy", "versions"] as const,
  rules: (versionId: string) => ["policy", "rules", versionId] as const,
  screening: (inventoryId: string) => ["policy", "screening", inventoryId] as const,
  suitability: (spaceId: string) => ["policy", "suitability", spaceId] as const,
};

export function useActivePolicy() {
  return useQuery({
    queryKey: policyKeys.active,
    queryFn: getActivePolicy,
    staleTime: 10 * 60 * 1000,
  });
}

export function usePolicyVersions() {
  return useQuery({ queryKey: policyKeys.versions, queryFn: listPolicyVersions });
}

export function usePolicyRules(versionId: string | undefined) {
  return useQuery({
    queryKey: policyKeys.rules(versionId ?? "none"),
    queryFn: () => listPolicyRules(versionId!),
    enabled: Boolean(versionId),
    staleTime: 10 * 60 * 1000,
  });
}

export function useInventoryScreening(inventoryId: string | undefined) {
  return useQuery({
    queryKey: policyKeys.screening(inventoryId ?? "none"),
    queryFn: () => screenInventory(inventoryId!),
    enabled: Boolean(inventoryId),
  });
}

export function useConfirmItemPolicy(inventoryId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: confirmItemPolicy,
    onSuccess: () => {
      if (inventoryId) {
        void qc.invalidateQueries({ queryKey: policyKeys.screening(inventoryId) });
      }
      void qc.invalidateQueries({ queryKey: ["inventory"] });
    },
  });
}

export function useSuitabilityProfile(spaceId: string | undefined) {
  return useQuery({
    queryKey: policyKeys.suitability(spaceId ?? "none"),
    queryFn: () => getSuitabilityProfile(spaceId!),
    enabled: Boolean(spaceId),
  });
}

export function useSaveSuitability(spaceId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveSuitabilityProfile,
    onSuccess: () => {
      if (spaceId) void qc.invalidateQueries({ queryKey: policyKeys.suitability(spaceId) });
    },
  });
}
