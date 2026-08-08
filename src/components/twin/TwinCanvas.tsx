/**
 * Milestone 2 + 8 + 20 — the WebGL canvas.
 *
 * Lazy-loaded so Three.js never lands in the initial bundle: a visitor who
 * never opens the twin never downloads the renderer. Lighting and shadow
 * quality step down on small screens to protect mobile frame rates, and the
 * frame loop idles when nothing is moving so a parked hero costs no battery.
 */
import { Canvas } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useState } from "react";

import type { CameraPreset, TwinScene, Vec3 } from "@/lib/twin/contracts";

import { GarageShell } from "./GarageShell";
import { TwinObjectMesh } from "./TwinObjectMesh";

interface TwinCanvasProps {
  scene: TwinScene;
  camera: { preset: CameraPreset; position: Vec3; target: Vec3 };
  highlightId?: string | null | undefined;
  /** Several objects lit at once — used by the analysing/grouping beats. */
  highlightIds?: readonly string[] | undefined;
  onSelect?: ((id: string) => void) | undefined;
  onHover?: ((id: string | null) => void) | undefined;
  onError?: (() => void) | undefined;
}

function useIsSmallScreen(): boolean {
  const [small, setSmall] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 768px)");
    const update = () => setSmall(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return small;
}

export default function TwinCanvas({
  scene,
  camera,
  highlightId,
  highlightIds,
  onSelect,
  onHover,
  onError,
}: TwinCanvasProps) {
  const small = useIsSmallScreen();
  const detail: "high" | "low" = small ? "low" : "high";
  const centre = useMemo(
    () => [scene.room.widthM / 2, 0, scene.room.depthM / 2] as [number, number, number],
    [scene.room.widthM, scene.room.depthM],
  );
  const lit = useMemo(() => new Set(highlightIds ?? []), [highlightIds]);

  /**
   * Frame the whole room. Presets give the direction to look from; the
   * distance is solved from the room's diagonal and the field of view so a
   * 2.4m loft and a 6m garage are both fully in shot with the same preset.
   */
  const fitted = useMemo(() => {
    const { widthM: w, depthM: d, heightM: h } = scene.room;
    // Objects stage themselves outside the opening before they move in, so the
    // fit radius has to cover them too — otherwise the story starts off-screen.
    const reach = scene.objects.reduce((max, object) => {
      const p = object?.transform?.position;
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return max;
      return Math.max(max, Math.hypot(p.x - w / 2, p.z - d / 2));
    }, Math.hypot(w, d) / 2);
    const target = { x: w / 2, y: h * 0.3, z: d / 2 };
    const radius = Math.max(reach, Math.hypot(w, d, h) / 2);
    const distance = (radius / Math.tan((camera.preset.fov * Math.PI) / 360)) * 0.92;
    // A raised three-quarter view: high enough to read the floor plan, low
    // enough to keep the opening and the walls in shot.
    const yaw = Math.PI * 0.14;
    return [
      target.x + Math.sin(yaw) * distance,
      target.y + distance * 0.42,
      target.z + Math.cos(yaw) * distance,
    ] as [number, number, number];
  }, [scene.room, scene.objects, camera]);
  const anyHighlight = Boolean(highlightId) || lit.size > 0;

  return (
    <Canvas
      shadows={!small}
      dpr={small ? [1, 1.5] : [1, 2]}
      gl={{ antialias: !small, powerPreference: "high-performance" }}
      camera={{
        position: fitted,
        fov: camera.preset.fov,
      }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", () => onError?.());
      }}
    >
      <color attach="background" args={["#f7f5f1"]} />
      <fog attach="fog" args={["#f4f1ec", 8, 26]} />

      {/* Warm key light through the opening, cool fill from the back wall. */}
      <hemisphereLight intensity={0.6} groundColor="#d7d2c8" color="#fff6e8" />
      <directionalLight
        position={[centre[0] + 2, scene.room.heightM + 2.4, scene.room.depthM + 3]}
        intensity={1.25}
        color="#fff3e2"
        castShadow={!small}
        shadow-mapSize-width={small ? 512 : 1024}
        shadow-mapSize-height={small ? 512 : 1024}
        shadow-bias={-0.0005}
      />
      <directionalLight position={[-2, scene.room.heightM, -1.5]} intensity={0.35} color="#dfe9ff" />
      <ambientLight intensity={0.32} />

      <GarageShell room={scene.room} walkway={scene.walkway} />

      {!small ? (
        <ContactShadows
          position={[centre[0], 0.002, centre[2]]}
          scale={Math.max(scene.room.widthM, scene.room.depthM) * 1.6}
          opacity={0.42}
          blur={2.4}
          far={2.2}
          resolution={512}
          frames={Infinity}
        />
      ) : null}

      {scene.objects.map((object) => (
        <TwinObjectMesh
          key={object.id}
          object={object}
          detail={detail}
          highlighted={highlightId === object.id || lit.has(object.id)}
          dimmed={anyHighlight && highlightId !== object.id && !lit.has(object.id)}
          {...(onSelect ? { onSelect } : {})}
          {...(onHover ? { onHover } : {})}
        />
      ))}

      <OrbitControls
        makeDefault
        enablePan={camera.preset.orbit}
        enableRotate={camera.preset.orbit}
        enableDamping
        dampingFactor={0.08}
        target={[camera.target.x, camera.target.y, camera.target.z]}
        maxPolarAngle={Math.PI / 2.05}
        minDistance={0.8}
        maxDistance={Math.max(scene.room.depthM, scene.room.widthM) * 3}
      />
    </Canvas>
  );
}
