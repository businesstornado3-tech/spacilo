/**
 * Guest SpaceFit — server-side boundary.
 *
 * This is the ONLY place anonymous input reaches the vision provider, and it
 * runs entirely on the server:
 *
 *  - the browser never sees provider or service-role credentials;
 *  - guest images go into an isolated PRIVATE bucket with server-generated
 *    names and are deleted the moment analysis finishes;
 *  - guest rows live in their own tables with no anon grants at all, so a
 *    guest can never read another guest's scan;
 *  - every provider response is schema-validated before it is stored;
 *  - nothing here writes to a canonical marketplace table. Ever.
 *
 * Claiming converts a SERVER-STORED result (never client-supplied JSON) into
 * pending, reviewable data owned by the authenticated claimant.
 */
import { CATALOGUE } from "@/lib/inventory-catalogue";
import { reconcileDetections } from "@/lib/spacefit-vision/normalise";
import { ITEM_CATEGORIES, BAND_SCORE, type VisionErrorCategory } from "@/lib/spacefit-vision/schema";
import {
  getVisionProvider,
  VisionProviderError,
  type VisionImage,
} from "@/lib/spacefit-vision/provider.server";
import {
  guestItemsFromDetections,
  guestProposalFromScan,
  type GuestItem,
  type GuestSpaceProposal,
} from "@/lib/spacefit-guest/preview";
import {
  base64ByteLength,
  decideGuestClaim,
  GUEST_CLAIM_MESSAGES,
  GUEST_IN_FLIGHT_SECONDS,
  GUEST_IP_WINDOW_MINUTES,
  guestSessionExpiresAt,
  isGuestSessionExpired,
  MAX_GUEST_PHOTOS,
  MAX_GUEST_RUNS_PER_IP,
  MAX_GUEST_SESSIONS_PER_IP,
  MAX_RUNS_PER_GUEST_SESSION,
  validateGuestUpload,
  type GuestKind,
} from "@/lib/spacefit-guest/config";
import {
  createGuestToken,
  guestObjectPath,
  hashClientIp,
  hashGuestToken,
  isPlausibleGuestToken,
} from "@/lib/spacefit-guest/token.server";

const GUEST_BUCKET = "guest-scans";

export type GuestErrorCategory =
  | VisionErrorCategory
  | "invalid_request"
  | "session_invalid"
  | "session_expired"
  | "rate_limited"
  | "already_claimed";

export class GuestSpaceFitError extends Error {
  constructor(
    readonly category: GuestErrorCategory,
    message: string,
  ) {
    super(message);
    this.name = "GuestSpaceFitError";
  }
}

interface AdminClient {
  from: (table: string) => any;
  storage: { from: (bucket: string) => any };
  rpc: (fn: string, args?: Record<string, unknown>) => any;
}

async function admin(): Promise<AdminClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AdminClient;
}

function ipSalt(): string {
  return process.env["SUPABASE_SERVICE_ROLE_KEY"]?.slice(-16) ?? "guest-spacefit";
}

/* ------------------------------------------------------------- sessions */

export interface GuestSessionHandle {
  token: string;
  sessionId: string;
  kind: GuestKind;
  expiresAt: string;
}

export async function createGuestSession(
  kind: GuestKind,
  clientIp: string | null,
): Promise<GuestSessionHandle> {
  const db = await admin();
  const ipHash = hashClientIp(clientIp, ipSalt());

  if (ipHash) {
    const windowStart = new Date(Date.now() - GUEST_IP_WINDOW_MINUTES * 60_000).toISOString();
    const { count } = await db
      .from("guest_spacefit_sessions")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", windowStart);
    if ((count ?? 0) >= MAX_GUEST_SESSIONS_PER_IP) {
      throw new GuestSpaceFitError("rate_limited", "Too many previews from this connection. Please try later.");
    }
  }

  const token = createGuestToken();
  const expiresAt = guestSessionExpiresAt().toISOString();

  const { data, error } = await db
    .from("guest_spacefit_sessions")
    .insert({ kind, token_hash: hashGuestToken(token), ip_hash: ipHash, expires_at: expiresAt })
    .select("id")
    .single();
  if (error || !data) throw new GuestSpaceFitError("unknown", "Couldn't start a preview.");

  // Bounded, best-effort housekeeping. Never blocks the visitor.
  void db.rpc("cleanup_guest_spacefit", { _limit: 200 });

  return { token, sessionId: data.id, kind, expiresAt };
}

