/**
 * Host view of a single storage request, rendered entirely from the request
 * snapshot. Accepting or declining goes through `respond_to_storage_request`,
 * which is the authority on ownership, pending status and expiry.
 */
import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Boxes, CalendarRange, Loader2, MapPin, Ruler } from "lucide-react";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { ErrorState } from "@/components/common/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, TextArea } from "@/components/form/Field";
import { Modal } from "@/components/overlay/Modal";
import { toast } from "@/components/overlay/toast";
import { useHostRequest, useRespondToRequest } from "@/hooks/useStorageRequests";
import { spaceTypeLabel, type SpaceTypeValue } from "@/lib/spaces";
import {
  requestStatusNote,
  effectiveStatus,
  formatApproximateDuration,
  hostStatusDetail,
  isRespondable,
  largestItemSnapshot,
  requestSnapshotView,
  snapshotItems,
  statusMeta,
} from "@/lib/storage-requests";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/host/requests/$requestId")({
  head: () => ({
    meta: [
      { title: "Storage request — Hosting — " + brand.name },
      { name: "description", content: "Review a renter's storage request and accept or decline it." },
      { property: "og:title", content: "Storage request — Hosting — " + brand.name },
      { property: "og:description", content: "Review a renter's storage request and accept or decline it." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HostRequestDetailPage,
});

function HostRequestDetailPage() {
  const { requestId } = Route.useParams();
  const { data: request, isLoading, error, refetch } = useHostRequest(requestId);
  const respond = useRespondToRequest();
  const [acceptOpen, setAcceptOpen] = React.useState(false);
  const [declineOpen, setDeclineOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");

  const view = request ? requestSnapshotView(request) : null;
  const items = request ? snapshotItems(request) : [];
  const largest = request ? largestItemSnapshot(request) : null;

  const onRespond = async (decision: "accepted" | "declined") => {
    if (!request) return;
    try {
      await respond.mutateAsync({
        id: request.id,
        decision,
        ...(decision === "declined" && reason.trim() ? { declineReason: reason.trim() } : {}),
      });
      setAcceptOpen(false);
      setDeclineOpen(false);
      toast.success(
        decision === "accepted" ? "Request accepted" : "Request declined",
        decision === "accepted"
          ? "The renter can see your response. No booking or payment has been created."
          : "The renter can see your response.",
      );
    } catch (err) {
      toast.error(
        "We couldn't record your response",
        err instanceof Error ? err.message : "Please try again.",
      );
      void refetch();
    }
  };

  return (
    <AppLayout
      mode="host"
      title="Storage request"
      description="Everything below was captured when the renter sent this request."
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link to="/host/bookings">All requests</Link>
        </Button>
      }
    >
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : null}

      {error ? <ErrorState onRetry={() => void refetch()} /> : null}

      {!isLoading && !error && !request ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-card">
          <h2 className="type-h3">Request not found</h2>
          <p className="mt-2 type-body-sm text-muted-foreground">
            It may have been removed, or it belongs to another host.
          </p>
          <Button asChild className="mt-5">
            <Link to="/host/bookings">Back to bookings</Link>
          </Button>
        </div>
      ) : null}

      {request && view ? (
        <div className="max-w-2xl space-y-6">
          <p className="type-body-sm text-muted-foreground">
            {hostStatusDetail(effectiveStatus(request))}
          </p>

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
              <Badge variant={statusMeta(view.status).tone}>{statusMeta(view.status).label}</Badge>
            </div>

            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="type-label text-muted-foreground">Price at time of request</dt>
                <dd className="mt-1 type-price">{view.priceLabel}</dd>
              </div>
              <div>
                <dt className="type-label text-muted-foreground">Requested period</dt>
                <dd className="mt-1 flex items-center gap-1.5 type-body">
                  <CalendarRange className="size-4 text-muted-foreground" aria-hidden="true" />
                  {view.period}
                </dd>
                <dd className="type-body-sm text-muted-foreground">
                  {formatApproximateDuration(request.requested_start_date, request.requested_end_date)}
                </dd>
              </div>
              <div>
                <dt className="type-label text-muted-foreground">Renter</dt>
                <dd className="mt-1 type-body">
                  {request.renter_first_name_snapshot?.trim() || "Verified renter"}
                </dd>
              </div>
              {view.status === "pending" ? (
                <div>
                  <dt className="type-label text-muted-foreground">Respond by</dt>
                  <dd className="mt-1 type-body">{formatDate(request.expires_at)}</dd>
                </div>
              ) : request.responded_at ? (
                <div>
                  <dt className="type-label text-muted-foreground">You responded</dt>
                  <dd className="mt-1 type-body">{formatDate(request.responded_at)}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <h2 className="type-h3">What the renter wants to store</h2>
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
                {largest.longest_edge_cm
                  ? ` · longest edge ${Math.round(largest.longest_edge_cm)} cm`
                  : ""}
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
              <p className="mt-2 type-body-sm text-muted-foreground">
                SpaceFit is an estimate to help you decide. It doesn't guarantee that everything will
                physically fit.
              </p>
            </section>
          ) : null}

          {view.note ? (
            <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <h2 className="type-h3">Message from the renter</h2>
              <p className="mt-2 whitespace-pre-wrap type-body text-muted-foreground">{view.note}</p>
            </section>
          ) : null}

          {request.decline_reason ? (
            <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <h2 className="type-h3">Your reason for declining</h2>
              <p className="mt-2 whitespace-pre-wrap type-body text-muted-foreground">
                {request.decline_reason}
              </p>
            </section>
          ) : null}

          {isRespondable(request) ? (
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button onClick={() => setAcceptOpen(true)}>Accept request</Button>
              <Button variant="secondary" onClick={() => setDeclineOpen(true)}>
                Decline request
              </Button>
            </div>
          ) : null}

          <p className="type-body-sm text-muted-foreground">{requestStatusNote(request, "host")}</p>

          <Modal
            open={acceptOpen}
            onOpenChange={setAcceptOpen}
            title="Accept this storage request?"
            description="Accepting confirms that you're willing to host this renter for the requested dates. Payment and the booking are not created yet."
          >
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => void onRespond("accepted")} disabled={respond.isPending}>
                {respond.isPending ? "Saving…" : "Accept request"}
              </Button>
              <Button variant="ghost" onClick={() => setAcceptOpen(false)}>
                Cancel
              </Button>
            </div>
          </Modal>

          <Modal
            open={declineOpen}
            onOpenChange={setDeclineOpen}
            title="Decline this storage request?"
            description="The renter will see that you declined. You can add a short reason if you'd like."
          >
            <div className="space-y-4">
              <Field label="Reason (optional)" htmlFor="decline-reason">
                <TextArea
                  id="decline-reason"
                  rows={3}
                  maxLength={500}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="For example: those dates no longer work for me."
                />
              </Field>
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => void onRespond("declined")} disabled={respond.isPending}>
                  {respond.isPending ? "Saving…" : "Decline request"}
                </Button>
                <Button variant="ghost" onClick={() => setDeclineOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </Modal>
        </div>
      ) : null}
    </AppLayout>
  );
}
