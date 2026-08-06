/**
 * Availability calendar for a public listing (Prompt 26B, Phase 5).
 *
 * Shows what is already taken and what falls outside the host's published
 * window. An open date is an indication, not a reservation — availability is
 * only settled when the host accepts a request and payment completes.
 */
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  availabilitySummary,
  monthGrid,
  monthLabel,
  reasonLabel,
  type UnavailableRange,
} from "@/lib/marketplace/availability";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function AvailabilityCalendar({
  ranges,
  isLoading = false,
}: {
  ranges: UnavailableRange[] | undefined;
  isLoading?: boolean;
}) {
  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [offset, setOffset] = React.useState(0);
  const base = new Date();
  const year = base.getUTCFullYear();
  const month = base.getUTCMonth() + offset;
  const shown = new Date(Date.UTC(year, month, 1));
  const rows = ranges ?? [];
  const cells = monthGrid(shown.getUTCFullYear(), shown.getUTCMonth(), rows, today);

  return (
    <section
      aria-labelledby="availability-heading"
      className="rounded-2xl border border-border bg-card p-5 shadow-card"
    >
      <h2 id="availability-heading" className="type-h3">
        Availability
      </h2>
      <p className="mt-1 type-body-sm text-muted-foreground">
        {isLoading ? "Checking dates…" : availabilitySummary(rows, today)}
      </p>

      <div className="mt-4 flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={offset === 0}
          onClick={() => setOffset((value) => Math.max(0, value - 1))}
        >
          Previous
        </Button>
        <p className="type-body-sm font-semibold">
          {monthLabel(shown.getUTCFullYear(), shown.getUTCMonth())}
        </p>
        <Button
          variant="ghost"
          size="sm"
          disabled={offset >= 5}
          onClick={() => setOffset((value) => Math.min(5, value + 1))}
        >
          Next
        </Button>
      </div>

      {/*
        Deliberately NOT role="grid": an ARIA grid requires row containers and
        keyboard cell navigation, neither of which a read-only month view has.
        A labelled group of plain cells conveys the same information without
        promising interaction that does not exist.
      */}
      <div className="mt-3 grid grid-cols-7 gap-1" role="group" aria-label="Availability calendar">
        {WEEKDAYS.map((day) => (
          <div key={day} aria-hidden="true" className="py-1 text-center type-body-sm text-muted-foreground">
            {day}
          </div>
        ))}
        {cells.map((cell, index) => (
          <div
            key={cell.date ?? `pad-${index}`}
            {...(cell.date
              ? {
                  "aria-label": `${cell.date}${cell.unavailable ? ` — ${reasonLabel(cell.reason ?? "")}` : " — available"}`,
                }
              : { "aria-hidden": true })}
            className={cn(
              "grid aspect-square place-items-center rounded-lg type-body-sm",
              !cell.date && "opacity-0",
              cell.date && !cell.unavailable && !cell.past && "bg-success/10 text-foreground",
              cell.date && cell.unavailable && "bg-muted text-muted-foreground line-through",
              cell.past && "opacity-50",
            )}
          >
            {cell.date ? Number(cell.date.slice(8, 10)) : ""}
          </div>
        ))}
      </div>


      <ul className="mt-4 flex flex-wrap gap-4 type-body-sm text-muted-foreground">
        <li className="flex items-center gap-2">
          <span className="size-3 rounded bg-success/30" aria-hidden="true" /> Likely available
        </li>
        <li className="flex items-center gap-2">
          <span className="size-3 rounded bg-muted" aria-hidden="true" /> Booked or outside the
          host&apos;s window
        </li>
      </ul>
    </section>
  );
}
