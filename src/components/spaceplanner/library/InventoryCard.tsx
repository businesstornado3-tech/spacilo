/**
 * InventoryCard — one saved inventory in the workspace.
 *
 * Shows the facts a user needs to recognise a plan at a glance (preview, score
 * band, item count, estimated volume and weight, storage type) and the actions
 * that manage its life: rename, duplicate, archive, restore and delete.
 */
import * as React from "react";
import { Archive, Copy, MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/overlay/Modal";
import { Field, TextArea, TextInput } from "@/components/form/Field";
import { PlanPreview } from "@/components/spaceplanner/library/PlanPreview";
import { bandFor } from "@/lib/spaceplanner";
import {
  formatVolume,
  formatWeight,
  relativeTime,
  spaceFor,
  summarise,
  type SavedInventory,
} from "@/lib/spaceplanner/library";

export interface InventoryCardProps {
  inventory: SavedInventory;
  onOpen?: (inventory: SavedInventory) => void;
  onRename?: (id: string, name: string, description: string) => void;
  onDuplicate?: (id: string) => void;
  onArchive?: (id: string) => void;
  onRestore?: (id: string) => void;
  onDelete?: (id: string) => void;
  className?: string;
}

export function InventoryCard({
  inventory,
  onOpen,
  onRename,
  onDuplicate,
  onArchive,
  onRestore,
  onDelete,
  className,
}: InventoryCardProps) {
  const summary = summarise(inventory);
  const space = spaceFor(inventory);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [name, setName] = React.useState(inventory.name);
  const [description, setDescription] = React.useState(inventory.description);
  const archived = Boolean(inventory.archivedAt);

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl border border-border bg-card p-4 transition-shadow hover:shadow-card",
        className,
      )}
    >
      <PlanPreview inventory={inventory} />

      <div className="mt-3 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate type-h3 text-base">{inventory.name}</h3>
          <p className="mt-0.5 truncate type-body-sm text-muted-foreground">
            {inventory.description || space.name}
          </p>
        </div>
        <StatusChip status={summary.status} archived={archived} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 type-body-sm">
        <Stat label="Items" value={`${summary.itemCount}`} />
        <Stat label="Volume" value={formatVolume(summary.estimatedStorageVolume)} />
        <Stat label="Weight" value={`~${formatWeight(summary.weightKg)}`} />
        <Stat
          label="Spacilo AI"
          value={
            inventory.lastScore === null ? "Not run yet" : `${inventory.lastScore} · ${bandFor(inventory.lastScore)}`
          }
        />
      </dl>

      <p className="mt-3 type-body-sm text-muted-foreground">
        {space.name} · updated {relativeTime(inventory.updatedAt)}
      </p>

      <div className="mt-4 flex items-center gap-2">
        {archived ? (
          <Button size="sm" variant="secondary" onClick={() => onRestore?.(inventory.id)}>
            <RotateCcw className="size-4" aria-hidden="true" />
            Restore
          </Button>
        ) : (
          <Button size="sm" onClick={() => onOpen?.(inventory)}>
            Open planner
          </Button>
        )}

        <div className="relative ml-auto">
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Actions for ${inventory.name}`}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </Button>
          {menuOpen ? (
            <>
              <button
                type="button"
                className="fixed inset-0 z-10 cursor-default"
                aria-hidden="true"
                tabIndex={-1}
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-overlay">
                <MenuItem
                  icon={Pencil}
                  label="Rename"
                  onClick={() => {
                    setMenuOpen(false);
                    setRenaming(true);
                  }}
                />
                <MenuItem
                  icon={Copy}
                  label="Duplicate"
                  onClick={() => {
                    setMenuOpen(false);
                    onDuplicate?.(inventory.id);
                  }}
                />
                {archived ? (
                  <MenuItem
                    icon={RotateCcw}
                    label="Restore"
                    onClick={() => {
                      setMenuOpen(false);
                      onRestore?.(inventory.id);
                    }}
                  />
                ) : (
                  <MenuItem
                    icon={Archive}
                    label="Archive"
                    onClick={() => {
                      setMenuOpen(false);
                      onArchive?.(inventory.id);
                    }}
                  />
                )}
                <MenuItem
                  icon={Trash2}
                  label="Delete"
                  destructive
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete?.(inventory.id);
                  }}
                />
              </div>
            </>
          ) : null}
        </div>
      </div>

      <Modal
        open={renaming}
        onOpenChange={setRenaming}
        title="Rename inventory"
        description="Give this plan a name you will recognise later."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenaming(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                onRename?.(inventory.id, name.trim() || inventory.name, description.trim());
                setRenaming(false);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label="Name" htmlFor={`name-${inventory.id}`}>
            <TextInput
              id={`name-${inventory.id}`}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="Description" htmlFor={`desc-${inventory.id}`}>
            <TextArea
              id={`desc-${inventory.id}`}
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}

function StatusChip({ status, archived }: { status: "draft" | "ready"; archived: boolean }) {
  const label = archived ? "Archived" : status === "ready" ? "Ready" : "Draft";
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-1 type-label text-xs",
        archived
          ? "bg-secondary text-muted-foreground"
          : status === "ready"
            ? "bg-success-soft text-success-soft-foreground"
            : "bg-warning-soft text-warning-soft-foreground",
      )}
    >
      {label}
    </span>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: typeof Pencil;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left type-body-sm transition-colors hover:bg-secondary",
        destructive && "text-destructive",
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      {label}
    </button>
  );
}
