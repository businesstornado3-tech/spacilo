/**
 * Mobile-first match card: photo, place, price, SpaceFit and the strongest
 * deterministic reasons. Detail lives behind "Why this matches".
 */
import { Link } from "@tanstack/react-router";
import { ImageOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PriceDisplay } from "@/components/marketplace/PriceDisplay";
import { formatM3, publicLocation, spaceTypeLabel } from "@/lib/spaces";
import type { SpaceTypeValue } from "@/lib/spaces";
import { ReasonList, SpaceFitResultBadge, WhyThisMatches } from "@/components/spacefit/SpaceFitResult";
import type { MatchEntry } from "@/hooks/useSpaceFitMatches";

export function MatchCard({ entry }: { entry: MatchEntry }) {
  const { row, result, coverUrl } = entry;
  const location = publicLocation(row.approximate_area, row.postcode_district);

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <div className="relative aspect-[16/10] w-full bg-muted">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={`${spaceTypeLabel(row.space_type as SpaceTypeValue)} in the ${location}`}
            className="size-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="grid size-full place-items-center text-muted-foreground">
            <ImageOff className="size-6" aria-hidden="true" />
          </div>
        )}
        <SpaceFitResultBadge result={result} className="absolute left-3 top-3 shadow-card" />
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="type-h3 truncate">{row.title ?? "Storage space"}</h3>
            <p className="type-body-sm text-muted-foreground">
              {spaceTypeLabel(row.space_type as SpaceTypeValue)} · {location}
            </p>
          </div>
          <PriceDisplay amount={row.monthly_price_pence ?? 0} size="sm" className="shrink-0" />
        </div>

        <p className="type-body-sm font-semibold">{result.label}</p>
        <p className="type-body-sm text-muted-foreground">
          {formatM3(row.estimated_available_volume_m3)} estimated available capacity
        </p>

        <ReasonList
          positives={result.positives}
          warnings={result.warnings.slice(0, 1)}
          limit={3}
        />

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button asChild size="sm">
            <Link to="/spaces/$spaceId" params={{ spaceId: row.id }}>
              View match
            </Link>
          </Button>
          <WhyThisMatches result={result} />
        </div>
      </div>
    </article>
  );
}

/** Transparency row for spaces that failed a hard compatibility check. */
export function IncompatibleRow({ entry }: { entry: MatchEntry }) {
  const { row, result } = entry;
  return (
    <li className="rounded-xl border border-border bg-secondary/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="type-body font-semibold truncate">{row.title ?? "Storage space"}</p>
          <p className="type-body-sm text-muted-foreground">
            {spaceTypeLabel(row.space_type as SpaceTypeValue)} ·{" "}
            {publicLocation(row.approximate_area, row.postcode_district)}
          </p>
        </div>
        <SpaceFitResultBadge result={result} className="shrink-0" />
      </div>
      <div className="mt-3">
        <ReasonList failures={result.hard_failures.map((failure) => failure.message)} />
      </div>
    </li>
  );
}
