/**
 * InventoryLock — "Here's what Spacilo AI found".
 *
 * The deliberate pause between photographing belongings and photographing the
 * space. Everything detected is shown, with quantity, estimated size and
 * volume, and everything is editable. Confirming here creates the canonical
 * inventory that every later step — the plan, the manifest, the visualisation
 * — reads from.
 */
import { ArrowRight, Camera, CheckCircle2 } from "lucide-react";

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

  return (
    <section className="space-y-4" aria-labelledby="inventory-lock-heading">
      <header>
        <p className="type-overline text-muted-foreground">Your belongings</p>
        <h3 id="inventory-lock-heading" className="mt-1 type-h3">
          Here&apos;s what Spacilo AI found
        </h3>
        <p className="mt-1 type-body-sm text-muted-foreground">
          Spacilo AI found {objects.length} {objects.length === 1 ? "item" : "items"} ({units} in
          total). Check the names and quantities — this list is what we&apos;ll plan and visualise.
        </p>
      </header>

      <ul className="grid gap-2 sm:grid-cols-2">
        {objects.map((object) => (
          <li key={object.id} className="rounded-xl border border-border bg-card p-3">
            <p className="type-card-title">{object.label}</p>
            <p className="type-body-xs text-muted-foreground">
              Quantity {object.quantity} · {Math.round(object.width)} × {Math.round(object.depth)} ×{" "}
              {Math.round(object.height)} cm · approx {objectVolume(object).toFixed(2)}m³
            </p>
            {needsReview(object) ? (
              <p className="mt-1 type-badge text-warning">
                Worth a look — {formatConfidence(object.confidence)} confidence
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      <DetectedInventory objects={objects} actions={actions} onAdd={onAdd} />

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="lg" onClick={onConfirm} disabled={objects.length === 0}>
          <CheckCircle2 aria-hidden="true" />
          Looks right — choose your space
          <ArrowRight aria-hidden="true" />
        </Button>
        {onRetake ? (
          <Button type="button" size="lg" variant="outline" onClick={onRetake}>
            <Camera aria-hidden="true" />
            Add or retake photos
          </Button>
        ) : null}
      </div>
    </section>
  );
}
