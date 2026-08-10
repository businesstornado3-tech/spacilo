/**
 * Phase 6AE — the render projection.
 *
 * ROOT CAUSE THIS MODULE EXISTS TO FIX
 * ------------------------------------
 * The photographic renderer used to be handed `requiredRenderItems()`: a flat,
 * PER-UNIT list of `{id, label, quantity: 1}`. Three silent failures lived in
 * that shape, and together they are why a TV stand could vanish from a preview
 * that was otherwise correct:
 *
 *   1. PER-UNIT INFLATION + A HARD SLICE. The endpoint truncated the list at 20
 *      entries. Because the list was expanded per unit, a single "cardboard box
 *      ×12" consumed twelve slots and pushed later objects — the TV stand among
 *      them — off the end of the whitelist entirely. No error, no diagnostic.
 *   2. NO STRUCTURAL SIGNAL. An object that CARRIES another object was
 *      indistinguishable from a cushion. The stand was named only inside the
 *      long prose instruction, as the id in "the TV rests on obj_3", so the
 *      model had no required-object row telling it the stand must be drawn.
 *   3. SILENT EXCLUSION. Unplaceable entries were dropped with no record, so a
 *      missing object could not be attributed to a stage.
 *
 * The projection is therefore PER OBJECT, carries the structural role, and
 * every exclusion is explicit and reported. Nothing leaves the manifest without
 * a named reason.
 */
import type { PlacementManifest } from "./manifest";

export type RenderExclusionReason = "not_placeable" | "no_label" | "capacity_limit";

/** The compact, render-facing description of one physical object. */
export interface RenderObject {
  id: string;
  label: string;
  quantity: number;
  widthCm: number;
  depthCm: number;
  heightCm: number;
  /** Where the deterministic plan put it, in plain words. */
  placement: string;
  /** The object whose top surface carries this one, when there is one. */
  supportBaseId: string | null;
  supportBaseLabel: string | null;
  /**
   * True when this object CARRIES another object in the plan. A structural
   * object is never dropped for capacity: removing it would leave whatever
   * stands on it floating.
   */
  structural: boolean;
  /** Always true. The renderer may not treat any projected object as optional. */
  required: true;
}

export interface RenderExclusion {
  id: string;
  label: string;
  reason: RenderExclusionReason;
}

export interface RenderProjection {
  objects: RenderObject[];
  excluded: RenderExclusion[];
}

/**
 * How many distinct objects one render request may describe. Generous: the cap
 * exists so a pathological inventory cannot blow the prompt, not to prune.
 */
export const MAX_RENDER_OBJECTS = 32;

/** Ids of every manifest entry that carries another entry. */
export function structuralBaseIds(manifest: PlacementManifest): Set<string> {
  const bases = new Set<string>();
  for (const entry of manifest.entries) {
    for (const position of entry.positions) {
      if (position.supportSurfaceId) bases.add(position.supportSurfaceId);
    }
  }
  return bases;
}

/**
 * Manifest → the exhaustive set of objects the photograph must contain.
 *
 * Every legitimate manifest object survives unless there is a deterministic,
 * named reason it cannot. Being small, secondary, a support base or visually
 * unimportant is NEVER such a reason.
 */
