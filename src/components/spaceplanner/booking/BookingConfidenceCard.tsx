/**
 * BookingConfidenceCard — the premium summary a renter reads before booking.
 *
 * Every row comes from `buildBookingConfidence`, so nothing here can say more
 * than the deterministic engine actually found.
 */
import { cn } from "@/lib/utils";
import { FitScore } from "@/components/spaceplanner/FitScore";
import { CompatibilityBadge } from "@/components/spaceplanner/booking/CompatibilityBadge";
import type { BookingConfidence } from "@/lib/spaceplanner/booking-confidence";

export function BookingConfidenceCard({
  confidence,
  spaceName,
  delta = 0,
  className,
}: {
  confidence: BookingConfidence;
  spaceName?: string;
  /** Score movement since suggestions were applied. */
  delta?: number;
  className?: string;
}) {
  return (
    <section
      aria-labelledby="booking-confidence-heading"
      className={cn("rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 id="booking-confidence-heading" className="type-h4">
            EarnRoom AI Score
          </h3>
          {spaceName ? (
            <p className="type-body-sm text-muted-foreground">Planned against {spaceName}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {delta !== 0 ? (
            <span
              className={cn(
                "type-badge",
                delta > 0 ? "text-success-soft-foreground" : "text-destructive",
              )}
            >
              {delta > 0 ? `+${delta}` : delta} with your changes
            </span>
          ) : null}
          <CompatibilityBadge tone={confidence.tone}>{confidence.score.band}</CompatibilityBadge>
        </div>
      </div>

      <FitScore score={confidence.score} className="mt-4" />

      <dl className="mt-4 grid gap-2 sm:grid-cols-2">
        {confidence.rows.map((row) => (
          <div
            key={row.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2 rounded-xl bg-surface px-3 py-2"
          >
            <div className="min-w-0">
              <dt className="type-label">{row.label}</dt>
              {row.detail ? (
                <dd className="type-badge text-muted-foreground">{row.detail}</dd>
              ) : null}
            </div>
            <dd className="shrink-0">
              <CompatibilityBadge tone={row.tone}>{row.value}</CompatibilityBadge>
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 type-badge text-muted-foreground">
        Estimates from typical dimensions and the measurements this host published — not a survey.
      </p>
    </section>
  );
}
