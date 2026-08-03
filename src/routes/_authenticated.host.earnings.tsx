/**
 * Hosting → Earnings (Prompt 12).
 *
 * Payout readiness is read from the server-side record of Stripe's own account
 * state — never from the fact that a host came back from onboarding. Amounts
 * come from the immutable earnings ledger, in integer pence.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, RefreshCw } from "lucide-react";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/common/Alert";
import { EmptyState } from "@/components/common/States";
import { formatDate, formatPrice } from "@/lib/format";
import {
  useHostEarnings,
  useHostPayoutAccount,
  useRefreshPayoutStatus,
  useStartPayoutOnboarding,
} from "@/hooks/useHostPayouts";
import { bookingReference, type HostEarningWithBooking } from "@/lib/host-earnings-api";
import { earningPeriodLabel } from "@/lib/payments/history";
import {
  EARNING_STATUS_LABEL,
  PAYOUT_STATUS_LABEL,
  PAYOUT_STATUS_NOTE,
  earningHoldNote,
  earningRefundOutcome,
  refundSettlement,
  summariseEarnings,
} from "@/lib/payments/payout-policy";

export const Route = createFileRoute("/_authenticated/host/earnings")({
  head: () => ({
    meta: [
      { title: "Earnings — Hosting — " + brand.name },
      { name: "description", content: "Your storage earnings, payout setup and release dates." },
      { property: "og:title", content: "Earnings — Hosting — " + brand.name },
      {
        property: "og:description",
        content: "Your storage earnings, payout setup and release dates.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HostEarningsPage,
});

function HostEarningsPage() {
  const { data: account, isLoading: accountLoading } = useHostPayoutAccount();
  const { data: earnings, isLoading: earningsLoading } = useHostEarnings();
  const onboarding = useStartPayoutOnboarding();
  const refresh = useRefreshPayoutStatus();

  const status = account?.status ?? "not_started";
  const rows = earnings ?? [];
  const summary = summariseEarnings(rows);

  const startOnboarding = () => {
    onboarding.mutate(undefined, {
      onSuccess: (result) => {
        if (result?.url) window.location.href = result.url;
      },
    });
  };

  return (
    <AppLayout
      mode="host"
      title="Earnings"
      description="What you've earned from storage, and when it's released."
    >
      {/* ------------------------------------------------ payout setup */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="type-label text-muted-foreground">PAYOUT SETUP</p>
            <h2 className="mt-1 type-h3">{PAYOUT_STATUS_LABEL[status]}</h2>
            <p className="mt-2 max-w-prose type-body-sm text-muted-foreground">
              {accountLoading ? "Checking your payout setup…" : PAYOUT_STATUS_NOTE[status]}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {status !== "ready" ? (
              <Button onClick={startOnboarding} disabled={onboarding.isPending}>
                {onboarding.isPending
                  ? "Opening Stripe…"
                  : status === "not_started"
                    ? "Set up payouts"
                    : "Continue payout setup"}
                <ArrowUpRight aria-hidden="true" />
              </Button>
            ) : null}
            {account ? (
              <Button
                variant="secondary"
                onClick={() => refresh.mutate()}
                disabled={refresh.isPending}
              >
                <RefreshCw aria-hidden="true" />
                {refresh.isPending ? "Checking…" : "Check status"}
              </Button>
            ) : null}
          </div>
        </div>

        {status === "not_started" ? (
          <p className="mt-4 max-w-prose type-body-sm text-muted-foreground">
            To receive earnings from your storage bookings, complete our secure payout setup with
            Stripe. Stripe collects and verifies your details — {brand.name} never sees your bank
            or identity documents.
          </p>
        ) : null}

        {onboarding.isError ? (
          <Alert tone="warning" title="Payout setup couldn't start" className="mt-4">
            {(onboarding.error as Error).message}
          </Alert>
        ) : null}

        {account && account.currently_due && (account.currently_due as string[]).length > 0 ? (
          <p className="mt-4 type-body-sm text-muted-foreground">
            Stripe still needs {(account.currently_due as string[]).length} item
            {(account.currently_due as string[]).length === 1 ? "" : "s"} from you.
          </p>
        ) : null}
      </section>

      {/* ---------------------------------------------------- summary */}
      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Ready to release" pence={summary.eligiblePence} />
        <SummaryCard label="Pending" pence={summary.pendingPence} />
        <SummaryCard label="Sent to your Stripe account" pence={summary.transferredPence} />
        <SummaryCard label="On hold" pence={summary.blockedPence + summary.adjustedPence} />
      </ul>

      <p className="mt-3 type-body-sm text-muted-foreground">
        “Sent to your Stripe account” means {brand.name} has transferred the money to your
        connected Stripe account. Stripe then pays it to your bank on its own schedule — check
        Stripe for bank payout dates.
      </p>

      {/* ---------------------------------------------------- earnings */}
      <h2 className="mt-10 type-h3">Your earnings</h2>
      {earningsLoading ? (
        <p className="mt-3 type-body-sm text-muted-foreground">Loading your earnings…</p>
      ) : rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="No earnings yet"
            description="When a renter pays for a booking, your storage earnings appear here."
          />
          <div className="mt-4 flex justify-center">
            <Button asChild variant="secondary">
              <Link to="/host/spaces">Manage my spaces</Link>
            </Button>
          </div>
        </div>
      ) : (
        <ul className="mt-4 space-y-4">
          {rows.map((earning) => (
            <EarningRow key={earning.id} earning={earning} payoutReady={status === "ready"} />
          ))}
        </ul>
      )}
    </AppLayout>
  );
}

