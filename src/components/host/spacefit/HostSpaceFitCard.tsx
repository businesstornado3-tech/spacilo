/**
 * Host Spacilo AI card — dashboard and hub.
 *
 * Reads EXISTING host spaces and runs the shared deterministic pricing engine.
 * No AI call is made to render this. An unconfirmed AI measurement is always
 * labelled as an estimate awaiting the host's confirmation.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight, ScanLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SpaceFitAiMark } from "@/components/trust/SpaceFitAI";
import { formatPrice } from "@/lib/format";
import { formatM3, spaceTypeLabel, type SpaceTypeValue } from "@/lib/spaces";
import { SPACEFIT_HUB_COPY, type HostSpaceFitState } from "@/lib/spacefit-hub";

export function HostSpaceFitCard({
  state,
  variant = "dashboard",
}: {
  state: HostSpaceFitState;
  variant?: "dashboard" | "hub";
}) {
  return (
    <section
      data-testid="host-spacefit-card"
      data-state={state.state}
      className="rounded-2xl border border-border bg-card p-5 shadow-card"
    >
      <SpaceFitAiMark size="sm" />

      {state.state === "none" ? (
        <>
          <h2 className="mt-3 type-h3">{SPACEFIT_HUB_COPY.hostEmptyTitle}</h2>
          <p className="mt-1.5 type-body-sm text-muted-foreground">
            {SPACEFIT_HUB_COPY.hostEmptyBody}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/host/spaces/new">
                <ScanLine className="size-4" aria-hidden="true" />
                Scan my space
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/host/spaces/new">List my space</Link>
            </Button>
          </div>
        </>
      ) : (
        <HostSpaceFitSummary state={state} variant={variant} />
      )}
    </section>
  );
}

function HostSpaceFitSummary({
  state,
  variant,
}: {
  state: Extract<HostSpaceFitState, { featured: unknown }>;
  variant: "dashboard" | "hub";
}) {
  const { featured } = state;
  const { space, price } = featured;
  const name =
    space.title?.trim() ||
    spaceTypeLabel((space.space_type ?? undefined) as SpaceTypeValue | undefined);

  return (
    <>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="type-h3">{name}</h2>
        {featured.published ? <Badge variant="neutral">Published</Badge> : null}
        <Badge
          variant={featured.verified ? "success" : "warning"}
          className="ml-auto"
          data-testid="host-spacefit-measurement-status"
        >
          {featured.statusLabel}
        </Badge>
      </div>

      <p className="mt-2 type-h2" data-testid="host-spacefit-capacity">
        {featured.usableVolumeM3 === null
          ? "Capacity not estimated yet"
          : `${formatM3(featured.usableVolumeM3)} usable`}
      </p>

      {price.suggestedMonthlyPence ? (
        <div className="mt-3">
          <p className="type-body-sm text-muted-foreground">{SPACEFIT_HUB_COPY.hostPricingLabel}</p>
          <p className="type-body font-semibold" data-testid="host-spacefit-pricing">
            {formatPrice(price.lowMonthlyPence ?? price.suggestedMonthlyPence)}–
            {formatPrice(price.highMonthlyPence ?? price.suggestedMonthlyPence)}/month*
          </p>
        </div>
      ) : (
        <p className="mt-3 type-body-sm text-muted-foreground">
          Add your measurements and we can suggest a starting price.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {featured.verified ? (
          <Button asChild>
            <Link to="/host/spaces/$spaceId/edit" params={{ spaceId: space.id }}>
              {variant === "hub" ? "View analysis" : "View fit"}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        ) : (
          <Button asChild>
            <Link to="/host/spaces/$spaceId/edit" params={{ spaceId: space.id }}>
              Review measurements
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        )}
        <Button asChild variant="secondary">
          <Link to="/host/spaces/new">{featured.verified ? "Scan again" : "Scan my space"}</Link>
        </Button>
        {variant === "hub" ? (
          <Button asChild variant="ghost">
            <Link to="/host/spaces">My spaces</Link>
          </Button>
        ) : null}
      </div>

      <p className="mt-3 type-body-sm text-muted-foreground">{SPACEFIT_HUB_COPY.pricingCaveat}</p>
    </>
  );
}
