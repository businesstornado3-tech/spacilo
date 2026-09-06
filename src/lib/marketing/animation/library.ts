/**
 * Reusable illustration library for the free animated engine.
 *
 * Every illustration is plain geometry inside a unit square, so it costs
 * nothing to draw, has no licence attached to it and can be rendered by any
 * canvas. Nothing here is stock artwork and nothing is downloaded.
 *
 * Pure module: geometry only.
 */
import type { Element, Shape } from "./types";

function person(head: number, bodyPaint: Shape["fill"] = "primary"): Shape[] {
  return [
    { kind: "circle", x: 0.5, y: head, r: 0.1, fill: "ink" },
    {
      kind: "path",
      points: [
        { x: 0.32, y: 1 },
        { x: 0.36, y: head + 0.14 },
        { x: 0.64, y: head + 0.14 },
        { x: 0.68, y: 1 },
      ],
      closed: true,
      fill: bodyPaint,
    },
  ];
}

function box(x: number, y: number, w: number, h: number): Shape[] {
  return [
    { kind: "rect", x, y, w, h, radius: 0.02, fill: "warning" },
    {
      kind: "path",
      points: [
        { x: x + w / 2, y },
        { x: x + w / 2, y: y + h },
      ],
      stroke: "canvas",
      lineWidth: 0.012,
    },
  ];
}

function roof(x: number, y: number, w: number, h: number): Shape {
  return {
    kind: "path",
    points: [
      { x, y: y + h },
      { x: x + w / 2, y },
      { x: x + w, y: y + h },
    ],
    closed: true,
    fill: "primary",
  };
}

