"use client";

import { create } from "zustand";
import { createProject, defaultPath, nextPathName, uid } from "@/lib/defaults";
import { generateGcode } from "@/lib/gcode/generator";
import { buildSimulationTimeline, interpolateFrames, parseGcode } from "@/lib/gcode/parser";
import type { SimKeyframe } from "@/lib/gcode/parser";
import { pathLengthMm } from "@/lib/fixture";
import { migrateProject } from "@/lib/models";
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  deleteProject,
  findProjectsWithName,
  getActiveProjectId,
  initProjectStorage,
  listSavedProjects,
  loadProject,
  nextCopyName,
  saveProject,
  stripLegacySampleStl,
} from "@/lib/storage";
import { loadStlGeometry } from "@/lib/stl";
import { canGenerate, validateProject } from "@/lib/validation";
import type {
  DispensingPath,
  ModelRole,
  PathPoint,
  Project,
  SimulationState,
  StlAsset,
  ValidationIssue,
  Vec3,
  WorkspaceTab,
} from "@/lib/types";

type GeometryCache = Record<string, ArrayBuffer>;

const MAX_HISTORY = 75;
const COALESCE_MS = 500;

let historyCoalesce: { key: string; at: number } | null = null;

/** Snapshot project for undo; shares STL base64 strings to avoid ballooning memory. */
function snapshotProject(project: Project): Project {
  return {
    ...project,
    machine: structuredClone(project.machine),
    nozzle: structuredClone(project.nozzle),
    dispenser: structuredClone(project.dispenser),
    motion: structuredClone(project.motion),
    models: project.models.map((m) => ({
      ...m,
      dimensions: { ...m.dimensions },
      transform: {
        position: { ...m.transform.position },
        rotation: { ...m.transform.rotation },
        scale: m.transform.scale,
      },
    })),
    paths: structuredClone(project.paths),
  };
}

interface ProjectStore {
  project: Project;
  tab: WorkspaceTab;
  issues: ValidationIssue[];
  sim: SimulationState;
  simFrames: SimKeyframe[];
  stlGeometryVersion: number;
  geometryCache: GeometryCache;
  hydrated: boolean;
  savedProjects: Array<{ id: string; name: string; updatedAt: string }>;
  saveError: string | null;
  saving: boolean;
  past: Project[];
  future: Project[];
  historySuspended: boolean;

  hydrate: () => Promise<void>;
  refreshSavedProjects: () => Promise<void>;
  setTab: (tab: WorkspaceTab) => void;
  setProjectName: (name: string) => void;
  patchMachine: (patch: Partial<Project["machine"]>) => void;
  patchNozzle: (patch: Partial<Project["nozzle"]>) => void;
  patchDispenser: (patch: Partial<Project["dispenser"]>) => void;
  patchMotion: (patch: Partial<Project["motion"]>) => void;
  setDryRun: (dryRun: boolean) => void;
  setNotes: (notes: string) => void;

  importStl: (file: File, role?: ModelRole) => Promise<void>;
  /** Swap mesh data for an existing model. Paths, role, and placement stay. */
  replaceModel: (id: string, file: File) => Promise<void>;
  removeModel: (id: string) => void;
  setActiveModel: (id: string) => void;
  setModelRole: (id: string, role: ModelRole) => void;
  updateModelTransform: (patch: Partial<StlAsset["transform"]>) => void;
  setModelPositionXY: (id: string, x: number, y: number) => void;
  beginTransientEdit: () => void;
  endTransientEdit: () => void;

  setActivePath: (id: string) => void;
  addPath: () => void;
  duplicatePath: (id: string) => void;
  deletePath: (id: string) => void;
  updatePath: (id: string, patch: Partial<DispensingPath>) => void;
  addPoint: (position: Vec3) => void;
  updatePoint: (pointId: string, position: Vec3) => void;
  deletePoint: (pointId: string) => void;
  clearPathPoints: () => void;
  /** When true, viewport clicks add Safe Z travel points instead of glue points. */
  placingSafePoint: boolean;
  setPlacingSafePoint: (placing: boolean) => void;
  addSafePoint: (x: number, y: number) => void;
  updateSafePoint: (pointId: string, x: number, y: number) => void;
  deleteSafePoint: (pointId: string) => void;
  clearSafePoints: () => void;

