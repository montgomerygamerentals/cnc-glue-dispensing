import type {
  DispenserConfig,
  DispensingPath,
  FixtureConfig,
  MachineConfig,
  MotionConfig,
  NozzleAssembly,
  Project,
} from "./types";

export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export const defaultMachine = (): MachineConfig => ({
  model: "SainSmart Genmitsu (confirm model)",
  travelX: 300,
  travelY: 180,
  travelZ: 45,
  workAreaX: 300,
  workAreaY: 180,
  workAreaZ: 45,
  maxSpeed: 2000,
  acceleration: 100,
  homePosition: { x: 0, y: 0, z: 0 },
  machineOrigin: { x: 0, y: 0, z: 0 },
  coordinateSystem: "absolute",
  grblCompatible: true,
  units: "mm",
});

export const defaultFixture = (): FixtureConfig => ({
  rows: 3,
  columns: 4,
  spacingX: 60,
  spacingY: 45,
  orientationDeg: 0,
  width: 260,
  depth: 150,
  height: 12,
  machinePosition: { x: 20, y: 20, z: 0 },
  slotOffsets: {},
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
  activationCommand: "M8",
  deactivationCommand: "M9",
  activationDelayMs: 150,
  deactivationDelayMs: 100,
  purgeTimeMs: 0,
  leadInMm: 0,
  leadOutMm: 0,
  verifiedHardware: false,
});

export const defaultMotion = (): MotionConfig => ({
  rapidSpeed: 1500,
  dispensingSpeed: 400,
  zSpeed: 300,
  safeZ: 15,
  dispensingZ: 2,
  startOffset: { x: 0, y: 0, z: 0 },
  endOffset: { x: 0, y: 0, z: 0 },
});

export const defaultPath = (): DispensingPath => ({
  id: uid("path"),
  name: "Primary adhesive path",
  mode: "planar",
  points: [
    { id: uid("pt"), position: { x: -15, y: 0, z: 2 } },
    { id: uid("pt"), position: { x: 15, y: 0, z: 2 } },
  ],
  planarZ: 2,
  nozzleClearance: 1.5,
  direction: 1,
});

export function createProject(name = "Untitled dispensing job"): Project {
  const path = defaultPath();
  return {
    id: uid("proj"),
    name,
    updatedAt: new Date().toISOString(),
    machine: defaultMachine(),
    fixture: defaultFixture(),
    nozzle: defaultNozzle(),
    dispenser: defaultDispenser(),
    motion: defaultMotion(),
    stl: null,
    paths: [path],
    activePathId: path.id,
    dryRun: true,
    gcode: "",
    notes: "",
  };
}

export const HARDWARE_WARNING = `Hardware verification required before live dispensing.

The pneumatic dispenser's foot pedal input is a separate electrical circuit. The CNC controller must trigger an isolated relay that simulates foot-pedal switch closure. Do not connect CNC output voltage directly to the dispenser's pedal input.

Confirm before adhesive use:
• Genmitsu model, travel limits, and GRBL firmware
• Controller output type/voltage for dispenser ON/OFF
• Relay module input requirements and COM/NO or COM/NC wiring
• Dispenser foot-pedal contact behavior (NO/NC) and pinout
• Dry-run motion with dispenser disabled
• Nozzle clearance and fixture registration on the physical machine

Configurable commands (default M8/M9) are placeholders until your pinout is confirmed.`;
