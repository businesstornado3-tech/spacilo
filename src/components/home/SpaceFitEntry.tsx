/**
 * "Your Stuff. Your Space. Just Show Us." — the Spacilo AI entry point.
 *
 * A core product surface, not marketing copy: both cards route into the real
 * scan journeys, and this section is the seed for AI inventory recognition,
 * AI space recognition, the Digital Twin, commercial planning and AR guidance.
 *
 * Nothing here loads AI code — analysis only starts inside those flows.
 */
import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Boxes, Camera, Home, Images, Keyboard } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/common/Reveal";
import { SpaceFitAiMark } from "@/components/trust/SpaceFitAI";
import { useAuth } from "@/hooks/useAuth";
import { scanSpaceTarget, scanStuffTarget } from "@/lib/spacefit-entry";
import { track } from "@/lib/analytics/tracker";

const METHODS = [
  { icon: Camera, label: "Take photos" },
  { icon: Images, label: "Upload images" },
  { icon: Keyboard, label: "Manual entry" },
];

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

function MethodList() {
  return (
    <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
      {METHODS.map((method) => (
        <li key={method.label} className="inline-flex items-center gap-1.5 type-badge">
          <method.icon className="size-3.5 text-signal-soft-foreground" aria-hidden="true" />
          {method.label}
        </li>
      ))}
    </ul>
  );
}

export function SpaceFitEntry({
  from = "homepage_ai_entry",
  className,
}: {
  from?: string;
  className?: string;
}) {
  return (
    <section
      aria-labelledby="spacefit-entry-heading"
      className={cn("border-y border-border/70 bg-surface/60 py-11 sm:py-14", className)}
    >
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
        <div className="text-center">
          <div className="inline-flex">
            <SpaceFitAiMark size="sm" />
          </div>
          <h2 id="spacefit-entry-heading" className="mt-3 text-balance type-h1">
            Your stuff. Your space. Just show us.
          </h2>
          <p className="mx-auto mt-2.5 max-w-lg type-body text-muted-foreground">
            Spacilo AI works out what fits — whether that's your belongings or your spare space.
          </p>
        </div>

        <div className="mt-7 grid gap-4 sm:grid-cols-2 sm:gap-5">
          <Reveal>
            <article className="flex h-full flex-col rounded-3xl border border-border bg-card p-5 shadow-card transition-shadow hover:shadow-raised sm:p-6">
              <span className="inline-flex items-center gap-2 type-label">
                <Boxes className="size-4 text-signal-soft-foreground" aria-hidden="true" />I have
                stuff to store
              </span>
              <p className="mt-2 type-body-sm text-muted-foreground">
                How much space do I really need?
              </p>
              <MethodList />
              <div className="mt-auto pt-5">
                <ScanStuffButton from={from} />
              </div>
            </article>
          </Reveal>

          <Reveal delay={80}>
            <article className="flex h-full flex-col rounded-3xl border border-border bg-card p-5 shadow-card transition-shadow hover:shadow-raised sm:p-6">
              <span className="inline-flex items-center gap-2 type-label">
                <Home className="size-4 text-signal-soft-foreground" aria-hidden="true" />I have
                unused space
              </span>
              <p className="mt-2 type-body-sm text-muted-foreground">
                What could my unused space earn?
              </p>
              <MethodList />
              <div className="mt-auto pt-5">
                <ScanSpaceButton from={from} />
              </div>
            </article>
          </Reveal>
        </div>

        <p className="mt-4 text-center type-badge text-muted-foreground">
          All estimates you can review and correct before anything is booked.
        </p>
      </div>
    </section>
  );
}
