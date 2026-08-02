import { Pencil, Trash2, Sparkles, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { QuantityStepper } from "@/components/inventory/QuantityStepper";
import { iconForItem } from "@/lib/inventory-catalogue";
import {
  CATEGORY_LABELS,
  formatDimensions,
  formatVolume,
  itemVolumeM3,
  sizeSourceLabel,
  type InventoryItem,
} from "@/lib/inventory-model";

export function ItemRow({
  item,
  onQuantityChange,
  onEdit,
  onDelete,
}: {
  item: InventoryItem;
  onQuantityChange: (quantity: number) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const Icon = iconForItem(item.catalogue_key, item.category);
  const volume = itemVolumeM3(item);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate type-body font-semibold">{item.item_name}</p>
        <p className="truncate type-body-sm text-muted-foreground">
          {formatDimensions(item.length_cm, item.width_cm, item.height_cm)}
          {volume !== null ? ` · ${formatVolume(volume)}` : ""}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge variant={item.size_source === "user_measured" ? "subtle" : "neutral"} size="sm">
            <Sparkles aria-hidden="true" />
            {sizeSourceLabel(item.size_source)}
          </Badge>
          {item.fragile ? (
            <Badge variant="warning" size="sm">
              <ShieldAlert aria-hidden="true" />
              Fragile
            </Badge>
          ) : null}
          {item.stackable === "no" ? (
            <Badge variant="neutral" size="sm">
              Not stackable
            </Badge>
          ) : null}
        </div>
        {item.notes ? (
          <p className="mt-1 type-body-sm text-muted-foreground">{item.notes}</p>
        ) : null}
      </div>

      <div className="ml-auto flex items-center gap-1">
        <QuantityStepper
          value={item.quantity}
          onChange={onQuantityChange}
          label={item.item_name}
          size="sm"
        />
        <button
          type="button"
          onClick={onEdit}
          className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Pencil className="size-4" aria-hidden="true" />
          <span className="sr-only">Edit {item.item_name}</span>
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-destructive-soft hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Trash2 className="size-4" aria-hidden="true" />
          <span className="sr-only">Delete {item.item_name}</span>
        </button>
      </div>
    </div>
  );
}

export function categoryHeading(category: InventoryItem["category"]) {
  return CATEGORY_LABELS[category];
}
