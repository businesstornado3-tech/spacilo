import { MapPin } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatDistance, formatPrice } from "@/lib/format";
import { Rating } from "@/components/marketplace/Rating";
import { SecurityFeatureChips } from "@/components/marketplace/SecurityFeatures";
import { SpaceFitBadge } from "@/components/trust/SpaceFit";
import { VerificationBadge } from "@/components/trust/VerificationBadge";
import type { Pence, SecurityFeature } from "@/types/models";

export interface ListingCardProps {
  id: string;
  title: string;
  spaceTypeLabel?: string;
  areaName: string;
  distanceMiles: number;
  areaSqFt?: number;
  pricePerMonth: Pence;
  rating?: number;
  reviewCount?: number;
  hostVerified?: boolean;
  spaceFitScore?: number;
  securityFeatures?: SecurityFeature[];
  /** Plain-language extras such as "Indoor" or "Host present". */
  extraFeatures?: string[];
  photoUrl?: string;
  photoAlt: string;
  href?: string;
  className?: string | undefined;
}

/**
 * Photography-first marketplace card.
 * Large image, then place, price, rating, trust, SpaceFit — nothing else.
 */
export function ListingCard({
  title,
  areaName,
  distanceMiles,
  pricePerMonth,
  rating,
  reviewCount,
  hostVerified,
  spaceFitScore,
  securityFeatures = [],
  extraFeatures = [],
  photoUrl,
  photoAlt,
  className,
}: ListingCardProps) {
  return (
    <article
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-2xl bg-card shadow-card transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-1 hover:shadow-raised focus-within:-translate-y-1",
        className,
      )}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={photoAlt}
            loading="lazy"
            className="size-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04]"
          />
        ) : (
          <div className="grid size-full place-items-center type-body-sm text-muted-foreground">
            No photo yet
          </div>
        )}
        {spaceFitScore !== undefined ? (
          <SpaceFitBadge
            score={spaceFitScore}
            className="absolute left-3 top-3 bg-card/92 shadow-card backdrop-blur-[2px]"
          />
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <h3 className="truncate type-card-title">{title}</h3>
            <p className="mt-0.5 flex min-w-0 items-center gap-1 type-body-sm text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {areaName} · {formatDistance(distanceMiles)}
              </span>
            </p>
          </div>
          <p className="shrink-0 text-right">
            <span className="type-price">{formatPrice(pricePerMonth)}</span>
            <span className="block type-body-sm text-muted-foreground">/month</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {rating !== undefined ? <Rating value={rating} reviewCount={reviewCount} size="sm" /> : null}
          {hostVerified ? <VerificationBadge type="host" size="sm" /> : null}
        </div>

        {securityFeatures.length > 0 || extraFeatures.length > 0 ? (
          <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
            {extraFeatures.map((f) => (
              <span
                key={f}
                className="inline-flex items-center rounded-md bg-surface px-2 py-1 type-badge text-muted-foreground"
              >
                {f}
              </span>
            ))}
            {securityFeatures.length > 0 ? (
              <SecurityFeatureChips features={securityFeatures} />
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
