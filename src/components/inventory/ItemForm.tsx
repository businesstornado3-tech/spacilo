import * as React from "react";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  TRI_STATE_OPTIONS,
  validateDimension,
  validateQuantity,
  type ItemCategory,
  type ItemTriState,
} from "@/lib/inventory-model";

export interface ItemFormValues {
  itemName: string;
  category: ItemCategory;
  quantity: number;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  stackable: ItemTriState;
  fragile: boolean;
  orientationFlexible: ItemTriState;
  notes: string;
}

export const emptyItemForm: ItemFormValues = {
  itemName: "",
  category: "other",
  quantity: 1,
  lengthCm: "",
  widthCm: "",
  heightCm: "",
  stackable: "unknown",
  fragile: false,
  orientationFlexible: "unknown",
  notes: "",
};

export type ItemFormErrors = Partial<Record<keyof ItemFormValues, string>>;

const parse = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

export function validateItemForm(values: ItemFormValues): ItemFormErrors {
  const errors: ItemFormErrors = {};
  if (!values.itemName.trim()) errors.itemName = "Give this item a name.";
  const quantityError = validateQuantity(values.quantity);
  if (quantityError) errors.quantity = quantityError;

  const dims: [keyof ItemFormValues, string, string][] = [
    ["lengthCm", values.lengthCm, "Length"],
    ["widthCm", values.widthCm, "Width"],
    ["heightCm", values.heightCm, "Height"],
  ];
  for (const [key, raw, label] of dims) {
    const parsed = parse(raw);
    const error = parsed === null ? null : validateDimension(parsed, label);
    if (error) errors[key] = error;
  }
  return errors;
}

/** cm in, metres never — the renter-facing UI is entirely in centimetres. */
export function itemFormToRow(values: ItemFormValues) {
  return {
    item_name: values.itemName.trim(),
    category: values.category,
    quantity: values.quantity,
    length_cm: parse(values.lengthCm),
    width_cm: parse(values.widthCm),
    height_cm: parse(values.heightCm),
    stackable: values.stackable,
    fragile: values.fragile,
    orientation_flexible: values.orientationFlexible,
    notes: values.notes.trim() || null,
  };
}

function TriStateField({
  legend,
  value,
  onChange,
}: {
  legend: string;
  value: ItemTriState;
  onChange: (next: ItemTriState) => void;
}) {
  return (
    <fieldset>
      <legend className="type-label">{legend}</legend>
      <div className="mt-2 flex gap-2">
        {TRI_STATE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "min-h-11 flex-1 rounded-xl border px-3 type-body-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              value === option.value
                ? "border-primary bg-primary-soft text-primary-soft-foreground font-semibold"
                : "border-border bg-card text-muted-foreground hover:bg-secondary",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function ItemForm({
  values,
  errors,
  onChange,
}: {
  values: ItemFormValues;
  errors: ItemFormErrors;
  onChange: (patch: Partial<ItemFormValues>) => void;
}) {
  const id = React.useId();

  return (
    <div className="space-y-5">
      <div>
        <Label htmlFor={`${id}-name`}>Item name</Label>
        <Input
          id={`${id}-name`}
          value={values.itemName}
          onChange={(e) => onChange({ itemName: e.target.value })}
          placeholder="e.g. Antique mirror"
          className="mt-1.5"
        />
        {errors.itemName ? (
          <p className="mt-1.5 type-body-sm text-destructive">{errors.itemName}</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${id}-category`}>Category</Label>
          <Select
            value={values.category}
            onValueChange={(value) => onChange({ category: value as ItemCategory })}
          >
            <SelectTrigger id={`${id}-category`} className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_ORDER.map((category) => (
                <SelectItem key={category} value={category}>
                  {CATEGORY_LABELS[category]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor={`${id}-qty`}>Quantity</Label>
          <Input
            id={`${id}-qty`}
            type="number"
            inputMode="numeric"
            min={1}
            value={values.quantity}
            onChange={(e) => onChange({ quantity: Number(e.target.value) })}
            className="mt-1.5"
          />
          {errors.quantity ? (
            <p className="mt-1.5 type-body-sm text-destructive">{errors.quantity}</p>
          ) : null}
        </div>
      </div>

      <div>
        <p className="type-label">Approximate size (cm)</p>
        <p className="mt-1 type-body-sm text-muted-foreground">
          Optional — a rough measurement still helps.
        </p>
        <div className="mt-2 grid grid-cols-3 gap-3">
          {([
            ["lengthCm", "Length"],
            ["widthCm", "Width"],
            ["heightCm", "Height"],
          ] as const).map(([key, label]) => (
            <div key={key}>
              <Label htmlFor={`${id}-${key}`} className="type-body-sm text-muted-foreground">
                {label}
              </Label>
              <Input
                id={`${id}-${key}`}
                type="number"
                inputMode="decimal"
                min={0}
                value={values[key]}
                onChange={(e) => onChange({ [key]: e.target.value } as Partial<ItemFormValues>)}
                className="mt-1"
              />
            </div>
          ))}
        </div>
        {(errors.lengthCm || errors.widthCm || errors.heightCm) ? (
          <p className="mt-1.5 type-body-sm text-destructive">
            {errors.lengthCm ?? errors.widthCm ?? errors.heightCm}
          </p>
        ) : null}
      </div>

      <TriStateField
        legend="Can items of this type be stacked?"
        value={values.stackable}
        onChange={(stackable) => onChange({ stackable })}
      />

      <fieldset>
        <legend className="type-label">Is this fragile?</legend>
        <div className="mt-2 flex gap-2">
          {[
            { label: "Yes", value: true },
            { label: "No", value: false },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              aria-pressed={values.fragile === option.value}
              onClick={() => onChange({ fragile: option.value })}
              className={cn(
                "min-h-11 flex-1 rounded-xl border px-3 type-body-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                values.fragile === option.value
                  ? "border-primary bg-primary-soft text-primary-soft-foreground font-semibold"
                  : "border-border bg-card text-muted-foreground hover:bg-secondary",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <TriStateField
        legend="Can it be stored in different orientations?"
        value={values.orientationFlexible}
        onChange={(orientationFlexible) => onChange({ orientationFlexible })}
      />

      <div>
        <Label htmlFor={`${id}-notes`}>Notes (optional)</Label>
        <Textarea
          id={`${id}-notes`}
          value={values.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder="Antique mirror — must remain upright."
          rows={3}
          className="mt-1.5"
        />
      </div>
    </div>
  );
}
