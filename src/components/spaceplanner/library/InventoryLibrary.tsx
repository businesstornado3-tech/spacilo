/**
 * InventoryLibrary — the personal collection of saved inventories.
 *
 * Unlimited inventories, each one a named plan the user can reopen, rename,
 * duplicate, archive, restore or delete. This component owns no rules: it
 * renders records from the repository and reports intent upwards.
 */
import * as React from "react";
import { Boxes, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/overlay/Modal";
import { Field, NativeSelect, TextArea, TextInput } from "@/components/form/Field";
import { EmptyState } from "@/components/common/States";
import { InventoryCard } from "@/components/spaceplanner/library/InventoryCard";
import { DEMO_SPACES } from "@/lib/spaceplanner";
import {
  STARTER_NAMES,
  archivedInventories,
  liveInventories,
  type SavedInventory,
  type SavedLine,
} from "@/lib/spaceplanner/library";

export interface InventoryLibraryProps {
  inventories: SavedInventory[];
  loading?: boolean;
  onOpen: (inventory: SavedInventory) => void;
  onCreate: (input: { name: string; description: string; spaceId: string; lines?: SavedLine[] }) => void;
  onRename: (id: string, name: string, description: string) => void;
  onDuplicate: (id: string) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  className?: string;
}

export function InventoryLibrary({
  inventories,
  loading = false,
  onOpen,
  onCreate,
  onRename,
  onDuplicate,
  onArchive,
  onRestore,
  onDelete,
  className,
}: InventoryLibraryProps) {
  const [tab, setTab] = React.useState<"active" | "archived">("active");
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [spaceId, setSpaceId] = React.useState(DEMO_SPACES[0]!.id);

  const live = liveInventories(inventories);
  const archived = archivedInventories(inventories);
  const rows = tab === "active" ? live : archived;

  const create = () => {
    onCreate({ name: name.trim() || "Untitled inventory", description: description.trim(), spaceId });
    setName("");
    setDescription("");
    setCreating(false);
  };

  return (
    <section className={cn("", className)} aria-labelledby="inventory-library-heading">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="inventory-library-heading" className="type-h3 text-base">
          My inventories
        </h2>
        <div className="flex rounded-full border border-border p-0.5">
          {(["active", "archived"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={tab === value}
              onClick={() => setTab(value)}
              className={cn(
                "rounded-full px-3 py-1 type-label text-xs capitalize transition-colors",
                tab === value ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {value} ({value === "active" ? live.length : archived.length})
            </button>
          ))}
        </div>
        <Button size="sm" className="ml-auto" onClick={() => setCreating(true)}>
          <Plus className="size-4" aria-hidden="true" />
          New inventory
        </Button>
      </div>

      {loading ? (
        <p className="mt-4 type-body-sm text-muted-foreground">Loading your inventories…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          className="mt-4"
          icon={Boxes}
          title={tab === "active" ? "No inventories yet" : "Nothing archived"}
          description={
            tab === "active"
              ? "Create an inventory for each move, clearout or season — Spacilo AI plans each one separately."
              : "Archived inventories stay here until you restore or delete them."
          }
          {...(tab === "active"
            ? { actionLabel: "Create your first inventory", onAction: () => setCreating(true) }
            : {})}
        />
      ) : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((inventory) => (
            <li key={inventory.id}>
              <InventoryCard
                inventory={inventory}
                onOpen={onOpen}
                onRename={onRename}
                onDuplicate={onDuplicate}
                onArchive={onArchive}
                onRestore={onRestore}
                onDelete={onDelete}
              />
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={creating}
        onOpenChange={setCreating}
        title="New inventory"
        description="Name it after the job — a move, a clearout, a season."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button onClick={create}>Create</Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label="Name" htmlFor="new-inventory-name">
            <TextInput
              id="new-inventory-name"
              value={name}
              placeholder="Garage clearout"
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-1.5">
            {STARTER_NAMES.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setName(suggestion)}
                className="rounded-full border border-border px-2.5 py-1 type-body-sm transition-colors hover:bg-secondary"
              >
                {suggestion}
              </button>
            ))}
          </div>
          <Field label="Description" htmlFor="new-inventory-description">
            <TextArea
              id="new-inventory-description"
              rows={2}
              value={description}
              placeholder="What's going into storage, and roughly when."
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          <Field label="Storage type to plan against" htmlFor="new-inventory-space">
            <NativeSelect
              id="new-inventory-space"
              value={spaceId}
              onChange={(event) => setSpaceId(event.target.value)}
            >
              {DEMO_SPACES.map((space) => (
                <option key={space.id} value={space.id}>
                  {space.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
      </Modal>
    </section>
  );
}
