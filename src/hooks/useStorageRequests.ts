/**
 * React Query wiring for storage requests.
 * Every figure rendered from these rows is a snapshot — see `@/lib/storage-requests`.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import {
  createStorageRequest,
  getMyRequest,
  listMyRequests,
  pendingRequestForSpace,
  withdrawRequest,
  type CreateRequestInput,
} from "@/lib/storage-requests-api";

export const requestKeys = {
  all: ["storage-requests"] as const,
  detail: (id: string) => ["storage-requests", id] as const,
  forSpace: (spaceId: string) => ["storage-requests", "space", spaceId] as const,
};

export function useMyRequests() {
  const { user } = useAuth();
  return useQuery({
    queryKey: requestKeys.all,
    queryFn: listMyRequests,
    enabled: Boolean(user),
  });
}

export function useRequest(id: string | undefined) {
  return useQuery({
    queryKey: requestKeys.detail(id ?? "none"),
    queryFn: () => getMyRequest(id as string),
    enabled: Boolean(id),
  });
}

/** Live pending request for a listing, so the CTA can't create duplicates. */
export function usePendingRequestForSpace(spaceId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: requestKeys.forSpace(spaceId ?? "none"),
    queryFn: () => pendingRequestForSpace(spaceId as string),
    enabled: Boolean(user && spaceId),
  });
}

export function useCreateRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRequestInput) => createStorageRequest(input),
    onSuccess: (request) => {
      void qc.invalidateQueries({ queryKey: requestKeys.all });
      void qc.invalidateQueries({ queryKey: requestKeys.forSpace(request.space_id) });
    },
  });
}

export function useWithdrawRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => withdrawRequest(id),
    onSuccess: (request) => {
      qc.setQueryData(requestKeys.detail(request.id), request);
      void qc.invalidateQueries({ queryKey: requestKeys.all });
      void qc.invalidateQueries({ queryKey: requestKeys.forSpace(request.space_id) });
    },
  });
}
