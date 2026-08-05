/** React Query wiring for support cases (Prompt 18). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { useAuth } from "@/hooks/useAuth";
import {
  addCaseMessage,
  caseRefundablePayments,
  getSupportCase,
  isSupportStaff,
  listBookingSupportCases,
  listCaseEvents,
  listCaseEvidence,
  listCaseMessages,
  listSupportQueue,
  openSupportCase,
  uploadCaseEvidence,
  type CaseQueueFilters,
} from "@/lib/support-cases-api";
import type {
  SupportAssignInput,
  SupportNoteInput,
  SupportRefundInput,
  SupportResolutionInput,
  SupportStatusInput,
  SupportUpdateInput,
} from "@/lib/support.functions";
import {
  supportAddNote,
  supportAssignCase,
  supportPostUpdate,
  supportRecordResolution,
  supportResolveWithRefund,
  supportSetStatus,
} from "@/lib/support.functions";

export const supportKeys = {
  booking: (bookingId: string) => ["support-cases", "booking", bookingId] as const,
  case: (caseId: string) => ["support-cases", "case", caseId] as const,
  messages: (caseId: string) => ["support-cases", caseId, "messages"] as const,
  events: (caseId: string) => ["support-cases", caseId, "events"] as const,
  evidence: (caseId: string) => ["support-cases", caseId, "evidence"] as const,
  refundable: (caseId: string) => ["support-cases", caseId, "refundable"] as const,
  queue: (filters: CaseQueueFilters) => ["support-cases", "queue", filters] as const,
  staff: () => ["support-cases", "staff"] as const,
};

export function useBookingSupportCases(bookingId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: supportKeys.booking(bookingId ?? "none"),
    queryFn: () => listBookingSupportCases(bookingId as string),
    enabled: Boolean(user && bookingId),
  });
}

export function useSupportCase(caseId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: supportKeys.case(caseId ?? "none"),
    queryFn: () => getSupportCase(caseId as string),
    enabled: Boolean(user && caseId),
  });
}

export function useCaseMessages(caseId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: supportKeys.messages(caseId ?? "none"),
    queryFn: () => listCaseMessages(caseId as string),
    enabled: Boolean(user && caseId),
  });
}

export function useCaseEvents(caseId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: supportKeys.events(caseId ?? "none"),
    queryFn: () => listCaseEvents(caseId as string),
    enabled: Boolean(user && caseId),
  });
}

export function useCaseEvidence(caseId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: supportKeys.evidence(caseId ?? "none"),
    queryFn: () => listCaseEvidence(caseId as string),
    enabled: Boolean(user && caseId),
  });
}

export function useCaseRefundable(caseId: string | undefined, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: supportKeys.refundable(caseId ?? "none"),
    queryFn: () => caseRefundablePayments(caseId as string),
    enabled: Boolean(user && caseId && enabled),
  });
}

export function useIsSupportStaff() {
  const { user } = useAuth();
  return useQuery({
    queryKey: supportKeys.staff(),
    queryFn: isSupportStaff,
    enabled: Boolean(user),
    staleTime: 60_000,
  });
}

export function useSupportQueue(filters: CaseQueueFilters) {
  const { user } = useAuth();
  return useQuery({
    queryKey: supportKeys.queue(filters),
    queryFn: () => listSupportQueue(filters),
    enabled: Boolean(user),
  });
}

export function useOpenSupportCase(bookingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: openSupportCase,
    onSuccess: () => void qc.invalidateQueries({ queryKey: supportKeys.booking(bookingId) }),
  });
}

export function useAddCaseMessage(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: addCaseMessage,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: supportKeys.messages(caseId) });
      void qc.invalidateQueries({ queryKey: supportKeys.events(caseId) });
      void qc.invalidateQueries({ queryKey: supportKeys.case(caseId) });
    },
  });
}

export function useUploadCaseEvidence(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: uploadCaseEvidence,
    onSuccess: () => void qc.invalidateQueries({ queryKey: supportKeys.evidence(caseId) }),
  });
}

/* ------------------------------------------------------------ staff-only */

function useCaseRefresh(caseId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: supportKeys.case(caseId) });
    void qc.invalidateQueries({ queryKey: supportKeys.messages(caseId) });
    void qc.invalidateQueries({ queryKey: supportKeys.events(caseId) });
    void qc.invalidateQueries({ queryKey: supportKeys.refundable(caseId) });
    void qc.invalidateQueries({ queryKey: ["support-cases", "queue"] });
  };
}

export function useSupportSetStatus(caseId: string) {
  const call = useServerFn(supportSetStatus);
  const refresh = useCaseRefresh(caseId);
  return useMutation({
    mutationFn: (data: SupportStatusInput) => call({ data }),
    onSuccess: refresh,
  });
}

export function useSupportPostUpdate(caseId: string) {
  const call = useServerFn(supportPostUpdate);
  const refresh = useCaseRefresh(caseId);
  return useMutation({
    mutationFn: (data: SupportUpdateInput) => call({ data }),
    onSuccess: refresh,
  });
}

export function useSupportAddNote(caseId: string) {
  const call = useServerFn(supportAddNote);
  const refresh = useCaseRefresh(caseId);
  return useMutation({
    mutationFn: (data: SupportNoteInput) => call({ data }),
    onSuccess: refresh,
  });
}

export function useSupportAssignCase(caseId: string) {
  const call = useServerFn(supportAssignCase);
  const refresh = useCaseRefresh(caseId);
  return useMutation({
    mutationFn: (data: SupportAssignInput) => call({ data }),
    onSuccess: refresh,
  });
}

export function useSupportRecordResolution(caseId: string) {
  const call = useServerFn(supportRecordResolution);
  const refresh = useCaseRefresh(caseId);
  return useMutation({
    mutationFn: (data: SupportResolutionInput) => call({ data }),
    onSuccess: refresh,
  });
}

export function useSupportResolveWithRefund(caseId: string) {
  const call = useServerFn(supportResolveWithRefund);
  const refresh = useCaseRefresh(caseId);
  return useMutation({
    mutationFn: (data: SupportRefundInput) => call({ data }),
    onSuccess: refresh,
  });
}
