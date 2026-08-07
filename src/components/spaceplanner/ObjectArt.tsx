/**
 * Illustrated belongings for the SpacePlanner™ demonstration.
 *
 * Every object is drawn as a clean top-down vector illustration inside a
 * 100×100 box, so the same artwork can be dropped into a plan-view placement,
 * an inventory card or the hero scene without redrawing anything. The planner
 * engine still only emits an `IconKey` — this module owns the picture.
 *
 * Palette comes from the warm `scene-*` design tokens (cardboard, timber,
 * fabric, metal) so the plan reads as a real room rather than a wireframe.
 */
import * as React from "react";

import { cn } from "@/lib/utils";
import type { IconKey } from "@/lib/spaceplanner";

/* -------------------------------------------------------------------------- */
/* Shared drawing helpers                                                      */
/* -------------------------------------------------------------------------- */

const CARD = "fill-scene-card";
const CARD_DARK = "fill-scene-card-dark";
const WOOD = "fill-scene-wood";
const WOOD_DARK = "fill-scene-wood-dark";
const FABRIC = "fill-scene-fabric";
const FABRIC_DARK = "fill-scene-fabric-dark";
const METAL = "fill-scene-metal";
const METAL_DARK = "fill-scene-metal-dark";
const INK = "fill-scene-ink";
const LEAF = "fill-scene-leaf";
const LINE = "stroke-scene-line";

function Outline({
  x = 0,
  y = 0,
  w = 100,
  h = 100,
  r = 6,
  className,
}: {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  r?: number;
  className?: string;
}) {
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx={r}
      className={cn(className, LINE)}
      strokeWidth={1.6}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* The objects — top-down, long axis horizontal                                */
/* -------------------------------------------------------------------------- */

function BoxArt() {
  return (
    <g>
      <Outline x={6} y={12} w={88} h={76} r={7} className={CARD} />
      <rect x={6} y={45} width={88} height={10} className={CARD_DARK} opacity={0.75} />
      <path d="M50 12V88" className={cn(LINE)} strokeWidth={2.2} fill="none" />
      <rect x={38} y={44} width={24} height={12} rx={3} className={CARD_DARK} />
      <rect x={16} y={22} width={26} height={5} rx={2.5} className={CARD_DARK} opacity={0.6} />
    </g>
  );
}

function BooksArt() {
  return (
    <g>
      <Outline x={6} y={16} w={88} h={68} r={5} className={CARD} />
      {[14, 30, 46, 62, 78].map((x, i) => (
        <rect
          key={x}
          x={x}
          y={22}
          width={11}
          height={56}
          rx={2}
          className={i % 2 ? INK : WOOD_DARK}
          opacity={i % 2 ? 0.75 : 0.9}
        />
      ))}
    </g>
  );
}

function BikeArt() {
  return (
    <g>
      <circle cx={20} cy={50} r={17} className="fill-none stroke-scene-ink" strokeWidth={5} />
      <circle cx={80} cy={50} r={17} className="fill-none stroke-scene-ink" strokeWidth={5} />
      <circle cx={20} cy={50} r={4} className={METAL_DARK} />
      <circle cx={80} cy={50} r={4} className={METAL_DARK} />
      <path
        d="M20 50 L44 32 L66 32 L80 50 M44 32 L52 50 L80 50 M52 50 L20 50"
        className="fill-none stroke-scene-accent"
        strokeWidth={5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M40 26h14"
        className="fill-none stroke-scene-ink"
        strokeWidth={4.5}
        strokeLinecap="round"
      />
      <path
        d="M66 26v12"
        className="fill-none stroke-scene-ink"
        strokeWidth={4.5}
        strokeLinecap="round"
      />
    </g>
  );
}

function TvArt() {
  return (
    <g>
      <Outline x={5} y={34} w={90} h={32} r={4} className={INK} />
      <rect x={9} y={38} width={82} height={24} rx={2} className="fill-scene-screen" />
      <rect x={38} y={68} width={24} height={5} rx={2.5} className={METAL_DARK} />
      <rect x={30} y={73} width={40} height={5} rx={2.5} className={METAL_DARK} />
    </g>
  );
}

function WardrobeArt() {
  return (
    <g>
      <Outline x={6} y={14} w={88} h={72} r={5} className={WOOD} />
      <rect x={10} y={18} width={39} height={64} rx={3} className={WOOD_DARK} opacity={0.35} />
      <rect x={51} y={18} width={39} height={64} rx={3} className={WOOD_DARK} opacity={0.35} />
      <circle cx={45} cy={50} r={3} className={METAL_DARK} />
      <circle cx={55} cy={50} r={3} className={METAL_DARK} />
    </g>
  );
}

function MattressArt() {
  return (
    <g>
      <Outline x={4} y={18} w={92} h={64} r={12} className={FABRIC} />
      {[34, 50, 66].map((y) => (
        <path
          key={y}
          d={`M12 ${y}h76`}
          className={LINE}
          strokeWidth={1.4}
          fill="none"
          opacity={0.7}
        />
      ))}
      {[26, 50, 74].map((x) =>
        [34, 50, 66].map((y) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={2} className={FABRIC_DARK} />
        )),
      )}
    </g>
  );
}

function TableArt() {
  return (
    <g>
      <Outline x={6} y={22} w={88} h={56} r={8} className={WOOD} />
      <rect x={14} y={30} width={72} height={40} rx={6} className={WOOD_DARK} opacity={0.28} />
      {[
        [16, 32],
        [84, 32],
        [16, 68],
        [84, 68],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={4} className={WOOD_DARK} />
      ))}
    </g>
  );
}

