/**
 * Guest renter preview — "Scan my stuff" without an account.
 *
 * Public route. AI proposes items, the visitor corrects them, and the shared
 * deterministic requirement engine decides the numbers. Nothing is saved.
 */
import { track } from "@/lib/analytics/tracker";
import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Sparkles, Trash2 } from "lucide-react";

import { brand } from "@/config/brand";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { Alert } from "@/components/common/Alert";
import { Button } from "@/components/ui/button";
import { QuantityStepper } from "@/components/inventory/QuantityStepper";
import { SpaceFitAiMark } from "@/components/trust/SpaceFitAI";
import {
  GuestConversionCta,
  GuestDisclaimer,
  GuestPhotoPicker,
  GuestScanningState,
} from "@/components/spacefit/GuestScanShell";
import { useGuestSpaceFit } from "@/hooks/useGuestSpaceFit";
import {
  guestItemFromCatalogue,
  guestRequirementPreview,
  type GuestItem,
} from "@/lib/spacefit-guest/preview";
import { CATALOGUE } from "@/lib/inventory-catalogue";
import { formatVolume } from "@/lib/inventory-model";
import { publicRouteMeta } from "@/lib/seo/meta";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/structured-data";

const title = "Scan your stuff — " + brand.name;
const description =
  "See how much storage your belongings really need. Scan your things with Spacilo AI — no account needed to try it.";

export const Route = createFileRoute("/spacefit/stuff")({
  head: () => ({
    ...publicRouteMeta({ title: title, description: description, path: "/spacefit/stuff" }),
    scripts: [
      jsonLdScript(breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: title, path: "/spacefit/stuff" }])),
    ],
  }),
  component: GuestStuffPage,
});

const POPULAR = CATALOGUE.filter((item) => item.popular).slice(0, 8);

function GuestStuffPage() {
  const scan = useGuestSpaceFit("renter");
  const items = scan.items;

  const setItems = scan.setItems;
  const update = React.useCallback(
    (id: string, patch: Partial<GuestItem>) =>
      setItems((current) =>
        (current ?? []).map((item) => (item.id === id ? { ...item, ...patch } : item)),
      ),
    [setItems],
  );
  const remove = React.useCallback(
    (id: string) => setItems((current) => (current ?? []).filter((item) => item.id !== id)),
    [setItems],
  );
  const addManual = React.useCallback(
    (key: string) =>
      setItems((current) => {
        const item = guestItemFromCatalogue(key);
        return item ? [...(current ?? []), item] : current;
      }),
    [setItems],
  );

  const preview = React.useMemo(
    () => (items && items.length > 0 ? guestRequirementPreview(items) : null),
    [items],
  );

  const viewed = React.useRef(false);
  React.useEffect(() => {
    if (!preview || viewed.current) return;
    viewed.current = true;
    track("guest_scan_result_viewed", { props: { kind: "stuff" } });
  }, [preview]);

  return (
    <MarketingLayout>
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <SpaceFitAiMark size="sm" />
        <h1 className="mt-3 type-h1">How much space do you actually need?</h1>
        <p className="mt-2 type-body text-muted-foreground">
          Photograph your belongings and Spacilo AI will suggest what it sees. You correct the list
          — we&apos;ll work out the storage space it needs. No account needed to try it.
        </p>

        <section className="mt-6 rounded-2xl border border-border bg-card p-5">
          <h2 className="type-h3">1. Add photos</h2>
          <div className="mt-4">
            <GuestPhotoPicker
              images={scan.images}
              onAdd={(files) => void scan.addFiles(files)}
              onRemove={scan.removeImage}
              disabled={scan.analysing}
            />
          </div>

          {scan.analysing ? (
            <GuestScanningState label="Looking at your photos…" />
          ) : (
            <div className="mt-4">
              <Button disabled={scan.images.length === 0} onClick={() => void scan.analyse()}>
                <Sparkles className="size-4" aria-hidden="true" />
                {items ? "Analyse again" : "Analyse my photos"}
              </Button>
            </div>
          )}

          {scan.error ? (
            <Alert tone="warning" className="mt-4" title="We couldn't finish that scan">
              {scan.error} You can still build your list by hand below.
            </Alert>
          ) : null}
        </section>

        <section className="mt-4 rounded-2xl border border-border bg-card p-5">
          <h2 className="type-h3">2. Check the list</h2>
          <p className="mt-1 type-body-sm text-muted-foreground">
            Spacilo AI proposes — you decide. Change quantities, remove anything wrong, add what it
            missed.
          </p>

          {items && items.length > 0 ? (
            <ul className="mt-4 divide-y divide-border">
              {items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate type-label">{item.label}</p>
                    <p className="type-body-sm text-muted-foreground">
                      {item.source === "ai" ? "Suggested by Spacilo AI" : "Added by you"}
                      {item.possibleRestrictedItem ? " · check this is allowed in storage" : ""}
                    </p>
                  </div>
                  <QuantityStepper
                    value={item.quantity}
                    onChange={(next) => update(item.id, { quantity: next })}
                    label={`Quantity of ${item.label}`}
                    size="sm"
                  />
                  <button
                    type="button"
                    onClick={() => remove(item.id)}
                    aria-label={`Remove ${item.label}`}
                    className="rounded-full p-2 text-muted-foreground"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 type-body-sm text-muted-foreground">
              Nothing on your list yet. Analyse some photos, or add common items below.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {POPULAR.map((entry) => (
              <Button
                key={entry.key}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addManual(entry.key)}
              >
                <Plus className="size-4" aria-hidden="true" />
                {entry.name}
              </Button>
            ))}
          </div>
        </section>

        {preview ? (
          <section className="mt-4 rounded-2xl border border-border bg-card p-5">
            <h2 className="type-h3">3. Your storage estimate</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="type-overline text-muted-foreground">Space needed</dt>
                <dd className="mt-1 type-h2 tabular-nums">
                  {formatVolume(preview.requirement.requiredVolumeM3, { approx: true })}
                </dd>
              </div>
              <div>
                <dt className="type-overline text-muted-foreground">Floor area</dt>
                <dd className="mt-1 type-h2 tabular-nums">
                  {preview.requirement.requiredFloorAreaM2
                    ? `~${preview.requirement.requiredFloorAreaM2} m²`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="type-overline text-muted-foreground">Items</dt>
                <dd className="mt-1 type-h2 tabular-nums">{preview.itemCount}</dd>
              </div>
            </dl>
            {preview.requirement.warnings.length > 0 ? (
              <ul className="mt-4 grid gap-1.5">
                {preview.requirement.warnings.map((warning) => (
                  <li key={warning} className="type-body-sm text-muted-foreground">
                    {warning}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        <GuestConversionCta
          mode="renter"
          headline="Keep this list and find real space"
          body="Create a free account and we'll move this scan straight into My Stuff for you to confirm — then match it against real spaces near you."
          withheld={[
            "Saving your inventory permanently",
            "Matching against real listings and fit scores",
            "Sending a storage request, messaging a host, booking and paying",
          ]}
        />

        <GuestDisclaimer />
      </div>
    </MarketingLayout>
  );
}
