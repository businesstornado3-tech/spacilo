import { Minus, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { MAX_QUANTITY } from "@/lib/inventory-model";

/** Large tap-target quantity control. Mobile-first: 44px minimum targets. */
export function QuantityStepper({
  value,
  onChange,
  label,
  size = "default",
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  label: string;
  size?: "default" | "sm";
  className?: string;
}) {
  const button =
    "grid place-items-center rounded-full border border-border-strong bg-card text-foreground transition-colors hover:bg-secondary disabled:opacity-40 disabled:hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const dimension = size === "sm" ? "size-9" : "size-11";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <button
        type="button"
        className={cn(button, dimension)}
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={value <= 0}
      >
        <Minus className="size-4" aria-hidden="true" />
        <span className="sr-only">Remove one {label}</span>
      </button>
      <span
        className="min-w-8 text-center type-h3 tabular-nums"
        aria-live="polite"
        aria-label={`${value} ${label}`}
      >
        {value}
      </span>
      <button
        type="button"
        className={cn(button, dimension)}
        onClick={() => onChange(Math.min(MAX_QUANTITY, value + 1))}
        disabled={value >= MAX_QUANTITY}
      >
        <Plus className="size-4" aria-hidden="true" />
        <span className="sr-only">Add one {label}</span>
      </button>
    </div>
  );
}
