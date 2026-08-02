import * as React from "react";
import { AlertTriangle, Copy, Images, Sparkles, Trash2, Undo2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { QuantityStepper } from "@/components/inventory/QuantityStepper";
import { CATALOGUE_BY_KEY } from "@/lib/inventory-catalogue";
import { CATEGORY_LABELS, type ItemCategory } from "@/lib/inventory-model";
import { duplicateNotice, REVIEW_BAND_LABEL, reviewBand } from "@/lib/spacefit-vision/normalise";
import type { DetectionWithPhotos } from "@/lib/detections-api";

export interface DetectionDraft {
  keep: boolean;
  label: string;
  quantity: number;
  category: ItemCategory;
  catalogueKey: string | null;
  edited: boolean;
}

const BAND_STYLES = {
  high: "bg-success-soft text-success-soft-foreground",
  medium: "bg-warning-soft text-warning-soft-foreground",
  low: "bg-secondary text-muted-foreground",
} as const;

/**
 * One AI suggestion awaiting the renter's decision.
 *
 * Everything is presented as a suggestion the renter owns: the label is
 * editable, the count is editable, and nothing is added to My Stuff until
 * they confirm.
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
  const band = reviewBand(detection.confidence_score);
  const catalogue = draft.catalogueKey ? CATALOGUE_BY_KEY.get(draft.catalogueKey) : undefined;
  const duplicate = duplicateNotice({
    duplicate_certainty: detection.duplicate_certainty as never,
    source_photo_indexes: detection.photo_ids.map((_, index) => index),
    label: detection.detected_label,
  });
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
            <span
              className={cn("rounded-full px-2 py-0.5 type-body-xs", BAND_STYLES[band])}
              title="How confident SpaceFit AI is about this suggestion"
            >
              <Sparkles className="mr-1 inline size-3" aria-hidden="true" />
              {REVIEW_BAND_LABEL[band]}
            </span>
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
