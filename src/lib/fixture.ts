import type { DispensingPath, FixtureConfig, PathPoint, Vec3 } from "./types";
import { uid } from "./defaults";

export function fixtureSlotCount(fixture: FixtureConfig): number {
  return fixture.rows * fixture.columns;
}

export function slotKey(row: number, col: number): string {
  return `${row}-${col}`;
}

/** Origin of slot (row,col) in machine coordinates (product local origin). */
export function slotOrigin(fixture: FixtureConfig, row: number, col: number): Vec3 {
  const key = slotKey(row, col);
  const offset = fixture.slotOffsets[key] ?? { x: 0, y: 0, z: 0 };
  const rad = (fixture.orientationDeg * Math.PI) / 180;
  const localX = col * fixture.spacingX;
  const localY = row * fixture.spacingY;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rx = localX * cos - localY * sin;
  const ry = localX * sin + localY * cos;
  return {
    x: fixture.machinePosition.x + rx + offset.x,
    y: fixture.machinePosition.y + ry + offset.y,
    z: fixture.machinePosition.z + offset.z,
  };
}

export function allSlotOrigins(fixture: FixtureConfig): Array<{ row: number; col: number; origin: Vec3; index: number }> {
  const slots: Array<{ row: number; col: number; origin: Vec3; index: number }> = [];
  let index = 0;
  for (let r = 0; r < fixture.rows; r++) {
    for (let c = 0; c < fixture.columns; c++) {
      slots.push({ row: r, col: c, origin: slotOrigin(fixture, r, c), index });
      index++;
    }
  }
  return slots;
}

export function transformPoint(local: Vec3, origin: Vec3, orientationDeg: number): Vec3 {
  const rad = (orientationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: origin.x + local.x * cos - local.y * sin,
    y: origin.y + local.x * sin + local.y * cos,
    z: origin.z + local.z,
  };
}

export function pathLengthMm(points: PathPoint[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1].position;
    const b = points[i].position;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    len += Math.hypot(dx, dy, dz);
  }
  return len;
}

export function replicatePathAcrossFixture(
  path: DispensingPath,
  fixture: FixtureConfig
): Array<{ index: number; row: number; col: number; points: Vec3[] }> {
  return allSlotOrigins(fixture).map((slot) => ({
    index: slot.index,
    row: slot.row,
    col: slot.col,
    points: path.points.map((p) =>
      transformPoint(
        {
          x: p.position.x,
          y: p.position.y,
          z: path.mode === "planar" ? path.planarZ : p.position.z,
        },
        slot.origin,
        fixture.orientationDeg
      )
    ),
  }));
}

export function clonePathWithOffset(path: DispensingPath, offset: Vec3): DispensingPath {
  return {
    ...path,
    id: uid("path"),
    points: path.points.map((p) => ({
      id: uid("pt"),
      position: {
        x: p.position.x + offset.x,
        y: p.position.y + offset.y,
        z: p.position.z + offset.z,
      },
    })),
  };
}
