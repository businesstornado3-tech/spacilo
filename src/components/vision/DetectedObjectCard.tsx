/**
 * DetectedObjectCard — one AI proposal, fully editable.
 *
 * Everything Vision AI suggests can be renamed, resized, re-weighed, split,
 * merged, duplicated or deleted. The person always has the last word.
 */
import * as React from "react";
import { ChevronDown, Copy, Merge, Scissors, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/form/Field";
import { cn } from "@/lib/utils";
import { ConfidenceBadge } from "@/components/vision/ConfidenceBadge";
import { formatVolume, formatWeight } from "@/lib/spaceplanner/library";
import type { WeightClass } from "@/lib/spaceplanner/types";
import { needsReview, objectVolume, objectWeightKg, type DetectedObject } from "@/lib/vision";

export interface DetectedObjectActions {
  update: (id: string, patch: Partial<DetectedObject>) => void;
  remove: (id: string) => void;
  duplicate: (id: string) => void;
  split: (id: string) => void;
  merge: (targetId: string, sourceId: string) => void;
}

const WEIGHTS: WeightClass[] = ["light", "medium", "heavy"];

export function DetectedObjectCard({
  object,
  actions,
  mergeCandidates = [],
}: {
  object: DetectedObject;
  actions: DetectedObjectActions;
  mergeCandidates?: DetectedObject[];
}) {
  const [open, setOpen] = React.useState(false);
  const review = needsReview(object);

  return (
    <li
      className={cn(
        "rounded-2xl border bg-card p-3 shadow-card",
        review ? "border-warning/50" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <TextInput
            value={object.label}
            aria-label="Item name"
            onChange={(event) => actions.update(object.id, { label: event.target.value })}
            className="h-10"
          />
          <p className="mt-1.5 flex flex-wrap items-center gap-2 type-body-xs text-muted-foreground">
            <span className="capitalize">{object.category}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {object.width}×{object.depth}×{object.height}cm
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{formatVolume(objectVolume(object))}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{formatWeight(objectWeightKg(object))}</span>
            {object.fragile ? <span className="text-warning">Fragile</span> : null}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {object.source === "ai" ? <ConfidenceBadge confidence={object.confidence} /> : null}
          <QuantityStepper
            value={object.quantity}
            onChange={(quantity) => actions.update(object.id, { quantity })}
          />
        </div>
      </div>

      {object.source === "ai" && tier !== "confident" ? (
        <p
          className={cn(
            "mt-2 rounded-lg px-2.5 py-1.5 type-body-xs",
            tier === "unsure"
              ? "bg-destructive-soft text-destructive-soft-foreground"
              : "bg-warning-soft text-warning-soft-foreground",
          )}
        >
          {confidenceTierCopy(tier)}.
        </p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <Button type="button" variant="text" size="sm" onClick={() => setOpen((v) => !v)}>
          <ChevronDown
            className={cn("size-4 transition-transform", open && "rotate-180")}
            aria-hidden="true"
          />
          Adjust details
        </Button>
        <Button type="button" variant="text" size="sm" onClick={() => actions.duplicate(object.id)}>
          <Copy aria-hidden="true" />
          Duplicate
        </Button>
        <Button
          type="button"
          variant="text"
          size="sm"
          onClick={() => actions.split(object.id)}
          disabled={object.quantity < 2}
        >
          <Scissors aria-hidden="true" />
          Split
        </Button>
        <Button type="button" variant="text" size="sm" onClick={() => actions.remove(object.id)}>
          <Trash2 aria-hidden="true" />
          Delete
        </Button>
      </div>

      {open ? (
        <div className="mt-3 grid gap-3 rounded-xl bg-muted/50 p-3 sm:grid-cols-2">
          <NumberField
            label="Width (cm)"
            value={object.width}
            onChange={(width) => actions.update(object.id, { width })}
          />
          <NumberField
            label="Depth (cm)"
            value={object.depth}
            onChange={(depth) => actions.update(object.id, { depth })}
          />
          <NumberField
            label="Height (cm)"
            value={object.height}
            onChange={(height) => actions.update(object.id, { height })}
          />
          <div>
            <p className="type-label text-muted-foreground">Weight</p>
            <div className="mt-1 flex gap-1">
              {WEIGHTS.map((weight) => (
                <button
                  key={weight}
                  type="button"
                  aria-pressed={object.weight === weight}
                  onClick={() => actions.update(object.id, { weight })}
                  className={cn(
                    "min-h-11 flex-1 rounded-lg border px-2 type-label capitalize transition-colors",
                    object.weight === weight
                      ? "border-primary bg-primary-soft text-primary-soft-foreground"
                      : "border-border bg-card text-muted-foreground",
                  )}
                >
                  {weight}
                </button>
              ))}
            </div>
          </div>

          {mergeCandidates.length > 0 ? (
            <label className="sm:col-span-2">
              <span className="type-label text-muted-foreground">
                <Merge className="mr-1 inline size-3.5" aria-hidden="true" />
                Merge another item into this one
              </span>
              <select
                className="mt-1 h-11 w-full rounded-lg border border-input bg-card px-3 type-body"
                value=""
                onChange={(event) => {
                  if (event.target.value) actions.merge(object.id, event.target.value);
                }}
              >
                <option value="">Choose an item…</option>
                {mergeCandidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.label} ×{candidate.quantity}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="type-label text-muted-foreground">{label}</span>
      <TextInput
        type="number"
        min={1}
        value={value}
        className="mt-1 h-11"
        onChange={(event) => onChange(Math.max(1, Number(event.target.value) || 1))}
      />
    </label>
  );
}

function QuantityStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-full border border-border">
      <button
        type="button"
        aria-label="Decrease quantity"
        onClick={() => onChange(Math.max(1, value - 1))}
        className="size-11 rounded-l-full text-muted-foreground hover:bg-muted"
      >
        −
      </button>
      <span className="min-w-8 text-center type-label tabular-nums">{value}</span>
      <button
        type="button"
        aria-label="Increase quantity"
        onClick={() => onChange(value + 1)}
        className="size-11 rounded-r-full text-muted-foreground hover:bg-muted"
      >
        +
      </button>
    </div>
  );
}
