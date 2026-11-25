"use client";

import { Canvas, ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { Grid, GizmoHelper, Line, OrbitControls, Text } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { modelLocalToWorld, pathPointsWorld, toolpathSegmentsFromFrames } from "@/lib/models";
import { loadStlGeometry } from "@/lib/stl";
import { useProjectStore } from "@/store/project-store";
import type { StlAsset } from "@/lib/types";

type MeasureHover = { x: number; y: number; clientX: number; clientY: number };

type ViewRotateApi = {
  rotateBy: (degrees: number) => void;
  /** Look straight at the work area from this axis. `quarterTurns` rolls that view in 90° steps. */
  frameAxis: (axis: THREE.Vector3, quarterTurns?: number) => void;
  /** Look straight down at the nozzle park point (home XY, park Z). */
  framePark: () => void;
};

type OrbitControlsLike = { target: THREE.Vector3; update: () => void };

type ViewFrame = {
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromUp: THREE.Vector3;
  toUp: THREE.Vector3;
  target: THREE.Vector3;
  t: number;
};

function workAreaCenter(machine: { workAreaX: number; workAreaY: number; workAreaZ: number }) {
  return new THREE.Vector3(machine.workAreaX / 2, machine.workAreaY / 2, machine.workAreaZ / 2);
}

function viewUpFor(dir: THREE.Vector3) {
  const worldUp = new THREE.Vector3(0, 0, 1);
  if (dir.z > 0.9) return new THREE.Vector3(0, -1, 0);
  if (dir.z < -0.9) return new THREE.Vector3(0, 1, 0);
  return worldUp.clone().addScaledVector(dir, -worldUp.dot(dir)).normalize();
}

/** Camera sits exactly on the axis so the target is dead center. Top view up puts the back edge at the bottom of the screen. */
function axisViewPlacement(dir: THREE.Vector3, distance: number, quarterTurns: number) {
  const steps = ((quarterTurns % 4) + 4) % 4;
  const up = viewUpFor(dir);
  if (steps !== 0) {
    const rollAxis = Math.abs(dir.z) > 0.9 ? new THREE.Vector3(0, 0, Math.sign(dir.z) || 1) : dir;
    up.applyAxisAngle(rollAxis, steps * (Math.PI / 2));
  }
  return { offset: dir.clone().multiplyScalar(distance), up };
}

/**
 * A straight-down camera locks OrbitControls. Nudge off the pole only when a drag starts,
 * keeping the same screen-up so the framed view stays centered until then.
 */
function releasePoleLock(camera: THREE.Camera, orbit: OrbitControlsLike) {
  const offset = camera.position.clone().sub(orbit.target);
  const dist = offset.length();
  if (dist < 1e-6) return;
  const dirZ = offset.z / dist;
  if (Math.abs(dirZ) < 0.98) return;
  const screenUpXY = camera.up.clone();
  screenUpXY.z = 0;
  if (screenUpXY.lengthSq() < 1e-8) screenUpXY.set(0, -1, 0);
  screenUpXY.normalize();
  const sign = dirZ >= 0 ? 1 : -1;
  const flat = screenUpXY.multiplyScalar(sign < 0 ? 1 : -1);
  const tilt = 0.05;
  const nudged = new THREE.Vector3(0, 0, sign * Math.cos(tilt))
    .addScaledVector(flat, Math.sin(tilt))
    .multiplyScalar(dist);
  camera.up.set(0, 0, 1);
  camera.position.copy(orbit.target).add(nudged);
  camera.lookAt(orbit.target);
  orbit.update();
}

function fitDistance(
  camera: THREE.Camera,
  dir: THREE.Vector3,
  up: THREE.Vector3,
  machine: { workAreaX: number; workAreaY: number; workAreaZ: number }
) {
  const persp = camera as THREE.PerspectiveCamera;
  const vFov = THREE.MathUtils.degToRad(persp.fov || 45);
  const aspect = persp.aspect > 0 ? persp.aspect : 1;
  const tanV = Math.tan(vFov / 2);
  const tanH = tanV * aspect;
  // Match Three.js lookAt: camera sits along +dir from the target.
  const right = new THREE.Vector3().crossVectors(up, dir).normalize();
  const screenUp = new THREE.Vector3().crossVectors(dir, right).normalize();
  const center = workAreaCenter(machine);
  const corner = new THREE.Vector3();
  let distance = 40;
  for (const x of [0, machine.workAreaX]) {
    for (const y of [0, machine.workAreaY]) {
      for (const z of [0, machine.workAreaZ]) {
        corner.set(x, y, z).sub(center);
        const along = corner.dot(dir);
        const sx = Math.abs(corner.dot(right));
        const sy = Math.abs(corner.dot(screenUp));
        distance = Math.max(distance, along + sx / tanH, along + sy / tanV);
      }
    }
  }
  // Extra room so the outline is not flush with the canvas edge.
  return distance * 1.15;
}

const VIEW_ROTATE_STEP_DEG = 22.5;

function rulerStep(length: number): number {
  if (length <= 80) return 10;
  if (length <= 160) return 20;
  if (length <= 320) return 50;
  return 100;
}

function rulerValues(length: number, step: number): number[] {
  const values: number[] = [];
  for (let v = 0; v <= length + 1e-6; v += step) {
    values.push(Math.round(v));
  }
  const end = Math.round(length);
  if (values[values.length - 1] !== end) values.push(end);
  return values;
}

function WorkEnvelope() {
  const machine = useProjectStore((s) => s.project.machine);
  const xLen = machine.workAreaX;
  const yLen = machine.workAreaY;
  const zLen = machine.workAreaZ;

  const xStep = rulerStep(xLen);
  const yStep = rulerStep(yLen);
  const zStep = rulerStep(zLen);
  const xTicks = useMemo(() => rulerValues(xLen, xStep), [xLen, xStep]);
  const yTicks = useMemo(() => rulerValues(yLen, yStep), [yLen, yStep]);
  const zTicks = useMemo(() => rulerValues(zLen, zStep), [zLen, zStep]);

  const tick = 4;
  const labelLift = 8;

  return (
    <group>
      {/* Work volume outline — edges only, no face diagonals */}
      <Line
        points={[
          [0, 0, 0],
          [xLen, 0, 0],
          [xLen, yLen, 0],
          [0, yLen, 0],
          [0, 0, 0],
        ]}
        color="#5b8fb8"
        lineWidth={1.5}
      />
      <Line
        points={[
          [0, 0, zLen],
          [xLen, 0, zLen],
          [xLen, yLen, zLen],
          [0, yLen, zLen],
          [0, 0, zLen],
        ]}
        color="#5b8fb8"
        lineWidth={1.25}
        transparent
        opacity={0.55}
      />
      <Line points={[[0, 0, 0], [0, 0, zLen]]} color="#5b8fb8" lineWidth={1.25} transparent opacity={0.55} />
      <Line points={[[xLen, 0, 0], [xLen, 0, zLen]]} color="#5b8fb8" lineWidth={1.25} transparent opacity={0.55} />
      <Line
        points={[
          [xLen, yLen, 0],
          [xLen, yLen, zLen],
        ]}
        color="#5b8fb8"
        lineWidth={1.25}
        transparent
        opacity={0.55}
      />
      <Line
        points={[
          [0, yLen, 0],
          [0, yLen, zLen],
        ]}
        color="#5b8fb8"
        lineWidth={1.25}
        transparent
        opacity={0.55}
      />

      {/* X ruler along Y=0 edge */}
      {xTicks.map((v) => (
        <group key={`x-${v}`}>
          <Line
            points={[
              [v, 0, 0],
              [v, -tick, 0],
            ]}
            color="#ef4444"
            lineWidth={1.5}
          />
          <Text
            position={[v, -tick - labelLift, 0]}
            fontSize={5}
            color="#f87171"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.3}
            outlineColor="#0d1117"
          >
            {`${v}`}
          </Text>
        </group>
      ))}
      <Text
        position={[xLen / 2, -tick - labelLift * 2.2, 0]}
        fontSize={6}
        color="#f87171"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.35}
        outlineColor="#0d1117"
      >
        X mm
      </Text>

      {/* Y ruler along X=0 edge */}
      {yTicks.map((v) => (
        <group key={`y-${v}`}>
          <Line
            points={[
              [0, v, 0],
              [-tick, v, 0],
            ]}
            color="#22c55e"
            lineWidth={1.5}
          />
          <Text
            position={[-tick - labelLift, v, 0]}
            fontSize={5}
            color="#4ade80"
            anchorX="center"
            anchorY="middle"
            rotation={[0, 0, Math.PI / 2]}
            outlineWidth={0.3}
            outlineColor="#0d1117"
          >
            {`${v}`}
          </Text>
        </group>
      ))}
      <Text
        position={[-tick - labelLift * 2.2, yLen / 2, 0]}
        fontSize={6}
        color="#4ade80"
        anchorX="center"
        anchorY="middle"
        rotation={[0, 0, Math.PI / 2]}
        outlineWidth={0.35}
        outlineColor="#0d1117"
      >
        Y mm
      </Text>

      {/* Z ruler at origin corner */}
      {zTicks.map((v) => (
        <group key={`z-${v}`}>
          <Line
            points={[
              [0, 0, v],
              [-tick, -tick, v],
            ]}
            color="#3b82f6"
            lineWidth={1.5}
          />
          <Text
            position={[-tick - labelLift, -tick - labelLift, v]}
            fontSize={5}
            color="#60a5fa"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.3}
            outlineColor="#0d1117"
          >
            {`${v}`}
          </Text>
        </group>
      ))}
      <Text
        position={[-tick - labelLift * 2.4, -tick - labelLift * 2.4, zLen / 2]}
        fontSize={6}
        color="#60a5fa"
        anchorX="center"
        anchorY="middle"
        rotation={[0, 0, Math.PI / 2]}
        outlineWidth={0.35}
        outlineColor="#0d1117"
      >
        Z mm
      </Text>

      {/* Machine side labels — match default camera (view from −Y): Y=0 front, +Y back, X=0 left, +X right */}
      <Text
        position={[xLen / 2, -tick - labelLift * 4.2, 1]}
        fontSize={8}
        color="#e2e8f0"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.45}
        outlineColor="#0d1117"
      >
        FRONT
      </Text>
      <Text
        position={[xLen / 2, yLen + tick + labelLift * 3.2, 1]}
        fontSize={8}
        color="#e2e8f0"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.45}
        outlineColor="#0d1117"
      >
        BACK
      </Text>
      <Text
        position={[-tick - labelLift * 4.2, yLen / 2, 1]}
        fontSize={8}
        color="#e2e8f0"
        anchorX="center"
        anchorY="middle"
        rotation={[0, 0, Math.PI / 2]}
        outlineWidth={0.45}
        outlineColor="#0d1117"
      >
        LEFT
      </Text>
      <Text
        position={[xLen + tick + labelLift * 3.2, yLen / 2, 1]}
        fontSize={8}
        color="#e2e8f0"
        anchorX="center"
        anchorY="middle"
        rotation={[0, 0, Math.PI / 2]}
        outlineWidth={0.45}
        outlineColor="#0d1117"
      >
        RIGHT
      </Text>
    </group>
  );
}

