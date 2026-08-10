/**
 * SpacePlanner visualisation — client pipeline.
 *
 * Downstream of the confirmed inventory: the placement manifest built from the
 * canonical inventory and the analytical plan is what the image model is asked
 * to satisfy, and what the returned image is checked against. A geometric
 * overlay is never returned from here: if no image comes back, or the image
 * cannot be shown to contain the required items, the caller is told.
 */
import type { PhotoPlanResult } from "./plan";
import {
  formatManifestForModel,
  requiredRenderItems,
  type CoverageReport,
  type PlacementManifest,
} from "./manifest";
import { hashString } from "@/lib/vision/hash";
import type { DetectedObject } from "@/lib/vision/types";

export type VisualisationStage =
  | "reading"
  | "identifying"
  | "sizing"
  | "space"
  | "fitting"
  | "planning"
  | "rendering"
  | "checking";

export const VISUALISATION_STAGES: { id: VisualisationStage; label: string }[] = [
  { id: "reading", label: "Reading your belongings…" },
  { id: "identifying", label: "Identifying your items…" },
  { id: "sizing", label: "Checking sizes and quantities…" },
  { id: "space", label: "Reading your storage space…" },
  { id: "fitting", label: "Calculating the best fit…" },
  { id: "planning", label: "Planning the arrangement…" },
  { id: "rendering", label: "Creating your visual preview…" },
  { id: "checking", label: "Checking that all your items are included…" },
];

export interface VisualisationImage {
  mimeType: string;
  base64: string;
}

export interface VisualisationRequest {
  spaceImage: VisualisationImage;
  itemImages: VisualisationImage[];
  instruction: string;
  /** Structured manifest the image must satisfy. */
  manifest?: { id: string; label: string; quantity: number }[];
  roomFeatures?: readonly { id: string; label: string; kind: string; position: string }[];
  /** Support relationships the plan asserted; rendered and then verified. */
  supports?: readonly { itemId: string; itemLabel: string; baseId: string; baseLabel: string }[];
  /** Items a previous attempt missed; the retry emphasises these. */
  emphasise?: string[];
  /** Distinguishes a corrective re-render from the cached first attempt. */
  nonce?: number;
  /** Diagnostics only. A retry sends the SAME hash — the plan never changes. */
  planHash?: string;
  inventoryHash?: string;
}


/** How the server's own verification pass judged the returned image. */
export type VerificationVerdict = "verified" | "incomplete" | "unfaithful" | "unverified";

export interface VisualisationResponse {
  image: string;
  coverage: CoverageReport | null;
  verification: VerificationVerdict;
  /** Correlates this render with the server log line for support. */
  diagnosticId: string | null;
  /** Which service actually produced the image. */
  provider: string | null;
  model: string | null;
  renderMs: number | null;
  /** Milliseconds the server spent checking the render. */
  verifyMs?: number | null;
  /** True when the CHECK ran out of time — the render itself was fine. */
  verifyTimedOut?: boolean;
  /** Render + verification as measured on the server. */
  serverTotalMs?: number | null;
}



/**
 * The rendering order sent to the image model.
 *
 * The deterministic physical plan is the single authority. When a manifest
 * exists, the manifest's metric coordinates ARE the instruction — no second,
 * looser description is included alongside it, because two descriptions of the
 * same arrangement is exactly how items end up scattered. Without a manifest
 * (a preview before the inventory is locked) a plain-language fallback is used.
 */
