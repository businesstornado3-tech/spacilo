/**
 * Public listing page sections.
 *
 * Presentation only. Every value shown here comes from the published listing
 * row, the host's own declarations, or platform policy that is identical for
 * every booking. Nothing is inferred and nothing that the host left blank is
 * filled in with a friendly default.
 */
import * as React from "react";
import { Link } from "@tanstack/react-router";
import {
  ChevronDown,
  DoorOpen,
  ImageOff,
  MapPin,
  MessageCircle,
  Ruler,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";
import { formatM3, publicLocation, spaceTypeLabel, type SpaceTypeValue } from "@/lib/spaces";
import { PriceDisplay } from "@/components/marketplace/PriceDisplay";
import { VerificationBadge } from "@/components/trust/VerificationBadge";
import {
  accessChips,
  accessSummary,
  capacitySummary,
  doorwaySummary,
  minimumStaySummary,
  securityChips,
  type ListingFactsRow,
} from "@/lib/marketplace/listing-facts";
import type { FaqEntry } from "@/lib/marketplace/listing-faq";

/* ------------------------------------------------------------------ shell */

export function ListingSection({
  title,
  icon: Icon,
  children,
  className,
  id,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      {...(id ? { id } : {})}
      className={cn("rounded-2xl border border-border bg-card p-5 shadow-card", className)}
    >
      <h2 className="flex items-center gap-2 type-h3">
        {Icon ? <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" /> : null}
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <li className="inline-flex items-center rounded-full bg-secondary px-2.5 py-1 type-badge text-secondary-foreground">
      {children}
    </li>
  );
}

/* ------------------------------------------------------------------ about */

export function ListingAbout({
  description,
  spaceType,
  location,
}: {
  description: string | null;
  spaceType: string | null;
  location: string;
}) {
  return (
    <ListingSection title={`${spaceTypeLabel(spaceType as SpaceTypeValue)} in ${location}`}>
      {description ? (
        <p className="type-body whitespace-pre-line text-muted-foreground">{description}</p>
      ) : (
        <p className="type-body-sm text-muted-foreground">
          The host hasn&apos;t written a description yet. Use &ldquo;Ask the host&rdquo; below if
          there&apos;s something you need to know.
        </p>
      )}
    </ListingSection>
  );
}

/* ------------------------------------------------------------------ facts */

export function ListingFacts({ row }: { row: ListingFactsRow }) {
  const capacity = capacitySummary(row);
  const access = accessSummary(row);
  const doorway = doorwaySummary(row);
  const minimum = minimumStaySummary(row);
  const accessible = accessChips(row);
  const security = securityChips(row);

  const facts = [
    capacity ? { icon: Ruler, label: "Capacity", value: capacity } : null,
    access ? { icon: DoorOpen, label: "Access", value: access } : null,
    doorway ? { icon: Ruler, label: "Doorway", value: doorway } : null,
    minimum ? { icon: ShieldCheck, label: "Minimum stay", value: minimum } : null,
  ].filter(Boolean) as { icon: typeof Ruler; label: string; value: string }[];

  if (!facts.length && !accessible.length && !security.length) return null;

  return (
    <ListingSection title="Storage facts" icon={Ruler}>
      {facts.length ? (
        <dl className="grid gap-3 sm:grid-cols-2">
          {facts.map((fact) => (
            <div key={fact.label} className="flex min-w-0 items-start gap-2">
              <fact.icon
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <dt className="type-overline text-muted-foreground">{fact.label}</dt>
                <dd className="type-body-sm">{fact.value}</dd>
              </div>
            </div>
          ))}
        </dl>
      ) : null}

      {accessible.length ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {accessible.map((chip) => (
            <Chip key={chip}>{chip}</Chip>
          ))}
        </ul>
      ) : null}

      {security.length ? (
        <div className="mt-4">
          <p className="type-overline text-muted-foreground">Host-declared security</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {security.map((chip) => (
              <Chip key={chip}>{chip}</Chip>
            ))}
          </ul>
          <p className="mt-2 type-body-sm text-muted-foreground">
            Declared by the host and not independently checked by {brand.name}.
          </p>
        </div>
      ) : null}
    </ListingSection>
  );
}

/* ------------------------------------------------------------------- host */

export function ListingHost({
  hostName,
  phoneVerified,
  publishedAt,
  onAsk,
}: {
  hostName: string;
  phoneVerified: boolean;
  publishedAt?: string | null;
  onAsk?: () => void;
}) {
  const initial = hostName.trim().charAt(0).toUpperCase() || "H";
  return (
    <ListingSection title="Your host">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary-soft type-h3 text-primary-soft-foreground"
        >
          {initial}
        </span>
        <div className="min-w-0">
          <p className="truncate type-card-title">{hostName}</p>
          {publishedAt ? (
            <p className="type-body-sm text-muted-foreground">
              Listed since{" "}
              {new Date(publishedAt).toLocaleDateString("en-GB", {
                month: "long",
                year: "numeric",
              })}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <VerificationBadge type="phone" pending={!phoneVerified} size="sm" />
      </div>
      {onAsk ? (
        <button
          type="button"
          onClick={onAsk}
          className="mt-4 inline-flex items-center gap-1.5 type-body-sm text-primary underline underline-offset-4"
        >
          <MessageCircle className="size-4" aria-hidden="true" />
          Ask the host a question
        </button>
      ) : null}
    </ListingSection>
  );
}

/* -------------------------------------------------------------- location */

export function ListingLocation({
  approximateArea,
  postcodeDistrict,
}: {
  approximateArea: string | null;
  postcodeDistrict: string | null;
}) {
  return (
    <ListingSection title="Where you'd be storing" icon={MapPin}>
      <p className="type-body">{publicLocation(approximateArea, postcodeDistrict)}</p>
      <p className="mt-2 type-body-sm text-muted-foreground">
        {brand.name} only shows the approximate area while you&apos;re browsing. The host shares the
        full address with you once your booking is confirmed.
      </p>
    </ListingSection>
  );
}

/* -------------------------------------------------------------------- faq */

export function ListingFaq({ entries }: { entries: FaqEntry[] }) {
  if (!entries.length) return null;
  return (
    <ListingSection title="Questions renters ask" icon={Sparkles}>
      <ul className="divide-y divide-border">
        {entries.map((entry) => (
          <li key={entry.question}>
            <details className="group py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 type-body font-medium marker:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                <span className="min-w-0">{entry.question}</span>
                <ChevronDown
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <p className="mt-2 type-body-sm text-muted-foreground">{entry.answer}</p>
            </details>
          </li>
        ))}
      </ul>
    </ListingSection>
  );
}

/* -------------------------------------------------------- similar spaces */

export interface SimilarListing {
  id: string;
  title: string;
  area: string;
  pricePence: number | null;
  volumeM3: number | null;
  photoUrl?: string | undefined;
}

export function SimilarListings({ listings }: { listings: SimilarListing[] }) {
  if (!listings.length) return null;
  return (
    <ListingSection title="Other spaces nearby">
      <ul className="grid gap-4 sm:grid-cols-2">
        {listings.map((listing) => (
          <li key={listing.id} className="min-w-0">
            <Link
              to="/spaces/$spaceId"
              params={{ spaceId: listing.id }}
              className="group block overflow-hidden rounded-xl border border-border bg-background transition-shadow hover:shadow-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {listing.photoUrl ? (
                <img
                  src={listing.photoUrl}
                  alt={listing.title}
                  loading="lazy"
                  className="aspect-4/3 w-full object-cover"
                />
              ) : (
                <div className="grid aspect-4/3 w-full place-items-center bg-muted text-muted-foreground">
                  <ImageOff className="size-5" aria-hidden="true" />
                </div>
              )}
              <div className="p-3">
                <p className="truncate type-card-title">{listing.title}</p>
                <p className="type-body-sm text-muted-foreground">
                  {listing.area}
                  {listing.volumeM3 ? ` · ${formatM3(listing.volumeM3)}` : ""}
                </p>
                {typeof listing.pricePence === "number" ? (
                  <PriceDisplay amount={listing.pricePence} size="sm" className="mt-1" />
                ) : null}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </ListingSection>
  );
}
