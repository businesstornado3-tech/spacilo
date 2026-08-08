/**
 * CompatibilityBadge — one figure, one colour, one meaning.
 *
 * Green, amber and red map to the deterministic score bands in
 * `@/lib/spaceplanner/booking-confidence`, never to a designer's judgement.
 */
import { cn } from "@/lib/utils";
import type { ConfidenceTone } from "@/lib/spaceplanner/booking-confidence";

const TONE_CLASS: Record<ConfidenceTone, string> = {
  green: "bg-success-soft text-success-soft-foreground border-success/30",
  amber: "bg-warning-soft text-warning-soft-foreground border-warning/30",
  red: "bg-destructive/10 text-destructive border-destructive/30",
};

export function CompatibilityBadge({
  tone,
  children,
  className,
}: {
  tone: ConfidenceTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 type-badge",
        TONE_CLASS[tone],
        className,
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          tone === "green" ? "bg-success" : tone === "amber" ? "bg-warning" : "bg-destructive",
        )}
        aria-hidden="true"
      />
      {children}
    </span>
  );
}