function worldHitToLocal(point: THREE.Vector3, t: StlAsset["transform"]): { x: number; y: number; z: number } {
  const localApprox = {
    x: (point.x - t.position.x) / (t.scale || 1),
    y: (point.y - t.position.y) / (t.scale || 1),
    z: (point.z - t.position.z) / (t.scale || 1),
  };
  const rx = (-t.rotation.x * Math.PI) / 180;
  const ry = (-t.rotation.y * Math.PI) / 180;
  const rz = (-t.rotation.z * Math.PI) / 180;
  let { x, y, z } = localApprox;
  {
    const x1 = x * Math.cos(rz) + y * Math.sin(rz);
    const y1 = -x * Math.sin(rz) + y * Math.cos(rz);
    x = x1;
    y = y1;
  }
  {
    const x1 = x * Math.cos(ry) - z * Math.sin(ry);
    const z1 = x * Math.sin(ry) + z * Math.cos(ry);
    x = x1;
    z = z1;
  }
  {
    const y1 = y * Math.cos(rx) + z * Math.sin(rx);
    const z1 = -y * Math.sin(rx) + z * Math.cos(rx);
    y = y1;
    z = z1;
  }
  return { x, y, z };
}

function ModelMesh({
  model,
  buffer,
  active,
  measureMode,
}: {
  model: StlAsset;
  buffer: ArrayBuffer;
  active: boolean;
  measureMode: boolean;
}) {
  const tab = useProjectStore((s) => s.tab);
  const addPoint = useProjectStore((s) => s.addPoint);
  const addSafePoint = useProjectStore((s) => s.addSafePoint);
  const placingSafePoint = useProjectStore((s) => s.placingSafePoint);
  const setActiveModel = useProjectStore((s) => s.setActiveModel);
  const setModelPositionXY = useProjectStore((s) => s.setModelPositionXY);
  const beginTransientEdit = useProjectStore((s) => s.beginTransientEdit);
  const endTransientEdit = useProjectStore((s) => s.endTransientEdit);
  const refreshIssues = useProjectStore((s) => s.refreshIssues);
  const version = useProjectStore((s) => s.stlGeometryVersion);
  const { camera, gl, controls } = useThree();

  const drag = useRef<{
    plane: THREE.Plane;
    offsetX: number;
    offsetY: number;
    startClientX: number;
    startClientY: number;
    moved: boolean;
    historyStarted: boolean;
    pointerId: number;
    button: number;
    pickWorld: THREE.Vector3;
    transformAtStart: StlAsset["transform"];
  } | null>(null);

  const geometry = useMemo(() => {
    try {
      return loadStlGeometry(buffer.slice(0)).geometry;
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buffer, version, model.id]);

  const pathMode = tab === "path";

  useEffect(() => {
    const onMove = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d || ev.pointerId !== d.pointerId) return;
      if (Math.hypot(ev.clientX - d.startClientX, ev.clientY - d.startClientY) > 5) {
        if (!d.moved) {
          d.moved = true;
          // Path mode: clicks place points only — never drag the model
          if (!pathMode && !d.historyStarted) {
            d.historyStarted = true;
            beginTransientEdit();
          }
        }
      }
      if (!d.moved || pathMode) return;

      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, camera);
      const hit = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(d.plane, hit)) return;
      setModelPositionXY(model.id, hit.x + d.offsetX, hit.y + d.offsetY);
    };

    const onUp = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d || ev.pointerId !== d.pointerId) return;
      const hadHistory = d.historyStarted;
      drag.current = null;
      if (controls) (controls as unknown as { enabled: boolean }).enabled = true;
      gl.domElement.style.cursor = "auto";
      if (hadHistory) endTransientEdit();
      refreshIssues();

      // Path mode: left-click only places a point (right-click leaves orbit free)
      if (pathMode && placingSafePoint && d.button === 0) {
        addSafePoint(d.pickWorld.x, d.pickWorld.y);
      } else if (pathMode && model.role === "glue" && d.button === 0) {
        addPoint(worldHitToLocal(d.pickWorld, d.transformAtStart));
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [
    addPoint,
    addSafePoint,
    beginTransientEdit,
    camera,
    controls,
    endTransientEdit,
    gl.domElement,
    model.id,
    model.role,
    pathMode,
    placingSafePoint,
    refreshIssues,
    setModelPositionXY,
  ]);

  if (!geometry) return null;

  const t = model.transform;
  const isGlue = model.role === "glue";
  const color = isGlue ? (active ? "#6f8f7a" : "#4f6b5c") : active ? "#8b7355" : "#6b5d4d";

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    // Left button only — right/middle clicks pass through for OrbitControls
    if (e.button !== 0) return;

    e.stopPropagation();
    setActiveModel(model.id);

    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -t.position.z);
    const hit = new THREE.Vector3();
    if (!e.ray.intersectPlane(plane, hit)) {
      hit.copy(e.point);
      hit.z = t.position.z;
    }

    drag.current = {
      plane,
      offsetX: t.position.x - hit.x,
      offsetY: t.position.y - hit.y,
      startClientX: e.clientX,
      startClientY: e.clientY,
      moved: false,
      historyStarted: false,
      pointerId: e.pointerId,
      button: e.button,
      pickWorld: e.point.clone(),
      transformAtStart: {
        ...t,
        position: { ...t.position },
        rotation: { ...t.rotation },
      },
    };

    if (controls) (controls as unknown as { enabled: boolean }).enabled = false;
    if (!pathMode) gl.domElement.style.cursor = "grabbing";
  };

  return (
    <mesh
      geometry={geometry}
      scale={t.scale}
      position={[t.position.x, t.position.y, t.position.z]}
      rotation={[
        (t.rotation.x * Math.PI) / 180,
        (t.rotation.y * Math.PI) / 180,
        (t.rotation.z * Math.PI) / 180,
      ]}
      onPointerDown={measureMode ? undefined : onPointerDown}
      onPointerOver={() => {
        if (measureMode || drag.current || pathMode) return;
        gl.domElement.style.cursor = "grab";
      }}
      onPointerOut={() => {
        if (measureMode || drag.current) return;
        gl.domElement.style.cursor = "auto";
      }}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial
        color={color}
        metalness={isGlue ? 0.15 : 0.05}
        roughness={isGlue ? 0.55 : 0.85}
        transparent={!isGlue}
        opacity={isGlue ? 1 : 0.75}
      />
    </mesh>
  );
}

