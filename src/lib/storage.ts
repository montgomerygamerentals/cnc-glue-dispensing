import { migrateProject } from "./models";
import type { Project, StlAsset } from "./types";

const PROJECTS_KEY = "cnc-glue-projects-v1";
const ACTIVE_KEY = "cnc-glue-active-project-id";
const SAMPLE_STRIP_FLAG = "cnc-glue-sample-stl-stripped-v1";
const IDB_MIGRATE_FLAG = "cnc-glue-idb-migrated-v1";

const DB_NAME = "cnc-glue-dispensing";
const DB_VERSION = 1;
const STORE_NAME = "projects";

/** Former bundled/procedural demo models — never reintroduce these. */
export function isLegacySampleStl(stl: StlAsset | null | undefined): boolean {
  if (!stl?.name) return false;
  const name = stl.name.trim().toLowerCase();
  return (
    name === "sample-dangle.stl" ||
    name === "sample_dangle.stl" ||
    name === "sample dangle.stl" ||
    /^sample[-_\s]?dangle(\.stl)?$/.test(name)
  );
}

/** Drop legacy sample STL blobs; keep the rest of the project. */
export function stripLegacySampleStl(project: Project): Project {
  const models = project.models.filter((m) => !isLegacySampleStl(m));
  if (models.length === project.models.length) return project;
  const activeModelId =
    project.activeModelId && models.some((m) => m.id === project.activeModelId)
      ? project.activeModelId
      : models[0]?.id ?? null;
  const paths = project.paths.filter((p) => models.some((m) => m.id === p.modelId));
  return {
    ...project,
    models,
    activeModelId,
    paths,
    activePathId:
      project.activePathId && paths.some((p) => p.id === project.activePathId)
        ? project.activePathId
        : paths[0]?.id ?? null,
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open project database"));
  });
}

function idbReq<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function readLegacyLocalProjects(): Record<string, Project> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, Project>;
  } catch {
    return {};
  }
}

/** Move old localStorage projects into IndexedDB and free the ~5MB quota. */
async function migrateLocalStorageToIdb(): Promise<void> {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(IDB_MIGRATE_FLAG) === "1") {
    // Still try to clear leftover localStorage blobs if migrate flag was set but clear failed.
    try {
      localStorage.removeItem(PROJECTS_KEY);
    } catch {
      /* ignore */
    }
    return;
  }

  const legacy = readLegacyLocalProjects();
  const projects = Object.values(legacy).map((p) => stripLegacySampleStl(migrateProject(p)));
  if (projects.length > 0) {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        for (const project of projects) {
          tx.objectStore(STORE_NAME).put(project);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("Migration transaction failed"));
        tx.onabort = () => reject(tx.error ?? new Error("Migration transaction aborted"));
      });
    } finally {
      db.close();
    }
  }

  // Free localStorage quota before writing small flags.
  try {
    localStorage.removeItem(PROJECTS_KEY);
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(SAMPLE_STRIP_FLAG, "1");
    localStorage.setItem(IDB_MIGRATE_FLAG, "1");
  } catch {
    // If quota is still exhausted, drop other non-essential keys and retry once.
    try {
      localStorage.removeItem(PROJECTS_KEY);
      localStorage.setItem(SAMPLE_STRIP_FLAG, "1");
      localStorage.setItem(IDB_MIGRATE_FLAG, "1");
    } catch {
      /* ignore — IDB already has the projects */
    }
  }
}

export async function initProjectStorage(): Promise<void> {
  if (typeof window === "undefined") return;
  await migrateLocalStorageToIdb();
}

export function normalizeProjectName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** "Name copy", then "Name copy 2", skipping names already in use. */
export function nextCopyName(sourceName: string, existingNames: string[]): string {
  const root = sourceName.trim() || "Untitled";
  const taken = new Set(existingNames.map(normalizeProjectName));
  let candidate = `${root} copy`;
  let n = 2;
  while (taken.has(normalizeProjectName(candidate))) {
    candidate = `${root} copy ${n}`;
    n += 1;
  }
  return candidate;
}

export async function listSavedProjects(): Promise<Array<{ id: string; name: string; updatedAt: string }>> {
  if (typeof window === "undefined") return [];
  await initProjectStorage();
  const db = await openDb();
  try {
    const rows = await idbReq(db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll());
    return (rows as Project[])
      .map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } finally {
    db.close();
  }
}

/** Other saved projects that share this display name (case/whitespace-insensitive). */
export async function findProjectsWithName(
  name: string,
  exceptId?: string
): Promise<Array<{ id: string; name: string; updatedAt: string }>> {
  const key = normalizeProjectName(name);
  if (!key) return [];
  const all = await listSavedProjects();
  return all.filter((p) => p.id !== exceptId && normalizeProjectName(p.name) === key);
}

export async function loadProject(id: string): Promise<Project | null> {
  if (typeof window === "undefined") return null;
  await initProjectStorage();
  const db = await openDb();
  try {
    const project = await idbReq(
      db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id)
    );
    if (!project) return null;
    return stripLegacySampleStl(migrateProject(project));
  } finally {
    db.close();
  }
}

export async function saveProject(project: Project): Promise<Project> {
  if (typeof window === "undefined") return project;
  await initProjectStorage();
  const cleaned = stripLegacySampleStl(migrateProject(project));
  const updated = { ...cleaned, updatedAt: new Date().toISOString() };
  const db = await openDb();
  try {
    await idbReq(db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(updated));
  } finally {
    db.close();
  }
  localStorage.setItem(ACTIVE_KEY, updated.id);
  return updated;
}

export async function deleteProject(id: string): Promise<void> {
  if (typeof window === "undefined") return;
  await initProjectStorage();
  const db = await openDb();
  try {
    await idbReq(db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(id));
  } finally {
    db.close();
  }
  if (localStorage.getItem(ACTIVE_KEY) === id) localStorage.removeItem(ACTIVE_KEY);
}

export function getActiveProjectId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_KEY);
}

export function downloadText(filename: string, content: string, mime = "text/plain"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
