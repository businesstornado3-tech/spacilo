/**
 * Spacilo AI hub — the single signed-in home for both scan journeys.
 *
 * Mode-aware: renters see their canonical requirement, hosts see their space's
 * usable capacity and deterministic pricing guidance. The hub holds no
 * intelligence of its own and never calls the vision provider — it reads
 * canonical rows and runs the shared engines in `@/lib/spacefit-hub`.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Boxes, ScanLine, Warehouse } from "lucide-react";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { Alert } from "@/components/common/Alert";
import { Button } from "@/components/ui/button";
import { RenterSpaceFitCard } from "@/components/spacefit/RenterSpaceFitCard";
import { HostSpaceFitCard } from "@/components/host/spacefit/HostSpaceFitCard";
import { useAuth } from "@/hooks/useAuth";
import { useActiveInventory, useInventoryItems } from "@/hooks/useInventory";
import { useMySpaces } from "@/hooks/useMySpaces";
import { hostSpaceFitState, renterSpaceFitState } from "@/lib/spacefit-hub";

const title = "Spacilo AI — " + brand.name;
const description =
  "Scan what you need to store, or scan the space you want to rent out. Spacilo AI estimates, you confirm.";

export const Route = createFileRoute("/_authenticated/spacefit")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: SpaceFitHubPage,
});

function SpaceFitHubPage() {
  const { mode } = useAuth();
  const isHost = mode === "host";

  return (
    <AppLayout
      mode={isHost ? "host" : "renter"}
      title="Spacilo AI"
      description="Estimates from photos. You confirm every figure."
    >
      {isHost ? <HostHub /> : <RenterHub />}

      <Alert tone="info" className="mt-6" title="AI proposes, you verify">
        Spacilo AI estimates from photos and can be wrong. Nothing is saved, published or verified
        until you confirm it.
      </Alert>
    </AppLayout>
  );
}

/* --------------------------------------------------------------- renter */

function RenterHub() {
  const { data: inventory } = useActiveInventory();
  const { data: items } = useInventoryItems(inventory?.id);
  const state = renterSpaceFitState(items);

  return (
    <div data-testid="spacefit-hub-renter" className="grid gap-4">
      {state.state === "empty" ? (
        <p className="type-body text-muted-foreground">
          Know what space you need before you search.
        </p>
      ) : null}

      <RenterSpaceFitCard state={state} variant="hub" />

      <div className="grid gap-4 sm:grid-cols-2">
        <HubLink
          to="/renter/inventory/photos"
          icon={ScanLine}
          title="Scan my stuff"
          body="Photograph your belongings and Spacilo AI will propose an itemised list you review."
          cta={state.state === "empty" ? "Scan my stuff" : "Update scan"}
        />
        <HubLink
          to="/renter/inventory/add"
          icon={Boxes}
          title="Add items manually"
          body="Prefer to type it in? Build or correct your inventory by hand at any time."
          cta="Add items"
        />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- host */

function HostHub() {
  const { data: spaces } = useMySpaces();
  const state = hostSpaceFitState(spaces);

  return (
    <div data-testid="spacefit-hub-host" className="grid gap-4">
      <HostSpaceFitCard state={state} variant="hub" />

      <div className="grid gap-4 sm:grid-cols-2">
        <HubLink
          to="/host/spaces/new"
          icon={Warehouse}
          title="Scan my space"
          body="Photograph your garage, loft or spare room for a measurement proposal you confirm."
          cta={state.state === "none" ? "Scan my space" : "Scan again"}
        />
        <HubLink
          to="/host/spaces"
          icon={Boxes}
          title="My spaces"
          body="Review measurements, capacity and guide pricing on your existing listings."
          cta="Open my spaces"
        />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- shared */

function HubLink({
  to,
  icon: Icon,
  title: heading,
  body,
  cta,
}: {
  to: "/renter/inventory/photos" | "/renter/inventory/add" | "/host/spaces/new" | "/host/spaces";
  icon: typeof Boxes;
  title: string;
  body: string;
  cta: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <Icon className="size-5 text-signal" aria-hidden="true" />
      <h2 className="mt-3 type-h3">{heading}</h2>
      <p className="mt-1.5 type-body-sm text-muted-foreground">{body}</p>
      <Button asChild className="mt-4" size="sm" variant="secondary">
        <Link to={to}>
          {cta}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}
