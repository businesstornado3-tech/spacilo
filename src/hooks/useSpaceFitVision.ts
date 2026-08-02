/**
 * React Query wiring for SpaceFit Vision.
 *
 * The analysis itself runs in an authenticated server function — the browser
 * only ever sends photo ids it already owns.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { analyseInventoryPhotos } from "@/lib/spacefit-vision.functions";
import {
  confirmDetections,
  latestRun,
  listPendingDetections,
  rejectAllPending,
  updateDetection,
  type ConfirmDecision,
} from "@/lib/detections-api";
import { inventoryKeys } from "@/hooks/useInventory";
import type { TablesUpdate } from "@/integrations/supabase/types";

export const visionKeys = {
  run: (id: string) => ["vision", id, "run"] as const,
  detections: (id: string) => ["vision", id, "detections"] as const,
};

export function useLatestAnalysisRun(inventoryId: string | undefined) {
  return useQuery({
    queryKey: visionKeys.run(inventoryId ?? "none"),
    queryFn: () => latestRun(inventoryId as string),
    enabled: Boolean(inventoryId),
  });
}

export function usePendingDetections(inventoryId: string | undefined) {
  return useQuery({
    queryKey: visionKeys.detections(inventoryId ?? "none"),
    queryFn: () => listPendingDetections(inventoryId as string),
    enabled: Boolean(inventoryId),
  });
}

export function useAnalysePhotos(inventoryId: string | undefined) {
  const qc = useQueryClient();
  const analyse = useServerFn(analyseInventoryPhotos);

  return useMutation({
    mutationFn: async (photoIds: string[]) =>
      analyse({
        data: {
          inventoryId: inventoryId as string,
          photoIds,
          clientRequestId: crypto.randomUUID(),
        },
      }),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: visionKeys.detections(inventoryId ?? "none") });
      void qc.invalidateQueries({ queryKey: visionKeys.run(inventoryId ?? "none") });
      void qc.invalidateQueries({ queryKey: inventoryKeys.photos(inventoryId ?? "none") });
      if (!result.ok) toast.error(result.message);
    },
    onError: () => toast.error("We couldn't analyse your photos. Please try again."),
  });
}

export function useDetectionMutations(inventoryId: string | undefined) {
  const qc = useQueryClient();

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: visionKeys.detections(inventoryId ?? "none") });
    void qc.invalidateQueries({ queryKey: inventoryKeys.items(inventoryId ?? "none") });
    void qc.invalidateQueries({ queryKey: inventoryKeys.active });
  };

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TablesUpdate<"inventory_detections"> }) =>
      updateDetection(id, patch),
    onSuccess: () => invalidate(),
  });

  const confirm = useMutation({
    mutationFn: (decisions: ConfirmDecision[]) =>
      confirmDetections(inventoryId as string, decisions),
    onSuccess: () => invalidate(),
    onError: (error: Error) =>
      toast.error(error.message || "We couldn't add those items to My Stuff."),
  });

  const discardAll = useMutation({
    mutationFn: () => rejectAllPending(inventoryId as string),
    onSuccess: () => invalidate(),
  });

  return { update, confirm, discardAll };
}
