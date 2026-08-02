/**
 * Data access for the renter inventory ("My Stuff").
 *
 * All calls go through the browser Supabase client, so RLS decides visibility:
 * a renter only ever reads or writes their own inventory, items and photos.
 * user_id is always taken from the authenticated session, never from the UI.
 */
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import type { Inventory, InventoryItem, InventoryPhoto } from "@/lib/inventory-model";

export const INVENTORY_PHOTO_BUCKET = "inventory-photos";
export const MAX_INVENTORY_PHOTO_BYTES = 12 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("You need to be signed in to manage your inventory.");
  return data.user.id;
}

/* ------------------------------------------------------------- inventories */

/**
 * One active inventory per user for MVP. The schema supports many, so this
 * simply picks the most recent non-archived one, creating it on first use.
 */
export async function getOrCreateActiveInventory(): Promise<Inventory> {
  const userId = await currentUserId();

  const { data: existing, error } = await supabase
    .from("renter_inventories")
    .select("*")
    .neq("status", "archived")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing;

  const { data, error: insertError } = await supabase
    .from("renter_inventories")
    .insert({ user_id: userId, name: "My Stuff" })
    .select("*")
    .single();
  if (insertError) throw insertError;
  return data;
}

export async function getActiveInventory(): Promise<Inventory | null> {
  const { data, error } = await supabase
    .from("renter_inventories")
    .select("*")
    .neq("status", "archived")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateInventory(id: string, patch: TablesUpdate<"renter_inventories">) {
  const { data, error } = await supabase
    .from("renter_inventories")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/* -------------------------------------------------------------------- items */

export async function listItems(inventoryId: string): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from("inventory_items")
    .select("*")
    .eq("inventory_id", inventoryId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export type NewItem = Omit<TablesInsert<"inventory_items">, "user_id" | "inventory_id">;

export async function addItem(inventoryId: string, item: NewItem): Promise<InventoryItem> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("inventory_items")
    .insert({ ...item, inventory_id: inventoryId, user_id: userId })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateItem(
  id: string,
  patch: TablesUpdate<"inventory_items">,
): Promise<InventoryItem> {
  const { user_id: _ignored, ...safe } = patch;
  const { data, error } = await supabase
    .from("inventory_items")
    .update({ ...safe, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteItem(id: string): Promise<void> {
  const { error } = await supabase.from("inventory_items").delete().eq("id", id);
  if (error) throw error;
}

/* ------------------------------------------------------------------- photos */

export async function listPhotos(inventoryId: string): Promise<InventoryPhoto[]> {
  const { data, error } = await supabase
    .from("inventory_photos")
    .select("*")
    .eq("inventory_id", inventoryId)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export function validateImage(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return `${file.name} isn't a supported image. Use JPG, PNG, WEBP or HEIC.`;
  }
  if (file.size > MAX_INVENTORY_PHOTO_BYTES) {
    return `${file.name} is too large. Photos must be under 12 MB.`;
  }
  return null;
}

/**
 * Downscale large camera images before upload: smaller uploads on mobile data,
 * while keeping enough resolution (long edge 1600px, quality 0.82) for future
 * computer-vision analysis. HEIC and small files are uploaded untouched.
 */
async function optimiseImage(file: File): Promise<File> {
  if (typeof document === "undefined") return file;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return file;
  if (file.size < 600 * 1024) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const maxEdge = 1600;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    if (scale === 1) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82),
    );
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/**
 * Uploads into a private bucket under `<user-id>/<inventory-id>/…`, which the
 * storage policies use to keep every renter's photos to themselves. The row
 * stores only the path — never a public URL — so a future server-side AI
 * function can mint short-lived access when it needs to analyse a photo.
 */
export async function uploadInventoryPhoto(
  inventoryId: string,
  file: File,
  displayOrder: number,
): Promise<InventoryPhoto> {
  const problem = validateImage(file);
  if (problem) throw new Error(problem);

  const userId = await currentUserId();
  const optimised = await optimiseImage(file);
  const ext = (optimised.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${userId}/${inventoryId}/${crypto.randomUUID()}.${ext || "jpg"}`;

  const { error: uploadError } = await supabase.storage
    .from(INVENTORY_PHOTO_BUCKET)
    .upload(path, optimised, { contentType: optimised.type, upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("inventory_photos")
    .insert({
      inventory_id: inventoryId,
      user_id: userId,
      storage_path: path,
      display_order: displayOrder,
      analysis_status: "uploaded",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteInventoryPhoto(photo: InventoryPhoto): Promise<void> {
  const { error } = await supabase.from("inventory_photos").delete().eq("id", photo.id);
  if (error) throw error;
  await supabase.storage.from(INVENTORY_PHOTO_BUCKET).remove([photo.storage_path]);
}

export async function reorderInventoryPhotos(photos: InventoryPhoto[]): Promise<void> {
  await Promise.all(
    photos.map((photo, index) =>
      supabase.from("inventory_photos").update({ display_order: index }).eq("id", photo.id),
    ),
  );
}

/** Private bucket: display always uses short-lived signed URLs. */
export async function signedInventoryPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage
    .from(INVENTORY_PHOTO_BUCKET)
    .createSignedUrls(paths, 60 * 60);
  if (error || !data) return {};
  const map: Record<string, string> = {};
  data.forEach((entry) => {
    if (entry.signedUrl && entry.path) map[entry.path] = entry.signedUrl;
  });
  return map;
}

/* ----------------------------------------------------------------- clearing */

/** Removes every item and photo (files included) but keeps the inventory row. */
export async function clearInventory(inventoryId: string): Promise<void> {
  const photos = await listPhotos(inventoryId);
  if (photos.length > 0) {
    await supabase.storage
      .from(INVENTORY_PHOTO_BUCKET)
      .remove(photos.map((photo) => photo.storage_path));
    const { error } = await supabase.from("inventory_photos").delete().eq("inventory_id", inventoryId);
    if (error) throw error;
  }
  const { error: itemError } = await supabase
    .from("inventory_items")
    .delete()
    .eq("inventory_id", inventoryId);
  if (itemError) throw itemError;
}
