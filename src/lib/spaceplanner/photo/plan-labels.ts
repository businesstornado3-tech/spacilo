/**
 * Phase 6O — plan label layout.
 *
 * The floor plan drew every full item name in the middle of its rectangle, so
 * long names spilled over their objects and over each other. This module makes
 * the decision separately from the drawing, and it never changes an object's
 * geometry to make text fit: a label either fits inside its own rectangle at a
 * readable size without colliding with an already-placed label, or the object
 * gets a numbered marker and its full name goes in the legend.
 *
 * All values are in metres, matching the manifest and the SVG view box.
 */

/** Never render below this — smaller is unreadable at any screen size. */
export const MIN_FONT_M = 0.13;
export const MAX_FONT_M = 0.2;
/** Rough advance width per character for the UI sans stack. */
const CHAR_WIDTH_RATIO = 0.58;
const LINE_HEIGHT_RATIO = 1.25;
const PADDING_M = 0.06;

export interface PlanUnit {
  key: string;
  entryId: string;
  label: string;
  xM: number;
  yM: number;
  widthM: number;
  depthM: number;
}

export interface PlanBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlanLabel {
  key: string;
  entryId: string;
  /** Legend number, stable per entry. */
  number: number;
  mode: "inline" | "marker";
  /** What is drawn: a short name inline, or the number in a marker. */
  text: string;
  fontSize: number;
  /** Centre of the text. */
  x: number;
  y: number;
  /** The area the text occupies, used for collision checks. */
  box: PlanBox;
}

export interface PlanLegendEntry {
  number: number;
  entryId: string;
  label: string;
  placed: boolean;
}

/** Trims a name to something that can sit inside an object. */
export function shortLabel(label: string, maxChars = 16): string {
  const clean = label.trim().replace(/\s+/g, " ");
  if (clean.length <= maxChars) return clean;
  const cut = clean.slice(0, maxChars - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > 6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export function boxesOverlap(a: PlanBox, b: PlanBox): boolean {
  return (
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  );
}

function textBox(text: string, fontSize: number, cx: number, cy: number): PlanBox {
  const width = text.length * fontSize * CHAR_WIDTH_RATIO;
  const height = fontSize * LINE_HEIGHT_RATIO;
  return { x: cx - width / 2, y: cy - height / 2, width, height };
}

/**
 * Decides, in draw order, how each unit is labelled. Larger objects are
 * considered first so the biggest rectangles keep their readable names and the
 * small ones fall back to markers.
 */
export function layoutPlanLabels(
  units: PlanUnit[],
  numbers: Map<string, number>,
): PlanLabel[] {
  const ordered = [...units].sort((a, b) => b.widthM * b.depthM - a.widthM * a.depthM);
  const taken: PlanBox[] = [];
  const labels: PlanLabel[] = [];

  for (const unit of ordered) {
    const number = numbers.get(unit.entryId) ?? 0;
    const cx = unit.xM + unit.widthM / 2;
    const cy = unit.yM + unit.depthM / 2;

    const available = Math.max(0, unit.widthM - PADDING_M * 2);
    const availableDepth = Math.max(0, unit.depthM - PADDING_M * 2);
    const text = shortLabel(unit.label);

    // The largest font that fits the rectangle, capped both ways.
    const byWidth = available / Math.max(1, text.length * CHAR_WIDTH_RATIO);
    const byDepth = availableDepth / LINE_HEIGHT_RATIO;
    const fontSize = Math.min(MAX_FONT_M, byWidth, byDepth);

    let label: PlanLabel;
    if (fontSize >= MIN_FONT_M) {
      const box = textBox(text, fontSize, cx, cy);
      const collides = taken.some((other) => boxesOverlap(box, other));
      label = collides
        ? markerLabel(unit, number, cx, cy)
        : { key: unit.key, entryId: unit.entryId, number, mode: "inline", text, fontSize, x: cx, y: cy, box };
    } else {
      label = markerLabel(unit, number, cx, cy);
    }

    // A marker can still be nudged out of the way rather than overlapping.
    if (label.mode === "marker") {
      let attempt = 0;
      while (taken.some((other) => boxesOverlap(label.box, other)) && attempt < 6) {
        attempt += 1;
        const shift = MIN_FONT_M * 0.9 * attempt;
        const y = cy + (attempt % 2 === 0 ? shift : -shift);
        label = markerLabel(unit, number, cx, y);
      }
    }

    taken.push(label.box);
    labels.push(label);
  }

  return labels;
}

function markerLabel(unit: PlanUnit, number: number, cx: number, cy: number): PlanLabel {
  const fontSize = MIN_FONT_M;
  const size = fontSize * 1.5;
  return {
    key: unit.key,
    entryId: unit.entryId,
    number,
    mode: "marker",
    text: String(number),
    fontSize,
    x: cx,
    y: cy,
    box: { x: cx - size / 2, y: cy - size / 2, width: size, height: size },
  };
}

/** True when no two labels overlap. Used by the renderer regression tests. */
export function labelsAreClear(labels: PlanLabel[]): boolean {
  for (let i = 0; i < labels.length; i += 1) {
    for (let j = i + 1; j < labels.length; j += 1) {
      if (boxesOverlap(labels[i]!.box, labels[j]!.box)) return false;
    }
  }
  return true;
}

/** Stable numbering: entry order in the manifest, placed and unplaced alike. */
export function legendFor(
  entries: { id: string; label: string; state: string }[],
): { numbers: Map<string, number>; legend: PlanLegendEntry[] } {
  const numbers = new Map<string, number>();
  const legend: PlanLegendEntry[] = entries.map((entry, index) => {
    numbers.set(entry.id, index + 1);
    return {
      number: index + 1,
      entryId: entry.id,
      label: entry.label,
      placed: entry.state !== "cannot be safely placed",
    };
  });
  return { numbers, legend };
}