export function buildRenderProjection(
  manifest: PlacementManifest,
  options: { maxObjects?: number } = {},
): RenderProjection {
  const maxObjects = options.maxObjects ?? MAX_RENDER_OBJECTS;
  const bases = structuralBaseIds(manifest);
  const labelOf = new Map(manifest.entries.map((entry) => [entry.id, entry.label]));
  const excluded: RenderExclusion[] = [];
  const candidates: RenderObject[] = [];

  for (const entry of manifest.entries) {
    const label = entry.label.trim();
    if (!label) {
      excluded.push({ id: entry.id, label: entry.label, reason: "no_label" });
      continue;
    }
    if (entry.state === "cannot be safely placed") {
      excluded.push({ id: entry.id, label, reason: "not_placeable" });
      continue;
    }
    const support = entry.positions.find((position) => position.supportSurfaceId)?.supportSurfaceId ?? null;
    candidates.push({
      id: entry.id,
      label,
      quantity: Math.max(1, Math.round(entry.quantity)),
      widthCm: entry.widthCm,
      depthCm: entry.depthCm,
      heightCm: entry.heightCm,
      placement: entry.placement,
      supportBaseId: support,
      supportBaseLabel: support ? (labelOf.get(support) ?? support) : null,
      structural: bases.has(entry.id),
      required: true,
    });
  }

  if (candidates.length <= maxObjects) return { objects: candidates, excluded };

  // Over capacity: structural objects and anything standing on something else
  // are kept first, because dropping either produces a physically impossible
  // picture. Everything else keeps manifest order. Every drop is reported.
  const priority = (object: RenderObject) =>
    object.structural || object.supportBaseId ? 0 : 1;
  const ordered = candidates
    .map((object, index) => ({ object, index }))
    .sort((a, b) => priority(a.object) - priority(b.object) || a.index - b.index);
  const keep = new Set(ordered.slice(0, maxObjects).map((entry) => entry.object.id));
  for (const object of candidates) {
    if (!keep.has(object.id)) excluded.push({ id: object.id, label: object.label, reason: "capacity_limit" });
  }
  return { objects: candidates.filter((object) => keep.has(object.id)), excluded };
}

/** Plain-language reason, for diagnostics. Never shown silently. */
export function exclusionReasonLabel(reason: RenderExclusionReason): string {
  switch (reason) {
    case "not_placeable":
      return "the planner could not fit it in this space";
    case "no_label":
      return "the object has no usable name";
    case "capacity_limit":
      return "too many distinct objects for one render request";
  }
}

/**
 * The REQUIRED_OBJECTS block. Compact by design: one line per object, no
 * prose, no planner reasoning. The manifest has already solved the planning
 * problem — this tells the renderer exactly what must be visible.
 */
export function requiredObjectsBlock(projection: RenderProjection): string {
  if (projection.objects.length === 0) return "";
  const lines = projection.objects.map((object) => {
    const size = `${object.widthCm}×${object.depthCm}×${object.heightCm}cm`;
    const support = object.supportBaseLabel
      ? `, standing on the ${object.supportBaseLabel}`
      : "";
    const structural = object.structural
      ? " [STRUCTURAL — another object rests on this one; it must be fully visible beneath it]"
      : "";
    return `- ${object.id} = ${object.quantity} × ${object.label} (${size}) — ${object.placement}${support}${structural}`;
  });
  return [
    `REQUIRED_OBJECTS — ${projection.objects.length} distinct objects. Every one must appear in the final image, exactly the stated number of times. Small objects and furniture that supports other objects are as required as large ones; none may be dropped, merged or substituted.`,
    ...lines,
  ].join("\n");
}

/** One unit-level whitelist row per physical unit, derived from the projection. */export function projectionUnits(
  projection: RenderProjection,
  maxUnits = 40,
): { id: string; label: string }[] {
  const units: { id: string; label: string }[] = [];
  for (const object of projection.objects) {
    for (let index = 0; index < object.quantity; index += 1) {
      if (units.length >= maxUnits) return units;
      units.push({ id: `${object.id}_${String(index + 1).padStart(2, "0")}`, label: object.label });
    }
  }
  return units;
}

/**
 * Part I — a retry must say WHAT to fix, not simply ask again. Missing objects
 * are restated with their structural role so the second attempt addresses the
 * actual omission.
 */
export function retryFocusFor(
  projection: RenderProjection,
  missingLabels: readonly string[],
): string[] {
  const byLabel = new Map(projection.objects.map((object) => [object.label.toLowerCase(), object]));
  return missingLabels.map((label) => {
    const object = byLabel.get(label.trim().toLowerCase());
    if (!object) return label;
    if (object.structural) {
      return `${label} — it must be physically visible, with the object that rests on it drawn standing on top of it, not floating`;
    }
    if (object.supportBaseLabel) {
      return `${label} — drawn standing on the ${object.supportBaseLabel}`;
    }
    return `${label} — ${object.placement}`;
  });
}

