/**
 * Early termination of an active booking (Prompt 17).
 *
 * The mutations are thin: every decision (who may ask, who may answer, whether
 * the end date moves) is made inside the database RPCs.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { requestEarlyTermination, respondToEarlyTermination } from "@/lib/early-termination-api";
import { bookingKeys, changeRequestKeys } from "@/hooks/useBookings";

function useInvalidate() {
  const qc = useQueryClient();
  return (bookingId: string) => {
    void qc.invalidateQueries({ queryKey: changeRequestKeys.forBooking(bookingId) });
    void qc.invalidateQueries({ queryKey: changeRequestKeys.all });
    void qc.invalidateQueries({ queryKey: bookingKeys.all });
  };
}

export function useRequestEarlyTermination() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: requestEarlyTermination,
    onSuccess: (row) => invalidate(row.booking_id),
  });
}

export function useRespondToEarlyTermination() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: respondToEarlyTermination,
    onSuccess: (row) => invalidate(row.booking_id),
  });
}
