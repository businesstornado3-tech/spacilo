/** React Query wiring for reviews and reputation (Prompt 19). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import {
  getBookingReviewState,
  getHostReputation,
  getRenterReputation,
  getSpaceReviewSummary,
  listReportedReviews,
  listSpaceReviews,
  moderateBookingReview,
  reportBookingReview,
  submitBookingReview,
} from "@/lib/reviews-api";

export const reviewKeys = {
  booking: (id: string) => ["reviews", "booking", id] as const,
  spaceList: (id: string, page: number) => ["reviews", "space", id, page] as const,
  spaceSummary: (id: string) => ["reviews", "space-summary", id] as const,
  hostReputation: (id: string) => ["reviews", "host-reputation", id] as const,
  renterReputation: (id: string) => ["reviews", "renter-reputation", id] as const,
  moderationQueue: ["reviews", "moderation-queue"] as const,
};

/** Server-authoritative review state for one booking. */
export function useBookingReviewState(bookingId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: reviewKeys.booking(bookingId ?? "none"),
    queryFn: () => getBookingReviewState(bookingId as string),
    enabled: Boolean(user && bookingId),
  });
}

export function useSubmitReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: submitBookingReview,
    onSuccess: (review) => {
      void qc.invalidateQueries({ queryKey: reviewKeys.booking(review.booking_id) });
      void qc.invalidateQueries({ queryKey: ["reviews", "space"] });
      void qc.invalidateQueries({ queryKey: ["reviews", "space-summary"] });
      void qc.invalidateQueries({ queryKey: ["reviews", "host-reputation"] });
      void qc.invalidateQueries({ queryKey: ["reviews", "renter-reputation"] });
    },
  });
}

export function useReportReview() {
  return useMutation({ mutationFn: reportBookingReview });
}

/* ----------------------------------------------------------------- public */

export function useSpaceReviews(spaceId: string | undefined, page = 0, pageSize = 10) {
  return useQuery({
    queryKey: reviewKeys.spaceList(spaceId ?? "none", page),
    queryFn: () => listSpaceReviews(spaceId as string, { limit: pageSize, offset: page * pageSize }),
    enabled: Boolean(spaceId),
  });
}

export function useSpaceReviewSummary(spaceId: string | undefined) {
  return useQuery({
    queryKey: reviewKeys.spaceSummary(spaceId ?? "none"),
    queryFn: () => getSpaceReviewSummary(spaceId as string),
    enabled: Boolean(spaceId),
  });
}

export function useHostReputation(hostId: string | undefined) {
  return useQuery({
    queryKey: reviewKeys.hostReputation(hostId ?? "none"),
    queryFn: () => getHostReputation(hostId as string),
    enabled: Boolean(hostId),
  });
}

export function useRenterReputation(renterId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: reviewKeys.renterReputation(renterId ?? "none"),
    queryFn: () => getRenterReputation(renterId as string),
    enabled: Boolean(user && renterId),
  });
}

/* ------------------------------------------------------------- moderation */

export function useReportedReviews(enabled: boolean) {
  return useQuery({
    queryKey: reviewKeys.moderationQueue,
    queryFn: listReportedReviews,
    enabled,
  });
}

export function useModerateReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: moderateBookingReview,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: reviewKeys.moderationQueue });
      void qc.invalidateQueries({ queryKey: ["reviews", "space"] });
      void qc.invalidateQueries({ queryKey: ["reviews", "space-summary"] });
      void qc.invalidateQueries({ queryKey: ["reviews", "host-reputation"] });
    },
  });
}
