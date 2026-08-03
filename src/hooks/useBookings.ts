/**
 * React Query wiring for bookings. Renter and host both read through RLS, so
 * the same list query is safe on either side of the marketplace.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { requestKeys, hostRequestKeys } from "@/hooks/useStorageRequests";
import {
  createBookingFromRequest,
  getBooking,
  getBookingForRequest,
  listMyBookings,
  myBookingsForSpace,
} from "@/lib/bookings-api";

export const bookingKeys = {
  all: ["bookings"] as const,
  detail: (id: string) => ["bookings", id] as const,
  forRequest: (requestId: string) => ["bookings", "request", requestId] as const,
};

export function useMyBookings() {
  const { user } = useAuth();
  return useQuery({ queryKey: bookingKeys.all, queryFn: listMyBookings, enabled: Boolean(user) });
}

export function useBooking(id: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: bookingKeys.detail(id ?? "none"),
    queryFn: () => getBooking(id as string),
    enabled: Boolean(user && id),
  });
}

export function useBookingForRequest(requestId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: bookingKeys.forRequest(requestId ?? "none"),
    queryFn: () => getBookingForRequest(requestId as string),
    enabled: Boolean(user && requestId),
  });
}

/**
 * Creating a booking is idempotent server-side: a second call for the same
 * request returns the existing booking rather than creating another.
 */
export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => createBookingFromRequest(requestId),
    onSuccess: (booking) => {
      qc.setQueryData(bookingKeys.detail(booking.id), booking);
      qc.setQueryData(bookingKeys.forRequest(booking.request_id), booking);
      void qc.invalidateQueries({ queryKey: bookingKeys.all });
      void qc.invalidateQueries({ queryKey: requestKeys.all });
      void qc.invalidateQueries({ queryKey: hostRequestKeys.all });
    },
  });
}

/** All of this renter's bookings for one listing, for the listing CTA. */
export function useMyBookingsForSpace(spaceId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["bookings", "space", spaceId ?? "none"] as const,
    queryFn: () => myBookingsForSpace(spaceId as string, user!.id),
    enabled: Boolean(user && spaceId),
  });
}
