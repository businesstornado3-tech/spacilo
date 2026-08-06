/**
 * Sticky booking panel for the public listing page.
 *
 * The figures here are an *estimate* the renter can play with before they
 * commit: they use the same deterministic pricing engine as the server, but
 * the authoritative total is always the one calculated when the request turns
 * into a booking. Nothing here takes payment and nothing here is negotiable
 * client-side — the panel only ever renders the host's published rates.
 */
import * as React from "react";
import { CalendarRange, Info } from "lucide-react";

import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/format";
import { serviceFeePence } from "@/lib/payments/fees";
import {
  DEFAULT_MINIMUM_STAY_DAYS,
  formatDuration,
  meetsMinimumStay,
  minimumStayMessage,
  priceStorage,
} from "@/lib/pricing/duration";
import { PriceDisplay } from "@/components/marketplace/PriceDisplay";
import { RequestSpaceCta } from "@/components/requests/RequestSpaceCta";

export interface BookingPanelProps {
  spaceId: string;
  monthlyPricePence: number | null;
  weeklyPricePence?: number | null;
  dailyPricePence?: number | null;
  minimumStayDays?: number | null;
  availabilityNote?: string | null;
  className?: string;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function BookingPanel({
  spaceId,
  monthlyPricePence,
  weeklyPricePence = null,
  dailyPricePence = null,
  minimumStayDays,
  availabilityNote,
  className,
}: BookingPanelProps) {
  const minimum = minimumStayDays ?? DEFAULT_MINIMUM_STAY_DAYS;
  const [startDate, setStartDate] = React.useState(todayIso);
  const [endDate, setEndDate] = React.useState(() => addDays(todayIso(), Math.max(minimum, 30)));

  const estimate = React.useMemo(() => {
    try {
      return priceStorage(startDate, endDate, {
        monthlyPricePence: monthlyPricePence ?? null,
        weeklyPricePence,
        dailyPricePence,
      });
    } catch {
      return null;
    }
  }, [startDate, endDate, monthlyPricePence, weeklyPricePence, dailyPricePence]);

  const longEnough = estimate ? meetsMinimumStay(estimate.durationDays, minimum) : false;
  const fee = estimate ? serviceFeePence(estimate.storageAmountPence) : 0;

  return (
    <div className={cn("space-y-4", className)}>
      <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          {typeof monthlyPricePence === "number" ? (
            <PriceDisplay amount={monthlyPricePence} size="lg" />
          ) : (
            <p className="type-h3">Price on request</p>
          )}
          {minimum > 1 ? (
            <p className="type-body-sm text-muted-foreground">{formatDuration(minimum)} minimum</p>
          ) : null}
        </div>
        {availabilityNote ? (
          <p className="mt-2 flex items-start gap-1.5 type-body-sm text-muted-foreground">
            <CalendarRange className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {availabilityNote}
          </p>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="type-label text-muted-foreground">Move in</span>
            <input
              type="date"
              value={startDate}
              min={todayIso()}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 type-body-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
          </label>
          <label className="block">
            <span className="type-label text-muted-foreground">Move out</span>
            <input
              type="date"
              value={endDate}
              min={addDays(startDate, 1)}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 type-body-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
          </label>
        </div>

        {estimate ? (
          <div className="mt-4 space-y-2 border-t border-border pt-4">
            <Row
              label={`Storage · ${formatDuration(estimate.durationDays)}`}
              value={formatPrice(estimate.storageAmountPence)}
            />
            <Row label={`${brand.name} service fee`} value={formatPrice(fee)} />
            <Row
              label="Estimated total"
              value={formatPrice(estimate.storageAmountPence + fee)}
              strong
            />
            {!longEnough ? (
              <p className="type-body-sm text-warning-soft-foreground">
                {minimumStayMessage(minimum)}
              </p>
            ) : null}
            <p className="flex items-start gap-1.5 type-body-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              Estimate only. {brand.name} calculates your final total for the dates the host
              accepts, and you see it before you pay. Sending a request never takes payment.
            </p>
          </div>
        ) : (
          <p className="mt-4 border-t border-border pt-4 type-body-sm text-muted-foreground">
            Choose a move-out date after your move-in date to see an estimated total.
          </p>
        )}
      </section>

      <RequestSpaceCta spaceId={spaceId} />
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <p
      className={cn(
        "flex items-baseline justify-between gap-3",
        strong ? "type-body font-semibold" : "type-body-sm text-muted-foreground",
      )}
    >
      <span className="min-w-0">{label}</span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </p>
  );
}
