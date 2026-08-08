/**
 * React Query wiring for the planner workspace.
 *
 * Mutations are thin: all the rules live in `@/lib/spaceplanner/library` and
 * all the persistence lives behind the repository, so these hooks stay the
 * same when the store moves to the database.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { plannerLibrary } from "@/lib/spaceplanner/library-store";
import type { PlanRun, SavedInventory, SavedLine } from "@/lib/spaceplanner/library";

export const plannerKeys = {
  inventories: ["planner", "inventories"] as const,
  runs: ["planner", "runs"] as const,
};

export function usePlannerInventories() {
  return useQuery({
    queryKey: plannerKeys.inventories,
    queryFn: () => plannerLibrary.listInventories(),
  });
}

export function usePlanRuns() {
  return useQuery({ queryKey: plannerKeys.runs, queryFn: () => plannerLibrary.listRuns() });
}

export function usePlannerLibraryMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: plannerKeys.inventories });
    void qc.invalidateQueries({ queryKey: plannerKeys.runs });
  };
  const fail = (error: Error, fallback: string) => toast.error(error.message || fallback);

  const create = useMutation({
    mutationFn: (input: { name: string; description?: string; spaceId: string; lines?: SavedLine[] }) =>
      plannerLibrary.createInventory(input),
    onSuccess: (inventory) => {
      refresh();
      toast.success(`“${inventory.name}” created.`);
    },
    onError: (error: Error) => fail(error, "We couldn't create that inventory."),
  });

  const rename = useMutation({
    mutationFn: ({ id, name, description }: { id: string; name: string; description?: string }) =>
      plannerLibrary.updateInventory(id, {
        name,
        ...(description === undefined ? {} : { description }),
      }),
    onSuccess: () => {
      refresh();
      toast.success("Inventory renamed.");
    },
    onError: (error: Error) => fail(error, "We couldn't rename that inventory."),
  });

  /** Silent save — used by autosave, so it never raises a toast. */
  const save = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<SavedInventory, "name" | "description" | "lines" | "spaceId" | "lastScore">>;
    }) => plannerLibrary.updateInventory(id, patch),
    onSuccess: () => refresh(),
  });

  const duplicate = useMutation({
    mutationFn: (id: string) => plannerLibrary.duplicateInventory(id),
    onSuccess: (inventory) => {
      refresh();
      toast.success(`Duplicated as “${inventory.name}”.`);
    },
    onError: (error: Error) => fail(error, "We couldn't duplicate that inventory."),
  });

  const archive = useMutation({
    mutationFn: (id: string) => plannerLibrary.archiveInventory(id),
    onSuccess: () => {
      refresh();
      toast.success("Moved to archive.");
    },
    onError: (error: Error) => fail(error, "We couldn't archive that inventory."),
  });

  const restore = useMutation({
    mutationFn: (id: string) => plannerLibrary.restoreInventory(id),
    onSuccess: () => {
      refresh();
      toast.success("Restored.");
    },
    onError: (error: Error) => fail(error, "We couldn't restore that inventory."),
  });

  const remove = useMutation({
    mutationFn: (id: string) => plannerLibrary.deleteInventory(id),
    onSuccess: () => {
      refresh();
      toast.success("Inventory deleted.");
    },
    onError: (error: Error) => fail(error, "We couldn't delete that inventory."),
  });

  const open = useMutation({
    mutationFn: (id: string) => plannerLibrary.touchInventory(id),
    onSuccess: () => refresh(),
  });

  const record = useMutation({
    mutationFn: (run: Omit<PlanRun, "id" | "ranAt">) => plannerLibrary.recordRun(run),
    onSuccess: () => refresh(),
  });

  return { create, rename, save, duplicate, archive, restore, remove, open, record };
}
