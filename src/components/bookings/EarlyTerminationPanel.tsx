/**
 * "End storage early" — two-party agreement for an ACTIVE booking (Prompt 17).
 *
 * One party proposes an earlier end date; the booking only changes when the
 * other party agrees, inside the database. This panel proposes and answers —
 * it never moves dates or money itself, and the normal check-out evidence and
 * collection confirmations continue to apply afterwards.
 */
import * as React from "react";
import { CalendarClock, Loader2 } from "lucide-react";

import { brand } from "@/config/brand";
import { Alert } from "@/components/common/Alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/overlay/Modal";
import { toast } from "@/components/overlay/toast";
import { formatDate } from "@/lib/format";
import {
  EARLY_TERMINATION_LIFECYCLE_COPY,
  PROPOSAL_MESSAGE,
  SERIOUS_PROBLEM_COPY,
  agreedEarlyTermination,
  canRespond,
  checkProposal,
  earlyTerminationStatusLabel,
  openEarlyTermination,
  type ChangeRequestRow,
} from "@/lib/early-termination";
import { ACTIVE_ADJUSTMENT_COPY, EARLY_TERMINATION_INTRO } from "@/lib/payments/quote";
import {
  REASON_DETAIL_MAX,
  cancellationReasons,
} from "@/lib/payments/cancellation-reasons";
import {
  useRequestEarlyTermination,
  useRespondToEarlyTermination,
} from "@/hooks/useEarlyTermination";
import type { Tables } from "@/integrations/supabase/types";

interface Props {
  booking: Tables<"bookings">;
  changeRequests: ChangeRequestRow[];
  viewerId: string | null;
  audience: "renter" | "host";
  /** A cancellation record short-circuits everything below. */
  cancelled?: boolean;
}

const today = () => new Date().toISOString().slice(0, 10);

export function EarlyTerminationPanel({
  booking,
  changeRequests,
  viewerId,
  audience,
  cancelled = false,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [endDate, setEndDate] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [details, setDetails] = React.useState("");

  const propose = useRequestEarlyTermination();
  const respond = useRespondToEarlyTermination();

  const pending = openEarlyTermination(changeRequests);
  const agreed = agreedEarlyTermination(changeRequests);
  const isParty = viewerId === booking.renter_id || viewerId === booking.host_id;

  if (!isParty || cancelled) return null;
  if (booking.status !== "active" && !pending && !agreed) return null;

  const check = checkProposal(booking, endDate, pending);
  const problem = endDate && !check.ok ? PROPOSAL_MESSAGE[check.reason!] : null;

  const onPropose = async () => {
    try {
      await propose.mutateAsync({
        bookingId: booking.id,
        proposedEndDate: endDate,
        ...(category ? { reasonCategory: category } : {}),
        ...(details.trim() ? { reasonDetails: details.trim() } : {}),
      });
      setOpen(false);
      setEndDate("");
      setCategory("");
      setDetails("");
      toast.success(
        "Early end requested",
        `We've asked the ${audience === "renter" ? "host" : "renter"} to agree to the new end date.`,
      );
    } catch (cause) {
      toast.error(
        "We couldn't send that request",
        cause instanceof Error ? cause.message : "Please try again.",
      );
    }
  };

  const onRespond = async (accept: boolean) => {
    if (!pending) return;
    try {
      await respond.mutateAsync({ changeId: pending.id, accept });
      toast.success(
        accept ? "Early end agreed" : "Early end declined",
        accept
          ? `Storage now ends on ${formatDate(pending.proposed_end_date)}.`
          : "The booking keeps its original end date.",
      );
    } catch (cause) {
      toast.error(
        "We couldn't record that",
        cause instanceof Error ? cause.message : "Please try again.",
      );
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <h2 className="flex items-center gap-2 type-h3">
        <CalendarClock className="size-4 text-muted-foreground" aria-hidden="true" />
        End storage early
      </h2>

      {agreed && !pending ? (
        <p className="mt-1 type-body-sm text-muted-foreground">
          Agreed: storage now ends on {formatDate(agreed.proposed_end_date)}, instead of{" "}
          {formatDate(agreed.original_end_date)}. {EARLY_TERMINATION_LIFECYCLE_COPY}
        </p>
      ) : null}

      {pending ? (
        <div className="mt-2 space-y-3">
          <p className="type-body-sm text-muted-foreground">
            {earlyTerminationStatusLabel(pending, audience)} · {formatDate(pending.original_end_date)}{" "}
            → {formatDate(pending.proposed_end_date)}
          </p>
          {pending.renter_note?.trim() ? (
            <p className="type-body-sm">
              <span className="text-muted-foreground">Details: </span>
              {pending.renter_note.trim()}
            </p>
          ) : null}
          <p className="type-body-sm text-muted-foreground">{ACTIVE_ADJUSTMENT_COPY}</p>

          {canRespond(pending, viewerId) ? (
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => void onRespond(true)} disabled={respond.isPending}>
                {respond.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                Agree to end on {formatDate(pending.proposed_end_date)}
              </Button>
              <Button
                variant="secondary"
                onClick={() => void onRespond(false)}
                disabled={respond.isPending}
              >
                Keep the original end date
              </Button>
            </div>
          ) : (
            <p className="type-body-sm text-muted-foreground">
              Waiting for the {audience === "renter" ? "host" : "renter"} to respond.
            </p>
          )}
        </div>
      ) : booking.status === "active" ? (
        <>
          <p className="mt-1 type-body-sm text-muted-foreground">
            {EARLY_TERMINATION_INTRO} Both of you need to agree the new end date.
          </p>
          <Button variant="secondary" className="mt-4" onClick={() => setOpen(true)}>
            Request an earlier end date
          </Button>
        </>
      ) : null}

      <Modal open={open} onOpenChange={setOpen} title="Request an earlier end date">
        <div className="space-y-4">
          <p className="type-body-sm text-muted-foreground">
            Storage currently ends on {formatDate(booking.end_date)}.{" "}
            {EARLY_TERMINATION_LIFECYCLE_COPY}
          </p>

          <label className="block type-body-sm">
            <span className="font-medium">New end date</span>
            <input
              type="date"
              value={endDate}
              min={booking.start_date.slice(0, 10) > today() ? booking.start_date.slice(0, 10) : today()}
              max={booking.end_date.slice(0, 10)}
              onChange={(event) => setEndDate(event.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background p-3 type-body-sm"
            />
          </label>

          {problem ? (
            <Alert tone="warning" title="Check the date">
              {problem}
            </Alert>
          ) : null}

          <label className="block type-body-sm">
            <span className="font-medium">Reason</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background p-3 type-body-sm"
            >
              <option value="">Choose a reason</option>
              {cancellationReasons(audience).map((reason) => (
                <option key={reason.value} value={reason.value}>
                  {reason.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block type-body-sm">
            <span className="font-medium">Optional details</span>
            <textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              maxLength={REASON_DETAIL_MAX}
              rows={3}
              className="mt-1 w-full rounded-xl border border-border bg-background p-3 type-body-sm"
              placeholder="Anything that helps the other person decide"
            />
          </label>

          <Alert tone="info" title="Money is handled separately">
            {ACTIVE_ADJUSTMENT_COPY} {SERIOUS_PROBLEM_COPY.replace("{brand}", brand.name)}
          </Alert>

          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={propose.isPending}>
              Not now
            </Button>
            <Button
              onClick={() => void onPropose()}
              disabled={propose.isPending || !check.ok || !category}
            >
              {propose.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Send request
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
