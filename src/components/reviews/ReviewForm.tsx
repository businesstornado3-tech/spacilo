/**
 * Review submission form. One-way door: the copy says so, and the server
 * enforces it — there is no update path for a submitted review anywhere.
 */
import * as React from "react";
import { Loader2 } from "lucide-react";

import { Alert } from "@/components/common/Alert";
import { Button } from "@/components/ui/button";
import { Field, TextArea } from "@/components/form/Field";
import { StarRatingInput } from "@/components/reviews/StarRatingInput";
import { toast } from "@/components/overlay/toast";
import { useSubmitReview } from "@/hooks/useReviews";
import {
  MAX_REVIEW_TEXT,
  SUBRATINGS,
  validateReviewDraft,
  type ReviewerRole,
  type SubratingKey,
} from "@/lib/reviews";

export function ReviewForm({
  bookingId,
  audience,
  onSubmitted,
  onCancel,
}: {
  bookingId: string;
  audience: ReviewerRole;
  onSubmitted?: () => void;
  onCancel?: () => void;
}) {
  const submit = useSubmitReview();
  const [rating, setRating] = React.useState<number | null>(null);
  const [text, setText] = React.useState("");
  const [subratings, setSubratings] = React.useState<Partial<Record<SubratingKey, number>>>({});
  const [error, setError] = React.useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submit.isPending) return; // double-click guard; the RPC is idempotent too
    const problem = validateReviewDraft({ rating, text, subratings });
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    try {
      await submit.mutateAsync({
        bookingId,
        rating: rating as number,
        text,
        ...(audience === "renter" ? { subratings } : {}),
      });
      toast.success("Review submitted", "Thanks — reviews can't be edited after submission.");
      onSubmitted?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't save your review.");
    }
  };

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-5">
      <Field
        label="Overall experience"
        htmlFor="review-rating"
        hint={
          audience === "renter"
            ? "How was storing your belongings with this host?"
            : "How was this booking with this renter?"
        }
      >
        <StarRatingInput
          id="review-rating"
          label="Overall experience, 1 to 5 stars"
          value={rating}
          onChange={setRating}
        />
      </Field>

      {audience === "renter" ? (
        <fieldset className="space-y-3 rounded-xl border border-border p-4">
          <legend className="px-1 type-label">Optional details</legend>
          {SUBRATINGS.map((sub) => (
            <div key={sub.key} className="flex flex-wrap items-center justify-between gap-2">
              <span className="type-body-sm">
                {sub.label}
                <span className="block type-body-sm text-muted-foreground">{sub.hint}</span>
              </span>
              <StarRatingInput
                id={`review-${sub.key}`}
                size="sm"
                label={`${sub.label}, 1 to 5 stars`}
                value={subratings[sub.key] ?? null}
                onChange={(value) => setSubratings((prev) => ({ ...prev, [sub.key]: value }))}
              />
            </div>
          ))}
        </fieldset>
      ) : null}

      <Field
        label={audience === "renter" ? "Tell us about your experience" : "Tell us about the booking"}
        htmlFor="review-text"
        hint={`Optional. Up to ${MAX_REVIEW_TEXT} characters.`}
      >
        <TextArea
          id="review-text"
          rows={5}
          maxLength={MAX_REVIEW_TEXT}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            audience === "renter"
              ? "Access, condition, communication — whatever would help the next person."
              : "Communication, handover and how the booking went."
          }
        />
      </Field>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <p className="type-body-sm text-muted-foreground">
        Reviews can&apos;t be edited after submission. Your review stays private until the other
        person submits theirs or the review period ends.
      </p>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={submit.isPending}>
          {submit.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          {submit.isPending ? "Submitting…" : "Submit review"}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
