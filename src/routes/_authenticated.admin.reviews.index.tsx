/**
 * Staff-only review moderation queue.
 *
 * Moderation can hide or restore a review. It can never edit a rating or
 * rewrite someone's words — the record stays immutable, and every action is
 * written to the moderation event log by the server.
 */
import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/States";
import { Alert } from "@/components/common/Alert";
import { Field, TextArea } from "@/components/form/Field";
import { StarRatingDisplay } from "@/components/reviews/StarRatingInput";
import { toast } from "@/components/overlay/toast";
import { useAuth } from "@/hooks/useAuth";
import { useIsSupportStaff } from "@/hooks/useSupportCases";
import { useModerateReview, useReportedReviews } from "@/hooks/useReviews";
import { MODERATION_STATUS_LABEL, REPORT_REASONS } from "@/lib/reviews";
import { formatDate } from "@/lib/format";
import type { ReportedReview } from "@/lib/reviews-api";

export const Route = createFileRoute("/_authenticated/admin/reviews/")({
  component: ReviewModerationRoute,
  head: () => ({
    meta: [
      { title: "Review moderation · Spacilo" },
      {
        name: "description",
        content: "Internal Spacilo queue for reported reviews and moderation decisions.",
      },
      { property: "og:title", content: "Review moderation · Spacilo" },
      { property: "og:description", content: "Internal Spacilo review moderation queue." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function ReviewModerationRoute() {
  const { profile } = useAuth();
  const staff = useIsSupportStaff();
  const queue = useReportedReviews(Boolean(staff.data));
  const mode = profile?.current_mode === "host" ? "host" : "renter";

  if (staff.isLoading) {
    return (
      <AppLayout mode={mode} title="Review moderation">
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      </AppLayout>
    );
  }

  if (!staff.data) {
    return (
      <AppLayout mode={mode} title="Review moderation">
        <EmptyState
          title="You don't have access to this area"
          description="Review moderation is only available to Spacilo support staff."
        />
      </AppLayout>
    );
  }

  const reviews = queue.data ?? [];

  return (
    <AppLayout
      mode={mode}
      title="Review moderation"
      description="Reviews reported by renters or hosts. Hiding removes a review from public pages and from rating averages."
    >
      <p className="type-body-sm text-muted-foreground">
        <Link to="/admin/support" className="underline">
          Back to the support queue
        </Link>
      </p>

      {queue.isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : null}

      {!queue.isLoading && reviews.length === 0 ? (
        <EmptyState
          title="Nothing reported"
          description="No reviews are currently awaiting a moderation decision."
        />
      ) : null}

      <ul className="mt-4 space-y-4">
        {reviews.map((review) => (
          <li key={review.id}>
            <ModerationRow review={review} />
          </li>
        ))}
      </ul>
    </AppLayout>
  );
}

const REASON_LABEL = Object.fromEntries(REPORT_REASONS.map((r) => [r.value, r.label]));

function ModerationRow({ review }: { review: ReportedReview }) {
  const moderate = useModerateReview();
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const act = async (action: "hide" | "restore" | "flag") => {
    if (moderate.isPending) return;
    if (action === "hide" && reason.trim().length === 0) {
      setError("Add a reason before hiding a review.");
      return;
    }
    setError(null);
    try {
      await moderate.mutateAsync({ reviewId: review.id, action, reason });
      toast.success(
        action === "hide"
          ? "Review hidden"
          : action === "restore"
            ? "Review restored"
            : "Review flagged",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't apply that moderation.");
    }
  };

  return (
    <article className="rounded-2xl border border-border bg-card p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StarRatingDisplay value={review.rating} />
          <Badge variant="neutral">
            {review.reviewer_role === "renter" ? "Renter → host" : "Host → renter"}
          </Badge>
          <Badge variant={review.moderation_status === "hidden" ? "destructive" : "outline"}>
            {MODERATION_STATUS_LABEL[review.moderation_status]}
          </Badge>
        </div>
        <p className="type-body-sm text-muted-foreground">
          Submitted {formatDate(review.submitted_at)} · {review.report_count}{" "}
          {review.report_count === 1 ? "report" : "reports"}
        </p>
      </header>

      <p className="mt-3 whitespace-pre-line break-words type-body-sm">
        {review.review_text ?? "Rating only — no written review."}
      </p>

      <ul className="mt-3 space-y-1">
        {review.reports.map((report, index) => (
          <li key={`${review.id}-${index}`} className="type-body-sm text-muted-foreground">
            {REASON_LABEL[report.reason] ?? report.reason}
            {report.details ? ` — ${report.details}` : ""} ({formatDate(report.created_at)})
          </li>
        ))}
      </ul>

      {review.moderation_reason ? (
        <p className="mt-3 type-body-sm text-muted-foreground">
          Last decision: {review.moderation_reason}
        </p>
      ) : null}

      <div className="mt-4 space-y-3 border-t border-border pt-4">
        <Field
          label="Decision note"
          htmlFor={`moderation-reason-${review.id}`}
          hint="Required when hiding a review. Stored on the moderation record."
        >
          <TextArea
            id={`moderation-reason-${review.id}`}
            rows={2}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        {error ? <Alert tone="error" title={error} /> : null}
        <div className="flex flex-wrap gap-3">
          {review.moderation_status === "hidden" ? (
            <Button size="sm" disabled={moderate.isPending} onClick={() => void act("restore")}>
              Restore review
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="destructive"
                disabled={moderate.isPending}
                onClick={() => void act("hide")}
              >
                Hide review
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={moderate.isPending}
                onClick={() => void act("flag")}
              >
                Keep flagged
              </Button>
            </>
          )}
        </div>
        <p className="type-body-sm text-muted-foreground">
          Moderation never edits a rating or someone&apos;s words. Hidden reviews are excluded from
          public pages and rating averages.
        </p>
      </div>
    </article>
  );
}
