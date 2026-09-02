/**
 * ConfidenceBadge — how sure EarnRoom AI is, stated plainly.
 *
 * Vision AI proposes; people confirm. Phase 6O gives the bands their own
 * words, so a 61% guess can never look like a 95% observation:
 *   ≥80%  confident
 *   60–79% please check
 *   <60%  EarnRoom AI isn't sure
 */
import { cn } from "@/lib/utils";
import { confidenceTier, formatConfidence } from "@/lib/vision";

export function ConfidenceBadge({
  confidence,
  className,
  showLabel = true,
}: {
  confidence: number;
  className?: string;
  showLabel?: boolean;
}) {
  const tier = confidenceTier(confidence);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 type-badge tabular-nums",
        tier === "unsure"
          ? "bg-destructive-soft text-destructive-soft-foreground"
          : tier === "check"
            ? "bg-warning-soft text-warning-soft-foreground"
            : "bg-success-soft text-success-soft-foreground",
        className,
      )}
    >
      {formatConfidence(confidence)}
      {showLabel ? (
        <span>{tier === "unsure" ? "not sure" : tier === "check" ? "please check" : "confident"}</span>
      ) : null}
    </span>
  );
}