function ChairArt() {
  return (
    <g>
      <Outline x={22} y={24} w={56} h={56} r={8} className={WOOD} />
      <rect x={22} y={14} width={56} height={12} rx={5} className={WOOD_DARK} />
      <rect x={30} y={32} width={40} height={40} rx={5} className={FABRIC} />
    </g>
  );
}

function DeskArt() {
  return (
    <g>
      <Outline x={5} y={26} w={90} h={48} r={6} className={WOOD} />
      <rect x={58} y={30} width={33} height={40} rx={4} className={WOOD_DARK} opacity={0.35} />
      <rect x={62} y={38} width={25} height={4} rx={2} className={METAL_DARK} />
      <rect x={62} y={54} width={25} height={4} rx={2} className={METAL_DARK} />
      <rect x={14} y={36} width={34} height={22} rx={2} className={INK} />
      <rect x={17} y={39} width={28} height={16} rx={1} className="fill-scene-screen" />
    </g>
  );
}

function SuitcaseArt() {
  return (
    <g>
      <Outline x={10} y={16} w={80} h={68} r={10} className={INK} />
      <rect x={18} y={24} width={64} height={52} rx={7} className={METAL_DARK} opacity={0.35} />
      <rect x={36} y={6} width={28} height={9} rx={4.5} className={METAL} />
      <path d="M50 24v52" className={LINE} strokeWidth={2} fill="none" />
      <circle cx={22} cy={80} r={4} className={METAL_DARK} />
      <circle cx={78} cy={80} r={4} className={METAL_DARK} />
    </g>
  );
}

function SportsArt() {
  return (
    <g>
      <Outline x={6} y={26} w={88} h={48} r={16} className={FABRIC} />
      <rect x={6} y={44} width={88} height={12} className={FABRIC_DARK} opacity={0.5} />
      <circle cx={30} cy={50} r={12} className={METAL} />
      <path d="M18 50h24M30 38v24" className={LINE} strokeWidth={1.6} fill="none" />
      <path
        d="M62 34l18 32"
        className="fill-none stroke-scene-accent"
        strokeWidth={5}
        strokeLinecap="round"
      />
      <path
        d="M72 32l14 28"
        className="fill-none stroke-scene-accent"
        strokeWidth={5}
        strokeLinecap="round"
      />
    </g>
  );
}

function GuitarArt() {
  return (
    <g>
      <ellipse cx={68} cy={50} rx={26} ry={22} className={cn(WOOD, LINE)} strokeWidth={1.6} />
      <ellipse cx={40} cy={50} rx={16} ry={15} className={cn(WOOD, LINE)} strokeWidth={1.6} />
      <circle cx={62} cy={50} r={7} className={INK} />
      <rect x={4} y={45} width={30} height={10} rx={3} className={WOOD_DARK} />
      <path d="M34 50h50" className={LINE} strokeWidth={1.2} fill="none" opacity={0.6} />
    </g>
  );
}

