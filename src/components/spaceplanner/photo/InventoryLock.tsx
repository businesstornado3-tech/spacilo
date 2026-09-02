/**
 * InventoryLock — "Here's what EarnRoom AI found".
 *
 * The deliberate pause between photographing belongings and photographing the
 * space. Confirming here creates the canonical inventory that every later step
 * — the plan, the manifest, the visualisation — reads from.
 *
 * Presentation rule: this screen must not read as a wall of content. Someone
 * who is happy with the result should be able to confirm in one tap, so the
 * default view is a short summary plus only the items that genuinely need a
 * human look. The full, editable list is one tap away and stays exactly as it
 * was — nothing is removed, only deferred.
 */
import * as React from "react";
import { ArrowRight, Camera, CheckCircle2, ChevronDown, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DetectedInventory } from "@/components/vision/DetectedInventory";
import { objectVolume } from "@/lib/vision/inventory";
import { formatConfidence, needsReview, type DetectedObject } from "@/lib/vision/types";
import type { DetectedObjectActions } from "@/components/vision/DetectedObjectCard";

export function InventoryLock({
  objects,
  actions,
  onAdd,
  onConfirm,
  onRetake,
}: {
  objects: DetectedObject[];
  actions: DetectedObjectActions;
  onAdd?: (label: string) => void;
  onConfirm: () => void;
  onRetake?: () => void;
}) {
  const units = objects.reduce((sum, object) => sum + object.quantity, 0);
  const volume = objects.reduce((sum, object) => sum + objectVolume(object) * object.quantity, 0);
  const flagged = objects.filter((object) => needsReview(object));
  // Open the full list automatically when there is nothing to confirm quickly.
  const [expanded, setExpanded] = React.useState(false);

  return (
    <section className="space-y-4" aria-labelledby="inventory-lock-heading">
      <header>
        <p className="type-overline text-muted-foreground">Your belongings</p>
        <h3 id="inventory-lock-heading" className="mt-1 type-h3">
          Here&apos;s what EarnRoom AI found
        </h3>
        <p className="mt-1 type-body-sm text-muted-foreground">
          {flagged.length === 0
            ? "Everything was recognised clearly. Check it over and confirm."
            : `${flagged.length} ${flagged.length === 1 ? "item is" : "items are"} worth a look before you confirm.`}
        </p>
      </header>

      <dl className="grid grid-cols-3 gap-2">
        {[
          { label: "Items", value: String(objects.length) },
          { label: "Units", value: String(units) },
          { label: "Volume", value: `${volume.toFixed(2)}m³` },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-card p-3">
            <dt className="type-badge text-muted-foreground">{stat.label}</dt>
            <dd className="mt-0.5 type-h4 tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>

      {flagged.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {flagged.map((object) => (
            <li key={object.id} className="rounded-xl border border-warning-soft bg-card p-3">
              <p className="type-card-title">{object.label}</p>
              <p className="type-body-xs text-muted-foreground">
                Quantity {object.quantity} · {Math.round(object.width)} ×{" "}
                {Math.round(object.depth)} × {Math.round(object.height)} cm
              </p>
              <p className="mt-1 type-badge text-warning">
                Worth a look — {formatConfidence(object.confidence)} confidence
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Confirm first: the common path is one tap. */}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="lg" onClick={onConfirm} disabled={objects.length === 0}>
          <CheckCircle2 aria-hidden="true" />
          Looks right — choose your space
          <ArrowRight aria-hidden="true" />
        </Button>
        <Button
          type="button"
          size="lg"
          variant="outline"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          aria-controls="inventory-lock-full-list"
        >
          <Pencil aria-hidden="true" />
          {expanded ? "Hide the full list" : `Review and edit all ${objects.length}`}
          <ChevronDown
            aria-hidden="true"
            className={expanded ? "rotate-180 transition-transform" : "transition-transform"}
          />
        </Button>
        {onRetake ? (
          <Button type="button" size="lg" variant="ghost" onClick={onRetake}>
            <Camera aria-hidden="true" />
            Add or retake photos
          </Button>
        ) : null}
      </div>

      <div id="inventory-lock-full-list" hidden={!expanded}>
        {expanded ? (
          <DetectedInventory objects={objects} actions={actions} {...(onAdd ? { onAdd } : {})} />
        ) : null}
      </div>
    </section>
  );
}