export function buildVisualisationInstruction(
  result: PhotoPlanResult,
  objects: DetectedObject[],
  manifest?: PlacementManifest,
): string {
  const arrangement = result.arrangement;
  const excluded = arrangement.unplaced.length
    ? `Do NOT draw these — the plan could not fit them: ${arrangement.unplaced.map((entry) => entry.label).join(", ")}.`
    : "";
  const dimensions = `The space is roughly ${result.space.width.toFixed(1)}m wide by ${result.space.depth.toFixed(1)}m deep with about ${result.space.height.toFixed(1)}m of height.`;
  const volume = `The placed items occupy roughly ${result.spaceUsedM3.toFixed(1)}m³, leaving about ${result.spaceRemainingM3.toFixed(1)}m³ free.`;

  if (manifest) {
    return [
      "YOU ARE A RENDERER, NOT A PLANNER. The arrangement below has already been calculated by a physical planning engine and validated. Reproduce it exactly. Do not move, add, remove, resize, duplicate or rearrange anything, and do not scatter items across the open floor.",
      dimensions,
      `EVERY item in this manifest must appear in the edited photograph, at the exact coordinates given:\n\n${formatManifestForModel(manifest)}`,
      "Items sharing a wall must sit shoulder to shoulder with no gaps between them. Nothing floats, nothing overlaps, nothing sits in the middle of the floor unless its coordinates say so.",
      "Render the supplied placement manifest exactly. Do not move, rotate, resize, duplicate, remove, substitute or reinterpret objects. Do not scatter objects. Do not improve the arrangement independently. The placement manifest is authoritative.",
      "Do not invent shelving, racking, cupboards, cabinets, drawers, hooks or storage boxes. Only the belongings listed, inside the room exactly as photographed.",
      excluded,
      volume,
    ]
      .filter(Boolean)
      .join(" ");
  }

  const items = objects
    .slice(0, 8)
    .map((object) => {
      const size = `${Math.round(object.width)}×${Math.round(object.depth)}×${Math.round(object.height)}cm`;
      const quantity = object.quantity > 1 ? `${object.quantity}× ` : "";
      return `${quantity}${object.label} (about ${size})`;
    })
    .join(", ");

  const placements = arrangement.entries
    .slice(0, 12)
    .map((entry) => {
      const count = entry.units > 1 ? `${entry.units}× ` : "";
      const stacked =
        entry.units > 1 ? " stacked vertically" : entry.layer > 0 ? " resting on the item below" : "";
      const turned =
        entry.orientation === "upright"
          ? ", standing upright on its edge"
          : entry.rotationDeg
            ? ", turned 90°"
            : "";
      return `${count}${entry.label} at ${describeSpot(entry.x + entry.w / 2, entry.y + entry.d / 2, result)}${turned}${stacked}`;
    })
    .join("; ");

  return [
    dimensions,
    items ? `Belongings to place: ${items}.` : "",
    placements
      ? `The arrangement has already been calculated. Place each item exactly as specified and do not move, add, remove or rearrange anything: ${placements}.`
      : "",
    arrangement.walkway
      ? "Leave a clear walkway from the opening through the space; no item may stand in it."
      : "",
    excluded,
    volume,
  ]
    .filter(Boolean)
    .join(" ");
}


function describeSpot(x: number, y: number, result: PhotoPlanResult): string {
  const across = x / Math.max(result.space.width, 0.1);
  const into = y / Math.max(result.space.depth, 0.1);
  const side = across < 0.34 ? "the left wall" : across > 0.66 ? "the right wall" : "the centre";
  const depth = into < 0.34 ? "the back of the room" : into > 0.66 ? "the entrance" : "the middle";
  return `${side}, towards ${depth}`;
}


/**
 * Manifest → the render projection the endpoint validates against.
 *
 * Phase 6AE: PER OBJECT, not per unit. The old per-unit expansion let a single
 * high-quantity item consume the endpoint's whitelist budget and silently push
 * later objects — a TV stand among them — off the end. Quantity now travels as
 * a number, and the endpoint expands it itself.
 */
export function manifestPayload(manifest: PlacementManifest): RenderObject[] {
  return buildRenderProjection(manifest).objects;
}

/** Objects the manifest contains that the render deliberately leaves out. */
export function manifestRenderExclusions(manifest: PlacementManifest): RenderExclusion[] {
  return buildRenderProjection(manifest).excluded;
}

/** Retained for verification suites that still assert the per-unit contract. */
export function manifestUnitPayload(
  manifest: PlacementManifest,
): { id: string; label: string; quantity: number }[] {
  return requiredRenderItems(manifest);
}

/**
 * Deterministic request signature. Same photos, same inventory, same plan →
 * same key, so a repeated request can reuse the previous image.
 *
 * Phase 6T — the plan and inventory hashes are part of the key. An image is
 * only ever reused for the exact plan and exact inventory it was rendered for,
 * so a re-plan can never be illustrated with a previous run's picture.
 */
