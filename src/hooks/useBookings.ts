/**
 * React Query wiring for bookings. Renter and host both read through RLS, so
 * the same list query is safe on either side of the marketplace.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { requestKeys, hostRequestKeys } from "@/hooks/useStorageRequests";
import {
  activateBooking,
  completeBooking,
  createBookingFromRequest,
  getBooking,
  getBookingForRequest,
  listBookingChangeRequests,
  listMyBookings,
  listMyChangeRequests,
  myBookingsForSpace,
  requestBookingExtension,
  respondToBookingExtension,
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

/* ------------------------------------------------- lifecycle (Prompt 14) */


export const changeRequestKeys = {
  all: ["booking-changes"] as const,
  forBooking: (id: string) => ["booking-changes", id] as const,
};

/** Invalidates everything a lifecycle transition can affect. */
function useLifecycleInvalidation() {
  const qc = useQueryClient();
  return (booking: { id: string; request_id: string }) => {
    qc.setQueryData(bookingKeys.detail(booking.id), booking);
    void qc.invalidateQueries({ queryKey: bookingKeys.all });
    void qc.invalidateQueries({ queryKey: requestKeys.all });
    void qc.invalidateQueries({ queryKey: hostRequestKeys.all });
  };
}

export function useActivateBooking() {
  const invalidate = useLifecycleInvalidation();
  return useMutation({ mutationFn: activateBooking, onSuccess: invalidate });
}

export function useCompleteBooking() {
  const invalidate = useLifecycleInvalidation();
  return useMutation({ mutationFn: completeBooking, onSuccess: invalidate });
}

/** Two-party handover: this side confirms, the server decides the outcome. */
export function useConfirmHandover() {
  const invalidate = useLifecycleInvalidation();
  return useMutation({ mutationFn: confirmBookingHandover, onSuccess: invalidate });
}

export function useConfirmCollection() {
  const invalidate = useLifecycleInvalidation();
  return useMutation({ mutationFn: confirmBookingCollection, onSuccess: invalidate });
}

export function useBookingChangeRequests(bookingId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: changeRequestKeys.forBooking(bookingId ?? "none"),
    queryFn: () => listBookingChangeRequests(bookingId as string),
    enabled: Boolean(user && bookingId),
  });
}

export function useMyChangeRequests() {
  const { user } = useAuth();
  return useQuery({
    queryKey: changeRequestKeys.all,
    queryFn: listMyChangeRequests,
    enabled: Boolean(user),
  });
}

export function useRequestExtension() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: requestBookingExtension,
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: changeRequestKeys.forBooking(row.booking_id) });
      void qc.invalidateQueries({ queryKey: changeRequestKeys.all });
    },
  });
}

export function useRespondToExtension() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: respondToBookingExtension,
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: changeRequestKeys.forBooking(row.booking_id) });
      void qc.invalidateQueries({ queryKey: changeRequestKeys.all });
    },
  });
}
