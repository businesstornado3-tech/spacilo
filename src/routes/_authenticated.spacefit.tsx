/**
 * SpaceFit AI hub — the single signed-in home for both scan journeys.
 *
 * The hub itself holds no intelligence: it routes to the existing renter photo
 * scan and host listing scanner, which remain the only places AI runs.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Boxes, ScanLine, Warehouse } from "lucide-react";

import { brand } from "@/config/brand";
import { AppLayout } from "@/components/layout/AppLayout";
import { Alert } from "@/components/common/Alert";
import { Button } from "@/components/ui/button";
import { SpaceFitAiMark } from "@/components/trust/SpaceFitAI";
import { useAuth } from "@/hooks/useAuth";

const title = "SpaceFit AI — " + brand.name;
const description =
  "Scan what you need to store, or scan the space you want to rent out. SpaceFit AI estimates, you confirm.";

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

const CARDS = {
  renter: [
    {
      to: "/renter/inventory/photos" as const,
      icon: ScanLine,
      title: "Scan my stuff",
      body: "Photograph your belongings and SpaceFit AI will propose an itemised list you review.",
      cta: "Start a scan",
    },
    {
      to: "/renter/inventory" as const,
      icon: Boxes,
      title: "My Stuff",
      body: "See your confirmed inventory and the space it needs.",
      cta: "Open My Stuff",
    },
  ],
  host: [
    {
      to: "/host/spaces/new" as const,
      icon: Warehouse,
      title: "Scan my space",
      body: "Photograph your garage, loft or spare room for a measurement proposal you confirm.",
      cta: "Scan a space",
    },
    {
      to: "/host/spaces" as const,
      icon: Boxes,
      title: "My spaces",
      body: "Review measurements, capacity and guide pricing on your existing listings.",
      cta: "Open my spaces",
    },
  ],
} as const;

function SpaceFitHubPage() {
  const { mode } = useAuth();
  const cards = CARDS[mode === "host" ? "host" : "renter"];

  return (
    <AppLayout
      mode={mode === "host" ? "host" : "renter"}
      title="SpaceFit AI"
      description="Estimates from photos. You confirm every figure."
    >
      <SpaceFitAiMark size="sm" />

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <div key={card.to} className="rounded-2xl border border-border bg-card p-5">
            <card.icon className="size-5 text-signal" aria-hidden="true" />
            <h2 className="mt-3 type-h3">{card.title}</h2>
            <p className="mt-1.5 type-body-sm text-muted-foreground">{card.body}</p>
            <Button asChild className="mt-4" size="sm">
              <Link to={card.to}>
                {card.cta}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        ))}
      </div>

      <Alert tone="info" className="mt-6" title="AI proposes, you verify">
        SpaceFit AI estimates from photos and can be wrong. Nothing is saved, published or verified
        until you confirm it.
      </Alert>
    </AppLayout>
  );
}
