/**
 * SpacePlannerCard — the SpacePlanner entry point on the renter and host
 * dashboards. Same capability, different framing for each side of the market.
 */
import { Link } from "@tanstack/react-router";
import { Camera, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics/tracker";

export function SpacePlannerCard({ mode }: { mode: "renter" | "host" }) {
  const renter = mode === "renter";

  return (
    <section className="rounded-2xl border border-signal-soft bg-card p-5 shadow-card">
      <p className="type-overline text-muted-foreground">Spacilo AI SpacePlanner™</p>
      <h2 className="mt-1 type-h3">
        {renter
          ? "Plan your storage before you book."
          : "Understand your space. Optimise it. See what it could earn."}
      </h2>
      <p className="mt-1.5 type-body-sm text-muted-foreground">
        {renter
          ? "Photograph your belongings and a space, and Spacilo AI estimates how much room you need and how it could fit."
          : "Photograph your space and Spacilo AI estimates usable capacity, what could fit, and its earning potential."}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {renter ? (
          <>
            <Button
              asChild
              onClick={() => track("spaceplanner_mode_selected", { props: { mode: "renter" } })}
            >
              <Link to="/renter/inventory/photos">
                <Camera aria-hidden="true" />
                Scan my belongings
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/spacefit/space">Scan a space</Link>
            </Button>
          </>
        ) : (
          <>
            <Button
              asChild
              onClick={() => track("spaceplanner_mode_selected", { props: { mode: "host" } })}
            >
              <Link to="/host/spaces/new">
                <Camera aria-hidden="true" />
                Scan my space
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/planner">
                <Sparkles aria-hidden="true" />
                See what could fit
              </Link>
            </Button>
          </>
        )}
      </div>

      <p className="mt-3 type-body-xs text-muted-foreground">
        Estimates only, based on the photos and details provided.
      </p>
    </section>
  );
}
