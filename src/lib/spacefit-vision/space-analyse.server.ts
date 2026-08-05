/**
 * SpaceFit AI — host space scan orchestration.
 *
 * Runs entirely on the server. The browser never sees provider credentials and
 * never supplies image URLs: every read goes through the caller's own
 * RLS-scoped Supabase client, so a host can only scan their own space.
 *
 * CRITICAL RULE: this module NEVER writes measurements onto `spaces`. It only
 * records a proposal in `space_measurement_proposals`. Applying a proposal is a
 * separate, explicit host action (`applySpaceMeasurementProposal`).
 */
import {
  getVisionProvider,
  VisionProviderError,
  type VisionImage,
} from "@/lib/spacefit-vision/provider.server";
import type { VisionErrorCategory } from "@/lib/spacefit-vision/schema";
import {
  deriveSpaceFigures,
  MAX_SPACE_SCAN_PHOTOS,
  type SpaceScanResult,
} from "@/lib/spacefit-vision/space-schema";

const SPACE_SCAN_BUCKET = "space-scans";

/** Cheap authenticated rate limiting, mirroring the renter pipeline. */
const RATE_LIMIT_WINDOW_MINUTES = 10;
const RATE_LIMIT_RUNS = 6;
const IN_FLIGHT_MINUTES = 3;

export class SpaceScanError extends Error {
  constructor(
    readonly category: VisionErrorCategory | "forbidden" | "invalid_request",
    message: string,
  ) {
    super(message);
    this.name = "SpaceScanError";
  }
}

export interface SpaceScanArgs {
  supabase: any;
  userId: string;
  spaceId: string;
  photoIds: string[];
  clientRequestId?: string | null;
}

export interface SpaceScanSummary {
  sessionId: string;
  proposalId: string | null;
  status: "completed" | "failed";
  analysedPhotoCount: number;
  failedPhotoCount: number;
  reused: boolean;
}