async function loadSession(db: AdminClient, token: unknown) {
  if (!isPlausibleGuestToken(token)) {
    throw new GuestSpaceFitError("session_invalid", "That preview link isn't valid. Please scan again.");
  }
  const { data } = await db
    .from("guest_spacefit_sessions")
    .select("id, kind, status, run_count, photo_count, result, claimed_by, expires_at, ip_hash")
    .eq("token_hash", hashGuestToken(token))
    .maybeSingle();
  if (!data) {
    throw new GuestSpaceFitError("session_invalid", "That preview link isn't valid. Please scan again.");
  }
  if (isGuestSessionExpired(data)) {
    throw new GuestSpaceFitError("session_expired", "That preview has expired. Please scan again.");
  }
  if (data.claimed_by) {
    throw new GuestSpaceFitError("already_claimed", "That preview has already been saved to an account.");
  }
  return data;
}

/* -------------------------------------------------------------- analysis */

export interface GuestImageInput {
  mimeType: string;
  base64: string;
}

export interface GuestAnalyseArgs {
  token: string;
  kind: GuestKind;
  images: GuestImageInput[];
  spaceType?: string | null;
  clientRequestId?: string | null;
  clientIp?: string | null;
}

export interface GuestRenterAnalysis {
  kind: "renter";
  items: GuestItem[];
  analysedPhotoCount: number;
  reused: boolean;
}

export interface GuestHostAnalysis {
  kind: "host";
  proposal: GuestSpaceProposal;
  analysedPhotoCount: number;
  reused: boolean;
}

export type GuestAnalysis = GuestRenterAnalysis | GuestHostAnalysis;

