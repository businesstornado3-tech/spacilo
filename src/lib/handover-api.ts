/**
 * Data access for booking handover evidence.
 *
 * Every call is RLS-scoped: the browser's booking_id and user_id are never
 * trusted on their own — `booking_party_role` and `booking_stage_open` in the
 * database decide whether a read or write is allowed. Files live in the
 * private `booking-evidence` bucket and are only ever displayed through
 * short-lived signed URLs.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  evidencePath,
  type ConditionNote,
  type EvidencePhoto,
  type HandoverIssue,
  type HandoverIssueCategory,
  type HandoverStage,
  type Party,
} from "@/lib/handover";

export const EVIDENCE_BUCKET = "booking-evidence";

const MAX_BYTES = 8 * 1024 * 1024;

function validateImage(file: File): string | null {
  if (!file.type.startsWith("image/")) return "That file isn't an image.";
  if (file.size > MAX_BYTES) return "That photo is larger than 8MB.";
  return null;
}

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error("You need to be signed in.");
  return id;
}

export async function listEvidencePhotos(bookingId: string): Promise<EvidencePhoto[]> {
  const { data, error } = await supabase
    .from("booking_evidence_photos")
    .select("*")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listConditionNotes(bookingId: string): Promise<ConditionNote[]> {
  const { data, error } = await supabase
    .from("booking_condition_notes")
    .select("*")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listHandoverIssues(bookingId: string): Promise<HandoverIssue[]> {
  const { data, error } = await supabase
    .from("booking_handover_issues")
    .select("*")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function uploadEvidencePhoto(input: {
  bookingId: string;
  stage: HandoverStage;
  role: Party;
  file: File;
  caption?: string;
}): Promise<EvidencePhoto> {
  const problem = validateImage(input.file);
  if (problem) throw new Error(problem);

  const uploaderId = await currentUserId();
  const path = evidencePath({
    bookingId: input.bookingId,
    stage: input.stage,
    uploaderId,
    fileName: input.file.name,
  });

  const { error: uploadError } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .upload(path, input.file, { contentType: input.file.type, upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("booking_evidence_photos")
    .insert({
      booking_id: input.bookingId,
      stage: input.stage,
      uploaded_by: uploaderId,
      uploader_role: input.role,
      storage_path: path,
      ...(input.caption?.trim() ? { caption: input.caption.trim() } : {}),
    })
    .select("*")
    .single();
  if (error) {
    // The row is the record; a file with no row would be unreachable.
    await supabase.storage.from(EVIDENCE_BUCKET).remove([path]);
    throw error;
  }
  return data;
}

export async function addConditionNote(input: {
  bookingId: string;
  stage: HandoverStage;
  role: Party;
  body: string;
}): Promise<ConditionNote> {
  const authorId = await currentUserId();
  const { data, error } = await supabase
    .from("booking_condition_notes")
    .insert({
      booking_id: input.bookingId,
      stage: input.stage,
      author_id: authorId,
      author_role: input.role,
      body: input.body.trim(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function reportHandoverIssue(input: {
  bookingId: string;
  stage: HandoverStage;
  role: Party;
  category: HandoverIssueCategory;
  description: string;
}): Promise<HandoverIssue> {
  const reporterId = await currentUserId();
  const { data, error } = await supabase
    .from("booking_handover_issues")
    .insert({
      booking_id: input.bookingId,
      stage: input.stage,
      reported_by: reporterId,
      reporter_role: input.role,
      category: input.category,
      description: input.description.trim(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/** Private bucket: display always uses short-lived signed URLs. */
export async function signedEvidenceUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrls(paths, 60 * 60);
  if (error || !data) return {};
  const map: Record<string, string> = {};
  data.forEach((entry) => {
    if (entry.signedUrl && entry.path) map[entry.path] = entry.signedUrl;
  });
  return map;
}
