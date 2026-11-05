"use client";

import { Canvas, ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { Grid, GizmoHelper, GizmoViewport, Line, OrbitControls } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { allSlotOrigins, replicatePathAcrossFixture } from "@/lib/fixture";
import { loadStlGeometry } from "@/lib/stl";
import { useProjectStore } from "@/store/project-store";

function WorkEnvelope() {
  const machine = useProjectStore((s) => s.project.machine);
  const size = useMemo(
    () => new THREE.Vector3(machine.workAreaX, machine.workAreaY, machine.workAreaZ),
    [machine.workAreaX, machine.workAreaY, machine.workAreaZ]
  );
  return (
    <group position={[size.x / 2, size.y / 2, size.z / 2]}>
      <mesh>
        <boxGeometry args={[size.x, size.y, size.z]} />
        <meshBasicMaterial color="#3d7ea6" wireframe transparent opacity={0.25} />
      </mesh>
    </group>
  );
}

function FixturePlate() {
  const fixture = useProjectStore((s) => s.project.fixture);
  return (
    <mesh
      position={[
        fixture.machinePosition.x + fixture.width / 2,
        fixture.machinePosition.y + fixture.depth / 2,
        fixture.machinePosition.z + fixture.height / 2,
      ]}
    >
      <boxGeometry args={[fixture.width, fixture.depth, fixture.height]} />
      <meshStandardMaterial color="#2a3340" metalness={0.2} roughness={0.7} />
    </mesh>
  );
}

function ProductMeshes() {
  const geometryCache = useProjectStore((s) => s.geometryCache);
  const version = useProjectStore((s) => s.stlGeometryVersion);
  const stl = useProjectStore((s) => s.project.stl);
  const fixture = useProjectStore((s) => s.project.fixture);
  const tab = useProjectStore((s) => s.tab);
  const addPoint = useProjectStore((s) => s.addPoint);

  const geometry = useMemo(() => {
    if (!geometryCache) return null;
    try {
      return loadStlGeometry(geometryCache.slice(0)).geometry;
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometryCache, version]);

  const slots = useMemo(() => allSlotOrigins(fixture), [fixture]);
  const transform = stl?.transform;

  if (!geometry || !transform) return null;

  const onPointerDown = (e: ThreeEvent<PointerEvent>, origin: { x: number; y: number; z: number }) => {
    if (tab !== "path") return;
    e.stopPropagation();
    // Convert world hit to local product coordinates
    const local = {
      x: e.point.x - origin.x,
      y: e.point.y - origin.y,
      z: e.point.z - origin.z,
    };
    addPoint(local);
  };

  return (
    <>
      {slots.map((slot) => (
        <group
          key={slot.index}
          position={[slot.origin.x, slot.origin.y, slot.origin.z]}
          rotation={[0, 0, (fixture.orientationDeg * Math.PI) / 180]}
        >
          <mesh
            geometry={geometry}
            scale={transform.scale}
            position={[transform.position.x, transform.position.y, transform.position.z]}
            rotation={[
              (transform.rotation.x * Math.PI) / 180,
              (transform.rotation.y * Math.PI) / 180,
              (transform.rotation.z * Math.PI) / 180,
            ]}
            onPointerDown={(e) => onPointerDown(e, slot.origin)}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial
              color={slot.index === 0 ? "#6f8f7a" : "#4f6b5c"}
              metalness={0.15}
              roughness={0.55}
            />
          </mesh>
        </group>
      ))}
    </>
  );
}

function GluePaths() {
  const project = useProjectStore((s) => s.project);
  const path = project.paths.find((p) => p.id === project.activePathId) ?? project.paths[0];
  if (!path || path.points.length < 2) return null;

  const batches = replicatePathAcrossFixture(path, project.fixture);

  return (
    <>
      {batches.map((batch) => {
        const pts = batch.points.map((p) => new THREE.Vector3(p.x, p.y, p.z + 0.3));
        if (pts.length < 2) return null;
        return (
          <Line
            key={batch.index}
            points={pts}
            color={batch.index === 0 ? "#f0b429" : "#c48a1a"}
            lineWidth={batch.index === 0 ? 3 : 2}
          />
        );
      })}
      {/* Path control points on master product */}
      {path.points.map((pt, i) => {
        const origin = allSlotOrigins(project.fixture)[0]?.origin ?? { x: 0, y: 0, z: 0 };
        const z = path.mode === "planar" ? path.planarZ : pt.position.z;
        return (
          <mesh
            key={pt.id}
            position={[origin.x + pt.position.x, origin.y + pt.position.y, origin.z + z + 0.5]}
          >
            <sphereGeometry args={[1.2, 12, 12]} />
            <meshStandardMaterial color={i === 0 ? "#3ecf8e" : i === path.points.length - 1 ? "#ef6b6b" : "#f0b429"} />
          </mesh>
        );
      })}
    </>
  );
}

function DispensingHead() {
  const nozzle = useProjectStore((s) => s.project.nozzle);
  const sim = useProjectStore((s) => s.sim);
  const pos = sim.position;

  const tipX = pos.x + nozzle.horizontalOffset;
  const tipY = pos.y;
  const tipZ = pos.z - nozzle.nozzleLength * 0.1;

  return (
    <group position={[pos.x, pos.y, pos.z + nozzle.verticalOffset]}>
      {/* Carriage mount */}
      <mesh position={[0, 0, 8]}>
        <boxGeometry args={[18, 12, 8]} />
        <meshStandardMaterial color="#8a93a0" metalness={0.4} roughness={0.4} />
      </mesh>
      {/* Syringe body with horizontal offset */}
      <group
        position={[nozzle.horizontalOffset / 2, 0, 4]}
        rotation={[0, 0, (nozzle.syringeAngleDeg * Math.PI) / 180]}
      >
        <mesh position={[nozzle.horizontalOffset / 2, 0, 6]}>
          <cylinderGeometry args={[4, 4, 28, 16]} />
          <meshStandardMaterial color="#d9e2ec" transparent opacity={0.85} />
        </mesh>
        {/* Nozzle tip */}
        <mesh
          position={[nozzle.horizontalOffset, 0, 6 - nozzle.nozzleLength / 2]}
          rotation={[(nozzle.nozzleAngleDeg * Math.PI) / 180, 0, 0]}
        >
          <coneGeometry args={[1.5, nozzle.nozzleLength, 12]} />
          <meshStandardMaterial color={sim.dispenserOn ? "#ff5a3d" : "#6b7280"} emissive={sim.dispenserOn ? "#ff3b1f" : "#000"} emissiveIntensity={sim.dispenserOn ? 0.6 : 0} />
        </mesh>
      </group>
      {/* Glue bead indicator when ON */}
      {sim.dispenserOn ? (
        <mesh position={[nozzle.horizontalOffset, 0, -2]}>
          <sphereGeometry args={[1.4, 10, 10]} />
          <meshStandardMaterial color="#f5c542" emissive="#f0a020" emissiveIntensity={0.5} />
        </mesh>
      ) : null}
      <AxesHelperMini />
      {/* Invisible reference for tip */}
      <mesh position={[tipX - pos.x, tipY - pos.y, tipZ - pos.z]} visible={false}>
        <sphereGeometry args={[0.1]} />
      </mesh>
    </group>
  );
}

function AxesHelperMini() {
  return (
    <group>
      <Line points={[new THREE.Vector3(0, 0, 0), new THREE.Vector3(20, 0, 0)]} color="#ef4444" lineWidth={2} />
      <Line points={[new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 20, 0)]} color="#22c55e" lineWidth={2} />
      <Line points={[new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 20)]} color="#3b82f6" lineWidth={2} />
    </group>
  );
}

