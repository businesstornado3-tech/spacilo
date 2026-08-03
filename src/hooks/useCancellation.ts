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
  listBookingRefunds,
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
    mutationFn: (reason?: string) =>
      run({ data: { bookingId, ...(reason ? { reason } : {}) } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bookings"] });
      void queryClient.invalidateQueries({ queryKey: ["booking-cancellation", bookingId] });
      void queryClient.invalidateQueries({ queryKey: ["booking-refunds", bookingId] });
      void queryClient.invalidateQueries({ queryKey: ["payments"] });
      void queryClient.invalidateQueries({ queryKey: ["host"] });
    },
  });
}
