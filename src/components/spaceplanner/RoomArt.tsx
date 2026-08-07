/**
 * Miniature room illustrations for the storage selector.
 *
 * A small, warm elevation view of each space type so a visitor recognises the
 * place before reading the dimensions. Purely presentational.
 */
import { cn } from "@/lib/utils";

const FLOOR = "fill-scene-floor";
const WALL = "fill-scene-wall";
const WOOD = "fill-scene-wood";
const WOOD_DARK = "fill-scene-wood-dark";
const METAL = "fill-scene-metal";
const METAL_DARK = "fill-scene-metal-dark";
const CARD = "fill-scene-card";
const LINE = "stroke-scene-line";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <>
      <rect x={0} y={0} width={160} height={100} rx={10} className={WALL} />
      <rect x={0} y={74} width={160} height={26} className={FLOOR} />
      <path d="M0 74h160" className={LINE} strokeWidth={1.4} fill="none" />
      {children}
    </>
  );
}

function Garage() {
  return (
    <Frame>
      <path d="M14 46 80 16l66 30" className={cn("fill-scene-wood-dark", LINE)} strokeWidth={1.5} />
      <rect x={30} y={44} width={100} height={30} rx={3} className={METAL} />
      {[50, 56, 62, 68].map((y) => (
        <path key={y} d={`M30 ${y}h100`} className={LINE} strokeWidth={1.2} fill="none" />
      ))}
      <rect x={70} y={70} width={20} height={3} rx={1.5} className={METAL_DARK} />
      <rect x={132} y={58} width={16} height={16} rx={2} className={CARD} />
    </Frame>
  );
}

function Bedroom() {
  return (
    <Frame>
      <rect x={22} y={26} width={116} height={48} rx={4} className={WOOD} opacity={0.35} />
      <rect x={34} y={40} width={44} height={34} rx={4} className="fill-scene-fabric" />
      <rect x={34} y={34} width={44} height={9} rx={4} className={WOOD_DARK} />
      <rect x={92} y={44} width={36} height={30} rx={3} className={WOOD} />
      <circle cx={110} cy={30} r={7} className="fill-scene-accent" opacity={0.4} />
    </Frame>
  );
}

function Loft() {
  return (
    <Frame>
      <path d="M10 74 80 20l70 54z" className={cn(WOOD, LINE)} strokeWidth={1.5} opacity={0.6} />
      <rect x={58} y={62} width={44} height={12} rx={2} className={WOOD_DARK} />
      <rect x={64} y={48} width={18} height={14} rx={2} className={CARD} />
      <rect x={86} y={52} width={14} height={10} rx={2} className={CARD} />
    </Frame>
  );
}

function Container() {
  return (
    <Frame>
      <rect x={16} y={28} width={128} height={46} rx={4} className={METAL} />
      {Array.from({ length: 9 }, (_, i) => 24 + i * 14).map((x) => (
        <path key={x} d={`M${x} 30v42`} className={LINE} strokeWidth={1.6} fill="none" />
      ))}
      <rect x={16} y={28} width={128} height={7} rx={3} className={METAL_DARK} />
      <circle cx={78} cy={52} r={3} className={METAL_DARK} />
    </Frame>
  );
}

function Warehouse() {
  return (
    <Frame>
      <path d="M8 40 80 14l72 26v34H8z" className={cn(WALL, LINE)} strokeWidth={1.5} />
      <rect x={26} y={46} width={44} height={28} rx={2} className={METAL} />
      <rect x={92} y={40} width={44} height={34} rx={2} className={WOOD} opacity={0.5} />
      {[46, 56, 66].map((y) => (
        <path key={y} d={`M92 ${y}h44`} className={LINE} strokeWidth={1.4} fill="none" />
      ))}
      <rect x={98} y={48} width={14} height={7} rx={1.5} className={CARD} />
      <rect x={116} y={58} width={14} height={7} rx={1.5} className={CARD} />
    </Frame>
  );
}

function Shed() {
  return (
    <Frame>
      <path d="M20 42 80 18l60 24v32H20z" className={cn(WOOD, LINE)} strokeWidth={1.5} />
      {[48, 56, 64, 72].map((y) => (
        <path key={y} d={`M20 ${y}h120`} className={LINE} strokeWidth={1.1} fill="none" />
      ))}
      <rect x={66} y={48} width={26} height={26} rx={2} className={WOOD_DARK} />
      <circle cx={87} cy={62} r={2} className={METAL_DARK} />
    </Frame>
  );
}

function Commercial() {
  return (
    <Frame>
      <rect x={12} y={24} width={136} height={50} rx={4} className={WALL} />
      <rect x={26} y={36} width={108} height={38} rx={3} className={METAL} />
      {[42, 50, 58, 66].map((y) => (
        <path key={y} d={`M26 ${y}h108`} className={LINE} strokeWidth={1.2} fill="none" />
      ))}
      <rect x={68} y={30} width={24} height={5} rx={2.5} className="fill-scene-accent" />
    </Frame>
  );
}

function StorageRoom() {
  return (
    <Frame>
      <rect x={26} y={26} width={108} height={48} rx={4} className={WALL} />
      <rect x={34} y={34} width={44} height={40} rx={2} className={METAL} />
      {[44, 54, 64].map((y) => (
        <path key={y} d={`M34 ${y}h44`} className={LINE} strokeWidth={1.3} fill="none" />
      ))}
      <rect x={40} y={36} width={14} height={7} rx={1.5} className={CARD} />
      <rect x={58} y={46} width={14} height={7} rx={1.5} className={CARD} />
      <rect x={94} y={34} width={32} height={40} rx={3} className={WOOD} />
    </Frame>
  );
}

function Parking() {
  return (
    <Frame>
      <rect x={0} y={40} width={160} height={34} className={FLOOR} />
      <path d="M28 40v34M132 40v34" className="stroke-scene-accent" strokeWidth={3} fill="none" opacity={0.6} />
      <rect x={44} y={46} width={72} height={22} rx={9} className="fill-scene-fabric" />
      <rect x={58} y={40} width={44} height={12} rx={6} className="fill-scene-fabric-dark" />
      <circle cx={58} cy={70} r={5} className="fill-scene-ink" />
      <circle cx={104} cy={70} r={5} className="fill-scene-ink" />
    </Frame>
  );
}

const ROOMS: Record<string, () => React.JSX.Element> = {
  garage: Garage,
  bedroom: Bedroom,
  loft: Loft,
  container: Container,
  warehouse: Warehouse,
  shed: Shed,
  commercial: Commercial,
  storage_room: StorageRoom,
  parking: Parking,
};

export function RoomIllustration({ kind, className }: { kind: string; className?: string }) {
  const Art = ROOMS[kind] ?? Garage;
  return (
    <svg viewBox="0 0 160 100" className={cn("w-full", className)} aria-hidden="true">
      <Art />
    </svg>
  );
}
