/** React Query wiring for the bilateral Storage Agreement. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { bookingKeys } from "@/hooks/useBookings";
import { acceptAgreement, ensureAgreement, getAgreementState } from "@/lib/agreements-api";

export const agreementKeys = {
  forBooking: (bookingId: string) => ["storage-agreement", bookingId] as const,
};

export function useStorageAgreement(bookingId: string | undefined, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: agreementKeys.forBooking(bookingId ?? "none"),
    queryFn: async () => {
      // Idempotent server-side: a second call returns the existing agreement.
      await ensureAgreement(bookingId as string);
      return getAgreementState(bookingId as string);
    },
    enabled: Boolean(user && bookingId && enabled),
  });
}

export function useAcceptStorageAgreement(bookingId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agreementVersionId: string) =>
      acceptAgreement({ bookingId: bookingId as string, agreementVersionId }),
    onSuccess: () => {
      if (!bookingId) return;
      void qc.invalidateQueries({ queryKey: agreementKeys.forBooking(bookingId) });
      void qc.invalidateQueries({ queryKey: bookingKeys.detail(bookingId) });
    },
  });
}