function SummaryCard({ label, pence }: { label: string; pence: number }) {
  return (
    <li className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <p className="type-body-sm text-muted-foreground">{label}</p>
      <p className="mt-1 type-h2 tabular-nums">{formatPrice(pence)}</p>
    </li>
  );
}

function EarningRow({
  earning,
  payoutReady,
}: {
  earning: HostEarningWithBooking;
  payoutReady: boolean;
}) {
  const booking = earning.bookings;
  const released = earning.status === "transferred";
  // The refund ledger is the authority: only a settled refund ends the hold.
  const settlement = refundSettlement(booking?.booking_refunds);
  const refundOutcome = earningRefundOutcome(earning, settlement);
  const hold = earningHoldNote(earning, settlement.settled && !settlement.pending);

  return (
    <li className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="type-body font-semibold">
          Booking {bookingReference(earning.booking_id)}
          {booking?.space_title_snapshot ? ` — ${booking.space_title_snapshot}` : ""}
        </p>
        <span className="type-label rounded-full bg-muted px-3 py-1 text-muted-foreground">
          {refundOutcome ? refundOutcome.label : EARNING_STATUS_LABEL[earning.status]}
        </span>
      </div>

      {/* The period this earning was paid for is immutable history — never the
          booking's current dates, which move when an extension is paid. */}
      {earning.period_start && earning.period_end ? (
        <p className="mt-1 type-body-sm text-muted-foreground">
          {formatDate(earning.period_start)} – {formatDate(earning.period_end)} ·{" "}
          {earningPeriodLabel(earning)}
        </p>
      ) : booking ? (
        <p className="mt-1 type-body-sm text-muted-foreground">
          {formatDate(booking.start_date)} – {formatDate(booking.end_date)} ·{" "}
          {earningPeriodLabel(earning)}
        </p>
      ) : null}

      <dl className="mt-4 space-y-2">
        <Line label="Storage amount" pence={earning.gross_storage_amount_pence} />
        <Line
          label={`${brand.name} service fee paid by the renter`}
          pence={earning.platform_fee_pence}
          muted
        />
        <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3">
          <dt className="type-body font-semibold">Your earnings</dt>
          <dd className="type-price tabular-nums">
            {formatPrice(earning.host_entitlement_pence)}
          </dd>
        </div>
      </dl>

      {/* A cancellation or refund only ever reduces the storage entitlement —
          the host is never asked to send money back. */}
      {earning.host_entitlement_pence < earning.gross_storage_amount_pence ? (
        <p className="mt-3 type-body-sm text-muted-foreground">
          Reduced by{" "}
          {formatPrice(earning.gross_storage_amount_pence - earning.host_entitlement_pence)} because
          this booking was cancelled or refunded.
        </p>
      ) : null}

      {hold ? (
        <div className="mt-3">
          <Alert tone="warning" title="On hold">
            {hold}
          </Alert>
        </div>
      ) : null}

      <p className="mt-3 type-body-sm text-muted-foreground">
        {refundOutcome
          ? refundOutcome.note
          : released && earning.transfer_created_at
          ? `Sent to your Stripe account on ${formatDate(earning.transfer_created_at)}.`
          : hold
            ? "We'll release anything still due once this is resolved."
            : earning.status === "blocked"
              ? (earning.blocked_reason ?? "On hold — contact support.")
              : `Available after ${formatDate(earning.eligible_at)}.`}
      </p>

      {!payoutReady && !released && !refundOutcome ? (
        <p className="mt-2 type-body-sm text-muted-foreground">
          Complete payout setup to receive your earnings.
        </p>
      ) : null}
    </li>
  );
}

function Line({ label, pence, muted }: { label: string; pence: number; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="type-body-sm text-muted-foreground">{label}</dt>
      <dd className={muted ? "type-body-sm text-muted-foreground tabular-nums" : "type-body tabular-nums"}>
        {muted ? `−${formatPrice(pence)} retained by ${brand.name}` : formatPrice(pence)}
      </dd>
    </div>
  );
}
