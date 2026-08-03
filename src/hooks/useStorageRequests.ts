/**
 * React Query wiring for storage requests.
 * Every figure rendered from these rows is a snapshot — see `@/lib/storage-requests`.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import {
  createStorageRequest,
  getHostRequest,
  listHostRequests,
  respondToRequest,
  getMyRequest,
  listMyRequests,
  myRequestsForSpace,
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

/* ------------------------------------------------------------------- host */

export const hostRequestKeys = {
  all: ["host-storage-requests"] as const,
  detail: (id: string) => ["host-storage-requests", id] as const,
};

export function useHostRequests() {
  const { user } = useAuth();
  return useQuery({
    queryKey: hostRequestKeys.all,
    queryFn: listHostRequests,
    enabled: Boolean(user),
  });
}

export function useHostRequest(id: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: hostRequestKeys.detail(id ?? "none"),
    queryFn: () => getHostRequest(id as string),
    enabled: Boolean(user && id),
  });
}

export function useRespondToRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: respondToRequest,
    onSuccess: (request) => {
      qc.setQueryData(hostRequestKeys.detail(request.id), request);
      void qc.invalidateQueries({ queryKey: hostRequestKeys.all });
      void qc.invalidateQueries({ queryKey: requestKeys.all });
    },
  });
}

/** All of this renter's requests for one listing, for the listing CTA. */
export function useMyRequestsForSpace(spaceId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...requestKeys.forSpace(spaceId ?? "none"), "mine"] as const,
    queryFn: () => myRequestsForSpace(spaceId as string, user!.id),
    enabled: Boolean(user && spaceId),
  });
}
