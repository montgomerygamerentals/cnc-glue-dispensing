import type {
  DispenserConfig,
  DispensingPath,
  MachineConfig,
  MotionConfig,
  NozzleAssembly,
  Project,
} from "./types";

export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export const defaultMachine = (): MachineConfig => ({
  model: "YoraHome CNC Router 3018-Pro",
  travelX: 300,
  travelY: 180,
  travelZ: 40,
  workAreaX: 300,
  workAreaY: 180,
  workAreaZ: 40,
  maxSpeed: 2000,
  acceleration: 100,
  homePosition: { x: 0, y: 0, z: 0 },
  machineOrigin: { x: 0, y: 0, z: 0 },
  coordinateSystem: "absolute",
  grblCompatible: true,
  units: "mm",
});

export const defaultNozzle = (): NozzleAssembly => ({
  syringeAngleDeg: 0,
  nozzleAngleDeg: 0,
  horizontalOffset: 50,
  verticalOffset: 0,
  nozzleLength: 30,
  nozzleClearance: 1.5,
  mountPosition: { x: 0, y: 0, z: 40 },
});

export const defaultDispenser = (): DispenserConfig => ({
  // YoraHome 3018-Pro laser port (GRBL): PWM/enable via M3 S… / M5 — wire relay to laser output, not spindle.
  activationCommand: "M3 S1000",
  deactivationCommand: "M5",
  activationDelayMs: 150,
  deactivationDelayMs: 100,
  purgeTimeMs: 0,
  leadInMm: 0,
  leadOutMm: 0,
  cutoffBeforeEndSec: 0,
  verifiedHardware: false,
});

export const defaultMotion = (): MotionConfig => ({
  rapidSpeed: 1500,
  dispensingSpeed: 400,
  zSpeed: 300,
  safeZ: 15,
  parkZ: 25,
  dispensingZ: 2,
  startOffset: { x: 0, y: 0, z: 0 },
  endOffset: { x: 0, y: 0, z: 0 },
});

export const defaultPath = (modelId: string, name = "Path 1"): DispensingPath => ({
  id: uid("path"),
  name,
  modelId,
  mode: "planar",
  points: [],
  safePoints: [],
  retraceAtSafeZ: false,
  planarZ: 2,
  nozzleClearance: 1.5,
  direction: 1,
});

/** Next unused "Path N" name based on existing path names. */
export function nextPathName(paths: Array<{ name: string }>): string {
  let max = 0;
  for (const p of paths) {
    const match = /^Path\s+(\d+)$/i.exec(p.name.trim());
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `Path ${max + 1}`;
}

export function createProject(name = "Untitled dispensing job"): Project {
  return {
    id: uid("proj"),
    name,
    updatedAt: new Date().toISOString(),
    machine: defaultMachine(),
    nozzle: defaultNozzle(),
    dispenser: defaultDispenser(),
    motion: defaultMotion(),
    models: [],
    activeModelId: null,
    paths: [],
    activePathId: null,
    dryRun: true,
    gcode: "",
    notes: "",
    camera: null,
  };
}
