/**
 * A published review, rendered safely.
 *
 * Review text is plain React text — never HTML — and the payload behind it
 * carries no booking, payment, inventory or contact information. Public
 * reviews show the month only, following the existing display-name convention.
 */
import * as React from "react";
import { Flag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, NativeSelect, TextArea } from "@/components/form/Field";
import { Alert } from "@/components/common/Alert";
import { StarRatingDisplay } from "@/components/reviews/StarRatingInput";
import { toast } from "@/components/overlay/toast";
import { useReportReview } from "@/hooks/useReviews";
import {
  REPORT_REASONS,
  SUBRATINGS,
  formatReviewMonth,
  type PublicReview,
  type ReportReason,
} from "@/lib/reviews";
import { cn } from "@/lib/utils";

export function ReviewCard({
  review,
  heading,
  canReport = false,
  className,
}: {
  review: PublicReview;
  heading?: string;
  canReport?: boolean;
  className?: string;
}) {
  const [reporting, setReporting] = React.useState(false);

  const subs = SUBRATINGS.map((sub) => ({
    ...sub,
    value:
      sub.key === "accuracy"
        ? review.rating_accuracy
        : sub.key === "access"
          ? review.rating_access
          : sub.key === "communication"
            ? review.rating_communication
            : review.rating_condition,
  })).filter((sub) => sub.value !== null);

  return (
    <article className={cn("rounded-xl border border-border bg-card p-4", className)}>
      {heading ? <p className="type-label text-muted-foreground">{heading}</p> : null}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="type-label truncate">{review.author_name}</p>
          <p className="type-body-sm text-muted-foreground">
            {formatReviewMonth(review.submitted_at)}
          </p>
        </div>
        <StarRatingDisplay value={review.rating} />
      </div>

      {review.review_text ? (
        <p className="mt-3 whitespace-pre-line break-words type-body-sm text-foreground">
          {review.review_text}
        </p>
      ) : (
        <p className="mt-3 type-body-sm text-muted-foreground">Rating only — no written review.</p>
      )}

      {subs.length > 0 ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1">
          {subs.map((sub) => (
            <div key={sub.key} className="flex items-center justify-between gap-2">
              <dt className="type-body-sm text-muted-foreground">{sub.label}</dt>
              <dd className="type-body-sm tabular-nums">{sub.value} / 5</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {canReport ? (
        <div className="mt-3 border-t border-border pt-3">
          {reporting ? (
            <ReportReviewForm reviewId={review.id} onDone={() => setReporting(false)} />
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setReporting(true)}>
              <Flag className="size-4" aria-hidden="true" />
              Report review
            </Button>
          )}
        </div>
      ) : null}
    </article>
  );
}

/** Reporting raises a moderation signal. It never hides the review itself. */
export function ReportReviewForm({
  reviewId,
  onDone,
}: {
  reviewId: string;
  onDone: () => void;
}) {
  const report = useReportReview();
  const [reason, setReason] = React.useState<ReportReason>("personal_information");
  const [details, setDetails] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (report.isPending) return;
    try {
      await report.mutateAsync({ reviewId, reason, details });
      toast.success(
        "Report sent",
        "Our support team will look at it. The review stays visible in the meantime.",
      );
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't send that report.");
    }
  };

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
      <Field label="Why are you reporting this review?" htmlFor={`report-reason-${reviewId}`}>
        <NativeSelect
          id={`report-reason-${reviewId}`}
          value={reason}
          onChange={(e) => setReason(e.target.value as ReportReason)}
        >
          {REPORT_REASONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field
        label="Anything else we should know?"
        htmlFor={`report-details-${reviewId}`}
        hint="Optional."
      >
        <TextArea
          id={`report-details-${reviewId}`}
          rows={3}
          maxLength={1000}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />
      </Field>
      {error ? <Alert tone="error" title={error} /> : null}
      <p className="type-body-sm text-muted-foreground">
        Reporting doesn&apos;t remove a review. Support decides whether it stays.
      </p>
      <div className="flex gap-3">
        <Button type="submit" size="sm" disabled={report.isPending}>
          {report.isPending ? "Sending…" : "Send report"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
