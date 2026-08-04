/** React Query wiring for booking handover evidence (Prompt 15). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import {
  addConditionNote,
  listConditionNotes,
  listEvidencePhotos,
  listHandoverIssues,
  reportHandoverIssue,
  uploadEvidencePhoto,
} from "@/lib/handover-api";

export const handoverKeys = {
  photos: (bookingId: string) => ["handover", bookingId, "photos"] as const,
  notes: (bookingId: string) => ["handover", bookingId, "notes"] as const,
  issues: (bookingId: string) => ["handover", bookingId, "issues"] as const,
};

export function useEvidencePhotos(bookingId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: handoverKeys.photos(bookingId ?? "none"),
    queryFn: () => listEvidencePhotos(bookingId as string),
    enabled: Boolean(user && bookingId),
  });
}

export function useConditionNotes(bookingId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: handoverKeys.notes(bookingId ?? "none"),
    queryFn: () => listConditionNotes(bookingId as string),
    enabled: Boolean(user && bookingId),
  });
}

export function useHandoverIssues(bookingId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: handoverKeys.issues(bookingId ?? "none"),
    queryFn: () => listHandoverIssues(bookingId as string),
    enabled: Boolean(user && bookingId),
  });
}

export function useUploadEvidencePhoto(bookingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: uploadEvidencePhoto,
    onSuccess: () => void qc.invalidateQueries({ queryKey: handoverKeys.photos(bookingId) }),
  });
}

export function useAddConditionNote(bookingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: addConditionNote,
    onSuccess: () => void qc.invalidateQueries({ queryKey: handoverKeys.notes(bookingId) }),
  });
}

export function useReportHandoverIssue(bookingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: reportHandoverIssue,
    onSuccess: () => void qc.invalidateQueries({ queryKey: handoverKeys.issues(bookingId) }),
  });
}