function ProductMeshes({ measureMode }: { measureMode: boolean }) {
  const models = useProjectStore((s) => s.project.models);
  const activeModelId = useProjectStore((s) => s.project.activeModelId);
  const geometryCache = useProjectStore((s) => s.geometryCache);

  return (
    <>
      {models.map((model) => {
        const buffer = geometryCache[model.id];
        if (!buffer) return null;
        return (
          <ModelMesh
            key={model.id}
            model={model}
            buffer={buffer}
            active={model.id === activeModelId}
            measureMode={measureMode}
          />
        );
      })}
    </>
  );
}

function SafePointPicker() {
  const placing = useProjectStore((s) => s.placingSafePoint);
  const tab = useProjectStore((s) => s.tab);
  const travelX = useProjectStore((s) => s.project.machine.travelX);
  const travelY = useProjectStore((s) => s.project.machine.travelY);
  const addSafePoint = useProjectStore((s) => s.addSafePoint);
  const controls = useThree((s) => s.controls);
  const start = useRef<{ x: number; y: number; id: number; worldX: number; worldY: number } | null>(null);

  useEffect(() => {
    if (!placing || tab !== "path") return;
    const onUp = (ev: PointerEvent) => {
      if (controls) (controls as unknown as { enabled: boolean }).enabled = true;
      const down = start.current;
      start.current = null;
      if (!down || down.id !== ev.pointerId || ev.button !== 0) return;
      if (Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 5) return;
      addSafePoint(down.worldX, down.worldY);
    };
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [addSafePoint, controls, placing, tab]);

  if (!placing || tab !== "path") return null;

  return (
    <mesh
      position={[travelX / 2, travelY / 2, 0.02]}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        start.current = {
          x: e.clientX,
          y: e.clientY,
          id: e.pointerId,
          worldX: e.point.x,
          worldY: e.point.y,
        };
        if (controls) (controls as unknown as { enabled: boolean }).enabled = false;
      }}
    >
      <planeGeometry args={[travelX, travelY]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

function SafeTravelPreview() {
  const project = useProjectStore((s) => s.project);
  const z = project.motion.safeZ;
  const jobs: {
    id: string;
    active: boolean;
    stops: { id: string; x: number; y: number }[];
    route: { x: number; y: number }[];
  }[] = [];
  let prev = { x: project.machine.homePosition.x, y: project.machine.homePosition.y };

  for (const model of project.models) {
    if (model.role !== "glue") continue;
    for (const path of project.paths) {
      if (path.modelId !== model.id || path.points.length < 2) continue;
      const world = pathPointsWorld(path, model, project.motion.dispensingZ);
      const ordered = path.direction === -1 ? [...world].reverse() : world;
      const start = ordered[0];
      const end = ordered[ordered.length - 1];
      const stops = path.safePoints ?? [];
      const route = [
        prev,
        ...stops.map((p) => ({ x: p.x, y: p.y })),
        {
          x: start.x + project.motion.startOffset.x,
          y: start.y + project.motion.startOffset.y,
        },
      ];
      if (stops.length > 0) {
        jobs.push({ id: path.id, active: path.id === project.activePathId, stops, route });
      }
      prev = {
        x: end.x + project.motion.endOffset.x,
        y: end.y + project.motion.endOffset.y,
      };
    }
  }

  if (jobs.length === 0) return null;

  return (
    <>
      {jobs.map((job) => (
        <group key={job.id}>
          {job.route.slice(1).map((pt, i) => (
            <Line
              key={`${job.id}-seg-${i}`}
              points={[
                new THREE.Vector3(job.route[i].x, job.route[i].y, z),
                new THREE.Vector3(pt.x, pt.y, z),
              ]}
              color={job.active ? "#38bdf8" : "#1d6f8a"}
              lineWidth={job.active ? 2 : 1}
              dashed
              dashSize={3}
              gapSize={1.5}
            />
          ))}
          {job.stops.map((pt) => (
            <mesh key={pt.id} position={[pt.x, pt.y, z]}>
              <sphereGeometry args={[job.active ? 0.9 : 0.55, 12, 12]} />
              <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={0.4} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
}

function GluePaths() {
  const project = useProjectStore((s) => s.project);
  const activePathId = project.activePathId;

  return (
    <>
      {project.paths.map((path) => {
        const model = project.models.find((m) => m.id === path.modelId);
        if (!model || model.role !== "glue" || path.points.length === 0) return null;
        const world = pathPointsWorld(path, model, project.motion.dispensingZ);
        const pts = world.map((p) => new THREE.Vector3(p.x, p.y, p.z + 0.3));
        const active = path.id === activePathId;
        return (
          <group key={path.id}>
            {pts.length >= 2 ? (
              <Line
                points={pts}
                color={active ? "#f0b429" : "#8a6a20"}
                lineWidth={active ? 3 : 1.5}
              />
            ) : null}
            {path.points.map((pt, i) => {
              const w = world[i];
              if (!w) return null;
              const alone = path.points.length === 1;
              const color = alone
                ? "#ef6b6b"
                : i === 0
                  ? "#3ecf8e"
                  : i === path.points.length - 1
                    ? "#ef6b6b"
                    : "#f0b429";
              return (
                <mesh key={pt.id} position={[w.x, w.y, w.z + 0.3]}>
                  <sphereGeometry args={[active || alone ? 0.7 : 0.5, 12, 12]} />
                  <meshStandardMaterial
                    color={active || alone ? color : "#8a6a20"}
                    emissive={alone || active ? color : "#000000"}
                    emissiveIntensity={alone || active ? 0.35 : 0}
                  />
                </mesh>
              );
            })}
          </group>
        );
      })}
    </>
  );
}

function ToolpathPreview() {
  const frames = useProjectStore((s) => s.simFrames);
  const segments = useMemo(() => toolpathSegmentsFromFrames(frames), [frames]);
  if (segments.length === 0) return null;

  return (
    <>
      {segments.map((seg, i) => (
        <Line
          key={i}
          points={[
            new THREE.Vector3(seg.from.x, seg.from.y, seg.from.z),
            new THREE.Vector3(seg.to.x, seg.to.y, seg.to.z),
          ]}
          color={seg.kind === "dispense" ? "#f0b429" : "#38bdf8"}
          lineWidth={seg.kind === "dispense" ? 2.5 : 1.25}
          dashed={seg.kind === "rapid"}
          dashSize={2}
          gapSize={1.5}
        />
      ))}
    </>
  );
}

function NozzleMarker() {
  const simPos = useProjectStore((s) => s.sim.position);
  const on = useProjectStore((s) => s.sim.dispenserOn);
  const hasFrames = useProjectStore((s) => s.simFrames.length > 0);
  const home = useProjectStore((s) => s.project.machine.homePosition);
  const parkZ = useProjectStore((s) => s.project.motion.parkZ);
  // No toolpath yet: tip sits at start/end park (Home XY + Park Z)
  const pos = hasFrames ? simPos : { x: home.x, y: home.y, z: parkZ };
  return (
    <mesh position={[pos.x, pos.y, pos.z]}>
      <sphereGeometry args={[1.0, 16, 16]} />
      <meshStandardMaterial
        color={on ? "#ff5a3d" : "#e2e8f0"}
        emissive={on ? "#ff3b1f" : "#334155"}
        emissiveIntensity={on ? 0.7 : 0.15}
      />
    </mesh>
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
    camera.lookAt(machine.workAreaX / 2, machine.workAreaY / 2, machine.workAreaZ / 2);
    primed.current = true;
  }, [camera, machine.workAreaX, machine.workAreaY, machine.workAreaZ]);
  return null;
}

function SyncOrbitTarget() {
  const machine = useProjectStore((s) => s.project.machine);
  const { controls } = useThree();
  useEffect(() => {
    const orbit = controls as OrbitControlsLike | null;
    if (!orbit?.target) return;
    orbit.target.copy(workAreaCenter(machine));
    orbit.update();
  }, [controls, machine.workAreaX, machine.workAreaY, machine.workAreaZ]);
  return null;
}

function CameraRotateBridge({ apiRef }: { apiRef: MutableRefObject<ViewRotateApi | null> }) {
  const { camera, controls, gl } = useThree();
  const pendingFrame = useRef<ViewFrame | null>(null);

  const orbitOf = () => controls as OrbitControlsLike | null;

  const applyFrame = (frame: ViewFrame, k: number, orbit: OrbitControlsLike) => {
    camera.position.lerpVectors(frame.fromPos, frame.toPos, k);
    camera.up.copy(frame.fromUp).lerp(frame.toUp, k).normalize();
    orbit.target.copy(frame.target);
    camera.lookAt(frame.target);
  };

  useFrame((_, delta) => {
    const orbit = orbitOf();
    const frame = pendingFrame.current;
    if (!frame || !orbit?.target) return;
    frame.t = Math.min(1, frame.t + delta * 3);
    const k = frame.t * frame.t * (3 - 2 * frame.t);
    applyFrame(frame, k, orbit);
    orbit.update();
    // update() nudges a straight-down camera off the target. Put the framed pose back.
    applyFrame(frame, k, orbit);
    if (frame.t >= 1) pendingFrame.current = null;
  });

  useEffect(() => {
    const el = gl.domElement;
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const orbit = orbitOf();
      if (!orbit?.target || pendingFrame.current) return;
      releasePoleLock(camera, orbit);
    };
    el.addEventListener("pointerdown", onPointerDown, true);
    return () => el.removeEventListener("pointerdown", onPointerDown, true);
  }, [camera, controls, gl]);

  useEffect(() => {
    apiRef.current = {
      rotateBy(degrees: number) {
        const orbit = orbitOf();
        if (!orbit?.target) return;
        const target = orbit.target;
        const offset = camera.position.clone().sub(target);
        const dist = offset.length();
        const rad = THREE.MathUtils.degToRad(degrees);
        if (dist > 1e-6 && Math.abs(offset.z) / dist > 0.98) {
          const sign = Math.sign(offset.z) || 1;
          camera.up.applyAxisAngle(new THREE.Vector3(0, 0, sign), rad);
          camera.up.z = 0;
          if (camera.up.lengthSq() < 1e-8) camera.up.set(0, -1, 0);
          camera.up.normalize();
          camera.position.copy(target).add(new THREE.Vector3(0, 0, sign * dist));
          camera.lookAt(target);
          return;
        }
        offset.applyAxisAngle(new THREE.Vector3(0, 0, 1), rad);
        camera.position.copy(target).add(offset);
        camera.up.set(0, 0, 1);
        camera.lookAt(target);
        orbit.update();
      },
      frameAxis(axis: THREE.Vector3, quarterTurns = 0) {
        const orbit = orbitOf();
        if (!orbit?.target) return;
        const machine = useProjectStore.getState().project.machine;
        const dir = axis.clone().normalize();
        const target = workAreaCenter(machine);
        const steps = ((quarterTurns % 4) + 4) % 4;
        const aim = axisViewPlacement(dir, 1, steps);
        const viewDir = aim.offset.clone().normalize();
        const distance = fitDistance(camera, viewDir, aim.up, machine);
        const placed = axisViewPlacement(dir, distance, steps);
        pendingFrame.current = {
          fromPos: camera.position.clone(),
          toPos: target.clone().add(placed.offset),
          fromUp: camera.up.clone(),
          toUp: placed.up,
          target,
          t: 0,
        };
        orbit.target.copy(target);
      },
      framePark() {
        const orbit = orbitOf();
        if (!orbit?.target) return;
        const { machine, motion } = useProjectStore.getState().project;
        const target = new THREE.Vector3(machine.homePosition.x, machine.homePosition.y, motion.parkZ);
        const persp = camera as THREE.PerspectiveCamera;
        const tanV = Math.tan(THREE.MathUtils.degToRad(persp.fov || 45) / 2);
        const tanH = tanV * (persp.aspect > 0 ? persp.aspect : 1);
        // About 80 mm of bed around the park, so the nozzle stays centered and readable.
        const span = 40;
        const distance = Math.max(span / tanV, span / tanH, 30) * 1.15;
        const placed = axisViewPlacement(new THREE.Vector3(0, 0, 1), distance, 0);
        pendingFrame.current = {
          fromPos: camera.position.clone(),
          toPos: target.clone().add(placed.offset),
          fromUp: camera.up.clone(),
          toUp: placed.up,
          target,
          t: 0,
        };
        orbit.target.copy(target);
      },
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, camera, controls]);
  return null;
}

function MeasureTracker({
  enabled,
  onHover,
}: {
  enabled: boolean;
  onHover: (hover: MeasureHover | null) => void;
}) {
  const machine = useProjectStore((s) => s.project.machine);
  const { gl, camera } = useThree();
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), []);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const hit = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    if (!enabled) {
      onHover(null);
      return;
    }

    const el = gl.domElement;
    const prevCursor = el.style.cursor;
    el.style.cursor = "crosshair";

    const pad = 40;
    const minX = -pad;
    const maxX = machine.workAreaX + pad;
    const minY = -pad;
    const maxY = machine.workAreaY + pad;

    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      ndc.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -(((e.clientY - rect.top) / rect.height) * 2 - 1)
      );
      raycaster.setFromCamera(ndc, camera);
      if (!raycaster.ray.intersectPlane(plane, hit)) {
        onHover(null);
        return;
      }
      if (hit.x < minX || hit.x > maxX || hit.y < minY || hit.y > maxY) {
        onHover(null);
        return;
      }
      el.style.cursor = "crosshair";
      onHover({
        x: Math.round(hit.x * 100) / 100,
        y: Math.round(hit.y * 100) / 100,
        clientX: e.clientX - rect.left,
        clientY: e.clientY - rect.top,
      });
    };

    const onLeave = () => onHover(null);

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.style.cursor = prevCursor;
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      onHover(null);
    };
  }, [
    enabled,
    onHover,
    gl,
    camera,
    machine.workAreaX,
    machine.workAreaY,
    plane,
    raycaster,
    ndc,
    hit,
  ]);

  return null;
}

function MeasureMarker({ hover }: { hover: MeasureHover | null }) {
  if (!hover) return null;
  return (
    <group position={[hover.x, hover.y, 0.05]}>
      <Line
        points={[
          [-8, 0, 0],
          [8, 0, 0],
        ]}
        color="#38bdf8"
        lineWidth={1.5}
      />
      <Line
        points={[
          [0, -8, 0],
          [0, 8, 0],
        ]}
        color="#38bdf8"
        lineWidth={1.5}
      />
      <mesh>
        <sphereGeometry args={[1.1, 12, 12]} />
        <meshBasicMaterial color="#38bdf8" />
      </mesh>
    </group>
  );
}

const GIZMO_AXIS_DIRS: Array<{ dir: [number, number, number]; color: string; label?: string }> = [
  { dir: [1, 0, 0], color: "#ef4444", label: "X" },
  { dir: [0, 1, 0], color: "#22c55e", label: "Y" },
  { dir: [0, 0, 1], color: "#3b82f6", label: "Z" },
  { dir: [-1, 0, 0], color: "#ef4444" },
  { dir: [0, -1, 0], color: "#22c55e" },
  { dir: [0, 0, -1], color: "#3b82f6" },
];

function axisHeadTexture(color: string, label?: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.CanvasTexture(canvas);
  context.beginPath();
  context.arc(32, 32, 16, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
  if (label) {
    context.font = "18px Inter, Arial, sans-serif";
    context.textAlign = "center";
    context.fillStyle = "white";
    context.fillText(label, 32, 41);
  }
  return new THREE.CanvasTexture(canvas);
}

function ViewAxisGizmo({ apiRef }: { apiRef: MutableRefObject<ViewRotateApi | null> }) {
  const gl = useThree((state) => state.gl);
  const lastAxis = useRef<string | null>(null);
  const quarterTurns = useRef(0);
  const textures = useMemo(
    () =>
      GIZMO_AXIS_DIRS.map((axis) => {
        const texture = axisHeadTexture(axis.color, axis.label);
        texture.anisotropy = gl.capabilities.getMaxAnisotropy() || 1;
        return texture;
      }),
    [gl]
  );

  return (
    <group scale={40}>
      <mesh position={[0.4, 0, 0]}>
        <boxGeometry args={[0.8, 0.05, 0.05]} />
        <meshBasicMaterial color="#ef4444" toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.4, 0]}>
        <boxGeometry args={[0.05, 0.8, 0.05]} />
        <meshBasicMaterial color="#22c55e" toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0.4]}>
        <boxGeometry args={[0.05, 0.05, 0.8]} />
        <meshBasicMaterial color="#3b82f6" toneMapped={false} />
      </mesh>
      {GIZMO_AXIS_DIRS.map((axis, index) => (
        <sprite
          key={axis.dir.join(",")}
          position={axis.dir}
          scale={axis.label ? 1 : 0.75}
          onPointerDown={(event) => {
            event.stopPropagation();
            const key = axis.dir.join(",");
            const direction = new THREE.Vector3(...axis.dir);
            if (lastAxis.current === key) {
              quarterTurns.current = (quarterTurns.current + 1) % 4;
            } else {
              lastAxis.current = key;
              quarterTurns.current = 0;
            }
            apiRef.current?.frameAxis(direction, quarterTurns.current);
          }}
        >
          <spriteMaterial
            map={textures[index]}
            alphaTest={0.3}
            opacity={axis.label ? 1 : 0.75}
            toneMapped={false}
          />
        </sprite>
      ))}
    </group>
  );
}

