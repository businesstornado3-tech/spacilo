/**
 * Host incoming-request confidence view (Prompt 23F).
 *
 * Everything is read back from the request's frozen snapshots by
 * `@/lib/trust/host-request-confidence` — this file only renders it. The host
 * sees exactly the facts the renter saw when they sent the request, a bounded
 * summary of the belongings (never the renter's full private record), and
 * earnings language that never implies money already exists.
 */
import { Boxes, CircleCheck, CircleHelp, CircleX, Lock, Ruler, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import type { StorageRequest } from "@/lib/storage-requests";
import type { CheckState } from "@/lib/trust/listing-confidence";
import {
  capacityComparison,
  declarationStatus,
  hostConfidenceChecks,
  hostEarningsView,
  hostInventorySummary,
  hostNextAction,
} from "@/lib/trust/host-request-confidence";

const STATE_ICON: Record<CheckState, typeof CircleCheck> = {
  pass: CircleCheck,
  note: TriangleAlert,
  action: TriangleAlert,
  fail: CircleX,
  blocked: CircleX,
  unknown: CircleHelp,
};

const STATE_COLOUR: Record<CheckState, string> = {
  pass: "text-success",
  note: "text-warning",
  action: "text-warning",
  fail: "text-destructive",
  blocked: "text-destructive",
  unknown: "text-muted-foreground",
};

const CAPACITY_TONE = {
  fits: "text-success",
  tight: "text-warning",
  over: "text-destructive",
  unknown: "text-muted-foreground",
} as const;

export function HostRequestConfidence({
  request,
  respondable,
}: {
  request: StorageRequest;
  respondable: boolean;
}) {
  const checks = hostConfidenceChecks(request);
  const capacity = capacityComparison(request);
  const earnings = hostEarningsView(request);
  const declaration = declarationStatus(request);
  const inventory = hostInventorySummary(request);
  const next = hostNextAction(request, respondable);

  return (
    <>
      <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <h2 className="type-h3">{next.headline}</h2>
        <p className="mt-1 type-body-sm text-muted-foreground">{next.detail}</p>

        <div className="mt-4 rounded-xl border border-border bg-background p-4">
          <p className="type-label text-muted-foreground">Capacity vs what they need</p>
          <p className={cn("mt-1 type-price tabular-nums", CAPACITY_TONE[capacity.state])}>
            {capacity.headline}
          </p>
          <p className="mt-1 type-body-sm text-muted-foreground">{capacity.detail}</p>
        </div>

        <ul className="mt-4 space-y-2">
          {checks.map((check) => {
            const Icon = STATE_ICON[check.state];
            return (
              <li key={check.key} className="flex gap-3 rounded-xl border border-border bg-background p-3">
                <Icon
                  className={cn("mt-0.5 size-4 shrink-0", STATE_COLOUR[check.state])}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="type-label">
                    {check.label} — <span className="font-normal">{check.statusText}</span>
                  </p>
                  <p className="mt-0.5 type-body-sm text-muted-foreground">{check.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <h2 className="type-h3">{earnings.label}</h2>
        <p className="mt-1 type-price tabular-nums">{earnings.amount ?? "—"}</p>
        <p className="mt-1 type-body-sm text-muted-foreground">{earnings.detail}</p>
        {earnings.periodDays ? (
          <p className="mt-1 type-body-xs text-muted-foreground">
            Covers the requested {earnings.periodDays} days at the price shown on this request.
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="type-h3">What they plan to store</h2>
          <span className="inline-flex items-center gap-1.5 type-body-xs text-muted-foreground">
            <Lock className="size-3.5" aria-hidden="true" />
            Summary only
          </span>
        </div>

        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="type-label text-muted-foreground">Items</dt>
            <dd className="mt-1 flex items-center gap-1.5 type-body tabular-nums">
              <Boxes className="size-4 text-muted-foreground" aria-hidden="true" />
              {inventory.itemCount}
            </dd>
          </div>
          <div>
            <dt className="type-label text-muted-foreground">Estimated space needed</dt>
            <dd className="mt-1 type-body tabular-nums">
              {capacity.requirementM3 === null ? "Not stated" : `${capacity.requirementM3.toFixed(2)} m³`}
            </dd>
          </div>
          <div>
            <dt className="type-label text-muted-foreground">Your capacity then</dt>
            <dd className="mt-1 type-body tabular-nums">
              {capacity.capacityM3 === null ? "Not stated" : `${capacity.capacityM3.toFixed(2)} m³`}
            </dd>
          </div>
        </dl>

        {inventory.largestItem ? (
          <p className="mt-4 flex items-center gap-1.5 type-body-sm text-muted-foreground">
            <Ruler className="size-4" aria-hidden="true" />
            Largest item: {inventory.largestItem.label} · {inventory.largestItem.dimensions}
          </p>
        ) : null}

        {inventory.lines.length > 0 ? (
          <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
            {inventory.lines.map((line, index) => (
              <li
                key={`${line.label}-${index}`}
                className="flex items-baseline justify-between gap-3 px-4 py-2.5"
              >
                <span className="type-body-sm">{line.label}</span>
                <span className="type-body-sm tabular-nums text-muted-foreground">
                  × {line.quantity}
                  {line.volumeM3 ? ` · ${line.volumeM3.toFixed(2)} m³` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {inventory.lineCount > inventory.lines.length ? (
          <p className="mt-2 type-body-xs text-muted-foreground">
            Showing {inventory.lines.length} of {inventory.lineCount} lines.
          </p>
        ) : null}

        <p className="mt-3 type-body-xs text-muted-foreground">{inventory.privacyNote}</p>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <h2 className="type-h3">Renter&apos;s storage declarations</h2>
        <p className="mt-1 type-body-sm text-muted-foreground">{declaration.summary}</p>
        <ul className="mt-3 space-y-1.5">
          {declaration.lines.map((line) => (
            <li key={line.label} className="flex gap-2 type-body-sm">
              {line.confirmed ? (
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
              ) : (
                <CircleHelp className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
              <span>{line.label}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
