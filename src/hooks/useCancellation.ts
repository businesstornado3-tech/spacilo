/**
 * Cancellation / refund state for a booking, plus the cancel action.
 *
 * Every amount rendered in the UI comes from these server-owned rows. The
 * browser never calculates a refund.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import {
  getBookingCancellation,
  getCancellationQuote,
  listBookingRefunds,
  listMyBookingCancellations,
  listHostBalanceAdjustments,
} from "@/lib/cancellations-api";
import { cancelBooking } from "@/lib/cancellations.functions";
import { useAuth } from "@/hooks/useAuth";

export function useBookingCancellation(bookingId: string | undefined) {
  return useQuery({
    queryKey: ["booking-cancellation", bookingId],
    queryFn: () => getBookingCancellation(bookingId!),
    enabled: Boolean(bookingId),
  });
}

/** Cancellations across the viewer's bookings, keyed by booking id. */
export function useMyBookingCancellations() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["booking-cancellations", user?.id],
    queryFn: listMyBookingCancellations,
    enabled: Boolean(user),
  });
}

/**
 * The authoritative cancellation quote. Never cached long: it is recomputed
 * server-side when the cancellation is submitted, and the screen is only ever
 * informational.
 */
export function useCancellationQuote(bookingId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["booking-cancellation-quote", bookingId],
    queryFn: () => getCancellationQuote(bookingId!),
    enabled: Boolean(bookingId) && enabled,
    staleTime: 0,
  });
}

export function useBookingRefunds(bookingId: string | undefined) {
  return useQuery({
    queryKey: ["booking-refunds", bookingId],
    queryFn: () => listBookingRefunds(bookingId!),
    enabled: Boolean(bookingId),
  });
}

export function useHostBalanceAdjustments() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["host-balance-adjustments", user?.id],
    queryFn: () => listHostBalanceAdjustments(user!.id),
    enabled: Boolean(user?.id),
  });
}

export function useCancelBooking(bookingId: string) {
  const queryClient = useQueryClient();
  const run = useServerFn(cancelBooking);

  return useMutation({
    mutationFn: (input: { reason?: string; reasonCategory?: string } = {}) =>
      run({
        data: {
          bookingId,
          ...(input.reason ? { reason: input.reason } : {}),
          ...(input.reasonCategory ? { reasonCategory: input.reasonCategory } : {}),
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bookings"] });
      void queryClient.invalidateQueries({ queryKey: ["booking-cancellation", bookingId] });
      void queryClient.invalidateQueries({ queryKey: ["booking-refunds", bookingId] });
      void queryClient.invalidateQueries({ queryKey: ["payments"] });
      void queryClient.invalidateQueries({ queryKey: ["host"] });
      void queryClient.invalidateQueries({ queryKey: ["booking-cancellation-quote", bookingId] });
      void queryClient.invalidateQueries({ queryKey: ["booking-changes"] });
    },
  });
}