const ELEMENTS: Record<string, Shape[]> = {
  /* ---------------------------------------------------------------- people */
  person: person(0.16),
  "person-boxes": [...person(0.14), ...box(0.6, 0.42, 0.34, 0.3)],
  family: [
    ...person(0.2).map((shape) =>
      shape.kind === "circle" ? { ...shape, x: 0.34 } : { ...shape, points: shape.kind === "path" ? shape.points.map((p) => ({ x: p.x - 0.16, y: p.y })) : [] },
    ),
    ...person(0.3).map((shape) =>
      shape.kind === "circle" ? { ...shape, x: 0.7, r: 0.075 } : { ...shape, points: shape.kind === "path" ? shape.points.map((p) => ({ x: p.x + 0.2, y: p.y })) : [] },
    ),
  ].filter((shape) => shape.kind !== "path" || shape.points.length > 0) as Shape[],
  student: [...person(0.18), ...box(0.06, 0.5, 0.24, 0.24)],
  host: [...person(0.16, "success")],

  /* --------------------------------------------------------------- objects */
  box: box(0.2, 0.25, 0.6, 0.6),
  "box-stack": [...box(0.18, 0.5, 0.44, 0.4), ...box(0.44, 0.16, 0.4, 0.34)],
  sofa: [
    { kind: "rect", x: 0.08, y: 0.4, w: 0.84, h: 0.34, radius: 0.06, fill: "primarySoft" },
    { kind: "rect", x: 0.08, y: 0.3, w: 0.84, h: 0.2, radius: 0.06, fill: "primary" },
    { kind: "rect", x: 0.14, y: 0.74, w: 0.08, h: 0.16, fill: "ink" },
    { kind: "rect", x: 0.78, y: 0.74, w: 0.08, h: 0.16, fill: "ink" },
  ],
  bed: [
    { kind: "rect", x: 0.06, y: 0.46, w: 0.88, h: 0.28, radius: 0.04, fill: "primarySoft" },
    { kind: "rect", x: 0.1, y: 0.36, w: 0.3, h: 0.14, radius: 0.04, fill: "white" },
  ],
  wardrobe: [
    { kind: "rect", x: 0.24, y: 0.1, w: 0.52, h: 0.82, radius: 0.03, fill: "primarySoft", stroke: "ink", lineWidth: 0.012 },
    { kind: "path", points: [{ x: 0.5, y: 0.1 }, { x: 0.5, y: 0.92 }], stroke: "ink", lineWidth: 0.01 },
  ],
  suitcase: [
    { kind: "rect", x: 0.2, y: 0.3, w: 0.6, h: 0.5, radius: 0.05, fill: "ink" },
    { kind: "rect", x: 0.4, y: 0.18, w: 0.2, h: 0.12, stroke: "ink", lineWidth: 0.02 },
  ],
  bicycle: [
    { kind: "circle", x: 0.24, y: 0.68, r: 0.2, stroke: "ink", lineWidth: 0.03 },
    { kind: "circle", x: 0.76, y: 0.68, r: 0.2, stroke: "ink", lineWidth: 0.03 },
    { kind: "path", points: [{ x: 0.24, y: 0.68 }, { x: 0.46, y: 0.4 }, { x: 0.68, y: 0.68 }, { x: 0.46, y: 0.68 }], stroke: "primary", lineWidth: 0.03 },
  ],

  /* ------------------------------------------------------------- locations */
  house: [
    roof(0.1, 0.14, 0.8, 0.3),
    { kind: "rect", x: 0.2, y: 0.44, w: 0.6, h: 0.44, fill: "surface", stroke: "ink", lineWidth: 0.012 },
    { kind: "rect", x: 0.44, y: 0.62, w: 0.16, h: 0.26, fill: "primary" },
  ],
  "house-delayed": [
    roof(0.1, 0.14, 0.8, 0.3),
    { kind: "rect", x: 0.2, y: 0.44, w: 0.6, h: 0.44, fill: "surface", stroke: "ink", lineWidth: 0.012 },
    { kind: "circle", x: 0.78, y: 0.24, r: 0.18, fill: "warning" },
  ],
  flat: [
    { kind: "rect", x: 0.16, y: 0.1, w: 0.68, h: 0.8, fill: "surface", stroke: "ink", lineWidth: 0.012 },
    { kind: "rect", x: 0.26, y: 0.2, w: 0.16, h: 0.14, fill: "primarySoft" },
    { kind: "rect", x: 0.58, y: 0.2, w: 0.16, h: 0.14, fill: "primarySoft" },
    { kind: "rect", x: 0.26, y: 0.44, w: 0.16, h: 0.14, fill: "primarySoft" },
    { kind: "rect", x: 0.58, y: 0.44, w: 0.16, h: 0.14, fill: "primary" },
  ],
  garage: [
    { kind: "rect", x: 0.08, y: 0.28, w: 0.84, h: 0.62, fill: "surface", stroke: "ink", lineWidth: 0.014 },
    roof(0.04, 0.08, 0.92, 0.22),
    { kind: "rect", x: 0.2, y: 0.46, w: 0.6, h: 0.44, fill: "primarySoft" },
    { kind: "path", points: [{ x: 0.2, y: 0.6 }, { x: 0.8, y: 0.6 }], stroke: "surface", lineWidth: 0.014 },
    { kind: "path", points: [{ x: 0.2, y: 0.74 }, { x: 0.8, y: 0.74 }], stroke: "surface", lineWidth: 0.014 },
  ],
  room: [
    { kind: "rect", x: 0.1, y: 0.16, w: 0.8, h: 0.7, fill: "surface", stroke: "ink", lineWidth: 0.012 },
    { kind: "rect", x: 0.18, y: 0.28, w: 0.24, h: 0.2, fill: "primarySoft" },
  ],
  warehouse: [
    { kind: "rect", x: 0.06, y: 0.36, w: 0.88, h: 0.54, fill: "surface", stroke: "ink", lineWidth: 0.012 },
    roof(0.02, 0.16, 0.96, 0.22),
  ],
  university: [
    { kind: "rect", x: 0.12, y: 0.4, w: 0.76, h: 0.5, fill: "surface", stroke: "ink", lineWidth: 0.012 },
    roof(0.06, 0.12, 0.88, 0.3),
    { kind: "rect", x: 0.44, y: 0.62, w: 0.16, h: 0.28, fill: "primary" },
  ],
  office: [
    { kind: "rect", x: 0.2, y: 0.08, w: 0.6, h: 0.84, fill: "surface", stroke: "ink", lineWidth: 0.012 },
    { kind: "rect", x: 0.3, y: 0.2, w: 0.16, h: 0.12, fill: "primary" },
    { kind: "rect", x: 0.56, y: 0.2, w: 0.16, h: 0.12, fill: "primarySoft" },
    { kind: "rect", x: 0.3, y: 0.44, w: 0.16, h: 0.12, fill: "primarySoft" },
  ],
  "uk-map": [
    {
      kind: "path",
      points: [
        { x: 0.42, y: 0.04 },
        { x: 0.56, y: 0.16 },
        { x: 0.5, y: 0.3 },
        { x: 0.64, y: 0.42 },
        { x: 0.62, y: 0.62 },
        { x: 0.72, y: 0.72 },
        { x: 0.56, y: 0.86 },
        { x: 0.4, y: 0.9 },
        { x: 0.3, y: 0.74 },
        { x: 0.34, y: 0.56 },
        { x: 0.24, y: 0.42 },
        { x: 0.3, y: 0.24 },
      ],
      closed: true,
      fill: "primarySoft",
      stroke: "primary",
      lineWidth: 0.01,
    },
    {
      kind: "path",
      points: [
        { x: 0.1, y: 0.5 },
        { x: 0.2, y: 0.46 },
        { x: 0.22, y: 0.6 },
        { x: 0.12, y: 0.62 },
      ],
      closed: true,
      fill: "primarySoft",
      stroke: "primary",
      lineWidth: 0.01,
    },
  ],

  /* -------------------------------------------------------------------- ui */
  pin: [
    {
      kind: "path",
      points: [
        { x: 0.5, y: 0.96 },
        { x: 0.16, y: 0.44 },
        { x: 0.84, y: 0.44 },
      ],
      closed: true,
      fill: "primary",
    },
    { kind: "circle", x: 0.5, y: 0.38, r: 0.34, fill: "primary" },
    { kind: "circle", x: 0.5, y: 0.38, r: 0.14, fill: "white" },
  ],
  "search-bar": [
    { kind: "rect", x: 0.02, y: 0.34, w: 0.96, h: 0.32, radius: 0.16, fill: "white", stroke: "line", lineWidth: 0.01 },
    { kind: "circle", x: 0.12, y: 0.5, r: 0.07, stroke: "ink", lineWidth: 0.02 },
    { kind: "rect", x: 0.24, y: 0.46, w: 0.44, h: 0.08, radius: 0.04, fill: "line" },
  ],
  notification: [
    { kind: "rect", x: 0.06, y: 0.28, w: 0.88, h: 0.44, radius: 0.08, fill: "white", stroke: "line", lineWidth: 0.01 },
    { kind: "circle", x: 0.2, y: 0.5, r: 0.09, fill: "success" },
    { kind: "rect", x: 0.34, y: 0.44, w: 0.5, h: 0.06, radius: 0.03, fill: "line" },
  ],
  calendar: [
    { kind: "rect", x: 0.1, y: 0.18, w: 0.8, h: 0.72, radius: 0.06, fill: "white", stroke: "ink", lineWidth: 0.014 },
    { kind: "rect", x: 0.1, y: 0.18, w: 0.8, h: 0.18, radius: 0.06, fill: "primary" },
    { kind: "rect", x: 0.24, y: 0.46, w: 0.14, h: 0.12, fill: "primarySoft" },
    { kind: "rect", x: 0.44, y: 0.46, w: 0.14, h: 0.12, fill: "primarySoft" },
    { kind: "rect", x: 0.64, y: 0.46, w: 0.14, h: 0.12, fill: "warning" },
  ],
  "arrow-right": [
    { kind: "path", points: [{ x: 0.04, y: 0.5 }, { x: 0.8, y: 0.5 }], stroke: "primary", lineWidth: 0.06 },
    { kind: "path", points: [{ x: 0.62, y: 0.28 }, { x: 0.94, y: 0.5 }, { x: 0.62, y: 0.72 }], closed: true, fill: "primary" },
  ],
  check: [
    { kind: "circle", x: 0.5, y: 0.5, r: 0.44, fill: "success" },
    { kind: "path", points: [{ x: 0.3, y: 0.52 }, { x: 0.45, y: 0.66 }, { x: 0.72, y: 0.36 }], stroke: "white", lineWidth: 0.07 },
  ],
  warning: [
    { kind: "path", points: [{ x: 0.5, y: 0.08 }, { x: 0.96, y: 0.9 }, { x: 0.04, y: 0.9 }], closed: true, fill: "warning" },
    { kind: "rect", x: 0.46, y: 0.36, w: 0.08, h: 0.3, radius: 0.04, fill: "white" },
    { kind: "circle", x: 0.5, y: 0.76, r: 0.05, fill: "white" },
  ],
  earning: [
    { kind: "circle", x: 0.5, y: 0.5, r: 0.42, fill: "success" },
    { kind: "path", points: [{ x: 0.62, y: 0.3 }, { x: 0.44, y: 0.3 }, { x: 0.4, y: 0.5 }, { x: 0.42, y: 0.7 }, { x: 0.64, y: 0.7 }], stroke: "white", lineWidth: 0.06 },
    { kind: "path", points: [{ x: 0.34, y: 0.52 }, { x: 0.58, y: 0.52 }], stroke: "white", lineWidth: 0.05 },
  ],
  "marketplace-link": [
    { kind: "circle", x: 0.14, y: 0.5, r: 0.12, fill: "primary" },
    { kind: "circle", x: 0.86, y: 0.5, r: 0.12, fill: "success" },
    { kind: "path", points: [{ x: 0.26, y: 0.5 }, { x: 0.74, y: 0.5 }], stroke: "primary", lineWidth: 0.03 },
    { kind: "circle", x: 0.5, y: 0.5, r: 0.16, fill: "white", stroke: "primary", lineWidth: 0.02 },
  ],
  chart: [
    { kind: "rect", x: 0.14, y: 0.56, w: 0.16, h: 0.34, fill: "primarySoft" },
    { kind: "rect", x: 0.42, y: 0.38, w: 0.16, h: 0.52, fill: "primary" },
    { kind: "rect", x: 0.7, y: 0.22, w: 0.16, h: 0.68, fill: "success" },
  ],
};

