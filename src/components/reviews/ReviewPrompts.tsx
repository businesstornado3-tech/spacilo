/**
 * Dashboard prompts for completed bookings still awaiting this person's review.
 *
 * Each row asks the server for its own review state, so a prompt disappears the
 * moment the review lands or the 14-day window closes — the browser clock never
 * decides eligibility.
 */
import { Link } from "@tanstack/react-router";
import { Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useMyBookings } from "@/hooks/useBookings";
import { useBookingReviewState } from "@/hooks/useReviews";
import { formatDate } from "@/lib/format";
import { reviewActionPrompt, reviewWindowLabel } from "@/lib/reviews";
import type { Tables } from "@/integrations/supabase/types";

type Booking = Tables<"bookings">;

export function ReviewPrompts({ audience }: { audience: "renter" | "host" }) {
  const { user } = useAuth();
  const { data: bookings } = useMyBookings();

  const completed = (bookings ?? []).filter(
    (booking) =>
      booking.status === "completed" &&
      (audience === "renter" ? booking.renter_id === user?.id : booking.host_id === user?.id),
  );
  if (completed.length === 0) return null;

  return (
    <section aria-label="Reviews to leave" className="mt-6 space-y-3">
      {completed.map((booking) => (
        <ReviewPromptRow key={booking.id} booking={booking} audience={audience} />
      ))}
    </section>
  );
}

function ReviewPromptRow({
  booking,
  audience,
}: {
  booking: Booking;
  audience: "renter" | "host";
}) {
  const { data: state } = useBookingReviewState(booking.id);
  const prompt = reviewActionPrompt(state, audience);
  if (!prompt || !state) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="min-w-0">
        <p className="flex items-center gap-2 type-body font-semibold">
          <Star className="size-4 text-warning" aria-hidden="true" />
          {booking.space_title_snapshot ?? "Storage booking"}
        </p>
        <p className="type-body-sm text-muted-foreground">
          {formatDate(booking.start_date)} – {formatDate(booking.end_date)}
        </p>
        <p className="mt-1 type-body-sm">
          {prompt} {reviewWindowLabel(state.window_closes_at, new Date(state.server_time))}.
        </p>
      </div>
      <Button asChild size="sm">
        {audience === "renter" ? (
          <Link to="/renter/bookings/$bookingId" params={{ bookingId: booking.id }}>
            Leave a review
          </Link>
        ) : (
          <Link to="/host/bookings">Leave a review</Link>
        )}
      </Button>
    </div>
  );
}
