/**
 * Milestone 11 — the 2D plan fallback.
 *
 * The same scene, drawn top-down as SVG. No WebGL, no dependencies, works on
 * every device and in print. It is the accessibility path as much as the
 * low-power path.
 */
import type { TwinScene } from "@/lib/twin/contracts";

interface TwinPlanFallbackProps {
  scene: TwinScene;
  highlightId?: string | null | undefined;
  onSelect?: ((id: string) => void) | undefined;
}

export function TwinPlanFallback({ scene, highlightId, onSelect }: TwinPlanFallbackProps) {
  const { room, objects, walkway } = scene;
  const pad = 0.3;
  const viewW = room.widthM + pad * 2;
  const viewD = room.depthM + pad * 2;

  return (
    <svg
      viewBox={`0 0 ${viewW} ${viewD}`}
      className="h-full w-full"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <rect
        x={pad}
        y={pad}
        width={room.widthM}
        height={room.depthM}
        className="fill-background stroke-border"
        strokeWidth={0.03}
      />

      {walkway ? (
        <rect
          x={pad + walkway.x}
          y={pad + walkway.z}
          width={walkway.widthM}
          height={walkway.depthM}
          className="fill-primary/10"
        />
      ) : null}

      {room.features
        .filter((feature) => feature.kind === "shelving" || feature.kind === "workbench")
        .map((feature) => (
          <rect
            key={feature.id}
            x={pad + feature.position.x - feature.size.widthM / 2}
            y={pad + feature.position.z - feature.size.depthM / 2}
            width={feature.size.widthM}
            height={feature.size.depthM}
            className="fill-muted stroke-border"
            strokeWidth={0.02}
          />
        ))}

      {objects.map((object) => {
        const turned = object.transform.rotationDeg % 180 !== 0;
        const w = turned ? object.size.depthM : object.size.widthM;
        const d = turned ? object.size.widthM : object.size.depthM;
        const selected = highlightId === object.id;
        return (
          <g key={object.id} onClick={onSelect ? () => onSelect(object.id) : undefined}>
            <rect
              x={pad + object.transform.position.x - w / 2}
              y={pad + object.transform.position.z - d / 2}
              width={w}
              height={d}
              rx={0.04}
              className={
                selected
                  ? "fill-primary/70 stroke-primary"
                  : object.level > 0
                    ? "fill-accent/60 stroke-border"
                    : "fill-secondary stroke-border"
              }
              strokeWidth={0.02}
            />
          </g>
        );
      })}

      {/* Opening, drawn on the front edge. */}
      <line
        x1={pad + room.widthM / 2 - room.doorWidthM / 2}
        y1={pad + room.depthM}
        x2={pad + room.widthM / 2 + room.doorWidthM / 2}
        y2={pad + room.depthM}
        className="stroke-primary"
        strokeWidth={0.06}
        strokeLinecap="round"
      />
    </svg>
  );
}
