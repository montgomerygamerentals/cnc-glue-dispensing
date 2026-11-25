import type { CameraView, MachineConfig, Vec3 } from "./types";

let reader: (() => CameraView | null) | null = null;

/** Viewport registers this so Save can read the live orbit camera without React state. */
export function registerLiveCameraReader(next: () => CameraView | null): () => void {
  reader = next;
  return () => {
    if (reader === next) reader = null;
  };
}

export function readLiveCamera(): CameraView | null {
  const view = reader?.() ?? null;
  return view ? cloneCameraView(view) : null;
}

/** Framing used when a project has no saved camera. Matches the viewport's initial pose. */
export function defaultCameraView(
  machine: Pick<MachineConfig, "workAreaX" | "workAreaY" | "workAreaZ">
): CameraView {
  return {
    position: {
      x: machine.workAreaX * 0.9,
      y: -machine.workAreaY * 0.9,
      z: machine.workAreaZ * 3.2,
    },
    target: {
      x: machine.workAreaX / 2,
      y: machine.workAreaY / 2,
      z: machine.workAreaZ / 2,
    },
    up: { x: 0, y: 0, z: 1 },
  };
}

function finiteVec(value: unknown): Vec3 | null {
  if (!value || typeof value !== "object") return null;
  const { x, y, z } = value as Vec3;
  if (![x, y, z].every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  return { x, y, z };
}

/** Drop incomplete or degenerate poses from older saves. */
export function sanitizeCameraView(raw: unknown): CameraView | null {
  if (!raw || typeof raw !== "object") return null;
  const view = raw as CameraView;
  const position = finiteVec(view.position);
  const target = finiteVec(view.target);
  const up = finiteVec(view.up);
  if (!position || !target || !up) return null;
  const upLen = up.x * up.x + up.y * up.y + up.z * up.z;
  if (upLen < 1e-12) return null;
  const dx = position.x - target.x;
  const dy = position.y - target.y;
  const dz = position.z - target.z;
  if (dx * dx + dy * dy + dz * dz < 1e-8) return null;
  return { position, target, up };
}

function cloneCameraView(view: CameraView): CameraView {
  return {
    position: { ...view.position },
    target: { ...view.target },
    up: { ...view.up },
  };
}