export async function runSpaceScan(args: SpaceScanArgs): Promise<SpaceScanSummary> {
  const { supabase, userId, spaceId, clientRequestId } = args;
  const startedAt = Date.now();

  /* 1 — the space must belong to the caller (RLS also enforces this). */
  const { data: space, error: spaceError } = await supabase
    .from("spaces")
    .select("id, host_id, space_type")
    .eq("id", spaceId)
    .maybeSingle();
  if (spaceError) throw new SpaceScanError("unknown", "Space lookup failed.");
  if (!space || space.host_id !== userId) {
    throw new SpaceScanError("forbidden", "That space isn't available.");
  }

  /* 2 — idempotency: the same request id never starts a second scan. */
  if (clientRequestId) {
    const { data: existing } = await supabase
      .from("space_scan_sessions")
      .select("id, status, photo_count")
      .eq("host_id", userId)
      .eq("client_request_id", clientRequestId)
      .maybeSingle();
    if (existing) {
      const { data: proposal } = await supabase
        .from("space_measurement_proposals")
        .select("id")
        .eq("session_id", existing.id)
        .maybeSingle();
      return {
        sessionId: existing.id,
        proposalId: proposal?.id ?? null,
        status: existing.status === "completed" ? "completed" : "failed",
        analysedPhotoCount: existing.photo_count ?? 0,
        failedPhotoCount: 0,
        reused: true,
      };
    }
  }

  /* 3 — rate limiting. */
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString();
  const { count: recentRuns } = await supabase
    .from("space_scan_sessions")
    .select("id", { count: "exact", head: true })
    .eq("host_id", userId)
    .gte("created_at", windowStart);
  if ((recentRuns ?? 0) >= RATE_LIMIT_RUNS) {
    throw new SpaceScanError("rate_limited", "Too many scans in a short time.");
  }

  const inFlightSince = new Date(Date.now() - IN_FLIGHT_MINUTES * 60_000).toISOString();
  const { data: inFlight } = await supabase
    .from("space_scan_sessions")
    .select("id")
    .eq("space_id", spaceId)
    .eq("status", "running")
    .gte("created_at", inFlightSince)
    .limit(1)
    .maybeSingle();
  if (inFlight) throw new SpaceScanError("rate_limited", "A scan is already running for this space.");

  /* 4 — only the caller's own photos, capped. */
  const requestedIds = Array.from(new Set(args.photoIds)).slice(0, MAX_SPACE_SCAN_PHOTOS);
  if (requestedIds.length === 0) throw new SpaceScanError("invalid_request", "No photos selected.");

  const { data: photos, error: photoError } = await supabase
    .from("space_scan_photos")
    .select("id, storage_path, host_id")
    .eq("space_id", spaceId)
    .in("id", requestedIds)
    .order("created_at", { ascending: true });
  if (photoError) throw new SpaceScanError("unknown", "Photo lookup failed.");
  const owned = (photos ?? []).filter((photo: any) => photo.host_id === userId);
  if (owned.length === 0) throw new SpaceScanError("invalid_request", "No usable photos selected.");

  const provider = await getVisionProvider();

  /* 5 — record the session before doing any work. */
  const { data: session, error: sessionError } = await supabase
    .from("space_scan_sessions")
    .insert({
      space_id: spaceId,
      host_id: userId,
      client_request_id: clientRequestId ?? null,
      provider: provider.id,
      model: provider.model,
      status: "running",
      photo_count: owned.length,
    })
    .select("id")
    .single();
  if (sessionError || !session) throw new SpaceScanError("unknown", "Couldn't start the scan.");

  await supabase
    .from("space_scan_photos")
    .update({ session_id: session.id, analysis_status: "analysing" })
    .in("id", owned.map((photo: any) => photo.id));

  /* 6 — fetch private image bytes server-side. Never a public URL. */
  const images: VisionImage[] = [];
  const failedPhotoIds: string[] = [];
  for (const photo of owned) {
    try {
      const { data: blob, error } = await supabase.storage
        .from(SPACE_SCAN_BUCKET)
        .download(photo.storage_path);
      if (error || !blob) throw new Error("download failed");
      const buffer = Buffer.from(await blob.arrayBuffer());
      if (buffer.byteLength === 0) throw new Error("empty file");
      images.push({
        id: photo.id,
        mimeType: (blob as Blob).type || "image/jpeg",
        base64: buffer.toString("base64"),
      });
    } catch {
      failedPhotoIds.push(photo.id);
    }
  }

  if (images.length === 0) {
    await finishSession(supabase, session.id, "failed", "photo_unavailable", Date.now() - startedAt);
    await markPhotos(supabase, failedPhotoIds, "failed");
    throw new SpaceScanError("photo_unavailable", "We couldn't open your photos.");
  }

  /* 7 — provider call. */
  let result: SpaceScanResult;
  let promptVersion = "";
  let schemaVersion = "";
  try {
    const response = await provider.analyseSpacePhotos({
      images,
      spaceType: space.space_type ?? null,
    });
    result = response.result;
    promptVersion = response.promptVersion;
    schemaVersion = response.schemaVersion;
  } catch (error) {
    const category: VisionErrorCategory =
      error instanceof VisionProviderError ? error.category : "unknown";
    console.error("[spacefit-space] scan failed", { sessionId: session.id, category });
    await finishSession(supabase, session.id, "failed", category, Date.now() - startedAt);
    await markPhotos(supabase, owned.map((photo: any) => photo.id), "failed");
    throw new SpaceScanError(category, "Scan failed.");
  }

  /* 8 — persist the PROPOSAL. The listing itself is untouched. */
  const figures = deriveSpaceFigures(result);
  const { data: proposal, error: proposalError } = await supabase
    .from("space_measurement_proposals")
    .insert({
      session_id: session.id,
      space_id: spaceId,
      host_id: userId,
      width_m: result.estimated_width_m,
      depth_m: result.estimated_depth_m,
      usable_height_m: result.estimated_usable_height_m,
      floor_area_m2: figures.floorAreaM2,
      gross_volume_m3: figures.grossVolumeM3,
      usable_volume_m3: figures.usableVolumeM3,
      confidence: result.measurement_confidence,
      proposed_obstacles: result.obstacles,
      limitations: result.limitations,
      notes: [result.reference_used ? `Scale reference: ${result.reference_used}.` : null, result.notes]
        .filter(Boolean)
        .join(" ")
        .slice(0, 600) || null,
      verification_state: "proposed",
    })
    .select("id")
    .single();
  if (proposalError) throw new SpaceScanError("unknown", "Couldn't save the scan results.");

  await supabase
    .from("space_scan_sessions")
    .update({ prompt_version: promptVersion, schema_version: schemaVersion })
    .eq("id", session.id);

  await markPhotos(supabase, images.map((image) => image.id), "analysed");
  if (failedPhotoIds.length > 0) await markPhotos(supabase, failedPhotoIds, "failed");

  await finishSession(supabase, session.id, "completed", null, Date.now() - startedAt);

  console.info("[spacefit-space] scan completed", {
    sessionId: session.id,
    provider: provider.id,
    photos: images.length,
    confidence: result.measurement_confidence,
    durationMs: Date.now() - startedAt,
  });

  return {
    sessionId: session.id,
    proposalId: proposal?.id ?? null,
    status: "completed",
    analysedPhotoCount: images.length,
    failedPhotoCount: failedPhotoIds.length,
    reused: false,
  };
}

async function finishSession(
  supabase: any,
  sessionId: string,
  status: string,
  errorCategory: string | null,
  durationMs: number,
) {
  await supabase
    .from("space_scan_sessions")
    .update({
      status,
      error_category: errorCategory,
      duration_ms: durationMs,
      completed_at: new Date().toISOString(),
    })
    .eq("id", sessionId);
}

async function markPhotos(supabase: any, photoIds: string[], status: string) {
  if (photoIds.length === 0) return;
  await supabase.from("space_scan_photos").update({ analysis_status: status }).in("id", photoIds);
}
