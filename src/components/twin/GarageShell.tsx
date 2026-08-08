/**
 * Milestone 3 — the garage rendered.
 *
 * Floor, three walls, ceiling and every fixture the shell describes. Walls are
 * single-sided planes so the camera can sit outside the room without the view
 * being blocked.
 */
import type { } from "@react-three/fiber";

import type { RoomShell, TwinScene } from "@/lib/twin/contracts";

const SURFACE = {
  floor: "#e7e3dc",
  wall: "#f2efe9",
  ceiling: "#dfdbd3",
  fixture: "#b9b2a6",
  metal: "#9aa6b2",
  glass: "#cfe3e0",
  accent: "#10b981",
  navy: "#0d2436",
};

const RAD = Math.PI / 180;

function Feature({
  feature,
  openDoor,
}: {
  feature: RoomShell["features"][number];
  openDoor: boolean;
}) {
  const { position, size, kind } = feature;
  // An up-and-over door left shut would hide the whole room from the outside
  // camera, so it is rolled up into a lintel unless a surface asks otherwise.
  const rolled = openDoor && kind === "roller_door";
  const heightM = rolled ? Math.min(0.28, size.heightM) : size.heightM;
  const baseY = rolled ? Math.max(0, size.heightM - heightM) : 0;
  const colour =
    kind === "roller_door"
      ? SURFACE.metal
      : kind === "window"
        ? SURFACE.glass
        : kind === "light"
          ? "#fdf6e3"
          : kind === "floor_marking"
            ? SURFACE.accent
            : SURFACE.fixture;

  return (
    <mesh
      position={[position.x, position.y + baseY + heightM / 2, position.z]}
      rotation={[0, feature.rotationDeg * RAD, 0]}
      castShadow={kind === "shelving" || kind === "workbench"}
      receiveShadow
    >
      <boxGeometry args={[size.widthM, heightM, size.depthM]} />
      <meshStandardMaterial
        color={colour}
        roughness={kind === "window" ? 0.1 : 0.8}
        metalness={kind === "roller_door" ? 0.6 : 0}
        transparent={kind === "floor_marking" || kind === "window"}
        opacity={kind === "floor_marking" ? 0.16 : kind === "window" ? 0.4 : 1}
        emissive={kind === "light" ? "#fff6de" : "#000000"}
        emissiveIntensity={kind === "light" ? 0.9 : 0}
      />
    </mesh>
  );
}

interface GarageShellProps {
  room: RoomShell;
  walkway?: TwinScene["walkway"];
  showFixtures?: boolean;
  /** Roll the up-and-over door open so the room is visible from outside. */
  openDoor?: boolean;
}

export function GarageShell({ room, walkway, showFixtures = true, openDoor = true }: GarageShellProps) {
  const { widthM: w, depthM: d, heightM: h } = room;
  const features = showFixtures ? room.features : [];

  return (
    <group>
      <mesh position={[w / 2, 0, d / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={SURFACE.floor} roughness={0.95} />
      </mesh>

      <mesh position={[w / 2, h, d / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={SURFACE.ceiling} roughness={1} />
      </mesh>

      {/* Back wall */}
      <mesh position={[w / 2, h / 2, 0]} receiveShadow>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial color={SURFACE.wall} roughness={1} />
      </mesh>
      {/* Left wall */}
      <mesh position={[0, h / 2, d / 2]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[d, h]} />
        <meshStandardMaterial color={SURFACE.wall} roughness={1} />
      </mesh>
      {/* Right wall */}
      <mesh position={[w, h / 2, d / 2]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[d, h]} />
        <meshStandardMaterial color={SURFACE.wall} roughness={1} />
      </mesh>

      {walkway ? (
        <mesh position={[walkway.x + walkway.widthM / 2, 0.004, walkway.z + walkway.depthM / 2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[walkway.widthM, walkway.depthM]} />
          <meshStandardMaterial color={SURFACE.accent} transparent opacity={0.12} />
        </mesh>
      ) : null}

      {features.map((feature) => (
        <Feature key={feature.id} feature={feature} openDoor={openDoor} />
      ))}
    </group>
  );
}
