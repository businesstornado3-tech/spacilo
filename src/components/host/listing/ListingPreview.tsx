import { MapPin, Ruler, Clock, ShieldCheck, PackageCheck, Thermometer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { PriceDisplay } from "@/components/marketplace/PriceDisplay";
import { Alert } from "@/components/common/Alert";
import {
  accessFrequencyLabel,
  accessTypeLabel,
  categoryLabel,
  featureLabel,
  formatM2,
  formatM3,
  restrictionLabel,
  spaceTypeLabel,
  type AccessFrequencyValue,
  type AccessTypeValue,
  type SpaceTypeValue,
  type StorageModeValue,
} from "@/lib/spaces";

/**
 * Renter-facing view of a listing. Deliberately contains no private data:
 * no address lines, no email, no phone number.
 */
export interface ListingView {
  title: string;
  spaceType: SpaceTypeValue | null;
  description: string;
  location: string;
  pricePence: number | null;
  minimumMonths: number;
  storageMode: StorageModeValue | null;
  hostAvailablePercentage: number | null;
  floorAreaM2: number | null;
  totalVolumeM3: number | null;
  availableVolumeM3: number | null;
  features: string[];
  acceptedCategories: string[];
  restrictions: string[];
  restrictionNotes?: string | null;
  accessType: AccessTypeValue | null;
  accessNotes?: string | null;
  accessFrequency: AccessFrequencyValue | null;
  temperature?: string | null;
  moisture?: string | null;
  hostName: string;
  hostPhoneVerified: boolean;
  photoUrls: string[];
}

export function ListingPreview({ view, footer }: { view: ListingView; footer?: React.ReactNode }) {
  const cover = view.photoUrls[0];

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <div className="aspect-16/10 w-full bg-muted">
        {cover ? (
          <img src={cover} alt={`${view.title || "Storage space"} — main photo`} className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center type-body-sm text-muted-foreground">
            No photos added yet
          </div>
        )}
      </div>

      {view.photoUrls.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto p-3">
          {view.photoUrls.slice(1).map((url, i) => (
            <img
              key={url}
              src={url}
              alt={`${view.title || "Storage space"} — photo ${i + 2}`}
              className="h-20 w-28 shrink-0 rounded-lg object-cover"
              loading="lazy"
            />
          ))}
        </div>
      ) : null}

      <div className="space-y-6 p-5 sm:p-6">
        <header>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="subtle">{spaceTypeLabel(view.spaceType)}</Badge>
            {view.storageMode === "partial" ? (
              <Badge variant="neutral">
                Part of a space{view.hostAvailablePercentage ? ` · ~${view.hostAvailablePercentage}% available` : ""}
              </Badge>
            ) : (
              <Badge variant="neutral">Whole space</Badge>
            )}
          </div>
          <h3 className="mt-3 type-h2">{view.title || "Untitled space"}</h3>
          <p className="mt-1.5 flex items-center gap-1.5 type-body-sm text-muted-foreground">
            <MapPin className="size-4" aria-hidden="true" />
            {view.location}
          </p>
          {view.pricePence !== null ? (
            <PriceDisplay amount={view.pricePence} size="lg" className="mt-4" />
          ) : null}
          <p className="mt-1 type-body-sm text-muted-foreground">
            Minimum booking: {view.minimumMonths} {view.minimumMonths === 1 ? "month" : "months"}
          </p>
        </header>

        {view.description ? (
          <section>
            <h4 className="type-label">About this space</h4>
            <p className="mt-2 whitespace-pre-line type-body text-muted-foreground">{view.description}</p>
          </section>
        ) : null}

        <section>
          <h4 className="flex items-center gap-2 type-label">
            <Ruler className="size-4 text-primary" aria-hidden="true" /> Estimated size
          </h4>
          {view.floorAreaM2 || view.availableVolumeM3 ? (
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="Floor area" value={formatM2(view.floorAreaM2)} />
              <Stat label="Total volume" value={formatM3(view.totalVolumeM3)} />
              <Stat label="Estimated available" value={formatM3(view.availableVolumeM3)} />
            </dl>
          ) : (
            <p className="mt-2 type-body-sm text-muted-foreground">
              The host hasn't measured this space yet.
            </p>
          )}
          <p className="mt-2 type-body-sm text-muted-foreground">
            Sizes are host estimates, not a guarantee that specific items will fit.
          </p>
        </section>

        <section>
          <h4 className="flex items-center gap-2 type-label">
            <ShieldCheck className="size-4 text-primary" aria-hidden="true" /> Features
          </h4>
          {view.features.length ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {view.features.map((f) => (
                <li key={f}>
                  <Badge variant="subtle">{featureLabel(f)}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 type-body-sm text-muted-foreground">No features listed.</p>
          )}
          <p className="mt-2 type-body-sm text-muted-foreground">
            Host-declared. These have not been independently checked.
          </p>
        </section>

        <section>
          <h4 className="flex items-center gap-2 type-label">
            <Clock className="size-4 text-primary" aria-hidden="true" /> Access
          </h4>
          <p className="mt-2 type-body text-muted-foreground">{accessTypeLabel(view.accessType)}</p>
          {view.accessFrequency ? (
            <p className="type-body-sm text-muted-foreground">
              Comfortable with: {accessFrequencyLabel(view.accessFrequency)}
            </p>
          ) : null}
          {view.accessNotes ? (
            <p className="mt-1 type-body-sm text-muted-foreground">{view.accessNotes}</p>
          ) : null}
        </section>

        <section>
          <h4 className="flex items-center gap-2 type-label">
            <PackageCheck className="size-4 text-primary" aria-hidden="true" /> Happy to store
          </h4>
          {view.acceptedCategories.length ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {view.acceptedCategories.map((c) => (
                <li key={c}>
                  <Badge variant="neutral">{categoryLabel(c)}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 type-body-sm text-muted-foreground">Not specified.</p>
          )}
          {view.restrictions.length || view.restrictionNotes ? (
            <p className="mt-3 type-body-sm text-muted-foreground">
              Host restrictions: {view.restrictions.map(restrictionLabel).join(", ")}
              {view.restrictionNotes ? ` ${view.restrictionNotes}` : ""}
            </p>
          ) : null}
        </section>

        {view.temperature || view.moisture ? (
          <section>
            <h4 className="flex items-center gap-2 type-label">
              <Thermometer className="size-4 text-primary" aria-hidden="true" /> Conditions
            </h4>
            <p className="mt-2 type-body-sm text-muted-foreground">
              {[view.temperature, view.moisture].filter(Boolean).join(" · ")}
            </p>
          </section>
        ) : null}

        <section className="rounded-xl border border-border bg-muted/40 p-4">
          <h4 className="type-label">Hosted by {view.hostName}</h4>
          <p className="mt-1 type-body-sm text-muted-foreground">
            {view.hostPhoneVerified ? "Phone number verified" : "Identity checks not yet completed"}
          </p>
        </section>

        <Alert tone="info" title="Your exact address stays private">
          Renters only ever see the approximate area until a booking is agreed.
        </Alert>

        {footer}
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <dt className="type-body-sm text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 type-label tabular-nums">{value}</dd>
    </div>
  );
}