  generate: (opts?: { switchToGcodeTab?: boolean }) => void;
  setGcode: (gcode: string) => void;

  save: () => Promise<void>;
  load: (id: string) => Promise<void>;
  /** Save a copy and open it. Omit id to copy the project currently open, including unsaved edits. */
  duplicate: (id?: string) => Promise<void>;
  newProject: () => void;
  removeSaved: (id: string) => Promise<void>;

  undo: () => void;
  redo: () => void;

  refreshIssues: () => void;
  getActivePath: () => DispensingPath | undefined;
  getPathLength: () => number;

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

function geometryFromProject(project: Project): GeometryCache {
  const cache: GeometryCache = {};
  for (const m of project.models) {
    if (m.dataBase64) cache[m.id] = base64ToArrayBuffer(m.dataBase64);
  }
  return cache;
}

function ensureActivePathForModel(project: Project, modelId: string): Project {
  // Keep the current path if it already belongs to this model (e.g. "New path" then click)
  const active = project.paths.find((p) => p.id === project.activePathId);
  if (active && active.modelId === modelId) {
    return { ...project, activeModelId: modelId };
  }
  const existing = project.paths.find((p) => p.modelId === modelId);
  if (existing) {
    return { ...project, activePathId: existing.id, activeModelId: modelId };
  }
  const path = defaultPath(modelId, nextPathName(project.paths));
  return {
    ...project,
    activeModelId: modelId,
    paths: [...project.paths, path],
    activePathId: path.id,
  };
}

type StoreGet = () => ProjectStore;
type StoreSet = (
  partial:
    | Partial<ProjectStore>
    | ((state: ProjectStore) => Partial<ProjectStore> | ProjectStore)
) => void;

function pushHistory(set: StoreSet, get: StoreGet, coalesceKey?: string) {
  const state = get();
  if (state.historySuspended) return;

  const now = Date.now();
  if (
    coalesceKey &&
    historyCoalesce &&
    historyCoalesce.key === coalesceKey &&
    now - historyCoalesce.at < COALESCE_MS
  ) {
    historyCoalesce = { key: coalesceKey, at: now };
    return;
  }
  historyCoalesce = coalesceKey ? { key: coalesceKey, at: now } : null;

  set({
    past: [...state.past.slice(-(MAX_HISTORY - 1)), snapshotProject(state.project)],
    future: [],
  });
}

function clearHistory(set: StoreSet) {
  historyCoalesce = null;
  set({ past: [], future: [], historySuspended: false });
}

function restoreProject(set: StoreSet, get: StoreGet, project: Project) {
  const geometryCache = geometryFromProject(project);
  set({
    project,
    geometryCache,
    stlGeometryVersion: get().stlGeometryVersion + 1,
    issues: refresh(project),
    simFrames: [],
  });
  get().rebuildSim();
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  project: createProject("Untitled dispensing job"),
  tab: "model",
  placingSafePoint: false,
  issues: [],
  sim: {
    playing: false,
    speed: 4,
    timeMs: 0,
    position: { x: 0, y: 0, z: 25 },
    dispenserOn: false,
    productIndex: 0,
    progress: 0,
    segmentIndex: 0,
  },
  simFrames: [],
  stlGeometryVersion: 0,
  geometryCache: {},
  hydrated: false,
  savedProjects: [],
  saveError: null,
  saving: false,
  past: [],
  future: [],
  historySuspended: false,

  refreshSavedProjects: async () => {
    try {
      const savedProjects = await listSavedProjects();
      set({ savedProjects });
    } catch {
      set({ savedProjects: [] });
    }
  },

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      await initProjectStorage();
      const id = getActiveProjectId();
      if (id) {
        const loaded = await loadProject(id);
        if (loaded) {
          const project = stripLegacySampleStl(migrateProject(loaded));
          const geometryCache = geometryFromProject(project);
          historyCoalesce = null;
          set({
            project,
            issues: refresh(project),
            geometryCache,
            hydrated: true,
            stlGeometryVersion: Object.keys(geometryCache).length,
            saveError: null,
            past: [],
            future: [],
            historySuspended: false,
          });
          await get().refreshSavedProjects();
          get().rebuildSim();
          return;
        }
      }
      historyCoalesce = null;
      set({
        hydrated: true,
        issues: refresh(get().project),
        saveError: null,
        past: [],
        future: [],
        historySuspended: false,
      });
      await get().refreshSavedProjects();
    } catch (err) {
      console.error(err);
      historyCoalesce = null;
      set({
        hydrated: true,
        issues: refresh(get().project),
        saveError: err instanceof Error ? err.message : "Failed to load saved projects",
        past: [],
        future: [],
        historySuspended: false,
      });
    }
  },

  setTab: (tab) => set({ tab }),
  setProjectName: (name) => {
    pushHistory(set, get, "project-name");
    set((s) => ({ project: { ...s.project, name } }));
  },

  patchMachine: (patch) => {
    pushHistory(set, get, "machine");
    set((s) => {
      const machine = { ...s.project.machine, ...patch };
      const project = {
        ...s.project,
        machine,
        gcode: "",
      };
      const park = {
        x: machine.homePosition.x,
        y: machine.homePosition.y,
        z: project.motion.parkZ,
      };
      return {
        project,
        issues: refresh(project),
        simFrames: [],
        sim: { ...s.sim, playing: false, timeMs: 0, progress: 0, segmentIndex: 0, dispenserOn: false, position: park },
      };
    });
  },
  patchNozzle: (patch) => {
    pushHistory(set, get, "nozzle");
    set((s) => {
      const project = { ...s.project, nozzle: { ...s.project.nozzle, ...patch } };
      return { project, issues: refresh(project) };
    });
  },
  patchDispenser: (patch) => {
    pushHistory(set, get, "dispenser");
    set((s) => {
      const project = { ...s.project, dispenser: { ...s.project.dispenser, ...patch } };
      return { project, issues: refresh(project) };
    });
  },
  patchMotion: (patch) => {
    pushHistory(set, get, "motion");
    set((s) => {
      const motion = { ...s.project.motion, ...patch };
      const project = {
        ...s.project,
        motion,
        gcode: "",
      };
      const park = {
        x: project.machine.homePosition.x,
        y: project.machine.homePosition.y,
        z: motion.parkZ,
      };
      return {
        project,
        issues: refresh(project),
        simFrames: [],
        sim: { ...s.sim, playing: false, timeMs: 0, progress: 0, segmentIndex: 0, dispenserOn: false, position: park },
      };
    });
  },
  setDryRun: (dryRun) => {
    pushHistory(set, get);
    set((s) => {
      const project = { ...s.project, dryRun };
      return { project, issues: refresh(project) };
    });
  },
  setNotes: (notes) => {
    pushHistory(set, get, "notes");
    set((s) => ({ project: { ...s.project, notes } }));
  },

  importStl: async (file, role = "glue") => {
    const buffer = await file.arrayBuffer();
    const { dimensions } = loadStlGeometry(buffer.slice(0));
    const model: StlAsset = {
      id: uid("stl"),
      name: file.name,
      dataBase64: arrayBufferToBase64(buffer),
      dimensions,
      role,
      transform: {
        position: { x: 20, y: 20, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: 1,
      },
    };

    pushHistory(set, get);
    set((s) => {
      let project: Project = {
        ...s.project,
        models: [...s.project.models, model],
        activeModelId: model.id,
        gcode: "",
      };
      if (role === "glue") {
        const path = defaultPath(model.id, nextPathName(s.project.paths));
        project = {
          ...project,
          paths: [...project.paths, path],
          activePathId: path.id,
        };
      }
      return {
        project,
        geometryCache: { ...s.geometryCache, [model.id]: buffer },
        stlGeometryVersion: s.stlGeometryVersion + 1,
        issues: refresh(project),
        simFrames: [],
      };
    });
  },

  replaceModel: async (id, file) => {
    const existing = get().project.models.find((m) => m.id === id);
    if (!existing) return;
    const buffer = await file.arrayBuffer();
    const { dimensions } = loadStlGeometry(buffer.slice(0));

    pushHistory(set, get);
    set((s) => {
      const current = s.project.models.find((m) => m.id === id);
      if (!current) return s;
      const models = s.project.models.map((m) =>
        m.id === id
          ? {
              ...m,
              name: file.name,
              dataBase64: arrayBufferToBase64(buffer),
              dimensions,
            }
          : m
      );
      const project: Project = { ...s.project, models };
      return {
        project,
        geometryCache: { ...s.geometryCache, [id]: buffer },
        stlGeometryVersion: s.stlGeometryVersion + 1,
        issues: refresh(project),
      };
    });
  },

  removeModel: (id) => {
    pushHistory(set, get);
    set((s) => {
      const models = s.project.models.filter((m) => m.id !== id);
      const paths = s.project.paths.filter((p) => p.modelId !== id);
      const activeModelId =
        s.project.activeModelId === id ? models[0]?.id ?? null : s.project.activeModelId;
      const activePathId =
        paths.find((p) => p.id === s.project.activePathId)?.id ??
        paths.find((p) => p.modelId === activeModelId)?.id ??
        paths[0]?.id ??
        null;
      const project: Project = {
        ...s.project,
        models,
        paths,
        activeModelId,
        activePathId,
        gcode: "",
      };
      const geometryCache = { ...s.geometryCache };
      delete geometryCache[id];
      return {
        project,
        geometryCache,
        stlGeometryVersion: s.stlGeometryVersion + 1,
        issues: refresh(project),
        simFrames: [],
      };
    });
  },

  setActiveModel: (id) =>
    set((s) => {
      const model = s.project.models.find((m) => m.id === id);
      if (!model) return s;
      let project: Project = { ...s.project, activeModelId: id };
      if (model.role === "glue") {
        project = ensureActivePathForModel(project, id);
      }
      return { project, issues: refresh(project) };
    }),

  setModelRole: (id, role) => {
    const model = get().project.models.find((m) => m.id === id);
    if (!model || model.role === role) return;

    if (role === "obstacle") {
      const hasPath = get().project.paths.some((p) => p.modelId === id && p.points.length > 0);
      if (hasPath) {
        const ok = window.confirm(
          `Mark "${model.name}" as Obstacle? Its glue path(s) will be removed.`
        );
        if (!ok) return;
      }
    }

    pushHistory(set, get);
    set((s) => {
      const models = s.project.models.map((m) => (m.id === id ? { ...m, role } : m));
      let paths = s.project.paths;
      let project: Project = { ...s.project, models, gcode: "" };

      if (role === "obstacle") {
        paths = paths.filter((p) => p.modelId !== id);
        project = {
          ...project,
          paths,
          activePathId:
            project.activePathId && paths.some((p) => p.id === project.activePathId)
              ? project.activePathId
              : paths[0]?.id ?? null,
        };
      } else {
        project = ensureActivePathForModel({ ...project, paths }, id);
      }

      return { project, issues: refresh(project), simFrames: [] };
    });
  },

  updateModelTransform: (patch) => {
    if (!get().project.activeModelId) return;
    pushHistory(set, get, "model-transform");
    set((s) => {
      const id = s.project.activeModelId;
      if (!id) return s;
      const models = s.project.models.map((m) =>
        m.id === id ? { ...m, transform: { ...m.transform, ...patch } } : m
      );
      const project = { ...s.project, models, gcode: "" };
      return { project, issues: refresh(project), simFrames: [] };
    });
  },

  setModelPositionXY: (id, x, y) =>
    set((s) => {
      const rx = Math.round(x * 100) / 100;
      const ry = Math.round(y * 100) / 100;
      const models = s.project.models.map((m) =>
        m.id === id
          ? {
              ...m,
              transform: {
                ...m.transform,
                position: { ...m.transform.position, x: rx, y: ry },
              },
            }
          : m
      );
      // Lightweight during drag — skip validation until pointer up
      return {
        project: { ...s.project, models, gcode: "" },
        simFrames: [],
      };
    }),

  beginTransientEdit: () => {
    if (get().historySuspended) return;
    pushHistory(set, get);
    set({ historySuspended: true });
  },

  endTransientEdit: () => {
    historyCoalesce = null;
    set({ historySuspended: false });
  },

  setActivePath: (id) =>
    set((s) => {
      const path = s.project.paths.find((p) => p.id === id);
      if (!path) return s;
      return {
        project: {
          ...s.project,
          activePathId: id,
          activeModelId: path.modelId,
        },
      };
    }),

  addPath: () => {
    const model = get().project.models.find((m) => m.id === get().project.activeModelId);
    if (!model || model.role !== "glue") return;
    pushHistory(set, get);
    set((s) => {
      const path = defaultPath(model.id, nextPathName(s.project.paths));
      const project = {
        ...s.project,
        paths: [...s.project.paths, path],
        activePathId: path.id,
        gcode: "",
      };
      return { project, issues: refresh(project), simFrames: [] };
    });
  },

  duplicatePath: (id) => {
    const source = get().project.paths.find((p) => p.id === id);
    if (!source) return;
    pushHistory(set, get);
    set((s) => {
      const copy: DispensingPath = {
        ...source,
        id: uid("path"),
        name: nextPathName(s.project.paths),
        points: source.points.map((pt) => ({
          id: uid("pt"),
          position: {
            x: Math.round((pt.position.x + 15.3) * 100) / 100,
            y: pt.position.y,
            z: pt.position.z,
          },
        })),
        safePoints: (source.safePoints ?? []).map((pt) => ({
          id: uid("safe"),
          x: Math.round((pt.x + 15.3) * 100) / 100,
          y: pt.y,
        })),
      };
      const project = {
        ...s.project,
        paths: [...s.project.paths, copy],
        activePathId: copy.id,
        activeModelId: copy.modelId,
        gcode: "",
      };
      return { project, issues: refresh(project), simFrames: [] };
    });
  },

  deletePath: (id) => {
    pushHistory(set, get);
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
    });
  },

  updatePath: (id, patch) => {
    pushHistory(set, get, `path-${id}`);
    set((s) => {
      const paths = s.project.paths.map((p) => (p.id === id ? { ...p, ...patch } : p));
      const project = { ...s.project, paths, gcode: "" };
      return { project, issues: refresh(project), simFrames: [] };
    });
  },

  addPoint: (position) => {
    pushHistory(set, get);
    const rounded = {
      x: Math.round(position.x * 100) / 100,
      y: Math.round(position.y * 100) / 100,
      z: Math.round(position.z * 100) / 100,
    };
    set((s) => {
      const paths = s.project.paths.map((p) => {
        if (p.id !== s.project.activePathId) return p;
        const point: PathPoint = { id: uid("pt"), position: rounded };
        return { ...p, points: [...p.points, point] };
      });
      const project = { ...s.project, paths, gcode: "" };
      return { project, issues: refresh(project), simFrames: [] };
    });
  },

  updatePoint: (pointId, position) => {
    pushHistory(set, get, `point-${pointId}`);
    const rounded = {
      x: Math.round(position.x * 100) / 100,
      y: Math.round(position.y * 100) / 100,
      z: Math.round(position.z * 100) / 100,
    };
    set((s) => {
      const paths = s.project.paths.map((p) => {
        if (p.id !== s.project.activePathId) return p;
        return {
          ...p,
          points: p.points.map((pt) => (pt.id === pointId ? { ...pt, position: rounded } : pt)),
        };
      });
      const project = { ...s.project, paths, gcode: "" };
      return { project, issues: refresh(project), simFrames: [] };
    });
  },

  deletePoint: (pointId) => {
    pushHistory(set, get);
    set((s) => {
      const paths = s.project.paths.map((p) => {
        if (p.id !== s.project.activePathId) return p;
        return { ...p, points: p.points.filter((pt) => pt.id !== pointId) };
      });
      const project = { ...s.project, paths, gcode: "" };
      return { project, issues: refresh(project), simFrames: [] };
    });
  },

  clearPathPoints: () => {
    pushHistory(set, get);
    set((s) => {
      const paths = s.project.paths.map((p) =>
        p.id === s.project.activePathId ? { ...p, points: [] } : p
      );
      const project = { ...s.project, paths, gcode: "" };
      return { project, issues: refresh(project), simFrames: [] };
    });
  },

  setPlacingSafePoint: (placing) => set({ placingSafePoint: placing }),

  addSafePoint: (x, y) => {
    pushHistory(set, get);
    const point = {
      id: uid("safe"),
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
    };
    set((s) => {
      const paths = s.project.paths.map((p) => {
        if (p.id !== s.project.activePathId) return p;
        return { ...p, safePoints: [...(p.safePoints ?? []), point] };
      });
      const project = { ...s.project, paths, gcode: "" };
      return { project, issues: refresh(project), simFrames: [] };
    });
  },

  updateSafePoint: (pointId, x, y) => {
    pushHistory(set, get, `safe-${pointId}`);
    const next = { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
    set((s) => {
      const paths = s.project.paths.map((p) => {
        if (p.id !== s.project.activePathId) return p;
        return {
          ...p,
          safePoints: (p.safePoints ?? []).map((pt) => (pt.id === pointId ? { ...pt, ...next } : pt)),
        };
      });
      const project = { ...s.project, paths, gcode: "" };
      return { project, issues: refresh(project), simFrames: [] };
    });
  },

  deleteSafePoint: (pointId) => {
    pushHistory(set, get);
    set((s) => {
      const paths = s.project.paths.map((p) => {
        if (p.id !== s.project.activePathId) return p;
        return { ...p, safePoints: (p.safePoints ?? []).filter((pt) => pt.id !== pointId) };
      });
      const project = { ...s.project, paths, gcode: "" };
      return { project, issues: refresh(project), simFrames: [] };
    });
  },

  clearSafePoints: () => {
    pushHistory(set, get);
    set((s) => {
      const paths = s.project.paths.map((p) =>
        p.id === s.project.activePathId ? { ...p, safePoints: [] } : p
      );
      const project = { ...s.project, paths, gcode: "" };
      return { project, issues: refresh(project), simFrames: [] };
    });
  },

  generate: (opts) => {
    const switchToGcodeTab = opts?.switchToGcodeTab !== false;
    const { project } = get();
    if (!canGenerate(project)) {
      set({
        issues: refresh(project),
        ...(switchToGcodeTab ? { tab: "gcode" as const } : {}),
      });
      return;
    }
    try {
      const gcode = generateGcode(project);
      pushHistory(set, get);
      const next = { ...project, gcode };
      set({
        project: next,
        issues: refresh(next),
        ...(switchToGcodeTab ? { tab: "gcode" as const } : {}),
      });
      get().rebuildSim();
    } catch (e) {
      const message = e instanceof Error ? e.message : "G-code generation failed";
      set({ issues: [...refresh(project), { level: "error", message }] });
    }
  },

  setGcode: (gcode) => {
    pushHistory(set, get, "gcode");
    set((s) => {
      const project = { ...s.project, gcode };
      return { project, issues: refresh(project) };
    });
    get().rebuildSim();
  },

  save: async () => {
    const { project } = get();
    try {
      const conflicts = await findProjectsWithName(project.name, project.id);
      if (conflicts.length > 0) {
        const label = project.name.trim() || "Untitled";
        const ok = window.confirm(`A project named "${label}" already exists. Overwrite it?`);
        if (!ok) return;
        for (const conflict of conflicts) await deleteProject(conflict.id);
      }

      const started = Date.now();
      set({ saving: true });
      try {
        const saved = await saveProject(project);
        set({ project: saved, saveError: null });
        await get().refreshSavedProjects();
      } finally {
        const minMs = 500;
        const elapsed = Date.now() - started;
        if (elapsed < minMs) {
          await new Promise((r) => setTimeout(r, minMs - elapsed));
        }
        set({ saving: false });
      }
    } catch (err) {
      set({ saving: false });
      const message =
        err instanceof Error
          ? err.message
          : "Could not save project. Storage may be full — delete an old project and try again.";
      set({ saveError: message });
      window.alert(`Save failed: ${message}`);
    }
  },

  load: async (id) => {
    const loaded = await loadProject(id);
    if (!loaded) return;
    const project = migrateProject(loaded);
    const geometryCache = geometryFromProject(project);
    clearHistory(set);
    set((s) => ({
      project,
      issues: refresh(project),
      geometryCache,
      stlGeometryVersion: s.stlGeometryVersion + 1,
      saveError: null,
    }));
    get().rebuildSim();
  },

  duplicate: async (id) => {
    const started = Date.now();
    set({ saving: true, saveError: null });
    try {
      const current = get().project;
      const source =
        !id || id === current.id ? structuredClone(current) : await loadProject(id);
      if (!source) {
        set({ saveError: "Could not duplicate that project." });
        return;
      }

      const saved = await listSavedProjects();
      const copy: Project = {
        ...structuredClone(source),
        id: uid("proj"),
        name: nextCopyName(
          source.name,
          saved.map((p) => p.name)
        ),
      };
      const stored = await saveProject(copy);
      const project = migrateProject(stored);
      const geometryCache = geometryFromProject(project);
      clearHistory(set);
      set((s) => ({
        project,
        issues: refresh(project),
        geometryCache,
        stlGeometryVersion: s.stlGeometryVersion + 1,
        saveError: null,
      }));
      await get().refreshSavedProjects();
      get().rebuildSim();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Could not duplicate project. Storage may be full — delete an old project and try again.";
      set({ saveError: message });
      window.alert(`Duplicate failed: ${message}`);
    } finally {
      const minMs = 500;
      const elapsed = Date.now() - started;
      if (elapsed < minMs) {
        await new Promise((r) => setTimeout(r, minMs - elapsed));
      }
      set({ saving: false });
    }
  },

  newProject: () => {
    const project = createProject();
    clearHistory(set);
    set({
      project,
      issues: refresh(project),
      geometryCache: {},
      simFrames: [],
      stlGeometryVersion: get().stlGeometryVersion + 1,
      saveError: null,
    });
  },

  removeSaved: async (id) => {
    await deleteProject(id);
    await get().refreshSavedProjects();
  },

  undo: () => {
    const { past, project, future, historySuspended } = get();
    if (historySuspended || past.length === 0) return;
    historyCoalesce = null;
    const previous = past[past.length - 1];
    set({
      past: past.slice(0, -1),
      future: [snapshotProject(project), ...future].slice(0, MAX_HISTORY),
    });
    restoreProject(set, get, previous);
  },

  redo: () => {
    const { past, project, future, historySuspended } = get();
    if (historySuspended || future.length === 0) return;
    historyCoalesce = null;
    const next = future[0];
    set({
      future: future.slice(1),
      past: [...past, snapshotProject(project)].slice(-MAX_HISTORY),
    });
    restoreProject(set, get, next);
  },

  refreshIssues: () => set((s) => ({ issues: refresh(s.project) })),
  getActivePath: () => {
    const { project } = get();
    return project.paths.find((p) => p.id === project.activePathId) ?? project.paths[0];
  },
  getPathLength: () => {
    const path = get().getActivePath();
    return path ? pathLengthMm(path.points) : 0;
  },

  rebuildSim: () => {
    const { project } = get();
    const park = {
      x: project.machine.homePosition.x,
      y: project.machine.homePosition.y,
      z: project.motion.parkZ,
    };
    if (!project.gcode.trim()) {
      set((s) => ({
        simFrames: [],
        sim: { ...s.sim, playing: false, timeMs: 0, progress: 0, segmentIndex: 0, dispenserOn: false, position: park },
      }));
      return;
    }
    const moves = parseGcode(
      project.gcode,
      project.dispenser.activationCommand,
      project.dispenser.deactivationCommand
    );
    const frames = buildSimulationTimeline(moves, park);
    let dispenserOn = false;
    const enriched = frames.map((f) => {
      if (/dispenser ON/i.test(f.raw)) dispenserOn = true;
      if (/dispenser OFF/i.test(f.raw)) dispenserOn = false;
      if (f.moveType === "dispense_on") dispenserOn = true;
      if (f.moveType === "dispense_off") dispenserOn = false;
      return { ...f, dispenserOn };
    });
    const start = enriched[0]?.position ?? park;
    set((s) => ({
      simFrames: enriched,
      issues: refresh(project),
      sim: { ...s.sim, playing: false, timeMs: 0, progress: 0, segmentIndex: 0, dispenserOn: false, position: start },
    }));
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
