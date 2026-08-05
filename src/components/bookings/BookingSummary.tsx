/**
 * Read-only summary of a booking. Every value comes from the booking snapshot
 * copied at creation time, so a later listing edit can't rewrite it.
 */
import { Boxes, CalendarRange, MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { spaceTypeLabel, type SpaceTypeValue } from "@/lib/spaces";
import { formatPrice } from "@/lib/format";
import { lifecycleMeta, lifecycleState } from "@/lib/bookings-lifecycle";
import type { StorageRefundSummary } from "@/lib/payments/history";
import {
  bookingItems,
  bookingStatusMeta,
  bookingView,
  formatBookingDuration,
  type Booking,
} from "@/lib/bookings";

/** Single source of status wording across the app: the lifecycle read model. */
export function BookingStatusBadge({ booking }: { booking: Booking }) {
  const meta = lifecycleMeta(lifecycleState(booking));
  return <Badge variant={meta.tone}>{meta.label}</Badge>;
}

export function BookingSummary({
  booking,
  paidStoragePence,
  storageRefund,
}: {
  booking: Booking;
  /** Cumulative storage paid, derived from successful payments. */
  paidStoragePence?: number | null;
  /** Paid / refunded / net storage, derived from payments and their refunds. */
  storageRefund?: StorageRefundSummary | null;
}) {
  const view = bookingView(booking, paidStoragePence);
  const paid = typeof paidStoragePence === "number" && paidStoragePence > 0;
  const items = bookingItems(booking);
  const refunded = Boolean(storageRefund?.hasRefund);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="type-h3">{view.spaceTitle}</h2>
            <p className="mt-1 flex items-center gap-1.5 type-body-sm text-muted-foreground">
              <MapPin className="size-4" aria-hidden="true" />
              {spaceTypeLabel(view.spaceType as SpaceTypeValue)}
              {view.area ? ` · ${view.area}` : ""}
            </p>
            {booking.status === "confirmed" ? null : booking.status === "cancelled" ? (
              <p className="type-body-sm text-muted-foreground">
                The storage address is no longer available because this booking was cancelled.
              </p>
            ) : (
              <p className="type-body-sm text-muted-foreground">
                Approximate location only. The exact address is released once the booking is
                confirmed and paid.
              </p>
            )}
          </div>
          <BookingStatusBadge booking={booking} />
        </div>

        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="type-label text-muted-foreground">
              {refunded ? "Storage payments" : paid ? "Storage paid" : "Agreed storage price"}
            </dt>
            <dd className="mt-1 type-price">{view.priceLabel}</dd>
            {refunded && storageRefund ? (
              <>
                <dd className="mt-1 type-body-sm tabular-nums text-muted-foreground">
                  Storage refunded: {formatPrice(storageRefund.refundedStoragePence)}
                </dd>
                <dd className="type-body-sm tabular-nums text-muted-foreground">
                  Net storage paid: {formatPrice(storageRefund.netStoragePence)}
                </dd>
                <dd className="mt-1">
                  <Badge variant="neutral">
                    {storageRefund.fullyRefunded ? "Fully refunded" : "Partially refunded"}
                  </Badge>
                </dd>
              </>
            ) : null}
          </div>
          <div>
            <dt className="type-label text-muted-foreground">Dates</dt>
            <dd className="mt-1 flex items-center gap-1.5 type-body">
              <CalendarRange className="size-4 text-muted-foreground" aria-hidden="true" />
              {view.period}
            </dd>
            <dd className="type-body-sm text-muted-foreground">
              {formatBookingDuration(booking)}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <h2 className="type-h3">What you're storing</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="type-label text-muted-foreground">Items</dt>
            <dd className="mt-1 flex items-center gap-1.5 type-body tabular-nums">
              <Boxes className="size-4 text-muted-foreground" aria-hidden="true" />
              {view.itemCount}
            </dd>
          </div>
          <div>
            <dt className="type-label text-muted-foreground">Estimated space needed</dt>
            <dd className="mt-1 type-body tabular-nums">{view.requirementM3.toFixed(2)} m³</dd>
          </div>
        </dl>

        {items.length > 0 ? (
          <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
            {items.map((item, index) => (
              <li
                key={`${item.catalogue_key ?? item.label}-${index}`}
                className="flex items-baseline justify-between gap-3 px-4 py-2.5"
              >
                <span className="type-body-sm">{item.label}</span>
                <span className="type-body-sm tabular-nums text-muted-foreground">
                  × {item.quantity}
                  {item.estimated_volume_m3
                    ? ` · ${Number(item.estimated_volume_m3).toFixed(2)} m³`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {view.spaceFitScore !== null ? (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="type-h3">SpaceFit at time of request</h2>
            <span className="inline-flex items-center rounded-full bg-primary-soft px-2.5 py-1 type-badge tabular-nums text-primary-soft-foreground">
              {view.spaceFitScore}% SpaceFit
            </span>
          </div>
          {view.spaceFitLabel ? (
            <p className="mt-1 type-body-sm font-semibold">{view.spaceFitLabel}</p>
          ) : null}
          <p className="mt-1 type-body-sm text-muted-foreground">SpaceFit is an estimate.</p>
        </section>
      ) : null}

      <SnapshotPackPlan
        planSnapshot={booking.spacefit_plan_snapshot}
        dimensionsSnapshot={booking.spacefit_space_dimensions_snapshot}
        title="SpaceFit Pack — agreed for this booking"
        intro="Carried over from the request. Use it as a guide on handover day."
      />

    </div>
  );
}