function SceneContent({
  measureMode,
  measureHover,
  onMeasureHover,
  rotateApiRef,
}: {
  measureMode: boolean;
  measureHover: MeasureHover | null;
  onMeasureHover: (hover: MeasureHover | null) => void;
  rotateApiRef: MutableRefObject<ViewRotateApi | null>;
}) {
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
      <ProductMeshes measureMode={measureMode} />
      <GluePaths />
      <SafeTravelPreview />
      <SafePointPicker />
      <ToolpathPreview />
      <NozzleMarker />
      <MeasureTracker enabled={measureMode} onHover={onMeasureHover} />
      <MeasureMarker hover={measureMode ? measureHover : null} />
      <SimClock />
      <CameraRig />
      <OrbitControls
        makeDefault
        target={[150, 90, 20]}
        maxPolarAngle={Math.PI * 0.95}
      />
      <SyncOrbitTarget />
      <CameraRotateBridge apiRef={rotateApiRef} />
      <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
        <ViewAxisGizmo apiRef={rotateApiRef} />
      </GizmoHelper>
    </>
  );
}

export function DispensingScene() {
  const [measureMode, setMeasureMode] = useState(false);
  const [measureHover, setMeasureHover] = useState<MeasureHover | null>(null);
  const rotateApiRef = useRef<ViewRotateApi | null>(null);

  return (
    <div className="relative h-full w-full" onContextMenu={(e) => e.preventDefault()}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: 45, near: 0.1, far: 2000, position: [220, -180, 160], up: [0, 0, 1] }}
        gl={{ antialias: true }}
      >
        <Suspense fallback={null}>
          <SceneContent
            measureMode={measureMode}
            measureHover={measureHover}
            onMeasureHover={setMeasureHover}
            rotateApiRef={rotateApiRef}
          />
        </Suspense>
      </Canvas>
      <ViewportHud
        measureMode={measureMode}
        measureHover={measureHover}
        onToggleMeasure={() => {
          setMeasureMode((v) => !v);
          setMeasureHover(null);
        }}
        onRotateLeft={() => rotateApiRef.current?.rotateBy(-VIEW_ROTATE_STEP_DEG)}
        onRotateRight={() => rotateApiRef.current?.rotateBy(VIEW_ROTATE_STEP_DEG)}
        onFramePark={() => rotateApiRef.current?.framePark()}
      />
    </div>
  );
}

