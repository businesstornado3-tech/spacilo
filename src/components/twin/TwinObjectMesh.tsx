/**
 * Milestone 2 + 4 — mesh rendering for a twin body.
 *
 * Reads a recipe from the object library and emits proportioned primitives.
 * An unknown item still renders (the library falls back to a generic box), so
 * a new catalogue entry can never break the scene.
 */
import { useMemo } from "react";
import type { } from "@react-three/fiber";

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
}

const RAD = Math.PI / 180;

export function TwinObjectMesh({
  object,
  detail = "high",
  highlighted = false,
  dimmed = false,
  onSelect,
}: TwinObjectProps) {
  const parts = useMemo(
    () => partsForLod(modelFor(object.itemId, object.icon), detail),
    [object.itemId, object.icon, detail],
  );

  const { widthM, heightM, depthM } = object.size;
  const { position, rotationDeg } = object.transform;

  const handleClick = onSelect
    ? (event: { stopPropagation: () => void }) => {
        event.stopPropagation();
        onSelect(object.id);
      }
    : undefined;

  return (
    <group
      position={[position.x, position.y, position.z]}
      rotation={[0, rotationDeg * RAD, 0]}
      {...(handleClick ? { onClick: handleClick } : {})}
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
              transparent={dimmed}
              opacity={dimmed ? 0.35 : 1}
            />
          </mesh>
        );
      })}
    </group>
  );
}