function TreeArt() {
  return (
    <g>
      <Outline x={12} y={30} w={76} h={40} r={8} className={CARD} />
      <path d="M50 34l14 30H36z" className={LEAF} />
      <path d="M50 44l10 20H40z" className="fill-scene-leaf-dark" opacity={0.6} />
      <circle cx={30} cy={50} r={5} className="fill-scene-accent" />
      <circle cx={74} cy={44} r={4} className="fill-scene-accent" />
      <circle cx={72} cy={58} r={4} className={FABRIC_DARK} />
    </g>
  );
}

function ApplianceArt() {
  return (
    <g>
      <Outline x={12} y={12} w={76} h={76} r={8} className={METAL} />
      <circle cx={50} cy={54} r={22} className={METAL_DARK} opacity={0.45} />
      <circle cx={50} cy={54} r={15} className="fill-scene-screen" />
      <rect x={18} y={18} width={64} height={12} rx={5} className={METAL_DARK} opacity={0.4} />
      <circle cx={74} cy={24} r={3.5} className="fill-scene-accent" />
    </g>
  );
}

function ShelvingArt() {
  return (
    <g>
      <Outline x={5} y={26} w={90} h={48} r={4} className={METAL} />
      {[5, 35, 65].map((x) => (
        <rect key={x} x={x + 3} y={30} width={26} height={40} rx={3} className={CARD} />
      ))}
      <path d="M33 26v48M63 26v48" className={LINE} strokeWidth={2} fill="none" />
    </g>
  );
}

const ART: Record<IconKey, () => React.JSX.Element> = {
  box: BoxArt,
  bike: BikeArt,
  tv: TvArt,
  wardrobe: WardrobeArt,
  mattress: MattressArt,
  table: TableArt,
  suitcase: SuitcaseArt,
  books: BooksArt,
  desk: DeskArt,
  chair: ChairArt,
  sports: SportsArt,
  guitar: GuitarArt,
  tree: TreeArt,
  appliance: ApplianceArt,
  luggage: SuitcaseArt,
};

export const SHELVING_ART = ShelvingArt;

/** Raw 100×100 artwork for an object, for embedding in a larger scene. */
export function objectArtFor(key: IconKey): () => React.JSX.Element {
  return ART[key] ?? BoxArt;
}

/**
 * Artwork placed inside an SVG scene at (x, y) with the given box size.
 * The illustration is drawn long-axis-horizontal, so it is rotated a quarter
 * turn when the placement is deeper than it is wide.
 */
export function SceneObject({
  icon,
  x,
  y,
  w,
  h,
  pad = 0.12,
  opacity = 1,
}: {
  icon: IconKey;
  x: number;
  y: number;
  w: number;
  h: number;
  pad?: number;
  opacity?: number;
}) {
  const Art = objectArtFor(icon);
  const inset = Math.min(w, h) * pad;
  const bw = Math.max(w - inset * 2, 4);
  const bh = Math.max(h - inset * 2, 4);
  const upright = bh > bw * 1.15;
  const size = upright ? { w: bh, h: bw } : { w: bw, h: bh };

  return (
    <g
      transform={
        upright
          ? `translate(${x + inset + bw / 2} ${y + inset + bh / 2}) rotate(-90) translate(${-size.w / 2} ${-size.h / 2})`
          : `translate(${x + inset} ${y + inset})`
      }
      opacity={opacity}
    >
      <svg
        width={size.w}
        height={size.h}
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        overflow="visible"
      >
        <Art />
      </svg>
    </g>
  );
}

/** Standalone illustration, for inventory cards and legends. */
export function ObjectIllustration({
  icon,
  className,
  title,
}: {
  icon: IconKey;
  className?: string;
  title?: string;
}) {
  const Art = objectArtFor(icon);
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("size-full", className)}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <Art />
    </svg>
  );
}
