/**
 * Belongings for the hero garage, drawn in a warm illustrated style.
 *
 * Every shape is anchored bottom-centre at the origin so the scene can pose it
 * with a single `translate/rotate/scale` transform, which keeps every movement
 * on the GPU compositor.
 */
import type { GarageObjectKind } from "@/lib/home/garage-scene";

const box = "fill-scene-card";
const boxDark = "fill-scene-card-dark";
const wood = "fill-scene-wood";
const woodDark = "fill-scene-wood-dark";
const metal = "fill-scene-metal";
const metalDark = "fill-scene-metal-dark";
const fabric = "fill-scene-fabric";
const fabricDark = "fill-scene-fabric-dark";
const ink = "fill-scene-ink";

function Box({ w, h, tape = true }: { w: number; h: number; tape?: boolean }) {
  return (
    <g>
      <rect x={-w / 2} y={-h} width={w} height={h} rx={3} className={box} />
      <rect x={-w / 2} y={-h} width={w} height={h * 0.16} rx={3} className={boxDark} />
      {tape ? <rect x={-3} y={-h} width={6} height={h} className={boxDark} opacity={0.55} /> : null}
    </g>
  );
}

function Bike({ tone, knobbly }: { tone: string; knobbly: boolean }) {
  return (
    <g>
      <circle cx={-26} cy={-24} r={24} className="fill-none stroke-scene-ink" strokeWidth={4} />
      <circle cx={30} cy={-24} r={24} className="fill-none stroke-scene-ink" strokeWidth={4} />
      {knobbly ? (
        <>
          <circle cx={-26} cy={-24} r={19} className="fill-none stroke-scene-ink" strokeWidth={1.5} opacity={0.5} />
          <circle cx={30} cy={-24} r={19} className="fill-none stroke-scene-ink" strokeWidth={1.5} opacity={0.5} />
        </>
      ) : null}
      <path
        d="M-26 -24 L2 -24 L14 -52 L-14 -52 Z M2 -24 L-14 -52 M30 -24 L14 -52"
        className={`fill-none ${tone}`}
        strokeWidth={5}
        strokeLinejoin="round"
      />
      <path d="M-18 -56 L-8 -56 M14 -52 L14 -64 L26 -64" className={`fill-none ${tone}`} strokeWidth={4} />
    </g>
  );
}

