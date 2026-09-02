/**
 * VisionConfidence — the honest headline above any detected inventory.
 */
import { ShieldCheck, TriangleAlert } from "lucide-react";

import { formatConfidence } from "@/lib/vision";
import type { DetectedInventorySummary } from "@/lib/vision";

export function VisionConfidence({ summary }: { summary: DetectedInventorySummary }) {
  const needsReview = summary.reviewCount > 0;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2">
      <span className="inline-flex items-center gap-1.5 type-label">
        {needsReview ? (
          <TriangleAlert className="size-4 text-warning" aria-hidden="true" />
        ) : (
          <ShieldCheck className="size-4 text-success" aria-hidden="true" />
        )}
        Average AI confidence {formatConfidence(summary.averageConfidence)}
      </span>
      <span className="type-body-xs text-muted-foreground">
        {needsReview
          ? `${summary.reviewCount} ${summary.reviewCount === 1 ? "item needs" : "items need"} a quick check before planning.`
          : "EarnRoom AI estimates — please correct anything that looks wrong."}
      </span>
    </div>
  );
}
