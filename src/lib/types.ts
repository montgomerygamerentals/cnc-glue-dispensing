export type Units = "mm" | "inch";
export type CoordinateSystem = "absolute" | "relative";
export type PathMode = "planar" | "surface";
export type ModelRole = "glue" | "obstacle";
export type WorkspaceTab =
  | "projects"
  | "model"
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
  /** Glue targets get paths; obstacles are clearance geometry only */
  role: ModelRole;
}

export interface PathPoint {
  id: string;
  position: Vec3;
}

/** XY waypoint flown at Safe Z on the way to a glue path. The relay stays off. */
export interface SafeTravelPoint {
  id: string;
  x: number;
  y: number;
}

export interface DispensingPath {
  id: string;
  name: string;
  /** Model this path belongs to (glue targets only) */
  modelId: string;
  mode: PathMode;
  points: PathPoint[];
  /** XY points visited at Safe Z before this path's glue starts. */
  safePoints: SafeTravelPoint[];
  /** After this glue line, rapid back along it in reverse at Safe Z before the next path. */
  retraceAtSafeZ: boolean;
  /** Fixed Z for planar mode; clearance applied separately */
  planarZ: number;
  nozzleClearance: number;
  direction: 1 | -1;
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
  /** Seconds before the end of each glue run to turn the relay off. 0 = off at the last point. */
  cutoffBeforeEndSec: number;
  verifiedHardware: boolean;
}

export interface MotionConfig {
  rapidSpeed: number;
  dispensingSpeed: number;
  zSpeed: number;
  /** Clearance Z while traveling between paths */
  safeZ: number;
  /** Z at start/end park (home XY) before first move and after last path */
  parkZ: number;
  dispensingZ: number;
  startOffset: Vec3;
  endOffset: Vec3;
}

/** Orbit camera pose in machine coordinates. */
export interface CameraView {
  position: Vec3;
  target: Vec3;
  up: Vec3;
}

export interface Project {
  id: string;
  name: string;
  updatedAt: string;
  machine: MachineConfig;
  nozzle: NozzleAssembly;
  dispenser: DispenserConfig;
  motion: MotionConfig;
  models: StlAsset[];
  activeModelId: string | null;
  paths: DispensingPath[];
  activePathId: string | null;
  dryRun: boolean;
  gcode: string;
  notes: string;
  /** Last viewport camera. Null until the project is saved with a view. */
  camera: CameraView | null;
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
  /** Spindle/laser power on this block. S0 turns the relay off without a separate stop. */
  s?: number;
  dwellMs?: number;
  raw: string;
  productIndex?: number;
}

export interface ToolpathSegment {
  from: Vec3;
  to: Vec3;
  kind: "rapid" | "dispense";
}
