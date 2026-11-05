import type { Project } from "./types";

const PROJECTS_KEY = "cnc-glue-projects-v1";
const ACTIVE_KEY = "cnc-glue-active-project-id";

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
    return map[id] ?? null;
  } catch {
    return null;
  }
}

export function saveProject(project: Project): void {
  if (typeof window === "undefined") return;
  const updated = { ...project, updatedAt: new Date().toISOString() };
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
