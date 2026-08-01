import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export interface InventoryItemCardProps {
  name: string;
  categoryLabel: string;
  quantity: number;
  dimensions?: string;
  volumeM3?: number;
  photoUrl?: string;
  photoAlt?: string;
  isAiEstimated?: boolean;
  actions?: React.ReactNode;
  className?: string;
}

export function InventoryItemCard({
  name,
  categoryLabel,
  quantity,
  dimensions,
  volumeM3,
  photoUrl,
  photoAlt,
  isAiEstimated,
  actions,
  className,
}: InventoryItemCardProps) {
  return (
    <article
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-card",
        className,
      )}
    >
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={photoAlt ?? name}
          loading="lazy"
          className="size-16 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="grid size-16 shrink-0 place-items-center rounded-lg bg-muted type-body-sm text-muted-foreground"
        >
          No photo
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="type-card-title truncate">{name}</h3>
          <span className="type-body-sm text-muted-foreground">×{quantity}</span>
        </div>
        <p className="type-body-sm text-muted-foreground">
          {[categoryLabel, dimensions, volumeM3 ? `${volumeM3.toFixed(2)} m³` : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {isAiEstimated ? (
          <Badge variant="subtle" size="sm" className="mt-1.5">
            <Sparkles aria-hidden="true" />
            AI estimate
          </Badge>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </article>
  );
}
