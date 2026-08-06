/**
 * Search result card.
 *
 * Extends the existing marketplace card language. Location and SpaceFit are
 * shown as two separate facts — distance never changes the SpaceFit score.
 */
import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ImageOff, MapPin } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PriceDisplay } from "@/components/marketplace/PriceDisplay";
import { formatM3, publicLocation, spaceTypeLabel } from "@/lib/spaces";
import type { SpaceTypeValue } from "@/lib/spaces";
import {
  ReasonList,
  SpaceFitResultBadge,
  WhyThisMatches,
} from "@/components/spacefit/SpaceFitResult";
import { SpaceFitSpark } from "@/components/trust/SpaceFitAI";
import { formatMilesAway } from "@/lib/location/distance";
import { VerificationBadge } from "@/components/trust/VerificationBadge";
import { cardChips } from "@/lib/marketplace/listing-facts";
import { track } from "@/lib/analytics/tracker";
import type { SearchResult } from "@/hooks/useStorageSearch";

export interface SearchResultCardProps {
  entry: SearchResult;
  selected?: boolean;
  /** Search context carried into the listing page, e.g. "PO4 8LB". */
  fromLabel?: string | null;
  onSelect?: (spaceId: string) => void;
  onHover?: (spaceId: string | null) => void;
  /** Where "Get your SpaceFit" should send a visitor without inventory. */
  spaceFitHref?: { to: string; search?: Record<string, unknown> };
}

export function SearchResultCard({
  entry,
  selected = false,
  fromLabel,
  onSelect,
  onHover,
  spaceFitHref,
}: SearchResultCardProps) {
  const { row, result, coverUrl, distanceMiles } = entry;
  const location = publicLocation(row.approximate_area, row.postcode_district);
  const [imageFailed, setImageFailed] = React.useState(false);
  React.useEffect(() => setImageFailed(false), [coverUrl]);
  const distance = formatMilesAway(distanceMiles);
  const chips = cardChips(row);

  return (
    <article
      id={`result-${row.id}`}
      onMouseEnter={() => onHover?.(row.id)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onSelect?.(row.id)}
      className={cn(
        "overflow-hidden rounded-2xl border bg-card shadow-card transition-[box-shadow,border-color,transform] duration-200",
        selected
          ? "border-primary shadow-raised"
          : "border-border hover:-translate-y-0.5 hover:shadow-raised",
      )}
    >
      <button
        type="button"
        onClick={() => {
          onSelect?.(row.id);
          track("search_result_selected", { props: { has_fit_score: Boolean(result) } });
        }}
        aria-pressed={selected}
        aria-label={`Show ${row.title ?? "this space"} on the map`}
        className="relative block aspect-[16/10] w-full bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {coverUrl && !imageFailed ? (
          <img
            src={coverUrl}
            alt={`${spaceTypeLabel(row.space_type as SpaceTypeValue)} in the ${location}`}
            className="size-full object-cover"
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="grid size-full place-items-center text-muted-foreground">
            <ImageOff className="size-6" aria-hidden="true" />
          </div>
        )}
        {result ? (
          <SpaceFitResultBadge result={result} className="absolute left-3 top-3 shadow-card" />
        ) : null}
      </button>

      <div className="space-y-3 p-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <h3 className="type-h3 truncate">{row.title ?? "Storage space"}</h3>
            <p className="type-body-sm text-muted-foreground">
              {spaceTypeLabel(row.space_type as SpaceTypeValue)} · {location}
            </p>
            {distance ? (
              <p className="mt-1 flex items-center gap-1 type-body-sm text-muted-foreground">
                <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                {distance}
              </p>
            ) : null}
          </div>
          <PriceDisplay amount={row.monthly_price_pence ?? 0} size="sm" className="shrink-0" />
        </div>

        {row.host_phone_verified ? <VerificationBadge type="phone" size="sm" /> : null}

        {result ? (
          <>
            <p className="type-body-sm font-semibold">{result.label}</p>
            <p className="type-body-sm text-muted-foreground">
              {formatM3(row.estimated_available_volume_m3)} estimated available capacity
            </p>
            <ReasonList
              positives={result.positives}
              warnings={result.warnings.slice(0, 1)}
              limit={3}
            />
          </>
        ) : (
          <>
            <p className="type-body-sm text-muted-foreground">
              {formatM3(row.estimated_available_volume_m3)} estimated available capacity
            </p>
            {spaceFitHref ? (
              <Link
                to={spaceFitHref.to}
                search={spaceFitHref.search as never}
                onClick={() =>
                  track("cta_clicked", { props: { cta: "scan_stuff", from: "search_card" } })
                }
                className="inline-flex items-center gap-2 rounded-xl border border-signal/25 bg-signal-soft/50 px-3 py-2 type-body-sm text-signal-soft-foreground hover:bg-signal-soft"
              >
                <SpaceFitSpark />
                See which space fits your stuff
              </Link>
            ) : null}
          </>
        )}

        {chips.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Space details">
            {chips.map((chip) => (
              <li
                key={chip}
                className="rounded-md bg-surface px-2 py-1 type-badge text-muted-foreground"
              >
                {chip}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button asChild size="sm">
            <Link
              to="/spaces/$spaceId"
              params={{ spaceId: row.id }}
              search={
                fromLabel && distanceMiles !== null
                  ? ({ from: fromLabel, distance: Number(distanceMiles.toFixed(2)) } as never)
                  : (undefined as never)
              }
            >
              View space
            </Link>
          </Button>
          {result ? <WhyThisMatches result={result} /> : null}
        </div>
      </div>
    </article>
  );
}