export async function runGuestAnalysis(args: GuestAnalyseArgs): Promise<GuestAnalysis> {
  const db = await admin();
  const session = await loadSession(db, args.token);
  const startedAt = Date.now();

  if (session.kind !== args.kind) {
    throw new GuestSpaceFitError("invalid_request", "That preview is for a different kind of scan.");
  }

  /* 1 — idempotency: a repeated tap returns the first answer. A run that
     already FAILED must not lock the visitor out — it is released so the same
     attempt id can be retried once. */
  if (args.clientRequestId) {
    const { data: existing } = await db
      .from("guest_spacefit_runs")
      .select("id, status, result, photo_count")
      .eq("session_id", session.id)
      .eq("client_request_id", args.clientRequestId)
      .maybeSingle();
    if (existing?.status === "completed" && existing.result) {
      return hydrate(args.kind, existing.result, existing.photo_count ?? 0, true, args.spaceType ?? null);
    }
    if (existing?.status === "failed") {
      await db
        .from("guest_spacefit_runs")
        .update({ client_request_id: null })
        .eq("id", existing.id);
    } else if (existing) {
      throw new GuestSpaceFitError("rate_limited", "That scan is already running.");
    }
  }


  /* 2 — per-session, per-IP and concurrency limits. */
  if ((session.run_count ?? 0) >= MAX_RUNS_PER_GUEST_SESSION) {
    throw new GuestSpaceFitError(
      "rate_limited",
      "You've used all the free preview scans. Create an account to keep going.",
    );
  }

  const inFlightSince = new Date(Date.now() - GUEST_IN_FLIGHT_SECONDS * 1000).toISOString();
  const { data: inFlight } = await db
    .from("guest_spacefit_runs")
    .select("id")
    .eq("session_id", session.id)
    .eq("status", "running")
    .gte("created_at", inFlightSince)
    .limit(1)
    .maybeSingle();
  if (inFlight) throw new GuestSpaceFitError("rate_limited", "A scan is already running.");

  const ipHash = session.ip_hash ?? hashClientIp(args.clientIp ?? null, ipSalt());
  if (ipHash) {
    const windowStart = new Date(Date.now() - GUEST_IP_WINDOW_MINUTES * 60_000).toISOString();
    const { data: siblings } = await db
      .from("guest_spacefit_sessions")
      .select("run_count")
      .eq("ip_hash", ipHash)
      .gte("created_at", windowStart);
    const runs = (siblings ?? []).reduce(
      (total: number, row: any) => total + (row.run_count ?? 0),
      0,
    );
    if (runs >= MAX_GUEST_RUNS_PER_IP) {
      throw new GuestSpaceFitError("rate_limited", "Too many previews from this connection. Please try later.");
    }
  }

  /* 3 — authoritative upload validation. */
  const images = args.images.slice(0, MAX_GUEST_PHOTOS);
  const validation = validateGuestUpload(
    images.map((image) => ({ mimeType: image.mimeType, byteLength: base64ByteLength(image.base64) })),
  );
  if (!validation.ok) {
    throw new GuestSpaceFitError("invalid_request", validation.message ?? "Those photos can't be scanned.");
  }

  const { data: run, error: runError } = await db
    .from("guest_spacefit_runs")
    .insert({
      session_id: session.id,
      client_request_id: args.clientRequestId ?? null,
      status: "running",
      photo_count: images.length,
    })
    .select("id")
    .single();
  if (runError || !run) {
    // A unique-index collision means a concurrent identical request won.
    throw new GuestSpaceFitError("rate_limited", "That scan is already running.");
  }

  await db
    .from("guest_spacefit_sessions")
    .update({ run_count: (session.run_count ?? 0) + 1, photo_count: images.length })
    .eq("id", session.id);

  /* 4 — isolated private storage with server-generated filenames. Client
     filenames and EXIF-bearing originals are never persisted anywhere else. */
  const objectPaths: string[] = [];
  const visionImages: VisionImage[] = [];
  for (const [index, image] of images.entries()) {
    const path = guestObjectPath(session.id, image.mimeType);
    const buffer = Buffer.from(image.base64, "base64");
    const { error } = await db.storage
      .from(GUEST_BUCKET)
      .upload(path, buffer, { contentType: image.mimeType, upsert: false });
    if (!error) objectPaths.push(path);
    visionImages.push({ id: `guest-${index}`, mimeType: image.mimeType, base64: image.base64 });
  }

  try {
    const provider = await getVisionProvider();
    let payload: unknown;
    let photoCount = visionImages.length;

    if (args.kind === "renter") {
      const response = await provider.analyseInventoryPhotos({
        images: visionImages,
        catalogueKeys: CATALOGUE.map((item) => item.key),
        categories: ITEM_CATEGORIES,
      });
      // Schema validation happens inside the provider; reconciliation is ours.
      const detections = reconcileDetections(response.result.detections).map((detection) => ({
        ...detection,
        confidence_score: BAND_SCORE[detection.object_confidence],
      }));
      payload = { kind: "renter", detections };
    } else {
      const response = await provider.analyseSpacePhotos({
        images: visionImages,
        spaceType: args.spaceType ?? null,
      });
      payload = { kind: "host", scan: response.result, spaceType: args.spaceType ?? null };
    }

    await db
      .from("guest_spacefit_runs")
      .update({
        status: "completed",
        provider: provider.id,
        model: provider.model,
        result: payload,
        duration_ms: Date.now() - startedAt,
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    await db
      .from("guest_spacefit_sessions")
      .update({ result: payload, result_at: new Date().toISOString() })
      .eq("id", session.id);

    console.info("[spacefit-guest] scan completed", {
      kind: args.kind,
      photos: photoCount,
      durationMs: Date.now() - startedAt,
    });

    return hydrate(args.kind, payload, photoCount, false, args.spaceType ?? null);
  } catch (error) {
    const category: GuestErrorCategory =
      error instanceof VisionProviderError ? error.category : "unknown";
    console.error("[spacefit-guest] scan failed", { kind: args.kind, category });
    await db
      .from("guest_spacefit_runs")
      .update({
        status: "failed",
        error_category: category,
        duration_ms: Date.now() - startedAt,
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    throw new GuestSpaceFitError(category, "We couldn't finish that scan.");
  } finally {
    // Guest images are never retained past the request that used them.
    if (objectPaths.length > 0) {
      try {
        await db.storage.from(GUEST_BUCKET).remove(objectPaths);
      } catch {
        /* swept later by expiry cleanup */
      }
    }
  }
}

function hydrate(
  kind: GuestKind,
  payload: any,
  photoCount: number,
  reused: boolean,
  spaceType: string | null,
): GuestAnalysis {
  if (kind === "renter") {
    return {
      kind: "renter",
      items: guestItemsFromDetections(payload?.detections ?? []),
      analysedPhotoCount: photoCount,
      reused,
    };
  }
  return {
    kind: "host",
    proposal: guestProposalFromScan(payload?.scan, payload?.spaceType ?? spaceType),
    analysedPhotoCount: photoCount,
    reused,
  };
}

/* ---------------------------------------------------------------- claim */

export interface GuestClaimArgs {
  /** The signed-in caller's own RLS-scoped client. */
  supabase: any;
  userId: string;
  token: string;
}

export type GuestClaimResult =
  | { kind: "renter"; inventoryId: string; runId: string; detectionCount: number; idempotent: boolean }
  | { kind: "host"; proposal: GuestSpaceProposal; idempotent: boolean };

export async function claimGuestSession(args: GuestClaimArgs): Promise<GuestClaimResult> {
  const db = await admin();
  if (!isPlausibleGuestToken(args.token)) {
    throw new GuestSpaceFitError("session_invalid", GUEST_CLAIM_MESSAGES.not_found);
  }

  const { data: session } = await db
    .from("guest_spacefit_sessions")
    .select("id, kind, status, result, claimed_by, expires_at")
    .eq("token_hash", hashGuestToken(args.token))
    .maybeSingle();

  const decision = decideGuestClaim(session, args.userId);
  if (!decision.ok) {
    const category: GuestErrorCategory =
      decision.reason === "expired"
        ? "session_expired"
        : decision.reason === "already_claimed_by_other"
          ? "already_claimed"
          : "session_invalid";
    throw new GuestSpaceFitError(category, GUEST_CLAIM_MESSAGES[decision.reason]);
  }

  /* Host: measurements stay a PROPOSAL. The host must confirm them in the
     existing listing wizard before anything becomes verified. */
  if (session.kind === "host") {
    if (!decision.idempotent) await markClaimed(db, session.id, args.userId);
    return {
      kind: "host",
      proposal: guestProposalFromScan(session.result?.scan, session.result?.spaceType ?? null),
      idempotent: decision.idempotent,
    };
  }

  /* Renter: the server-stored detections become PENDING suggestions the
     claimant must still review in the canonical review flow. */
  const items = guestItemsFromDetections(session.result?.detections ?? []);

  const { data: existingInventory } = await args.supabase
    .from("renter_inventories")
    .select("id")
    .eq("user_id", args.userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let inventoryId = existingInventory?.id as string | undefined;
  if (!inventoryId) {
    const { data: created, error } = await args.supabase
      .from("renter_inventories")
      .insert({ user_id: args.userId, name: "My Stuff" })
      .select("id")
      .single();
    if (error || !created) throw new GuestSpaceFitError("unknown", "Couldn't set up your inventory.");
    inventoryId = created.id;
  }

  // One-time: a second claim never duplicates detections.
  const claimRequestId = `guest-claim-${session.id}`;
  const { data: existingRun } = await args.supabase
    .from("inventory_analysis_runs")
    .select("id, detection_count")
    .eq("inventory_id", inventoryId)
    .eq("client_request_id", claimRequestId)
    .maybeSingle();
  if (existingRun) {
    return {
      kind: "renter",
      inventoryId: inventoryId!,
      runId: existingRun.id,
      detectionCount: existingRun.detection_count ?? 0,
      idempotent: true,
    };
  }

  const { data: run, error: runError } = await args.supabase
    .from("inventory_analysis_runs")
    .insert({
      inventory_id: inventoryId,
      user_id: args.userId,
      client_request_id: claimRequestId,
      provider: "guest-claim",
      model: "guest-spacefit-v1",
      status: "completed",
      photo_count: 0,
      analysed_photo_count: 0,
      detection_count: items.length,
      completed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (runError || !run) throw new GuestSpaceFitError("unknown", "Couldn't save your scan.");

  if (items.length > 0) {
    const rows = items.map((item) => ({
      run_id: run.id,
      inventory_id: inventoryId,
      user_id: args.userId,
      provider: "guest-claim",
      model: "guest-spacefit-v1",
      detected_label: item.label.slice(0, 80),
      suggested_category: item.category,
      suggested_catalogue_key: item.catalogueKey,
      suggested_quantity: item.quantity,
      object_confidence: item.confidence,
      quantity_confidence: item.confidence,
      confidence_score: BAND_SCORE[item.confidence],
      stackable_suggestion: item.stackable,
      fragile_suggestion: item.fragile ? "yes" : "unknown",
      orientation_suggestion: "unknown",
      possible_restricted_item: item.possibleRestrictedItem,
      inventory_intent: "likely_inventory",
      review_status: "pending",
    }));
    const { error } = await args.supabase.from("inventory_detections").insert(rows);
    if (error) throw new GuestSpaceFitError("unknown", "Couldn't save your scan.");
  }

  await markClaimed(db, session.id, args.userId);

  return {
    kind: "renter",
    inventoryId: inventoryId!,
    runId: run.id,
    detectionCount: items.length,
    idempotent: false,
  };
}

async function markClaimed(db: AdminClient, sessionId: string, userId: string) {
  await db
    .from("guest_spacefit_sessions")
    .update({ status: "claimed", claimed_by: userId, claimed_at: new Date().toISOString() })
    .eq("id", sessionId)
    .is("claimed_by", null);
}
