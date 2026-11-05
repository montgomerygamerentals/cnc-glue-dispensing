export type Units = "mm" | "inch";
export type CoordinateSystem = "absolute" | "relative";
export type PathMode = "planar" | "surface";
export type WorkspaceTab =
  | "model"
  | "fixture"
  | "path"
  | "dispenser"
  | "machine"
  | "calibration"
  | "gcode";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface MachineConfig {
  model: string;
  travelX: number;
  travelY: number;
  travelZ: number;
  workAreaX: number;
  workAreaY: number;
  workAreaZ: number;
  maxSpeed: number;
  acceleration: number;
  homePosition: Vec3;
  machineOrigin: Vec3;
  coordinateSystem: CoordinateSystem;
  grblCompatible: boolean;
  units: Units;
}

export interface ModelTransform {
  position: Vec3;
  rotation: Vec3;
  scale: number;
}

export interface StlAsset {
  id: string;
  name: string;
  /** base64 of ArrayBuffer for persistence */
  dataBase64: string;
  dimensions: Vec3;
  transform: ModelTransform;
}

export interface PathPoint {
  id: string;
  position: Vec3;
}

export interface DispensingPath {
  id: string;
  name: string;
  mode: PathMode;
  points: PathPoint[];
  /** Fixed Z for planar mode; clearance applied separately */
  planarZ: number;
  nozzleClearance: number;
  direction: 1 | -1;
}

export interface FixtureConfig {
  rows: number;
  columns: number;
  spacingX: number;
  spacingY: number;
  orientationDeg: number;
  width: number;
  depth: number;
  height: number;
  machinePosition: Vec3;
  /** Optional per-slot offsets keyed by "r-c" */
  slotOffsets: Record<string, Vec3>;
}

export interface NozzleAssembly {
  syringeAngleDeg: number;
  nozzleAngleDeg: number;
  horizontalOffset: number;
  verticalOffset: number;
  nozzleLength: number;
  nozzleClearance: number;
  mountPosition: Vec3;
}

export interface DispenserConfig {
  activationCommand: string;
  deactivationCommand: string;
  activationDelayMs: number;
  deactivationDelayMs: number;
  purgeTimeMs: number;
  leadInMm: number;
  leadOutMm: number;
  verifiedHardware: boolean;
}

export interface MotionConfig {
  rapidSpeed: number;
  dispensingSpeed: number;
  zSpeed: number;
  safeZ: number;
  dispensingZ: number;
  startOffset: Vec3;
  endOffset: Vec3;
}

export interface Project {
  id: string;
  name: string;
  updatedAt: string;
  machine: MachineConfig;
  fixture: FixtureConfig;
  nozzle: NozzleAssembly;
  dispenser: DispenserConfig;
  motion: MotionConfig;
  stl: StlAsset | null;
  paths: DispensingPath[];
  activePathId: string | null;
  dryRun: boolean;
  gcode: string;
  notes: string;
}

export interface ValidationIssue {
  level: "error" | "warning" | "info";
  message: string;
}

export interface SimulationState {
  playing: boolean;
  speed: number;
  timeMs: number;
  position: Vec3;
  dispenserOn: boolean;
  productIndex: number;
  progress: number;
  segmentIndex: number;
}

export interface ParsedMove {
  type: "rapid" | "feed" | "dwell" | "dispense_on" | "dispense_off" | "comment" | "other";
  x?: number;
  y?: number;
  z?: number;
  f?: number;
  dwellMs?: number;
  raw: string;
  productIndex?: number;
}