export const ELEMENT_IDS = Object.keys(ELEMENTS);

/** Looks an illustration up. Unknown names never render a blank frame. */
export function element(id: string): Element {
  const shapes = ELEMENTS[id] ?? ELEMENTS["box"]!;
  return { id: ELEMENTS[id] ? id : "box", shapes };
}

export function hasElement(id: string): boolean {
  return Boolean(ELEMENTS[id]);
}

/**
 * Chooses illustrations for a scene from the words the story uses. Deterministic
 * so the same story always draws the same picture.
 */
export function elementsForText(text: string): string[] {
  const lower = text.toLowerCase();
  const picks: string[] = [];
  const rule = (match: RegExp, ...ids: string[]) => {
    if (match.test(lower)) picks.push(...ids);
  };

  rule(/garage/, "garage");
  rule(/loft|spare room|room/, "room");
  rule(/flat|apartment/, "flat");
  rule(/(moving|move|removal|new home|house)/, "house");
  rule(/(delay|not ready|isn't ready|waiting)/, "house-delayed", "warning");
  rule(/(box|boxes|belongings|stuff|clutter|declutter)/, "box-stack");
  rule(/(sofa|furniture)/, "sofa");
  rule(/(bed|mattress)/, "bed");
  rule(/(wardrobe|clothes)/, "wardrobe");
  rule(/(student|university|term|summer)/, "university", "suitcase");
  rule(/(bike|bicycle)/, "bicycle");
  rule(/(business|stock|office)/, "office");
  rule(/(map|near you|nearby|area|local)/, "uk-map", "pin");
  rule(/(earn|income|money|worth|£)/, "earning");
  rule(/(connect|marketplace|match|two people|handover)/, "marketplace-link");
  rule(/(search|find storage|looking for)/, "search-bar");
  rule(/(book|date|calendar|month|week)/, "calendar");
  rule(/(safe|check|verified|works)/, "check");

  if (picks.length === 0) picks.push("person-boxes");
  return [...new Set(picks)].slice(0, 3);
}
