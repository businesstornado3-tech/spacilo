/**
 * React Query wiring for the renter inventory.
 *
 * Quantity changes are optimistic so the +/- controls feel instant, then
 * reconciled against the database rollup. All arithmetic lives in
 * `@/lib/inventory-model` — never inline in components.
 */
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  addItem,
  clearInventory,
  deleteItem,
  getActiveInventory,
  getOrCreateActiveInventory,
  listItems,
  listPhotos,
  updateItem,
  type NewItem,
} from "@/lib/inventory-api";
import {
  calculateTotals,
  inventoryReadiness,
  largestItem,
  type InventoryItem,
} from "@/lib/inventory-model";
import type { TablesUpdate } from "@/integrations/supabase/types";

export const inventoryKeys = {
  active: ["inventory", "active"] as const,
  items: (id: string) => ["inventory", id, "items"] as const,
  photos: (id: string) => ["inventory", id, "photos"] as const,
};

/** Reads the active inventory without creating one (dashboard / read-only). */
export function useActiveInventory() {
  return useQuery({ queryKey: inventoryKeys.active, queryFn: getActiveInventory });
}

/** Ensures an inventory exists — use on pages where the renter will add things. */
export function useEnsuredInventory() {
  return useQuery({ queryKey: inventoryKeys.active, queryFn: getOrCreateActiveInventory });
}

export function useInventoryItems(inventoryId: string | undefined) {
  return useQuery({
    queryKey: inventoryKeys.items(inventoryId ?? "none"),
    queryFn: () => listItems(inventoryId as string),
    enabled: Boolean(inventoryId),
  });
}

export function useInventoryPhotos(inventoryId: string | undefined) {
  return useQuery({
    queryKey: inventoryKeys.photos(inventoryId ?? "none"),
    queryFn: () => listPhotos(inventoryId as string),
    enabled: Boolean(inventoryId),
  });
}

/** Derived figures for a set of items — totals, largest item and readiness. */
export function useInventorySummary(items: InventoryItem[] | undefined) {
  return React.useMemo(() => {
    const list = items ?? [];
    return {
      totals: calculateTotals(list),
      largest: largestItem(list),
      readiness: inventoryReadiness(list),
    };
  }, [items]);
}

export function useInventoryMutations(inventoryId: string | undefined) {
  const qc = useQueryClient();
  const itemsKey = inventoryKeys.items(inventoryId ?? "none");

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: itemsKey });
    void qc.invalidateQueries({ queryKey: inventoryKeys.active });
  };

  const add = useMutation({
    mutationFn: (item: NewItem) => addItem(inventoryId as string, item),
    onSuccess: () => invalidate(),
    onError: (error: Error) => toast.error(error.message || "We couldn't add that item."),
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TablesUpdate<"inventory_items"> }) =>
      updateItem(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: itemsKey });
      const previous = qc.getQueryData<InventoryItem[]>(itemsKey);
      if (previous) {
        qc.setQueryData<InventoryItem[]>(
          itemsKey,
          previous.map((item) => (item.id === id ? { ...item, ...patch } as InventoryItem : item)),
        );
      }
      return { previous };
    },
    onError: (error: Error, _vars, context) => {
      if (context?.previous) qc.setQueryData(itemsKey, context.previous);
      toast.error(error.message || "We couldn't save that change.");
    },
    onSettled: () => invalidate(),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteItem(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: itemsKey });
      const previous = qc.getQueryData<InventoryItem[]>(itemsKey);
      if (previous) {
        qc.setQueryData<InventoryItem[]>(itemsKey, previous.filter((item) => item.id !== id));
      }
      return { previous };
    },
    onError: (error: Error, _id, context) => {
      if (context?.previous) qc.setQueryData(itemsKey, context.previous);
      toast.error(error.message || "We couldn't remove that item.");
    },
    onSettled: () => invalidate(),
  });

  const clear = useMutation({
    mutationFn: () => clearInventory(inventoryId as string),
    onSuccess: () => {
      invalidate();
      void qc.invalidateQueries({ queryKey: inventoryKeys.photos(inventoryId ?? "none") });
      toast.success("My Stuff cleared.");
    },
    onError: (error: Error) => toast.error(error.message || "We couldn't clear your inventory."),
  });

  return { add, update, remove, clear };
}
