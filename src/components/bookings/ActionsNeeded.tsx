/**
 * Dashboard notifications: the bookings waiting on THIS person.
 *
 * Both sides read the same lifecycle rules, so a renter and a host never see
 * contradictory prompts about the same booking.
 */
import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useMyBookings } from "@/hooks/useBookings";
import { bookingsNeedingAction } from "@/lib/bookings-lifecycle";
import { formatDate } from "@/lib/format";

export function ActionsNeeded({ audience }: { audience: "renter" | "host" }) {
  const { user } = useAuth();
  const { data: bookings } = useMyBookings();

  const mine = (bookings ?? []).filter((booking) =>
    audience === "renter" ? booking.renter_id === user?.id : booking.host_id === user?.id,
  );
  const outstanding = bookingsNeedingAction(mine, audience);
  if (outstanding.length === 0) return null;

  return (
    <section className="mt-8 rounded-2xl border border-warning/40 bg-warning-soft p-5">
      <h2 className="flex items-center gap-2 type-h3">
        <Bell className="size-5 text-warning" aria-hidden="true" />
        Needs your attention
      </h2>
      <ul className="mt-4 space-y-3">
        {outstanding.map(({ booking, prompt }) => (
          <li
            key={booking.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-card p-4 shadow-card"
          >
            <div>
              <p className="type-body font-semibold">
                {booking.space_title_snapshot ?? "Storage booking"}
              </p>
              <p className="type-body-sm text-muted-foreground">
                {formatDate(booking.start_date)} – {formatDate(booking.end_date)}
              </p>
              <p className="mt-1 type-body-sm">{prompt}</p>
            </div>
            <Button asChild size="sm">
              {audience === "renter" ? (
                <Link to="/renter/bookings/$bookingId" params={{ bookingId: booking.id }}>
                  Open booking
                </Link>
              ) : (
                <Link to="/host/bookings">Open bookings</Link>
              )}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
