/**
 * React Query bindings for the storage safety layer.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  confirmItemPolicy,
  createPolicyDraft,
  publishPolicyVersion,
  getActivePolicy,
  getSuitabilityProfile,
  listPolicyRules,
  listPublicPolicyRules,
  listPolicyVersions,
  saveSuitabilityProfile,
  screenInventory,
} from "@/lib/policy-api";

export const policyKeys = {
  active: ["policy", "active"] as const,
  versions: ["policy", "versions"] as const,
  rules: (versionId: string) => ["policy", "rules", versionId] as const,
  publicRules: (versionId: string) => ["policy", "public-rules", versionId] as const,
  screening: (inventoryId: string) => ["policy", "screening", inventoryId] as const,
  suitability: (spaceId: string) => ["policy", "suitability", spaceId] as const,
};

export function useActivePolicy(enabled = true) {
  return useQuery({
    queryKey: policyKeys.active,
    queryFn: getActivePolicy,
    enabled,
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

/** Public storage-policy page: no session, so read the vetted projection. */
export function usePublicPolicyRules(versionId: string | undefined) {
  return useQuery({
    queryKey: policyKeys.publicRules(versionId ?? "none"),
    queryFn: () => listPublicPolicyRules(versionId!),
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

export function useCreatePolicyDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createPolicyDraft,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: policyKeys.versions });
    },
  });
}

export function usePublishPolicyVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: publishPolicyVersion,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: policyKeys.versions });
      void qc.invalidateQueries({ queryKey: policyKeys.active });
    },
  });
}