function SimClock() {
  const tickSim = useProjectStore((s) => s.tickSim);
  useFrame((_, delta) => {
    tickSim(delta * 1000);
  });
  return null;
}

function CameraRig() {
  const machine = useProjectStore((s) => s.project.machine);
  const { camera } = useThree();
  const primed = useRef(false);
  useEffect(() => {
    if (primed.current) return;
    camera.position.set(machine.workAreaX * 0.9, -machine.workAreaY * 0.9, machine.workAreaZ * 3.2);
    camera.up.set(0, 0, 1);
    camera.lookAt(machine.workAreaX / 2, machine.workAreaY / 2, 0);
    primed.current = true;
  }, [camera, machine.workAreaX, machine.workAreaY, machine.workAreaZ]);
  return null;
}

function SceneContent() {
  return (
    <>
      <color attach="background" args={["#0d1117"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[80, -40, 120]} intensity={1.1} castShadow />
      <directionalLight position={[-60, 80, 60]} intensity={0.35} />
      <Grid
        infiniteGrid
        fadeDistance={280}
        sectionSize={50}
        cellSize={10}
        sectionColor="#2a3544"
        cellColor="#1b2430"
        position={[0, 0, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      />
      <axesHelper args={[40]} />
      <WorkEnvelope />
      <FixturePlate />
      <ProductMeshes />
      <GluePaths />
      <DispensingHead />
      <SimClock />
      <CameraRig />
      <OrbitControls makeDefault target={[120, 80, 0]} maxPolarAngle={Math.PI * 0.95} />
      <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
        <GizmoViewport axisColors={["#ef4444", "#22c55e", "#3b82f6"]} labelColor="white" />
      </GizmoHelper>
    </>
  );
}

export function DispensingScene() {
  return (
    <div className="relative h-full w-full">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: 45, near: 0.1, far: 2000, position: [220, -180, 160], up: [0, 0, 1] }}
        gl={{ antialias: true }}
      >
        <Suspense fallback={null}>
          <SceneContent />
        </Suspense>
      </Canvas>
      <ViewportHud />
    </div>
  );
}

function ViewportHud() {
  const sim = useProjectStore((s) => s.sim);
  const stl = useProjectStore((s) => s.project.stl);
  const pathLen = useProjectStore((s) => s.getPathLength());
  const fixture = useProjectStore((s) => s.project.fixture);
  const tab = useProjectStore((s) => s.tab);

  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute left-3 top-3 rounded border border-[var(--border)] bg-[var(--panel)]/90 px-3 py-2 text-[11px] backdrop-blur">
        <div className="font-medium text-[var(--text)]">Viewport</div>
        <div className="mt-1 text-[var(--muted)]">
          {stl
            ? `${stl.name} · ${stl.dimensions.x.toFixed(1)}×${stl.dimensions.y.toFixed(1)}×${stl.dimensions.z.toFixed(1)} mm`
            : "No STL — import your own workpiece (Model → Import STL)"}
        </div>
        <div className="text-[var(--muted)]">
          Fixture {fixture.rows}×{fixture.columns} · Path {pathLen.toFixed(1)} mm
        </div>
        {tab === "path" && stl ? (
          <div className="mt-1 text-[var(--accent)]">Click a product surface to add path points</div>
        ) : null}
        {tab === "path" && !stl ? (
          <div className="mt-1 text-[var(--warn-text)]">Import an STL before picking path points on a product</div>
        ) : null}
      </div>
      <div className="absolute right-3 top-3 rounded border border-[var(--border)] bg-[var(--panel)]/90 px-3 py-2 text-[11px] backdrop-blur">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              sim.dispenserOn ? "bg-[var(--danger)] shadow-[0_0_8px_var(--danger)]" : "bg-[var(--muted-2)]"
            }`}
          />
          <span className="font-semibold tracking-wide">
            Dispenser {sim.dispenserOn ? "ON" : "OFF"}
          </span>
        </div>
        <div className="mt-1 font-mono text-[var(--muted)]">
          X{sim.position.x.toFixed(1)} Y{sim.position.y.toFixed(1)} Z{sim.position.z.toFixed(1)}
        </div>
        <div className="text-[var(--muted)]">Product {sim.productIndex + 1}</div>
      </div>
    </div>
  );
}
