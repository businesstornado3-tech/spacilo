/**
 * React Query wiring for payments.
 *
 * The return page polls the booking and its payments until the verified Stripe
 * webhook has done its work — the redirect itself is never treated as proof.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { useAuth } from "@/hooks/useAuth";
import { bookingKeys } from "@/hooks/useBookings";
import { createBookingCheckout } from "@/lib/payments.functions";
import { createExtensionCheckout } from "@/lib/extensions.functions";
import { getBookingExactAddress, listPaymentsForBooking } from "@/lib/payments-api";

export const paymentKeys = {
  forBooking: (bookingId: string) => ["payments", "booking", bookingId] as const,
  address: (bookingId: string) => ["payments", "address", bookingId] as const,
};

export function useBookingPayments(bookingId: string | undefined, poll = false) {
  const { user } = useAuth();
  return useQuery({
    queryKey: paymentKeys.forBooking(bookingId ?? "none"),
    queryFn: () => listPaymentsForBooking(bookingId as string),
    enabled: Boolean(user && bookingId),
    refetchInterval: poll ? 3000 : false,
  });
}

export function useBookingExactAddress(bookingId: string | undefined, enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: paymentKeys.address(bookingId ?? "none"),
    queryFn: () => getBookingExactAddress(bookingId as string),
    enabled: Boolean(user && bookingId && enabled),
  });
}

/** Starts server-side checkout and hands back the Stripe-hosted URL. */
export function useStartCheckout() {
  const start = useServerFn(createBookingCheckout);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bookingId: string) => start({ data: { bookingId } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: bookingKeys.all });
    },
  });
}

/**
 * Starts checkout for a host-accepted extension. This is a separate payment
 * from the original booking payment; the booking only changes once the Stripe
 * webhook confirms it.
 */
export function useStartExtensionCheckout() {
  const start = useServerFn(createExtensionCheckout);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (changeRequestId: string) => start({ data: { changeRequestId } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: bookingKeys.all });
    },
  });
}
