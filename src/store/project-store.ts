"use client";

import { create } from "zustand";
import { createProject, defaultPath, uid } from "@/lib/defaults";
import { generateGcode } from "@/lib/gcode/generator";
import { buildSimulationTimeline, interpolateFrames, parseGcode } from "@/lib/gcode/parser";
import type { SimKeyframe } from "@/lib/gcode/parser";
import { pathLengthMm } from "@/lib/fixture";
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  deleteProject,
  getActiveProjectId,
  listSavedProjects,
  loadProject,
  saveProject,
} from "@/lib/storage";
import { loadStlGeometry } from "@/lib/stl";
import { canGenerate, validateProject } from "@/lib/validation";
import type {
  DispensingPath,
  PathPoint,
  Project,
  SimulationState,
  StlAsset,
  ValidationIssue,
  Vec3,
  WorkspaceTab,
} from "@/lib/types";

interface ProjectStore {
  project: Project;
  tab: WorkspaceTab;
  issues: ValidationIssue[];
  sim: SimulationState;
  simFrames: SimKeyframe[];
  stlGeometryVersion: number;
  geometryCache: ArrayBuffer | null;
  hydrated: boolean;

  hydrate: () => void;
  setTab: (tab: WorkspaceTab) => void;
  setProjectName: (name: string) => void;
  patchMachine: (patch: Partial<Project["machine"]>) => void;
  patchFixture: (patch: Partial<Project["fixture"]>) => void;
  patchNozzle: (patch: Partial<Project["nozzle"]>) => void;
  patchDispenser: (patch: Partial<Project["dispenser"]>) => void;
  patchMotion: (patch: Partial<Project["motion"]>) => void;
  setDryRun: (dryRun: boolean) => void;
  setNotes: (notes: string) => void;

  importStl: (file: File) => Promise<void>;
  clearStl: () => void;
  updateModelTransform: (patch: Partial<StlAsset["transform"]>) => void;

  setActivePath: (id: string) => void;
  addPath: () => void;
  deletePath: (id: string) => void;
  updatePath: (id: string, patch: Partial<DispensingPath>) => void;
  addPoint: (position: Vec3) => void;
  updatePoint: (pointId: string, position: Vec3) => void;
  deletePoint: (pointId: string) => void;
  clearPathPoints: () => void;

  generate: () => void;
  setGcode: (gcode: string) => void;

  save: () => void;
  load: (id: string) => void;
  newProject: () => void;
  removeSaved: (id: string) => void;
  listSaved: () => Array<{ id: string; name: string; updatedAt: string }>;

  refreshIssues: () => void;
  getActivePath: () => DispensingPath | undefined;
  getPathLength: () => number;
  getGeometryBuffer: () => ArrayBuffer | null;

  // Simulation
  rebuildSim: () => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  restart: () => void;
  setSimSpeed: (speed: number) => void;
  stepForward: () => void;
  stepBackward: () => void;
  tickSim: (dtMs: number) => void;
}

