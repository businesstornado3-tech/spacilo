/**
 * Read-only summary of a storage request. Every value comes from the request
 * snapshot, so a request looks the same today as it did the day it was sent.
 */
import { Boxes, CalendarRange, MapPin, Ruler } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { spaceTypeLabel, type SpaceTypeValue } from "@/lib/spaces";
import {
  requestStatusNote,
  expiryLabel,
  formatApproximateDuration,
  largestItemSnapshot,
  requestSnapshotView,
  snapshotItems,
  statusMeta,
  type StorageRequest,
} from "@/lib/storage-requests";

export function RequestStatusBadge({ request }: { request: StorageRequest }) {
  const view = requestSnapshotView(request);
  const meta = statusMeta(view.status);
  return <Badge variant={meta.tone}>{meta.label}</Badge>;
}

export function RequestSummary({
  request,
  audience = "renter",
}: {
  request: StorageRequest;
  audience?: "renter" | "host";
}) {
  const view = requestSnapshotView(request);
  const items = snapshotItems(request);
  const largest = largestItemSnapshot(request);
  const expiry = expiryLabel(request);

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
          </div>
          <RequestStatusBadge request={request} />
        </div>

        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="type-label text-muted-foreground">Price at time of request</dt>
            <dd className="mt-1 type-price">{view.priceLabel}</dd>
          </div>
          <div>
            <dt className="type-label text-muted-foreground">Dates</dt>
            <dd className="mt-1 flex items-center gap-1.5 type-body">
              <CalendarRange className="size-4 text-muted-foreground" aria-hidden="true" />
              {view.period}
            </dd>
            <dd className="type-body-sm text-muted-foreground">
              {formatApproximateDuration(request.requested_start_date, request.requested_end_date)}
            </dd>
          </div>
        </dl>

        {expiry ? <p className="mt-4 type-body-sm text-muted-foreground">{expiry}</p> : null}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <h2 className="type-h3">What you asked to store</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
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
          <div>
            <dt className="type-label text-muted-foreground">Space capacity then</dt>
            <dd className="mt-1 type-body tabular-nums">
              {view.capacityM3 === null ? "Not stated" : `${view.capacityM3.toFixed(2)} m³`}
            </dd>
          </div>
        </dl>

        {largest ? (
          <p className="mt-4 flex items-center gap-1.5 type-body-sm text-muted-foreground">
            <Ruler className="size-4" aria-hidden="true" />
            Largest item: {largest.label}
            {largest.longest_edge_cm ? ` · longest edge ${Math.round(largest.longest_edge_cm)} cm` : ""}
          </p>
        ) : null}

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
        </section>
      ) : null}

      {view.note ? (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <h2 className="type-h3">Your message to the host</h2>
          <p className="mt-2 whitespace-pre-wrap type-body text-muted-foreground">{view.note}</p>
        </section>
      ) : null}

      <p className="type-body-sm text-muted-foreground">{requestStatusNote(request, audience)}</p>
    </div>
  );
}
