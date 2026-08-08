/**
 * SpacePlanner visualisation — client pipeline.
 *
 * Turns the analytical plan into an instruction for the image model, sends the
 * user's own photographs to the visualisation endpoint, and returns the edited
 * photograph. A geometric overlay is never returned from here: if no image
 * comes back the caller is told visualisation is unavailable.
 */
import type { PhotoPlanResult } from "./plan";
import type { DetectedObject } from "@/lib/vision/types";

export type VisualisationStage = "analysing" | "placing" | "rendering";

export const VISUALISATION_STAGES: { id: VisualisationStage; label: string }[] = [
  { id: "analysing", label: "Spacilo AI is analysing your space…" },
  { id: "placing", label: "Finding the best placement…" },
  { id: "rendering", label: "Creating your SpacePlanner visualisation…" },
];

export interface VisualisationImage {
  mimeType: string;
  base64: string;
}

export interface VisualisationRequest {
  spaceImage: VisualisationImage;
  itemImages: VisualisationImage[];
  instruction: string;
}

/** Human, model-facing description of what to place and where. */
export function buildVisualisationInstruction(
  result: PhotoPlanResult,
  objects: DetectedObject[],
): string {
  const items = objects
    .slice(0, 8)
    .map((object) => {
      const size = `${Math.round(object.width)}×${Math.round(object.depth)}×${Math.round(object.height)}cm`;
      const quantity = object.quantity > 1 ? `${object.quantity}× ` : "";
      return `${quantity}${object.label} (about ${size})`;
    })
    .join(", ");

  const placements = result.plan.after.placements
    .slice(0, 8)
    .map((placement) => `${placement.label} near ${describeSpot(placement.x, placement.y, result)}`)
    .join("; ");

  return [
    `The space is roughly ${result.space.width.toFixed(1)}m wide by ${result.space.depth.toFixed(1)}m deep with about ${result.space.height.toFixed(1)}m of height.`,
    items ? `Belongings to place: ${items}.` : "",
    placements ? `Recommended arrangement: ${placements}.` : "",
    `They should occupy roughly ${result.spaceUsedM3.toFixed(1)}m³, leaving about ${result.spaceRemainingM3.toFixed(1)}m³ of the space free.`,
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

/** Blob/object URL or data URL → the bytes the endpoint expects. */
export async function toVisualisationImage(url: string): Promise<VisualisationImage> {
  const response = await fetch(url);
  const blob = await response.blob();
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_failed"));
    reader.onload = () => {
      const value = String(reader.result ?? "");
      resolve(value.slice(value.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
  return { mimeType: blob.type || "image/jpeg", base64 };
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
): Promise<string> {
  const response = await fetchImpl("/api/spaceplanner-visualise", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  const payload = (await response.json().catch(() => null)) as
    | { image?: unknown; error?: unknown }
    | null;

  if (!response.ok) {
    throw new VisualisationError(
      typeof payload?.error === "string" ? payload.error : `http_${response.status}`,
    );
  }
  if (typeof payload?.image !== "string" || !payload.image) {
    throw new VisualisationError("no_image_returned");
  }
  return payload.image;
}