function refresh(project: Project): ValidationIssue[] {
  return validateProject(project);
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  project: createProject("Untitled dispensing job"),
  tab: "model",
  issues: [],
  sim: {
    playing: false,
    speed: 4,
    timeMs: 0,
    position: { x: 0, y: 0, z: 15 },
    dispenserOn: false,
    productIndex: 0,
    progress: 0,
    segmentIndex: 0,
  },
  simFrames: [],
  stlGeometryVersion: 0,
  geometryCache: null,
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return;
    const id = getActiveProjectId();
    if (id) {
      const loaded = loadProject(id);
      if (loaded) {
        let geometryCache: ArrayBuffer | null = null;
        if (loaded.stl?.dataBase64) {
          geometryCache = base64ToArrayBuffer(loaded.stl.dataBase64);
        }
        set({
          project: loaded,
          issues: refresh(loaded),
          geometryCache,
          hydrated: true,
          stlGeometryVersion: geometryCache ? 1 : 0,
        });
        get().rebuildSim();
        return;
      }
    }
    // Empty project — user imports their own STL
    set({ hydrated: true, issues: refresh(get().project) });
  },

  setTab: (tab) => set({ tab }),
  setProjectName: (name) => set((s) => ({ project: { ...s.project, name } })),

  patchMachine: (patch) =>
    set((s) => {
      const project = { ...s.project, machine: { ...s.project.machine, ...patch } };
      return { project, issues: refresh(project) };
    }),
  patchFixture: (patch) =>
    set((s) => {
      const project = { ...s.project, fixture: { ...s.project.fixture, ...patch } };
      return { project, issues: refresh(project) };
    }),
  patchNozzle: (patch) =>
    set((s) => {
      const project = { ...s.project, nozzle: { ...s.project.nozzle, ...patch } };
      return { project, issues: refresh(project) };
    }),
  patchDispenser: (patch) =>
    set((s) => {
      const project = { ...s.project, dispenser: { ...s.project.dispenser, ...patch } };
      return { project, issues: refresh(project) };
    }),
  patchMotion: (patch) =>
    set((s) => {
      const project = { ...s.project, motion: { ...s.project.motion, ...patch } };
      return { project, issues: refresh(project) };
    }),
  setDryRun: (dryRun) =>
    set((s) => {
      const project = { ...s.project, dryRun };
      return { project, issues: refresh(project) };
    }),
  setNotes: (notes) => set((s) => ({ project: { ...s.project, notes } })),

  importStl: async (file) => {
    const buffer = await file.arrayBuffer();
    const { dimensions } = loadStlGeometry(buffer.slice(0));
    const stl: StlAsset = {
      id: uid("stl"),
      name: file.name,
      dataBase64: arrayBufferToBase64(buffer),
      dimensions,
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: 1,
      },
    };
    set((s) => ({
      project: { ...s.project, stl },
      geometryCache: buffer,
      stlGeometryVersion: s.stlGeometryVersion + 1,
      issues: refresh({ ...s.project, stl }),
    }));
  },

  clearStl: () =>
    set((s) => {
      const project = { ...s.project, stl: null };
      return {
        project,
        geometryCache: null,
        stlGeometryVersion: s.stlGeometryVersion + 1,
        issues: refresh(project),
      };
    }),

  updateModelTransform: (patch) =>
    set((s) => {
      if (!s.project.stl) return s;
      const stl = {
        ...s.project.stl,
        transform: { ...s.project.stl.transform, ...patch },
      };
      return { project: { ...s.project, stl } };
    }),

  setActivePath: (id) => set((s) => ({ project: { ...s.project, activePathId: id } })),

  addPath: () =>
    set((s) => {
      const path = defaultPath();
      path.name = `Adhesive path ${s.project.paths.length + 1}`;
      const project = {
        ...s.project,
        paths: [...s.project.paths, path],
        activePathId: path.id,
        gcode: "",
      };
      return { project, issues: refresh(project), simFrames: [] };
    }),

  deletePath: (id) =>
    set((s) => {
      const remaining = s.project.paths.filter((p) => p.id !== id);
      const wasActive = s.project.activePathId === id;
      const activePathId = wasActive
        ? remaining[0]?.id ?? null
        : s.project.activePathId && remaining.some((p) => p.id === s.project.activePathId)
          ? s.project.activePathId
          : remaining[0]?.id ?? null;
      const project = {
        ...s.project,
        paths: remaining,
        activePathId,
        gcode: "",
      };
      return { project, issues: refresh(project), simFrames: [] };
    }),

  updatePath: (id, patch) =>
    set((s) => {
      const paths = s.project.paths.map((p) => (p.id === id ? { ...p, ...patch } : p));
      const project = { ...s.project, paths, gcode: "" };
      return { project, issues: refresh(project), simFrames: [] };
    }),

  addPoint: (position) =>
    set((s) => {
      const paths = s.project.paths.map((p) => {
        if (p.id !== s.project.activePathId) return p;
        const point: PathPoint = { id: uid("pt"), position };
        return { ...p, points: [...p.points, point] };
      });
      const project = { ...s.project, paths, gcode: "" };
      return { project, issues: refresh(project), simFrames: [] };
    }),

  updatePoint: (pointId, position) =>
    set((s) => {
      const paths = s.project.paths.map((p) => {
        if (p.id !== s.project.activePathId) return p;
        return {
          ...p,
          points: p.points.map((pt) => (pt.id === pointId ? { ...pt, position } : pt)),
        };
      });
      const project = { ...s.project, paths, gcode: "" };
      return { project, issues: refresh(project), simFrames: [] };
    }),

  deletePoint: (pointId) =>
    set((s) => {
      const paths = s.project.paths.map((p) => {
        if (p.id !== s.project.activePathId) return p;
        return { ...p, points: p.points.filter((pt) => pt.id !== pointId) };
      });
      const project = { ...s.project, paths, gcode: "" };
      return { project, issues: refresh(project), simFrames: [] };
    }),

  clearPathPoints: () =>
    set((s) => {
      const paths = s.project.paths.map((p) =>
        p.id === s.project.activePathId ? { ...p, points: [] } : p
      );
      const project = { ...s.project, paths, gcode: "" };
      return { project, issues: refresh(project), simFrames: [] };
    }),

  generate: () => {
    const { project } = get();
    if (!canGenerate(project)) {
      set({ issues: refresh(project), tab: "gcode" });
      return;
    }
    try {
      const gcode = generateGcode(project);
      set({ project: { ...project, gcode }, tab: "gcode" });
      get().rebuildSim();
    } catch (e) {
      const message = e instanceof Error ? e.message : "G-code generation failed";
      set({ issues: [...refresh(project), { level: "error", message }] });
    }
  },

  setGcode: (gcode) => {
    set((s) => ({ project: { ...s.project, gcode } }));
    get().rebuildSim();
  },

  save: () => {
    const { project } = get();
    saveProject(project);
    set({ project: { ...project, updatedAt: new Date().toISOString() } });
  },

  load: (id) => {
    const loaded = loadProject(id);
    if (!loaded) return;
    const geometryCache = loaded.stl?.dataBase64
      ? base64ToArrayBuffer(loaded.stl.dataBase64)
      : null;
    set((s) => ({
      project: loaded,
      issues: refresh(loaded),
      geometryCache,
      stlGeometryVersion: s.stlGeometryVersion + 1,
    }));
    get().rebuildSim();
  },

  newProject: () => {
    const project = createProject();
    set({
      project,
      issues: refresh(project),
      geometryCache: null,
      simFrames: [],
      stlGeometryVersion: get().stlGeometryVersion + 1,
    });
  },

  removeSaved: (id) => deleteProject(id),
  listSaved: () => listSavedProjects(),

  refreshIssues: () => set((s) => ({ issues: refresh(s.project) })),
  getActivePath: () => {
    const { project } = get();
    return project.paths.find((p) => p.id === project.activePathId) ?? project.paths[0];
  },
  getPathLength: () => {
    const path = get().getActivePath();
    return path ? pathLengthMm(path.points) : 0;
  },
  getGeometryBuffer: () => get().geometryCache,

  rebuildSim: () => {
    const { project } = get();
    if (!project.gcode.trim()) {
      set({ simFrames: [] });
      return;
    }
    const moves = parseGcode(
      project.gcode,
      project.dispenser.activationCommand,
      project.dispenser.deactivationCommand
    );
    // Dry-run comments won't toggle — also detect "; DRY-RUN: dispenser ON"
    const frames = buildSimulationTimeline(moves, {
      x: project.machine.homePosition.x,
      y: project.machine.homePosition.y,
      z: project.motion.safeZ,
    });
    // Enrich dry-run visualization: treat dry-run comment markers as on/off for UI
    let dispenserOn = false;
    const enriched = frames.map((f) => {
      if (/dispenser ON/i.test(f.raw)) dispenserOn = true;
      if (/dispenser OFF/i.test(f.raw)) dispenserOn = false;
      if (f.moveType === "dispense_on") dispenserOn = true;
      if (f.moveType === "dispense_off") dispenserOn = false;
      return { ...f, dispenserOn };
    });
    set({ simFrames: enriched });
  },

  play: () => set((s) => ({ sim: { ...s.sim, playing: true } })),
  pause: () => set((s) => ({ sim: { ...s.sim, playing: false } })),
  stop: () =>
    set((s) => ({
      sim: {
        ...s.sim,
        playing: false,
        timeMs: 0,
        progress: 0,
        segmentIndex: 0,
        dispenserOn: false,
        position: s.simFrames[0]?.position ?? s.sim.position,
      },
    })),
  restart: () => {
    get().stop();
    get().play();
  },
  setSimSpeed: (speed) => set((s) => ({ sim: { ...s.sim, speed } })),
  stepForward: () => {
    const { simFrames, sim } = get();
    if (!simFrames.length) return;
    const nextIdx = Math.min(sim.segmentIndex + 1, simFrames.length - 1);
    const frame = simFrames[nextIdx];
    set({
      sim: {
        ...sim,
        playing: false,
        timeMs: frame.timeMs,
        position: frame.position,
        dispenserOn: frame.dispenserOn,
        productIndex: frame.productIndex,
        progress: frame.timeMs / (simFrames[simFrames.length - 1].timeMs || 1),
        segmentIndex: nextIdx,
      },
    });
  },
  stepBackward: () => {
    const { simFrames, sim } = get();
    if (!simFrames.length) return;
    const nextIdx = Math.max(sim.segmentIndex - 1, 0);
    const frame = simFrames[nextIdx];
    set({
      sim: {
        ...sim,
        playing: false,
        timeMs: frame.timeMs,
        position: frame.position,
        dispenserOn: frame.dispenserOn,
        productIndex: frame.productIndex,
        progress: frame.timeMs / (simFrames[simFrames.length - 1].timeMs || 1),
        segmentIndex: nextIdx,
      },
    });
  },
  tickSim: (dtMs) => {
    const { sim, simFrames } = get();
    if (!sim.playing || !simFrames.length) return;
    const total = simFrames[simFrames.length - 1].timeMs || 1;
    const timeMs = Math.min(sim.timeMs + dtMs * sim.speed, total);
    const interp = interpolateFrames(simFrames, timeMs);
    // Prefer enriched dispenser state from nearest frame
    const frame = simFrames[interp.segmentIndex];
    set({
      sim: {
        ...sim,
        timeMs,
        position: interp.position,
        dispenserOn: frame?.dispenserOn ?? interp.dispenserOn,
        productIndex: interp.productIndex,
        progress: interp.progress,
        segmentIndex: interp.segmentIndex,
        playing: timeMs < total,
      },
    });
  },
}));
