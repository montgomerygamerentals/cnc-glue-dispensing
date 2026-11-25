import { sanitizeCameraView } from "./camera-view";
import type { DispensingPath, Project, StlAsset, ToolpathSegment, Vec3 } from "./types";
import type { SimKeyframe } from "./gcode/parser";

function degToRad(d: number): number {
  return (d * Math.PI) / 180;
}

/** Match Three.js default Euler XYZ order used in the viewport. */
export function modelLocalToWorld(local: Vec3, model: StlAsset): Vec3 {
  const s = model.transform.scale;
  let x = local.x * s;
  let y = local.y * s;
  let z = local.z * s;

  const rx = degToRad(model.transform.rotation.x);
  const ry = degToRad(model.transform.rotation.y);
  const rz = degToRad(model.transform.rotation.z);

  // X
  {
    const y1 = y * Math.cos(rx) - z * Math.sin(rx);
    const z1 = y * Math.sin(rx) + z * Math.cos(rx);
    y = y1;
    z = z1;
  }
  // Y
  {
    const x1 = x * Math.cos(ry) + z * Math.sin(ry);
    const z1 = -x * Math.sin(ry) + z * Math.cos(ry);
    x = x1;
    z = z1;
  }
  // Z
  {
    const x1 = x * Math.cos(rz) - y * Math.sin(rz);
    const y1 = x * Math.sin(rz) + y * Math.cos(rz);
    x = x1;
    y = y1;
  }

  return {
    x: x + model.transform.position.x,
    y: y + model.transform.position.y,
    z: z + model.transform.position.z,
  };
}

export function pathPointsWorld(path: DispensingPath, model: StlAsset, motionDispenseZ: number): Vec3[] {
  return path.points.map((pt) => {
    const local = {
      x: pt.position.x,
      y: pt.position.y,
      z: path.mode === "planar" ? path.planarZ : pt.position.z,
    };
    const world = modelLocalToWorld(local, model);
    if (path.mode === "planar") {
      return { ...world, z: motionDispenseZ + path.nozzleClearance };
    }
    return { ...world, z: world.z + path.nozzleClearance };
  });
}

export function glueModels(project: Project): StlAsset[] {
  return project.models.filter((m) => m.role === "glue");
}

export function pathsForModel(project: Project, modelId: string): DispensingPath[] {
  return project.paths.filter((p) => p.modelId === modelId);
}

export function activeModel(project: Project): StlAsset | undefined {
  return project.models.find((m) => m.id === project.activeModelId) ?? project.models[0];
}

/** Build rapid vs dispense polylines from simulation keyframes. */
export function toolpathSegmentsFromFrames(frames: SimKeyframe[]): ToolpathSegment[] {
  const segments: ToolpathSegment[] = [];
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1];
    const b = frames[i];
    const dist = Math.hypot(
      b.position.x - a.position.x,
      b.position.y - a.position.y,
      b.position.z - a.position.z
    );
    if (dist < 1e-6) continue;
    // Prefer dispenser state on the departing frame for segment classification
    segments.push({
      from: a.position,
      to: b.position,
      kind: a.dispenserOn ? "dispense" : "rapid",
    });
  }
  return segments;
}

/**
 * Migrate legacy single-`stl` projects to `models[]`.
 * Accepts unknown JSON shapes from older saves.
 */
export function migrateProject(raw: unknown): Project {
  const p = raw as Project & { stl?: StlAsset | null };
  let models = Array.isArray(p.models) ? [...p.models] : [];
  let activeModelId = p.activeModelId ?? null;

  if (models.length === 0 && p.stl) {
    const stl = { ...p.stl, role: (p.stl as StlAsset).role ?? ("glue" as const) };
    models = [stl];
    activeModelId = stl.id;
  }

  models = models.map((m) => ({
    ...m,
    role: m.role === "obstacle" ? "obstacle" : "glue",
    transform: m.transform ?? {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: 1,
    },
  }));

  if (!activeModelId || !models.some((m) => m.id === activeModelId)) {
    activeModelId = models[0]?.id ?? null;
  }

  const fallbackModelId = activeModelId ?? models[0]?.id ?? "";
  const paths = (p.paths ?? []).map((path) => ({
    ...path,
    modelId: path.modelId || fallbackModelId,
    safePoints: Array.isArray(path.safePoints) ? path.safePoints : [],
    retraceAtSafeZ: path.retraceAtSafeZ === true,
  }));

  const { stl: _drop, fixture: _fixture, ...rest } = p as Project & {
    stl?: StlAsset | null;
    fixture?: unknown;
  };

  const rawDispenser = rest.dispenser;
  const dispenser = rawDispenser
    ? {
        ...rawDispenser,
        cutoffBeforeEndSec:
          typeof rawDispenser.cutoffBeforeEndSec === "number" ? rawDispenser.cutoffBeforeEndSec : 0,
      }
    : undefined;

  const rawMotion = rest.motion as (Project["motion"] & { parkZ?: number }) | undefined;
  const motion = rawMotion
    ? {
        ...rawMotion,
        parkZ: typeof rawMotion.parkZ === "number" ? rawMotion.parkZ : (rawMotion.safeZ ?? 25),
      }
    : undefined;

  return {
    ...rest,
    ...(motion ? { motion } : {}),
    ...(dispenser ? { dispenser } : {}),
    models,
    activeModelId,
    paths,
    camera: sanitizeCameraView(p.camera),
  } as Project;
}
