/**
 * The Spacilo AI entry experience. Rendered inside the hero so both scan
 * paths are reachable without scrolling, on mobile and desktop.
 *
 * Both CTAs route to the real SpaceFit journeys via `spacefit-entry.ts`.
 * Nothing here loads any AI code — analysis only starts inside those flows.
 */
import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Boxes, Camera, Home } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SpaceFitAiMark } from "@/components/trust/SpaceFitAI";
import { useAuth } from "@/hooks/useAuth";
import { scanSpaceTarget, scanStuffTarget } from "@/lib/spacefit-entry";
import { track } from "@/lib/analytics/tracker";

function ScanStuffButton({
  from,
  block = true,
  children = "Scan my stuff",
}: {
  from: string;
  block?: boolean;
  children?: React.ReactNode;
}) {
  const { user } = useAuth();
  const target = scanStuffTarget(Boolean(user));
  const label = (
    <>
      <Camera className="size-4" aria-hidden="true" />
      {children}
    </>
  );

  return (
    <Button
      asChild
      size="lg"
      {...(block ? { block: true } : {})}
      onClick={() => track("cta_clicked", { props: { cta: "scan_stuff", from } })}
    >
      {target.to === "/renter/inventory/photos" ? (
        <Link to="/renter/inventory/photos">{label}</Link>
      ) : (
        <Link to="/spacefit/stuff">{label}</Link>
      )}
    </Button>
  );
}

function ScanSpaceButton({
  from,
  block = true,
  variant = "secondary",
  children = "Scan my space",
}: {
  from: string;
  block?: boolean;
  variant?: "default" | "secondary";
  children?: React.ReactNode;
}) {
  const { user } = useAuth();
  const target = scanSpaceTarget(Boolean(user));
  const label = (
    <>
      <Camera className="size-4" aria-hidden="true" />
      {children}
    </>
  );

  return (
    <Button
      asChild
      size="lg"
      variant={variant}
      {...(block ? { block: true } : {})}
      onClick={() => track("cta_clicked", { props: { cta: "scan_space", from } })}
    >
      {target.to === "/host/spaces/new" ? (
        <Link to="/host/spaces/new">{label}</Link>
      ) : (
        <Link to="/spacefit/space">{label}</Link>
      )}
    </Button>
  );
}

export { ScanStuffButton, ScanSpaceButton };

export function SpaceFitEntry({
  from = "homepage_hero",
  className,
}: {
  from?: string;
  className?: string;
}) {
  return (
    <section
      aria-labelledby="spacefit-entry-heading"
      className={cn(
        "rounded-3xl border border-signal/25 bg-signal-soft/45 p-4 shadow-card sm:p-5",
        className,
      )}
    >
      <SpaceFitAiMark size="sm" />
      <h2 id="spacefit-entry-heading" className="mt-3 type-h3">
        Your stuff. Your space. Just show us.
      </h2>
      <p className="mt-1.5 type-body-sm text-muted-foreground">
        Spacilo AI helps work out what fits — whether that's your belongings or your spare space.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="flex h-full flex-col rounded-2xl bg-card p-4">
          <span className="inline-flex items-center gap-2 type-label">
            <Boxes className="size-4 text-signal-soft-foreground" aria-hidden="true" />I have stuff
            to store
          </span>
          <p className="mt-1.5 mb-4 type-body-sm text-muted-foreground">
            How much space do I really need?
          </p>
          <div className="mt-auto">
            <ScanStuffButton from={from} />
          </div>
        </div>

        <div className="flex h-full flex-col rounded-2xl bg-card p-4">
          <span className="inline-flex items-center gap-2 type-label">
            <Home className="size-4 text-signal-soft-foreground" aria-hidden="true" />I have space
            to spare
          </span>
          <p className="mt-1.5 mb-4 type-body-sm text-muted-foreground">
            What could my unused space earn?
          </p>
          <div className="mt-auto">
            <ScanSpaceButton from={from} />
          </div>
        </div>
      </div>

      <p className="mt-3 type-body-sm text-muted-foreground">
        Camera, photo upload or manual entry — all estimates you can review and correct.
      </p>
    </section>
  );
}