export function visualisationSignature(request: VisualisationRequest): string {
  const parts = [
    request.planHash ?? "no-plan",
    request.inventoryHash ?? "no-inventory",
    (request.manifest ?? []).map((entry) => `${entry.id}x${entry.quantity}`).join(","),
    (request.supports ?? []).map((support) => `${support.itemId}>${support.baseId}`).join(","),
    request.spaceImage.base64,
    ...request.itemImages.map((image) => image.base64),
    request.instruction,
    (request.emphasise ?? []).join(","),
    String(request.nonce ?? 0),
  ];
  return `vis_${hashString(parts.join("|")).toString(36)}`;
}


/**
 * Per-session, in-memory only. Never persisted and never shared between
 * users — a page reload starts empty.
 */
const sessionCache = new Map<string, VisualisationResponse>();

/**
 * Phase 6AD — identical input must never pay for a second render.
 *
 * A request already in flight is JOINED rather than duplicated: React strict
 * mode, a double click and an effect re-run all resolve from the one call the
 * gateway is actually billing for.
 */
const inFlight = new Map<string, Promise<VisualisationResponse>>();

export function cachedVisualisation(signature: string): VisualisationResponse | undefined {
  return sessionCache.get(signature);
}

/** True when this exact plan+photos already has a render request running. */
export function visualisationInFlight(signature: string): boolean {
  return inFlight.has(signature);
}

export function clearVisualisationCache(): void {
  sessionCache.clear();
  inFlight.clear();
}

export class VisualisationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "VisualisationError";
  }
}

/** Calls the visualisation endpoint. Resolves only with a real edited photo. */
export async function requestVisualisation(
  request: VisualisationRequest,
  fetchImpl: typeof fetch = fetch,
  options: { signal?: AbortSignal } = {},
): Promise<VisualisationResponse> {
  const signature = visualisationSignature(request);
  const cached = sessionCache.get(signature);
  if (cached) return cached;
  const running = inFlight.get(signature);
  if (running) return running;

  const attempt = (async (): Promise<VisualisationResponse> => {
    const response = await fetchImpl("/api/spaceplanner-visualise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      ...(options.signal ? { signal: options.signal } : {}),
    });

    const payload = (await response.json().catch(() => null)) as
      | {
          image?: unknown;
          error?: unknown;
          coverage?: CoverageReport;
          verification?: VerificationVerdict;
          diagnosticId?: unknown;
          provider?: unknown;
          model?: unknown;
          renderMs?: unknown;
          verifyMs?: unknown;
          verifyTimedOut?: unknown;
          serverTotalMs?: unknown;
        }
      | null;

    if (!response.ok) {
      throw new VisualisationError(
        typeof payload?.error === "string" ? payload.error : `http_${response.status}`,
      );
    }
    if (typeof payload?.image !== "string" || !payload.image) {
      throw new VisualisationError("no_image_returned");
    }

    const coverage = payload.coverage ?? null;
    const result: VisualisationResponse = {
      image: payload.image,
      coverage,
      verification:
        payload.verification ??
        (!coverage
          ? "unverified"
          : !coverage.faithful || (coverage.supportIssues?.length ?? 0) > 0
            ? "unfaithful"
            : coverage.complete
              ? "verified"
              : "incomplete"),

      diagnosticId: typeof payload.diagnosticId === "string" ? payload.diagnosticId : null,
      provider: typeof payload.provider === "string" ? payload.provider : null,
      model: typeof payload.model === "string" ? payload.model : null,
      renderMs: typeof payload.renderMs === "number" ? payload.renderMs : null,
      verifyMs: typeof payload.verifyMs === "number" ? payload.verifyMs : null,
      verifyTimedOut: payload.verifyTimedOut === true,
      serverTotalMs: typeof payload.serverTotalMs === "number" ? payload.serverTotalMs : null,
    };

    sessionCache.set(signature, result);
    return result;
  })();

  inFlight.set(signature, attempt);
  try {
    return await attempt;
  } finally {
    inFlight.delete(signature);
  }
}


