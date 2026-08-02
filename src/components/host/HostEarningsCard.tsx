import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import type { Pence } from "@/types/models";

interface HostEarningsCardProps {
  /** e.g. "Your unused garage could earn" */
  headline?: string;
  amount: Pence;
  period?: string;
  note?: string;
  ctaLabel?: string;
  onCta?: () => void;
  className?: string;
}

/**
 * Aspirational host earnings estimate on the warm accent surface.
 * Always labelled as illustrative — never a promise of income.
 */
export function HostEarningsCard({
  headline = "Your unused garage could earn",
  amount,
  period = "month",
  note = "Illustrative estimate",
  ctaLabel,
  onCta,
  className,
}: HostEarningsCardProps) {
  return (
    <section
      className={cn(
        "rounded-3xl bg-accent-soft p-6 text-accent-foreground sm:p-8",
        className,
      )}
    >
      <p className="type-label text-accent-foreground/80">{headline}</p>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="type-hero tabular-nums">{formatPrice(amount)}</span>
        <span className="type-h3 font-normal text-accent-foreground/70">/{period}</span>
      </p>
      <p className="mt-2 type-body-sm text-accent-foreground/70">{note}</p>
      {ctaLabel ? (
        <Button className="mt-5" onClick={onCta}>
          {ctaLabel}
          <ArrowRight aria-hidden="true" />
        </Button>
      ) : null}
    </section>
  );
}
