import { MapPin, Ruler } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatArea, formatDistance } from "@/lib/format";
import { PriceDisplay } from "@/components/marketplace/PriceDisplay";
import { Rating } from "@/components/marketplace/Rating";
import { SecurityFeatureIcons } from "@/components/marketplace/SecurityFeatures";
import { SpaceFitBadge } from "@/components/trust/SpaceFit";
import { VerificationBadge } from "@/components/trust/VerificationBadge";
import type { Pence, SecurityFeature } from "@/types/models";

export interface ListingCardProps {
  id: string;
  title: string;
  spaceTypeLabel: string;
  areaName: string;
  distanceMiles: number;
  areaSqFt: number;
  pricePerMonth: Pence;
  rating?: number;
  reviewCount?: number;
  hostVerified?: boolean;
  spaceFitScore?: number;
  securityFeatures?: SecurityFeature[];
  photoUrl?: string;
  photoAlt: string;
  href?: string;
  className?: string;
}

export function ListingCard({
  title,
  spaceTypeLabel,
  areaName,
  distanceMiles,
  areaSqFt,
  pricePerMonth,
  rating,
  reviewCount,
  hostVerified,
  spaceFitScore,
  securityFeatures = [],
  photoUrl,
  photoAlt,
  className,
}: ListingCardProps) {
  return (
    <article
      className={cn(
        "group overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-shadow hover:shadow-raised",
        className,
      )}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={photoAlt}
            loading="lazy"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="grid size-full place-items-center type-body-sm text-muted-foreground">
            No photo yet
          </div>
        )}
        {spaceFitScore !== undefined ? (
          <SpaceFitBadge
            score={spaceFitScore}
            className="absolute left-3 top-3 shadow-card backdrop-blur"
          />
        ) : null}
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="type-overline text-muted-foreground">{spaceTypeLabel}</p>
            <h3 className="mt-1 type-card-title truncate">{title}</h3>
          </div>
          <PriceDisplay amount={pricePerMonth} className="shrink-0 text-right" />
        </div>

        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 type-body-sm text-muted-foreground">
          <li className="flex items-center gap-1">
            <MapPin className="size-4" aria-hidden="true" />
            {areaName} · {formatDistance(distanceMiles)}
          </li>
          <li className="flex items-center gap-1">
            <Ruler className="size-4" aria-hidden="true" />
            approx. {formatArea(areaSqFt)}
          </li>
        </ul>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {rating !== undefined ? <Rating value={rating} reviewCount={reviewCount} size="sm" /> : null}
          {hostVerified ? <VerificationBadge type="generic" /> : null}
        </div>

        {securityFeatures.length > 0 ? (
          <div className="flex items-center justify-between border-t border-border pt-3">
            <SecurityFeatureIcons features={securityFeatures} />
          </div>
        ) : null}
      </div>
    </article>
  );
}
