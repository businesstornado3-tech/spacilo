/**
 * Data access for SpaceFit Vision detections.
 *
 * Detections are SUGGESTIONS, never inventory. Nothing here writes to
 * `inventory_items` except `confirmDetections`, which runs only when the
 * renter has explicitly accepted the results.
 *
 * All reads go through the browser client, so RLS keeps every renter to their
 * own detections, runs and photos.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";
import { CATALOGUE_BY_KEY } from "@/lib/inventory-catalogue";

export type AnalysisRun = Tables<"inventory_analysis_runs">;
export type Detection = Tables<"inventory_detections">;

export interface DetectionWithPhotos extends Detection {
  photo_ids: string[];
}

/** The most recent analysis for an inventory, whatever its outcome. */
export async function latestRun(inventoryId: string): Promise<AnalysisRun | null> {
  const { data, error } = await supabase
    .from("inventory_analysis_runs")
    .select("*")
    .eq("inventory_id", inventoryId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Detections still awaiting the renter's decision, newest run first. */
export async function listPendingDetections(inventoryId: string): Promise<DetectionWithPhotos[]> {
  const { data, error } = await supabase
    .from("inventory_detections")
    .select("*, inventory_detection_photos(photo_id)")
    .eq("inventory_id", inventoryId)
    .eq("review_status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const { inventory_detection_photos, ...detection } = row as Detection & {
      inventory_detection_photos: { photo_id: string }[] | null;
    };
    return {
      ...detection,
      photo_ids: (inventory_detection_photos ?? []).map((link) => link.photo_id),
    };
  });
}

export async function updateDetection(id: string, patch: TablesUpdate<"inventory_detections">) {
  const { user_id: _ignored, ...safe } = patch;
  const { data, error } = await supabase
    .from("inventory_detections")
    .update({ ...safe, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/** "Not mine" — the suggestion is dismissed and never becomes an item. */
export async function rejectDetection(id: string) {
  return updateDetection(id, { review_status: "rejected", confirmed_quantity: 0 });
}

export async function rejectAllPending(inventoryId: string) {
  const { error } = await supabase
    .from("inventory_detections")
    .update({ review_status: "rejected", confirmed_quantity: 0, updated_at: new Date().toISOString() })
    .eq("inventory_id", inventoryId)
    .eq("review_status", "pending");
  if (error) throw error;
}

export interface ConfirmDecision {
  detection: DetectionWithPhotos;
  /** Final label after any renter edit. */
  itemName: string;
  category: Detection["suggested_category"];
  catalogueKey: string | null;
  quantity: number;
  edited: boolean;
}

/**
 * Turns accepted suggestions into real inventory items.
 *
 * Sizes come from EarnRoom's own catalogue, never from the photograph.
 * When no catalogue entry matches, dimensions stay empty and the item is
 * flagged `unknown` so the renter is asked for them later — an honest gap
 * beats an invented measurement.
 */
export async function confirmDetections(
  inventoryId: string,
  decisions: ConfirmDecision[],
): Promise<number> {
  if (decisions.length === 0) return 0;

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error("You need to be signed in to confirm your inventory.");
  const userId = auth.user.id;

  const rows = decisions.map(({ detection, itemName, category, catalogueKey, quantity }) => {
    const catalogue = catalogueKey ? CATALOGUE_BY_KEY.get(catalogueKey) : undefined;
    return {
      inventory_id: inventoryId,
      user_id: userId,
      item_name: itemName.slice(0, 80),
      category,
      catalogue_key: catalogue?.key ?? null,
      quantity,
      length_cm: catalogue?.lengthCm ?? null,
      width_cm: catalogue?.widthCm ?? null,
      height_cm: catalogue?.heightCm ?? null,
      size_source: catalogue ? ("catalogue_estimate" as const) : ("unknown" as const),
      stackable: catalogue?.stackable ?? detection.stackable_suggestion,
      fragile: catalogue?.fragile ?? detection.fragile_suggestion === "yes",
      orientation_flexible: catalogue?.orientationFlexible ?? detection.orientation_suggestion,
      ai_detected: true,
      ai_confirmed: true,
      created_manually: false,
      confidence_score: detection.confidence_score,
      source_photo_id: detection.photo_ids[0] ?? null,
      notes: detection.notes,
    };
  });

  const { data: inserted, error } = await supabase
    .from("inventory_items")
    .insert(rows)
    .select("id");
  if (error) throw error;

  await Promise.all(
    decisions.map((decision, index) =>
      updateDetection(decision.detection.id, {
        review_status: decision.edited ? "edited" : "confirmed",
        confirmed_quantity: decision.quantity,
        resulting_item_id: inserted?.[index]?.id ?? null,
      }),
    ),
  );

  return inserted?.length ?? 0;
}
