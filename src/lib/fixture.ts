import type { PathPoint } from "./types";

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
