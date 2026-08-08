/**
 * EarningsEstimateCard — what a space like this could earn.
 *
 * Always a range, always based on the *usable* capacity Spacilo AI estimated
 * rather than the raw volume of the room, and always labelled as an estimate.
 * No guarantees are made or implied.
 */
import { TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";
import type { EarningsEstimate } from "@/lib/spaceplanner/photo/earnings";

const gbp = (value: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);

export function EarningsEstimateCard({
  earnings,
  className,
}: {
  earnings: EarningsEstimate;
  className?: string;
}) {
  const { capacity } = earnings;

  return (
    <section className={cn("rounded-2xl border border-border bg-card p-4 sm:p-5", className)}>
      <h3 className="flex items-center gap-2 type-h4">
        <TrendingUp className="size-4 text-primary" aria-hidden="true" />
        Estimated earning potential
      </h3>

      <p className="mt-2 type-h2">
        {gbp(earnings.monthlyMin)}–{gbp(earnings.monthlyMax)}
        <span className="type-body-sm text-muted-foreground"> / month</span>
      </p>
      <p className="mt-0.5 type-body-sm text-muted-foreground">
        Around {gbp(earnings.annualMin)}–{gbp(earnings.annualMax)} a year, based on about{" "}
        {capacity.rentableVolumeM3.toFixed(1)}m³ of usable, rentable space.
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-surface p-3">
          <dt className="type-overline text-muted-foreground">Estimated usable</dt>
          <dd className="mt-0.5 type-card-title">{capacity.usableVolumeM3.toFixed(1)}m³</dd>
        </div>
        <div className="rounded-xl bg-surface p-3">
          <dt className="type-overline text-muted-foreground">Estimated in use</dt>
          <dd className="mt-0.5 type-card-title">{capacity.currentUtilisation}%</dd>
        </div>
      </dl>

      <ul className="mt-3 space-y-1">
        {earnings.basis.map((line) => (
          <li key={line} className="type-body-xs text-muted-foreground">
            · {line}
          </li>
        ))}
      </ul>

      <p className="mt-3 type-body-xs text-muted-foreground">
        An estimate based on the photos and typical local demand — not a guaranteed income. Your
        actual earnings depend on demand, availability and the price you set.
      </p>
    </section>
  );
}
