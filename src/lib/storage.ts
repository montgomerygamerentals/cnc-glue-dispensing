import type { Project, StlAsset } from "./types";

const PROJECTS_KEY = "cnc-glue-projects-v1";
const ACTIVE_KEY = "cnc-glue-active-project-id";
const SAMPLE_STRIP_FLAG = "cnc-glue-sample-stl-stripped-v1";

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
  if (!isLegacySampleStl(project.stl)) return project;
  return { ...project, stl: null };
}

/**
 * One-time rewrite of localStorage: remove embedded sample-dangle (etc.) STL data
 * left over from older app versions. User-imported models are kept.
 */
export function migrateStripLegacySampleStls(): void {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(SAMPLE_STRIP_FLAG) === "1") return;
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (raw) {
      const map = JSON.parse(raw) as Record<string, Project>;
      let changed = false;
      for (const id of Object.keys(map)) {
        if (!isLegacySampleStl(map[id].stl)) continue;
        map[id] = { ...map[id], stl: null, updatedAt: new Date().toISOString() };
        changed = true;
      }
      if (changed) localStorage.setItem(PROJECTS_KEY, JSON.stringify(map));
    }
  } catch {
    // ignore corrupt storage
  }
  localStorage.setItem(SAMPLE_STRIP_FLAG, "1");
}

export function listSavedProjects(): Array<{ id: string; name: string; updatedAt: string }> {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (!raw) return [];
    const map = JSON.parse(raw) as Record<string, Project>;
    return Object.values(map)
      .map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

export function loadProject(id: string): Project | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, Project>;
    const project = map[id];
    if (!project) return null;
    return stripLegacySampleStl(project);
  } catch {
    return null;
  }
}

export function saveProject(project: Project): void {
  if (typeof window === "undefined") return;
  const cleaned = stripLegacySampleStl(project);
  const updated = { ...cleaned, updatedAt: new Date().toISOString() };
  const raw = localStorage.getItem(PROJECTS_KEY);
  const map = raw ? (JSON.parse(raw) as Record<string, Project>) : {};
  map[updated.id] = updated;
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(map));
  localStorage.setItem(ACTIVE_KEY, updated.id);
}

export function deleteProject(id: string): void {
  if (typeof window === "undefined") return;
  const raw = localStorage.getItem(PROJECTS_KEY);
  if (!raw) return;
  const map = JSON.parse(raw) as Record<string, Project>;
  delete map[id];
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(map));
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
