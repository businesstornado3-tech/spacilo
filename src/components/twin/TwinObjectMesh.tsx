/**
 * Milestone 2 + 4 + Phase 6 Part 2 Milestone 3 — mesh rendering for a twin body.
 *
 * Reads a recipe from the object library and emits proportioned primitives.
 * An unknown item still renders (the library falls back to a generic box), so
 * a new catalogue entry can never break the scene.
 *
 * Motion is interpolated here rather than in the engine. The engine snaps to
 * discrete, reasoned states; this component eases towards whichever state is
 * current with a weight-aware time constant, so a heavy item lands slowly and
 * a light one arrives quickly. Nothing teleports, and no movement exists that
 * the engine did not decide.
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";

import type { TwinObject as TwinObjectModel } from "@/lib/twin/contracts";
import { modelFor, partsForLod, type MaterialRole } from "@/lib/twin/library";

/** Palette roles resolved once. Kept in sync with the Spacilo brand tokens. */
export const TWIN_MATERIALS: Record<MaterialRole, { color: string; roughness: number; metalness: number }> = {
  card: { color: "#d9c7a7", roughness: 0.9, metalness: 0 },
  cardboard: { color: "#c8ab7d", roughness: 0.95, metalness: 0 },
  fabric: { color: "#8b93a5", roughness: 1, metalness: 0 },
  metal: { color: "#9aa6b2", roughness: 0.35, metalness: 0.8 },
  wood: { color: "#a9784f", roughness: 0.7, metalness: 0 },
  glass: { color: "#bcd9d6", roughness: 0.1, metalness: 0.2 },
  screen: { color: "#1c2432", roughness: 0.25, metalness: 0.4 },
  rubber: { color: "#2d3340", roughness: 1, metalness: 0 },
  accent: { color: "#10b981", roughness: 0.5, metalness: 0.1 },
  plastic: { color: "#e2e8ec", roughness: 0.6, metalness: 0 },
};

interface TwinObjectProps {
  object: TwinObjectModel;
  detail?: "high" | "low";
  highlighted?: boolean;
  dimmed?: boolean;
  onSelect?: ((id: string) => void) | undefined;
  onHover?: ((id: string | null) => void) | undefined;
}

const RAD = Math.PI / 180;

/** Heavier things take longer to settle. Seconds to close most of the gap. */
const SETTLE_SECONDS = { heavy: 0.62, medium: 0.46, light: 0.34 } as const;

/** Frame-rate independent exponential damping. */
function damp(current: number, target: number, lambda: number, delta: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * delta));
}

/** Signed smallest rotation from `from` to `to`, in radians. */
function shortestDelta(from: number, to: number): number {
  const twoPi = Math.PI * 2;
  return (((to - from + Math.PI) % twoPi) + twoPi) % twoPi - Math.PI;
}

export function TwinObjectMesh({
  object,
  detail = "high",
  highlighted = false,
  dimmed = false,
  onSelect,
  onHover,
}: TwinObjectProps) {
  const parts = useMemo(
    () => partsForLod(modelFor(object.itemId, object.icon), detail),
    [object.itemId, object.icon, detail],
  );

  const { widthM, heightM, depthM } = object.size;
  const { position, rotationDeg } = object.transform;

  const group = useRef<Group>(null);
  const started = useRef(false);
  const lambda = 1 / SETTLE_SECONDS[object.weight ?? "medium"];

  useFrame((_, delta) => {
    const node = group.current;
    if (!node) return;
    const step = Math.min(delta, 0.05);
    const targetRot = rotationDeg * RAD;

    if (!started.current) {
      node.position.set(position.x, position.y, position.z);
      node.rotation.y = targetRot;
      started.current = true;
      return;
    }

    node.position.x = damp(node.position.x, position.x, lambda, step);
    node.position.z = damp(node.position.z, position.z, lambda, step);
    // Vertical motion is a touch snappier so items never appear to float.
    node.position.y = damp(node.position.y, position.y, lambda * 1.4, step);
    const unwrapped = node.rotation.y + shortestDelta(node.rotation.y, targetRot);
    node.rotation.y = damp(node.rotation.y, unwrapped, lambda, step);
  });

  const handleClick = onSelect
    ? (event: { stopPropagation: () => void }) => {
        event.stopPropagation();
        onSelect(object.id);
      }
    : undefined;

  const hoverProps = onHover
    ? {
        onPointerOver: (event: { stopPropagation: () => void }) => {
          event.stopPropagation();
          onHover(object.id);
        },
        onPointerOut: () => onHover(null),
      }
    : {};

  return (
    <group
      ref={group}
      position={[position.x, position.y, position.z]}
      rotation={[0, rotationDeg * RAD, 0]}
      {...(handleClick ? { onClick: handleClick } : {})}
      {...hoverProps}
    >
      {parts.map((part, index) => {
        const material = TWIN_MATERIALS[part.material];
        const size: [number, number, number] = [
          Math.max(0.01, part.size[0] * widthM),
          Math.max(0.01, part.size[1] * heightM),
          Math.max(0.01, part.size[2] * depthM),
        ];
        const at: [number, number, number] = [
          (part.at[0] - 0.5) * widthM,
          part.at[1] * heightM,
          (part.at[2] - 0.5) * depthM,
        ];
        return (
          <mesh
            key={`${object.id}-${index}`}
            position={at}
            rotation={[0, 0, (part.tiltDeg ?? 0) * RAD]}
            castShadow
            receiveShadow
          >
            {part.shape === "cylinder" ? (
              <cylinderGeometry args={[size[0] / 2, size[0] / 2, size[1], detail === "high" ? 20 : 8]} />
            ) : (
              <boxGeometry args={size} />
            )}
            <meshStandardMaterial
              color={highlighted ? TWIN_MATERIALS.accent.color : material.color}
              roughness={material.roughness}
              metalness={material.metalness}
              emissive={highlighted ? TWIN_MATERIALS.accent.color : "#000000"}
              emissiveIntensity={highlighted ? 0.25 : 0}
              transparent={dimmed}
              opacity={dimmed ? 0.38 : 1}
            />
          </mesh>
        );
      })}
    </group>
  );
}
