import type { ParsedMove, Vec3 } from "../types";

/**
 * Parse generated G-code into simulation moves.
 * Source of truth for the simulator is the G-code text itself.
 */
export function parseGcode(gcode: string, onCmd = "M8", offCmd = "M9"): ParsedMove[] {
  const moves: ParsedMove[] = [];
  let productIndex = 0;
  const onNorm = onCmd.trim().toUpperCase();
  const offNorm = offCmd.trim().toUpperCase();

  for (const rawLine of gcode.split(/\r?\n/)) {
    const raw = rawLine.trim();
    if (!raw) continue;

    if (raw.startsWith(";")) {
      const productMatch = raw.match(/Product\s+(\d+)/i);
      if (productMatch) productIndex = Number(productMatch[1]) - 1;
      moves.push({ type: "comment", raw, productIndex });
      continue;
    }

    const code = raw.split(";")[0].trim();
    if (!code) continue;
    const upper = code.toUpperCase();

    if (upper === onNorm || upper.startsWith(onNorm + " ")) {
      moves.push({ type: "dispense_on", raw, productIndex });
      continue;
    }
    if (upper === offNorm || upper.startsWith(offNorm + " ")) {
      moves.push({ type: "dispense_off", raw, productIndex });
      continue;
    }

    const dwell = upper.match(/^G4\s+P([-\d.]+)/);
    if (dwell) {
      moves.push({
        type: "dwell",
        dwellMs: Number(dwell[1]) * 1000,
        raw,
        productIndex,
      });
      continue;
    }

    const isRapid = /^G0\b/.test(upper) || /^G00\b/.test(upper);
    const isFeed = /^G1\b/.test(upper) || /^G01\b/.test(upper);
    if (isRapid || isFeed) {
      const x = axis(upper, "X");
      const y = axis(upper, "Y");
      const z = axis(upper, "Z");
      const f = axis(upper, "F");
      moves.push({
        type: isRapid ? "rapid" : "feed",
        x,
        y,
        z,
        f,
        raw,
        productIndex,
      });
      continue;
    }

    moves.push({ type: "other", raw, productIndex });
  }

  return moves;
}

function axis(line: string, letter: string): number | undefined {
  const m = line.match(new RegExp(`${letter}(-?\\d*\\.?\\d+)`));
  return m ? Number(m[1]) : undefined;
}

export interface SimKeyframe {
  timeMs: number;
  position: Vec3;
  dispenserOn: boolean;
  productIndex: number;
  moveType: ParsedMove["type"];
  raw: string;
}

/** Build timed keyframes from parsed moves for playback. */
export function buildSimulationTimeline(
  moves: ParsedMove[],
  start: Vec3 = { x: 0, y: 0, z: 15 }
): SimKeyframe[] {
  const frames: SimKeyframe[] = [];
  let t = 0;
  let pos = { ...start };
  let dispenserOn = false;
  let productIndex = 0;

  frames.push({
    timeMs: 0,
    position: { ...pos },
    dispenserOn: false,
    productIndex: 0,
    moveType: "other",
    raw: "; start",
  });

  for (const move of moves) {
    if (move.productIndex !== undefined) productIndex = move.productIndex;

    // Dry-run comment markers still drive the ON/OFF indicator in simulation
    if (move.type === "comment") {
      if (/dispenser ON/i.test(move.raw)) {
        dispenserOn = true;
        t += 1;
        frames.push({
          timeMs: t,
          position: { ...pos },
          dispenserOn,
          productIndex,
          moveType: "dispense_on",
          raw: move.raw,
        });
      } else if (/dispenser OFF/i.test(move.raw)) {
        dispenserOn = false;
        t += 1;
        frames.push({
          timeMs: t,
          position: { ...pos },
          dispenserOn,
          productIndex,
          moveType: "dispense_off",
          raw: move.raw,
        });
      }
      continue;
    }

    if (move.type === "dispense_on") {
      dispenserOn = true;
      t += 1;
      frames.push({ timeMs: t, position: { ...pos }, dispenserOn, productIndex, moveType: move.type, raw: move.raw });
      continue;
    }
    if (move.type === "dispense_off") {
      dispenserOn = false;
      t += 1;
      frames.push({ timeMs: t, position: { ...pos }, dispenserOn, productIndex, moveType: move.type, raw: move.raw });
      continue;
    }
    if (move.type === "dwell") {
      t += move.dwellMs ?? 0;
      frames.push({ timeMs: t, position: { ...pos }, dispenserOn, productIndex, moveType: move.type, raw: move.raw });
      continue;
    }
    if (move.type === "rapid" || move.type === "feed") {
      const next = {
        x: move.x ?? pos.x,
        y: move.y ?? pos.y,
        z: move.z ?? pos.z,
      };
      const dist = Math.hypot(next.x - pos.x, next.y - pos.y, next.z - pos.z);
      const feed = move.f ?? (move.type === "rapid" ? 1500 : 400);
      const duration = feed > 0 ? (dist / feed) * 60_000 : 0;
      t += Math.max(duration, 1);
      pos = next;
      frames.push({
        timeMs: t,
        position: { ...pos },
        dispenserOn,
        productIndex,
        moveType: move.type,
        raw: move.raw,
      });
    }
  }

  return frames;
}

export function interpolateFrames(
  frames: SimKeyframe[],
  timeMs: number
): { position: Vec3; dispenserOn: boolean; productIndex: number; progress: number; segmentIndex: number } {
  if (frames.length === 0) {
    return {
      position: { x: 0, y: 0, z: 15 },
      dispenserOn: false,
      productIndex: 0,
      progress: 0,
      segmentIndex: 0,
    };
  }
  const total = frames[frames.length - 1].timeMs || 1;
  const clamped = Math.max(0, Math.min(timeMs, total));

  let i = 0;
  while (i < frames.length - 1 && frames[i + 1].timeMs < clamped) i++;

  const a = frames[i];
  const b = frames[Math.min(i + 1, frames.length - 1)];
  const span = Math.max(1, b.timeMs - a.timeMs);
  const u = (clamped - a.timeMs) / span;

  return {
    position: {
      x: a.position.x + (b.position.x - a.position.x) * u,
      y: a.position.y + (b.position.y - a.position.y) * u,
      z: a.position.z + (b.position.z - a.position.z) * u,
    },
    dispenserOn: a.dispenserOn,
    productIndex: a.productIndex,
    progress: clamped / total,
    segmentIndex: i,
  };
}
