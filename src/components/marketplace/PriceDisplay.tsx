import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/format";
import type { Pence } from "@/types/models";

interface PriceDisplayProps {
  amount: Pence;
  period?: "month" | "week" | "day" | null;
  size?: "sm" | "md" | "lg";
  className?: string;
  note?: string;
}

export function PriceDisplay({
  amount,
  period = "month",
  size = "md",
  className,
  note,
}: PriceDisplayProps) {
  const sizeClass =
    size === "lg" ? "text-3xl" : size === "sm" ? "text-lg" : "text-[1.375rem]";

  return (
    <p className={cn("flex items-baseline gap-1", className)}>
      <span className={cn("type-price", sizeClass)}>{formatPrice(amount)}</span>
      {period ? (
        <span className="type-body-sm text-muted-foreground">/{period}</span>
      ) : null}
      {note ? <span className="ml-1 type-body-sm text-muted-foreground">{note}</span> : null}
    </p>
  );
}
