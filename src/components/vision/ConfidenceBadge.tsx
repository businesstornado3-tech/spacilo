/**
 * ConfidenceBadge — how sure Spacilo AI is, stated plainly.
 *
 * Vision AI proposes; people confirm. Anything under the review threshold is
 * labelled as needing a look rather than quietly presented as fact.
 */
import { cn } from "@/lib/utils";
import { REVIEW_CONFIDENCE, formatConfidence } from "@/lib/vision";

export function ConfidenceBadge({
  confidence,
  className,
  showLabel = true,
}: {
  confidence: number;
  className?: string;
  showLabel?: boolean;
}) {
  const low = confidence < REVIEW_CONFIDENCE;
  const high = confidence >= 0.9;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 type-badge tabular-nums",
        low
          ? "bg-warning-soft text-warning-soft-foreground"
          : high
            ? "bg-success-soft text-success-soft-foreground"
            : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {formatConfidence(confidence)}
      {showLabel ? <span>{low ? "check this" : "confident"}</span> : null}
    </span>
  );
}