export function GarageObjectArt({ kind }: { kind: GarageObjectKind }) {
  switch (kind) {
    case "road-bike":
      return <Bike tone="stroke-scene-accent" knobbly={false} />;
    case "mountain-bike":
      return <Bike tone="stroke-scene-screen" knobbly />;

    case "television":
      return (
        <g>
          <rect x={-38} y={-6} width={22} height={6} rx={2} className={metalDark} />
          <rect x={-46} y={-52} width={92} height={46} rx={4} className={ink} />
          <rect x={-42} y={-48} width={84} height={38} rx={2} className="fill-scene-screen" />
        </g>
      );

    case "wardrobe":
      return (
        <g>
          <rect x={-34} y={-126} width={68} height={126} rx={4} className={wood} />
          <rect x={-30} y={-122} width={28} height={118} rx={3} className={woodDark} opacity={0.35} />
          <circle cx={-4} cy={-62} r={3} className={metalDark} />
          <circle cx={4} cy={-62} r={3} className={metalDark} />
        </g>
      );

    case "mattress":
      return (
        <g>
          <rect x={-30} y={-124} width={60} height={124} rx={10} className={fabric} />
          <path d="M-30 -96 H30 M-30 -62 H30 M-30 -28 H30" className="stroke-scene-fabric-dark fill-none" strokeWidth={2} opacity={0.6} />
        </g>
      );

    case "desk":
      return (
        <g>
          <rect x={-52} y={-58} width={104} height={9} rx={3} className={wood} />
          <rect x={-48} y={-49} width={10} height={49} className={woodDark} />
          <rect x={38} y={-49} width={10} height={49} className={woodDark} />
          <rect x={-24} y={-46} width={54} height={26} rx={3} className={woodDark} opacity={0.6} />
        </g>
      );

    case "suitcase":
      return (
        <g>
          <rect x={-24} y={-58} width={48} height={58} rx={6} className={fabricDark} />
          <path d="M-24 -34 H24" className="stroke-scene-ink fill-none" strokeWidth={2} opacity={0.35} />
          <rect x={-8} y={-68} width={16} height={12} rx={3} className="fill-none stroke-scene-ink" strokeWidth={3} />
        </g>
      );

    case "medium-box":
      return <Box w={54} h={44} />;
    case "large-box":
      return <Box w={72} h={58} />;

    case "tool-chest":
      return (
        <g>
          <rect x={-36} y={-62} width={72} height={62} rx={4} className="fill-scene-accent" />
          <rect x={-30} y={-54} width={60} height={12} rx={2} className={metal} opacity={0.7} />
          <rect x={-30} y={-36} width={60} height={12} rx={2} className={metal} opacity={0.7} />
          <rect x={-30} y={-18} width={60} height={12} rx={2} className={metal} opacity={0.7} />
        </g>
      );

    case "golf-clubs":
      return (
        <g>
          <rect x={-14} y={-78} width={28} height={78} rx={12} className={fabricDark} />
          <path d="M-8 -78 L-12 -104 M0 -78 L0 -108 M8 -78 L12 -102" className="stroke-scene-ink fill-none" strokeWidth={3} strokeLinecap="round" />
        </g>
      );

    case "camping":
      return (
        <g>
          <path d="M-38 0 L0 -50 L38 0 Z" className="fill-scene-leaf" />
          <path d="M0 -50 L0 0" className="stroke-scene-leaf-dark fill-none" strokeWidth={3} />
          <rect x={-16} y={-64} width={32} height={16} rx={6} className={fabricDark} />
        </g>
      );

    case "christmas":
      return (
        <g>
          <Box w={58} h={40} tape={false} />
          <path d="M-29 -20 H29" className="stroke-scene-leaf fill-none" strokeWidth={5} />
          <path d="M0 -40 V0" className="stroke-scene-leaf fill-none" strokeWidth={5} />
        </g>
      );

    case "sports":
      return (
        <g>
          <rect x={-34} y={-30} width={68} height={30} rx={12} className="fill-scene-screen" />
          <circle cx={22} cy={-40} r={13} className={box} />
          <path d="M22 -53 A13 13 0 0 0 22 -27" className="fill-none stroke-scene-ink" strokeWidth={1.6} opacity={0.5} />
        </g>
      );

    case "vacuum":
      return (
        <g>
          <rect x={-20} y={-34} width={40} height={34} rx={8} className="fill-scene-screen" />
          <path d="M14 -34 C34 -54 26 -78 6 -80" className="fill-none stroke-scene-ink" strokeWidth={4} strokeLinecap="round" />
          <circle cx={-12} cy={-6} r={7} className={ink} />
        </g>
      );

    case "ladder":
      return (
        <g>
          <rect x={-20} y={-150} width={7} height={150} rx={3} className={metalDark} />
          <rect x={13} y={-150} width={7} height={150} rx={3} className={metalDark} />
          {[-132, -104, -76, -48, -20].map((y) => (
            <rect key={y} x={-20} y={y} width={40} height={5} className={metal} />
          ))}
        </g>
      );

    case "bin":
      return (
        <g>
          <path d="M-28 0 L-24 -44 H24 L28 0 Z" className="fill-scene-fabric" />
          <rect x={-30} y={-52} width={60} height={9} rx={3} className={fabricDark} />
        </g>
      );

    case "mower":
      return (
        <g>
          <rect x={-34} y={-36} width={68} height={28} rx={8} className="fill-scene-leaf" />
          <circle cx={-22} cy={-8} r={9} className={ink} />
          <circle cx={22} cy={-8} r={9} className={ink} />
          <path d="M28 -36 L52 -78" className="fill-none stroke-scene-ink" strokeWidth={4} strokeLinecap="round" />
        </g>
      );

    case "stroller":
      return (
        <g>
          <path d="M-26 -46 A26 26 0 0 1 26 -46 L26 -30 H-26 Z" className={fabricDark} />
          <path d="M26 -46 L46 -74" className="fill-none stroke-scene-ink" strokeWidth={4} strokeLinecap="round" />
          <circle cx={-18} cy={-9} r={9} className={ink} />
          <circle cx={20} cy={-9} r={9} className={ink} />
        </g>
      );

    case "chairs":
      return (
        <g>
          <rect x={-22} y={-84} width={18} height={84} rx={5} className={fabricDark} />
          <rect x={2} y={-80} width={18} height={80} rx={5} className={fabric} />
        </g>
      );

    default:
      return null;
  }
}
