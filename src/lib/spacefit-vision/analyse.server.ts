/**
 * SpaceFit Vision — server-side analysis orchestration.
 *
 * Runs entirely on the server. The browser never sees provider credentials,
 * never supplies image URLs, and can only ask for photos it already owns:
 * every read here goes through the caller's own (RLS-scoped) Supabase client.
 */
import { CATALOGUE } from "@/lib/inventory-catalogue";
import { reconcileDetections } from "@/lib/spacefit-vision/normalise";
import {
  ITEM_CATEGORIES,
  MAX_PHOTOS_PER_ANALYSIS,
  type VisionErrorCategory,
} from "@/lib/spacefit-vision/schema";
import {
  getVisionProvider,
  VisionProviderError,
  type VisionImage,
} from "@/lib/spacefit-vision/provider.server";

/** Private bucket holding renter inventory photos. */
const INVENTORY_PHOTO_BUCKET = "inventory-photos";

/** Max analyses a single renter may start in a rolling window. */
const RATE_LIMIT_WINDOW_MINUTES = 10;
const RATE_LIMIT_RUNS = 8;
/** A run still "running" within this window is treated as in flight. */
const IN_FLIGHT_MINUTES = 3;

export interface AnalyseArgs {
  supabase: any;
  userId: string;
  inventoryId: string;
  photoIds: string[];
  clientRequestId?: string | null;
}

export interface AnalyseSummary {
  runId: string;
  status: "completed" | "partial" | "failed";
  detectionCount: number;
  analysedPhotoCount: number;
  failedPhotoCount: number;
  errorCategory: VisionErrorCategory | null;
  reused: boolean;
}

export class AnalysisError extends Error {
  constructor(
    readonly category: VisionErrorCategory | "forbidden" | "invalid_request",
    message: string,
  ) {
    super(message);
    this.name = "AnalysisError";
  }
}

