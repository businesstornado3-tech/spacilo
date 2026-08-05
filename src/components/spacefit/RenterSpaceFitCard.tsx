/**
 * Renter SpaceFit AI card — dashboard and hub.
 *
 * Renders EXISTING canonical inventory through the deterministic requirement
 * engine. It never triggers an AI call: rendering this card performs no vision
 * request of any kind.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight, ScanLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SpaceFitAiMark } from "@/components/trust/SpaceFitAI";
import { formatVolume } from "@/lib/inventory-model";
import { SPACEFIT_HUB_COPY, type RenterSpaceFitState } from "@/lib/spacefit-hub";

export function RenterSpaceFitCard({
  state,
  variant = "dashboard",
}: {
  state: RenterSpaceFitState;
  variant?: "dashboard" | "hub";
}) {
  return (
    <section
      data-testid="renter-spacefit-card"
      data-state={state.state}
      className="rounded-2xl border border-border bg-card p-5 shadow-card"
    >
      <SpaceFitAiMark size="sm" />

      {state.state === "empty" ? (
        <>
          <h2 className="mt-3 type-h3">{SPACEFIT_HUB_COPY.renterEmptyTitle}</h2>
          <p className="mt-1.5 type-body-sm text-muted-foreground">
            {SPACEFIT_HUB_COPY.renterEmptyBody}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/renter/inventory/photos">
                <ScanLine className="size-4" aria-hidden="true" />
                Scan my stuff
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/renter/inventory/add">Add items manually</Link>
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-3 type-body-sm text-muted-foreground">
            {SPACEFIT_HUB_COPY.renterReadyLabel}
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="type-h1" data-testid="renter-spacefit-requirement">
              {formatVolume(state.requirementM3, { approx: true })}
            </p>
            <p className="type-body-sm text-muted-foreground">
              {state.itemCount} {state.itemCount === 1 ? "item" : "items"}
            </p>
            <Badge
              variant={state.readiness.level === "ready" ? "success" : "warning"}
              className="ml-auto"
            >
              {state.readiness.label}
            </Badge>
          </div>

          {variant === "hub" ? (
            <p className="mt-2 type-body-sm text-muted-foreground">
              Belongings volume {formatVolume(state.itemVolumeM3, { approx: true })} before packing
              allowance. Estimates only — you can correct any item.
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild variant={variant === "hub" ? "secondary" : "default"}>
              <Link to="/renter/inventory">View my stuff</Link>
            </Button>
            {variant === "hub" ? (
              <Button asChild variant="secondary">
                <Link to="/renter/inventory/photos">Update scan</Link>
              </Button>
            ) : null}
            <Button asChild variant={variant === "hub" ? "default" : "secondary"}>
              <Link to={variant === "hub" ? "/renter/matches" : "/renter/search"}>
                {variant === "hub" ? "Find spaces that fit" : "Find storage"}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