function ViewportHud({
  measureMode,
  measureHover,
  onToggleMeasure,
  onRotateLeft,
  onRotateRight,
  onFramePark,
}: {
  measureMode: boolean;
  measureHover: MeasureHover | null;
  onToggleMeasure: () => void;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onFramePark: () => void;
}) {
  const sim = useProjectStore((s) => s.sim);
  const models = useProjectStore((s) => s.project.models);
  const activeModelId = useProjectStore((s) => s.project.activeModelId);
  const pathLen = useProjectStore((s) => s.getPathLength());
  const tab = useProjectStore((s) => s.tab);
  const placingSafePoint = useProjectStore((s) => s.placingSafePoint);
  const hasToolpath = useProjectStore((s) => s.simFrames.length > 0);
  const active = models.find((m) => m.id === activeModelId) ?? models[0];
  const glueCount = models.filter((m) => m.role === "glue").length;
  const obstacleCount = models.filter((m) => m.role === "obstacle").length;

  const rotateBtnClass =
    "pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel)]/95 text-[var(--text)] shadow-md backdrop-blur hover:border-[var(--accent)]/50 hover:bg-[var(--panel-2)]";

  return (
    <div className="pointer-events-none absolute inset-0">
      {placingSafePoint && tab === "path" ? (
        <div className="absolute left-3 top-3 rounded border border-sky-400/40 bg-[var(--panel)]/95 px-2 py-1 text-[11px] text-sky-200">
          Click the bed to add a Safe Z travel point
        </div>
      ) : null}
      <button
        type="button"
        title="center view on nozzle park point"
        aria-label="center view on nozzle park point"
        className={`${rotateBtnClass} absolute bottom-[18px] left-[18px]`}
        onClick={onFramePark}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <circle cx="8" cy="8" r="5.25" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 2.25v2.1M8 11.65v2.1M2.25 8h2.1M11.65 8h2.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="8" r="1.35" fill="currentColor" />
        </svg>
      </button>
      <div className="absolute bottom-[132px] right-[60px] flex translate-x-1/2 gap-1.5">
        <button
          type="button"
          title="Rotate left"
          aria-label="Rotate view left"
          className={rotateBtnClass}
          onClick={onRotateLeft}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M10 3.5 5.5 8 10 12.5"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          title="Rotate right"
          aria-label="Rotate view right"
          className={rotateBtnClass}
          onClick={onRotateRight}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M6 3.5 10.5 8 6 12.5"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      <div className="absolute left-3 top-3 rounded border border-[var(--border)] bg-[var(--panel)]/90 px-3 py-2 text-[11px] backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="font-medium text-[var(--text)]">Viewport</div>
          <button
            type="button"
            onClick={onToggleMeasure}
            className={`pointer-events-auto rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              measureMode
                ? "border-[var(--accent)]/50 bg-[var(--accent-soft)] text-[var(--accent)]"
                : "border-[var(--border)] bg-[var(--panel-2)] text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            Measure
          </button>
        </div>
        <div className="mt-1 text-[var(--muted)]">
          {models.length === 0
            ? "No models — Import STL under Model"
            : `${models.length} models · ${glueCount} glue · ${obstacleCount} obstacle`}
        </div>
        <div className="text-[var(--muted)]">
          {active ? `Active: ${active.name}` : "No active model"} · Path {pathLen.toFixed(1)} mm
        </div>
        {hasToolpath ? (
          <div className="mt-1 text-[var(--muted)]">
            Toolpath: <span className="text-[#f0b429]">glue</span> ·{" "}
            <span className="text-sky-400">travel</span>
          </div>
        ) : (
          <div className="mt-1 text-[var(--muted-2)]">Generate G-code to preview full nozzle travel</div>
        )}
        {measureMode ? (
          <div className="mt-1 text-sky-400">Hover the bed to read X / Y (mm)</div>
        ) : null}
        {tab === "path" && active?.role === "glue" ? (
          <div className="mt-1 text-[var(--accent)]">Click (without dragging) a glue model to add path points</div>
        ) : null}
        {tab === "path" && active?.role === "obstacle" ? (
          <div className="mt-1 text-[var(--warn-text)]">Obstacles have no glue path — switch role to Glue</div>
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
        <div className="text-[var(--muted)]">Job {sim.productIndex + 1}</div>
      </div>
      {measureMode && measureHover ? (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[120%] rounded border border-sky-500/40 bg-[var(--panel)] px-2 py-1 font-mono text-[11px] text-sky-300 shadow-lg"
          style={{ left: measureHover.clientX, top: measureHover.clientY }}
        >
          X {measureHover.x.toFixed(2)} · Y {measureHover.y.toFixed(2)}
        </div>
      ) : null}
    </div>
  );
}
