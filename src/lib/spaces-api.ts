/**
 * Data access for host spaces and their photos.
 * All calls run through the browser Supabase client, so RLS is enforced:
 * a host only ever sees or edits their own rows.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";

export type Space = Tables<"spaces">;
export type SpacePhoto = Tables<"space_photos">;
export type SpacePatch = TablesUpdate<"spaces">;

export const PHOTO_BUCKET = "space-photos";
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

/* ------------------------------------------------------------------ Spaces */

export async function createDraftSpace(hostId: string): Promise<Space> {
  const { data, error } = await supabase
    .from("spaces")
    .insert({ host_id: hostId })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function listMySpaces(): Promise<Space[]> {
  const { data, error } = await supabase
    .from("spaces")
    .select("*")
    .neq("listing_status", "archived")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getMySpace(id: string): Promise<Space | null> {
  const { data, error } = await supabase.from("spaces").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

/** Most recent unfinished draft, used for "Continue your listing". */
export async function getLatestDraft(): Promise<Space | null> {
  const { data, error } = await supabase
    .from("spaces")
    .select("*")
    .eq("listing_status", "draft")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateSpace(id: string, patch: SpacePatch): Promise<Space> {
  const { data, error } = await supabase
    .from("spaces")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export const publishSpace = (id: string) => updateSpace(id, { listing_status: "published" });
export const pauseSpace = (id: string) => updateSpace(id, { listing_status: "paused" });
export const archiveSpace = (id: string) => updateSpace(id, { listing_status: "archived" });

/* ------------------------------------------------------------------ Photos */

export async function listSpacePhotos(spaceId: string): Promise<SpacePhoto[]> {
  const { data, error } = await supabase
    .from("space_photos")
    .select("*")
    .eq("space_id", spaceId)
    .order("is_cover", { ascending: false })
    .order("display_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export function validateImage(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return `${file.name} isn't a supported image. Use JPG, PNG, WEBP or HEIC.`;
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return `${file.name} is too large. Photos must be under 8 MB.`;
  }
  return null;
}

export async function uploadSpacePhoto(
  spaceId: string,
  file: File,
  displayOrder: number,
  isCover: boolean,
): Promise<SpacePhoto> {
  const problem = validateImage(file);
  if (problem) throw new Error(problem);

  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${spaceId}/${crypto.randomUUID()}.${ext || "jpg"}`;

  const { error: uploadError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("space_photos")
    .insert({
      space_id: spaceId,
      storage_path: path,
      display_order: displayOrder,
      is_cover: isCover,
      alt: "Photo of the storage space",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSpacePhoto(photo: SpacePhoto): Promise<void> {
  const { error } = await supabase.from("space_photos").delete().eq("id", photo.id);
  if (error) throw error;
  await supabase.storage.from(PHOTO_BUCKET).remove([photo.storage_path]);
}

export async function setCoverPhoto(spaceId: string, photoId: string): Promise<void> {
  const { error: clearError } = await supabase
    .from("space_photos")
    .update({ is_cover: false })
    .eq("space_id", spaceId);
  if (clearError) throw clearError;
  const { error } = await supabase.from("space_photos").update({ is_cover: true }).eq("id", photoId);
  if (error) throw error;
}

export async function reorderPhotos(photos: SpacePhoto[]): Promise<void> {
  await Promise.all(
    photos.map((photo, index) =>
      supabase.from("space_photos").update({ display_order: index }).eq("id", photo.id),
    ),
  );
}

/** Photos live in a private bucket; display uses short-lived signed URLs. */
export async function signedPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(paths, 60 * 60);
  if (error || !data) return {};
  const map: Record<string, string> = {};
  data.forEach((entry) => {
    if (entry.signedUrl && entry.path) map[entry.path] = entry.signedUrl;
  });
  return map;
}

/* ------------------------------------------------------- Public read surface */

export type PublicSpaceSummary = Awaited<ReturnType<typeof listPublishedSpaces>>[number];

export async function listPublishedSpaces(limit = 60) {
  const { data, error } = await supabase.rpc("get_published_spaces", { limit_count: limit });
  if (error) throw error;
  return data ?? [];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getPublishedSpace(spaceId: string) {
  if (!UUID_RE.test(spaceId)) return null;
  const { data, error } = await supabase.rpc("get_published_space", { space_id: spaceId });
  if (error) throw error;
  return data?.[0] ?? null;
}
