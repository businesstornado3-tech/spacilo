import * as React from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  HelpCircle,
  Images,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { QuantityStepper } from "@/components/inventory/QuantityStepper";
import { CATALOGUE_BY_KEY } from "@/lib/inventory-catalogue";
import { CATEGORY_LABELS, type ItemCategory } from "@/lib/inventory-model";
import {
  duplicateNotice,
  INTENT_PROMPT,
  quantityDisplay,
  reviewStatus,
} from "@/lib/spacefit-vision/normalise";
import { scoreToBand, type ConfidenceBand, type InventoryIntent } from "@/lib/spacefit-vision/schema";
import type { DetectionWithPhotos } from "@/lib/detections-api";

export interface DetectionDraft {
  keep: boolean;
  label: string;
  quantity: number;
  category: ItemCategory;
  catalogueKey: string | null;
  edited: boolean;
}

/** Small status pill: green when clear, amber when the renter should check. */
function StatusPill({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 type-body-xs",
        ok
          ? "bg-success-soft text-success-soft-foreground"
          : "bg-warning-soft text-warning-soft-foreground",
      )}
    >
      {ok ? (
        <Check className="size-3" aria-hidden="true" />
      ) : (
        <AlertTriangle className="size-3" aria-hidden="true" />
      )}
      {children}
    </span>
  );
}

/**
 * One AI suggestion awaiting the renter's decision.
 *
 * Identification and quantity are shown as SEPARATE statements: SpaceFit can
 * be sure a group is cardboard boxes while being unsure how many there are.
 * Nothing is added to My Stuff until the renter confirms.
 */
export function DetectionCard({
  detection,
  draft,
  onChange,
  thumbnails,
}: {
  detection: DetectionWithPhotos;
  draft: DetectionDraft;
  onChange: (next: DetectionDraft) => void;
  thumbnails: string[];
}) {
  const objectBand = (detection.object_confidence as ConfidenceBand | null) ??
    scoreToBand(detection.confidence_score);
  const quantityBand = (detection.quantity_confidence as ConfidenceBand | null) ?? "medium";
  const intent = (detection.inventory_intent as InventoryIntent | null) ?? "likely_inventory";
  const repeated = detection.suggested_quantity > 1;

  const status = reviewStatus({
    object_confidence: objectBand,
    quantity_confidence: quantityBand,
    quantity: draft.quantity,
  });

  const catalogue = draft.catalogueKey ? CATALOGUE_BY_KEY.get(draft.catalogueKey) : undefined;
  const duplicate = duplicateNotice({
    duplicate_certainty: detection.duplicate_certainty as never,
    source_photo_indexes: detection.photo_ids.map((_, index) => index),
    label: detection.detected_label,
    repeated_item_group: repeated,
    quantity_confidence: quantityBand,
  });
  const intentPrompt = INTENT_PROMPT[intent];
  const labelId = React.useId();

  return (
    <li
      className={cn(
        "rounded-2xl border border-border bg-card p-4 transition-opacity",
        !draft.keep && "opacity-60",
      )}
    >
      <div className="flex gap-3">
        {thumbnails[0] ? (
          <img
            src={thumbnails[0]}
            alt={`Photo showing ${detection.detected_label}`}
            className="size-16 shrink-0 rounded-xl object-cover"
            loading="lazy"
          />
        ) : (
          <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground">
            <Images className="size-5" aria-hidden="true" />
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {status.allClear ? (
              <StatusPill ok>
                <Sparkles className="size-3" aria-hidden="true" />
                Looks clear
              </StatusPill>
            ) : (
              <>
                <StatusPill ok={status.itemOk}>{status.itemLabel}</StatusPill>
                {status.quantityLabel ? (
                  <StatusPill ok={status.quantityOk}>{status.quantityLabel}</StatusPill>
                ) : null}
              </>
            )}
            {thumbnails.length > 1 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 type-body-xs text-muted-foreground">
                <Copy className="size-3" aria-hidden="true" />
                Seen in {thumbnails.length} photos
              </span>
            ) : null}
          </div>

          <label htmlFor={labelId} className="sr-only">
            Item name
          </label>
          <Input
            id={labelId}
            value={draft.label}
            onChange={(event) => onChange({ ...draft, label: event.target.value, edited: true })}
            disabled={!draft.keep}
          />

          <p className="type-body-sm text-muted-foreground">
            {CATEGORY_LABELS[draft.category]}
            {catalogue
              ? ` · ${catalogue.name} — typical estimate ${catalogue.lengthCm}×${catalogue.widthCm}×${catalogue.heightCm} cm`
              : " · size unknown, we'll ask you for this"}
          </p>

          {intentPrompt ? (
            <p className="flex gap-2 rounded-xl bg-secondary px-3 py-2 type-body-sm text-muted-foreground">
              <HelpCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {intentPrompt}
            </p>
          ) : null}

          {!status.quantityOk && status.quantityLabel ? (
            <p className="type-body-sm text-muted-foreground">
              {quantityDisplay(draft.quantity, quantityBand)}
              {detection.min_plausible_quantity !== null &&
              detection.max_plausible_quantity !== null &&
              detection.max_plausible_quantity > detection.min_plausible_quantity
                ? ` (likely ${detection.min_plausible_quantity}–${detection.max_plausible_quantity})`
                : ""}
            </p>
          ) : null}

          {duplicate ? (
            <p className="flex gap-2 rounded-xl bg-warning-soft px-3 py-2 type-body-sm text-warning-soft-foreground">
              <Copy className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {duplicate}
            </p>
          ) : null}

          {detection.possible_restricted_item ? (
            <p className="flex gap-2 rounded-xl bg-destructive/10 px-3 py-2 type-body-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              This may be something hosts can&apos;t accept. Please check before storing it.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <QuantityStepper
              value={draft.quantity}
              onChange={(quantity) =>
                onChange({ ...draft, quantity: Math.max(1, quantity), edited: true })
              }
              label={draft.label || "item"}
              size="sm"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange({ ...draft, keep: !draft.keep })}
            >
              {draft.keep ? (
                <>
                  <Trash2 aria-hidden="true" />
                  Not mine
                </>
              ) : (
                <>
                  <Undo2 aria-hidden="true" />
                  Keep it
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}
