/**
 * Milestone 2 + 8 + 20 — the WebGL canvas.
 *
 * Lazy-loaded so Three.js never lands in the initial bundle: a visitor who
 * never opens the twin never downloads the renderer. Lighting and shadow
 * quality step down on small screens to protect mobile frame rates.
 */
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useState } from "react";

import type { CameraPreset, TwinScene, Vec3 } from "@/lib/twin/contracts";

import { GarageShell } from "./GarageShell";
import { TwinObjectMesh } from "./TwinObjectMesh";

interface TwinCanvasProps {
  scene: TwinScene;
  camera: { preset: CameraPreset; position: Vec3; target: Vec3 };
  highlightId?: string | null | undefined;
  onSelect?: ((id: string) => void) | undefined;
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
  onSelect,
  onError,
}: TwinCanvasProps) {
  const small = useIsSmallScreen();
  const detail: "high" | "low" = small ? "low" : "high";
  const centre = useMemo(
    () => [scene.room.widthM / 2, 0, scene.room.depthM / 2] as [number, number, number],
    [scene.room.widthM, scene.room.depthM],
  );

  return (
    <Canvas
      shadows={!small}
      dpr={small ? [1, 1.5] : [1, 2]}
      camera={{
        position: [camera.position.x, camera.position.y, camera.position.z],
        fov: camera.preset.fov,
      }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", () => onError?.());
      }}
    >
      <color attach="background" args={["#f7f5f1"]} />
      <hemisphereLight intensity={0.65} groundColor="#d7d2c8" />
      <directionalLight
        position={[centre[0] + 2, scene.room.heightM + 2, centre[2] + 2.5]}
        intensity={1.15}
        castShadow={!small}
        shadow-mapSize-width={small ? 512 : 1024}
        shadow-mapSize-height={small ? 512 : 1024}
      />
      <ambientLight intensity={0.35} />

      <GarageShell room={scene.room} walkway={scene.walkway} />

      {scene.objects.map((object) => (
        <TwinObjectMesh
          key={object.id}
          object={object}
          detail={detail}
          highlighted={highlightId === object.id}
          dimmed={Boolean(highlightId) && highlightId !== object.id}
          {...(onSelect ? { onSelect } : {})}
        />
      ))}

      <OrbitControls
        makeDefault
        enablePan={camera.preset.orbit}
        enableRotate={camera.preset.orbit}
        target={[camera.target.x, camera.target.y, camera.target.z]}
        maxPolarAngle={Math.PI / 2.05}
        minDistance={0.8}
        maxDistance={Math.max(scene.room.depthM, scene.room.widthM) * 3}
      />
    </Canvas>
  );
}
