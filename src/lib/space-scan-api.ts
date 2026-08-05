/**
 * SpaceFit AI host space scan — browser-side data access.
 *
 * Scan photos live in a private bucket under the host's own user folder and
 * are NEVER shown to renters or promoted into listing photos: they exist only
 * to produce a measurement proposal.
 *
 * Applying a proposal is an explicit host action. It is the ONLY path that can
 * mark a listing's measurements as verified, which is why it lives here (run
 * with the host's own permissions) rather than in the AI pipeline.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { validateImage } from "@/lib/spaces-api";
import { MAX_SPACE_SCAN_PHOTOS, type ObstacleKind } from "@/lib/spacefit-vision/space-schema";

export const SPACE_SCAN_BUCKET = "space-scans";

export type SpaceScanPhoto = Tables<"space_scan_photos">;
export type SpaceMeasurementProposal = Tables<"space_measurement_proposals">;
export type SpaceScanSession = Tables<"space_scan_sessions">;

/** A capacity reducer the host has confirmed. Stored on `spaces.obstacles`. */
export interface ConfirmedObstacle {
  key: ObstacleKind | string;
  label: string;
  volume_m3: number;
}

export { MAX_SPACE_SCAN_PHOTOS };

/* ------------------------------------------------------------------ photos */

export async function listScanPhotos(spaceId: string): Promise<SpaceScanPhoto[]> {
  const { data, error } = await supabase
    .from("space_scan_photos")
    .select("*")
    .eq("space_id", spaceId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function uploadScanPhoto(spaceId: string, file: File): Promise<SpaceScanPhoto> {
  const problem = validateImage(file);
  if (problem) throw new Error(problem);

  const { data: session } = await supabase.auth.getUser();
  const userId = session.user?.id;
  if (!userId) throw new Error("You need to be signed in.");

  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${userId}/${spaceId}/${crypto.randomUUID()}.${ext || "jpg"}`;

  const { error: uploadError } = await supabase.storage
    .from(SPACE_SCAN_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("space_scan_photos")
    .insert({ space_id: spaceId, host_id: userId, storage_path: path })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteScanPhoto(photo: SpaceScanPhoto): Promise<void> {
  await supabase.storage.from(SPACE_SCAN_BUCKET).remove([photo.storage_path]);
  const { error } = await supabase.from("space_scan_photos").delete().eq("id", photo.id);
  if (error) throw error;
}

export async function signedScanUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage
    .from(SPACE_SCAN_BUCKET)
    .createSignedUrls(paths, 60 * 60);
  if (error || !data) return {};
  const map: Record<string, string> = {};
  data.forEach((entry) => {
    if (entry.signedUrl && entry.path) map[entry.path] = entry.signedUrl;
  });
  return map;
}

/* --------------------------------------------------------------- proposals */

/** The most recent proposal for a space, whatever its state. */
export async function latestProposal(spaceId: string): Promise<SpaceMeasurementProposal | null> {
  const { data, error } = await supabase
    .from("space_measurement_proposals")
    .select("*")
    .eq("space_id", spaceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export interface ApplyProposalInput {
  spaceId: string;
  proposalId: string;
  /** Host-checked values — always what the host confirmed, not what AI said. */
  lengthM: number | null;
  widthM: number | null;
  heightM: number | null;
  obstacles: ConfirmedObstacle[];
}

/**
 * Writes host-CONFIRMED measurements onto the listing and records that the
 * host verified them. The AI's own numbers are never written directly: the UI
 * pre-fills these fields from the proposal, and the host can change any of them
 * before confirming.
 */
export async function applySpaceMeasurementProposal(input: ApplyProposalInput): Promise<void> {
  const obstacles = input.obstacles
    .filter((obstacle) => obstacle.label.trim().length > 0)
    .slice(0, 20)
    .map((obstacle) => ({
      key: String(obstacle.key).slice(0, 40),
      label: obstacle.label.trim().slice(0, 60),
      volume_m3: Math.max(0, Math.round((Number(obstacle.volume_m3) || 0) * 100) / 100),
    }));

  const { error: spaceError } = await supabase
    .from("spaces")
    .update({
      length_m: input.lengthM,
      width_m: input.widthM,
      height_m: input.heightM,
      dimensions_unknown: input.lengthM === null || input.widthM === null || input.heightM === null,
      obstacles,
      measurement_source: "host_verified",
      measurements_verified_at: new Date().toISOString(),
    })
    .eq("id", input.spaceId);
  if (spaceError) throw spaceError;

  const { error: proposalError } = await supabase
    .from("space_measurement_proposals")
    .update({ verification_state: "applied", applied_at: new Date().toISOString() })
    .eq("id", input.proposalId);
  if (proposalError) throw proposalError;
}

export async function dismissProposal(proposalId: string): Promise<void> {
  const { error } = await supabase
    .from("space_measurement_proposals")
    .update({ verification_state: "dismissed" })
    .eq("id", proposalId);
  if (error) throw error;
}

/** Saves host-confirmed obstacles without touching dimensions. */
export async function saveObstacles(spaceId: string, obstacles: ConfirmedObstacle[]): Promise<void> {
  const { error } = await supabase
    .from("spaces")
    .update({
      obstacles: obstacles.slice(0, 20).map((obstacle) => ({
        key: String(obstacle.key).slice(0, 40),
        label: obstacle.label.trim().slice(0, 60),
        volume_m3: Math.max(0, Math.round((Number(obstacle.volume_m3) || 0) * 100) / 100),
      })),
    })
    .eq("id", spaceId);
  if (error) throw error;
}

/* ----------------------------------------------------------------- labels */

export const MEASUREMENT_SOURCE_LABEL: Record<string, string> = {
  ai_estimated: "Estimated by SpaceFit AI — not yet checked",
  host_entered: "Entered by the host",
  host_verified: "Checked and confirmed by the host",
};

export const CONFIDENCE_LABEL: Record<string, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence — please check carefully",
};