export async function runInventoryAnalysis(args: AnalyseArgs): Promise<AnalyseSummary> {
  const { supabase, userId, inventoryId, clientRequestId } = args;
  const startedAt = Date.now();

  /* 1 — the inventory must belong to the caller (RLS also enforces this). */
  const { data: inventory, error: inventoryError } = await supabase
    .from("renter_inventories")
    .select("id, user_id")
    .eq("id", inventoryId)
    .maybeSingle();
  if (inventoryError) throw new AnalysisError("unknown", "Inventory lookup failed.");
  if (!inventory || inventory.user_id !== userId) {
    throw new AnalysisError("forbidden", "That inventory isn't available.");
  }

  /* 2 — idempotency: the same request id never starts a second analysis. */
  if (clientRequestId) {
    const { data: existing } = await supabase
      .from("inventory_analysis_runs")
      .select("id, status, detection_count, analysed_photo_count, failed_photo_count, error_category")
      .eq("inventory_id", inventoryId)
      .eq("client_request_id", clientRequestId)
      .maybeSingle();
    if (existing) {
      return {
        runId: existing.id,
        status: existing.status === "failed" ? "failed" : existing.status === "partial" ? "partial" : "completed",
        detectionCount: existing.detection_count,
        analysedPhotoCount: existing.analysed_photo_count,
        failedPhotoCount: existing.failed_photo_count,
        errorCategory: (existing.error_category as VisionErrorCategory | null) ?? null,
        reused: true,
      };
    }
  }

  /* 3 — cheap authenticated rate limiting. */
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString();
  const { count: recentRuns } = await supabase
    .from("inventory_analysis_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", windowStart);
  if ((recentRuns ?? 0) >= RATE_LIMIT_RUNS) {
    throw new AnalysisError("rate_limited", "Too many scans in a short time.");
  }

  const inFlightSince = new Date(Date.now() - IN_FLIGHT_MINUTES * 60_000).toISOString();
  const { data: inFlight } = await supabase
    .from("inventory_analysis_runs")
    .select("id")
    .eq("inventory_id", inventoryId)
    .eq("status", "running")
    .gte("started_at", inFlightSince)
    .limit(1)
    .maybeSingle();
  if (inFlight) {
    throw new AnalysisError("rate_limited", "An analysis is already running for this inventory.");
  }

  /* 4 — only the caller's own photos, capped. */
  const requestedIds = Array.from(new Set(args.photoIds)).slice(0, MAX_PHOTOS_PER_ANALYSIS);
  if (requestedIds.length === 0) throw new AnalysisError("invalid_request", "No photos selected.");

  const { data: photos, error: photoError } = await supabase
    .from("inventory_photos")
    .select("id, storage_path, inventory_id, user_id")
    .eq("inventory_id", inventoryId)
    .in("id", requestedIds)
    .order("display_order", { ascending: true });
  if (photoError) throw new AnalysisError("unknown", "Photo lookup failed.");
  const owned = (photos ?? []).filter((p: any) => p.user_id === userId);
  if (owned.length === 0) throw new AnalysisError("invalid_request", "No usable photos selected.");

  const provider = await getVisionProvider();

  /* 5 — record the run before doing any work. */
  const { data: run, error: runError } = await supabase
    .from("inventory_analysis_runs")
    .insert({
      inventory_id: inventoryId,
      user_id: userId,
      client_request_id: clientRequestId ?? null,
      provider: provider.id,
      model: provider.model,
      status: "running",
      photo_count: owned.length,
    })
    .select("id")
    .single();
  if (runError || !run) throw new AnalysisError("unknown", "Couldn't start the analysis.");

  await supabase
    .from("inventory_photos")
    .update({ analysis_status: "analysing", last_run_id: run.id, last_error_category: null })
    .in("id", owned.map((p: any) => p.id));

  console.info("[spacefit-vision] analysis started", {
    runId: run.id,
    provider: provider.id,
    model: provider.model,
    photoCount: owned.length,
  });

  /* 6 — fetch private image bytes server-side. Never a public URL. */
  const images: VisionImage[] = [];
  const failedPhotoIds: string[] = [];
  for (const photo of owned) {
    try {
      const { data: blob, error } = await supabase.storage
        .from(INVENTORY_PHOTO_BUCKET)
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
    await finishRun(supabase, run.id, {
      status: "failed",
      errorCategory: "photo_unavailable",
      analysed: 0,
      failed: failedPhotoIds.length,
      detections: 0,
      durationMs: Date.now() - startedAt,
    });
    await markPhotos(supabase, failedPhotoIds, "failed", "photo_unavailable");
    throw new AnalysisError("photo_unavailable", "We couldn't open your photos.");
  }

  /* 7 — provider call + validation. */
  let detections;
  try {
    const response = await provider.analyseInventoryPhotos({
      images,
      catalogueKeys: CATALOGUE.map((item) => item.key),
      categories: ITEM_CATEGORIES,
    });
    detections = reconcileDetections(response.result.detections);
  } catch (error) {
    const category: VisionErrorCategory =
      error instanceof VisionProviderError ? error.category : "unknown";
    console.error("[spacefit-vision] analysis failed", { runId: run.id, category });
    await finishRun(supabase, run.id, {
      status: "failed",
      errorCategory: category,
      analysed: 0,
      failed: owned.length,
      detections: 0,
      durationMs: Date.now() - startedAt,
    });
    await markPhotos(supabase, owned.map((p: any) => p.id), "failed", category);
    throw new AnalysisError(category, "Analysis failed.");
  }

  /* 8 — persist suggestions (never inventory items). */
  let detectionCount = 0;
  if (detections.length > 0) {
    const rows = detections.map((detection) => ({
      run_id: run.id,
      inventory_id: inventoryId,
      user_id: userId,
      provider: provider.id,
      model: provider.model,
      detected_label: detection.label.slice(0, 80),
      suggested_category: detection.category,
      suggested_catalogue_key: detection.catalogue_key,
      suggested_quantity: clampInt(detection.quantity, 1, 999),
      confidence_score: detection.confidence === null ? null : clampNumber(detection.confidence, 0, 1),
      stackable_suggestion: detection.stackable_suggestion,
      fragile_suggestion: detection.fragile_suggestion,
      orientation_suggestion: detection.orientation_flexible_suggestion,
      possible_duplicate_group: detection.possible_duplicate_group?.slice(0, 60) ?? null,
      duplicate_certainty: detection.duplicate_certainty,
      possible_restricted_item: detection.possible_restricted_item,
      restricted_reason: detection.restricted_reason,
      notes: detection.notes?.slice(0, 240) ?? null,
      review_status: "pending",
    }));

    const { data: inserted, error: insertError } = await supabase
      .from("inventory_detections")
      .insert(rows)
      .select("id");
    if (insertError) throw new AnalysisError("unknown", "Couldn't save the results.");
    detectionCount = inserted?.length ?? 0;

    const links = (inserted ?? []).flatMap((row: any, index: number) => {
      const indexes = detections[index]?.source_photo_indexes ?? [];
      const photoIds = indexes
        .map((photoIndex) => images[photoIndex]?.id)
        .filter((value): value is string => Boolean(value));
      const unique = Array.from(new Set(photoIds.length > 0 ? photoIds : images.map((i) => i.id)));
      return unique.map((photoId) => ({ detection_id: row.id, photo_id: photoId, user_id: userId }));
    });
    if (links.length > 0) await supabase.from("inventory_detection_photos").insert(links);
  }

  /* 9 — statuses reflect real backend state. */
  const analysedIds = images.map((image) => image.id);
  await markPhotos(supabase, analysedIds, "analysed", null);
  if (failedPhotoIds.length > 0) await markPhotos(supabase, failedPhotoIds, "failed", "photo_unavailable");

  const status = failedPhotoIds.length > 0 ? "partial" : "completed";
  await finishRun(supabase, run.id, {
    status,
    errorCategory: failedPhotoIds.length > 0 ? "photo_unavailable" : null,
    analysed: analysedIds.length,
    failed: failedPhotoIds.length,
    detections: detectionCount,
    durationMs: Date.now() - startedAt,
  });

  console.info("[spacefit-vision] analysis completed", {
    runId: run.id,
    provider: provider.id,
    model: provider.model,
    photos: owned.length,
    analysed: analysedIds.length,
    failed: failedPhotoIds.length,
    detections: detectionCount,
    durationMs: Date.now() - startedAt,
  });

  return {
    runId: run.id,
    status,
    detectionCount,
    analysedPhotoCount: analysedIds.length,
    failedPhotoCount: failedPhotoIds.length,
    errorCategory: failedPhotoIds.length > 0 ? "photo_unavailable" : null,
    reused: false,
  };
}

async function finishRun(
  supabase: any,
  runId: string,
  data: {
    status: string;
    errorCategory: string | null;
    analysed: number;
    failed: number;
    detections: number;
    durationMs: number;
  },
) {
  await supabase
    .from("inventory_analysis_runs")
    .update({
      status: data.status,
      error_category: data.errorCategory,
      analysed_photo_count: data.analysed,
      failed_photo_count: data.failed,
      detection_count: data.detections,
      duration_ms: data.durationMs,
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId);
}

async function markPhotos(
  supabase: any,
  photoIds: string[],
  status: string,
  errorCategory: string | null,
) {
  if (photoIds.length === 0) return;
  await supabase
    .from("inventory_photos")
    .update({
      analysis_status: status,
      last_error_category: errorCategory,
      analysed_at: status === "analysed" ? new Date().toISOString() : null,
    })
    .in("id", photoIds);
}

function clampInt(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
