import * as React from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ItemForm,
  emptyItemForm,
  itemFormToRow,
  validateItemForm,
  type ItemFormErrors,
  type ItemFormValues,
} from "@/components/inventory/ItemForm";
import type { InventoryItem } from "@/lib/inventory-model";

type Row = ReturnType<typeof itemFormToRow>;

function toForm(item: InventoryItem): ItemFormValues {
  const str = (value: number | null) => (value === null ? "" : String(Number(value)));
  return {
    itemName: item.item_name,
    category: item.category,
    quantity: item.quantity,
    lengthCm: str(item.length_cm),
    widthCm: str(item.width_cm),
    heightCm: str(item.height_cm),
    stackable: item.stackable,
    fragile: item.fragile,
    orientationFlexible: item.orientation_flexible,
    notes: item.notes ?? "",
  };
}

/** Shared dialog for both "Add custom item" and "Edit item". */
export function ItemDialog({
  open,
  onOpenChange,
  item,
  onSubmit,
  saving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Undefined = creating a custom item. */
  item?: InventoryItem;
  onSubmit: (row: Row, dimensionsChanged: boolean) => void | Promise<void>;
  saving?: boolean;
}) {
  const initial = React.useMemo(() => (item ? toForm(item) : emptyItemForm), [item]);
  const [values, setValues] = React.useState<ItemFormValues>(initial);
  const [errors, setErrors] = React.useState<ItemFormErrors>({});

  React.useEffect(() => {
    if (open) {
      setValues(initial);
      setErrors({});
    }
  }, [open, initial]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const found = validateItemForm(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const dimensionsChanged =
      values.lengthCm !== initial.lengthCm ||
      values.widthCm !== initial.widthCm ||
      values.heightCm !== initial.heightCm;

    await onSubmit(itemFormToRow(values), dimensionsChanged);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? "Edit item" : "Add custom item"}</DialogTitle>
          <DialogDescription>
            Measurements are in centimetres. Rough sizes are fine — you can refine them later.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <ItemForm
            values={values}
            errors={errors}
            onChange={(patch) => setValues((current) => ({ ...current, ...patch }))}
          />
          <DialogFooter className="mt-6">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {item ? "Save changes" : "Add to My Stuff"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
