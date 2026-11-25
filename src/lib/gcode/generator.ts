import { pathPointsWorld } from "../models";
import type { DispensingPath, Project, StlAsset, Vec3 } from "../types";

function fmt(n: number, digits = 3): string {
  return Number(n.toFixed(digits)).toString();
}

function delaySeconds(ms: number): number {
  return Math.max(0, ms) / 1000;
}

function segmentMm(a: Vec3, b: Vec3): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

export function polylineLengthMm(pts: Vec3[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += segmentMm(pts[i - 1], pts[i]);
  return len;
}

/** Distance before the end of a run where the relay turns off, at the dispense feed. */
export function cutoffTailMm(dispensingSpeed: number, cutoffBeforeEndSec: number): number {
  const sec = Math.max(0, cutoffBeforeEndSec || 0);
  const speed = Math.max(0, dispensingSpeed || 0);
  return (speed / 60) * sec;
}

/** Split a path so `tail` is the last `tailMm` of travel. `head` ends at the cut. */
export function splitPathByTail(pts: Vec3[], tailMm: number): { head: Vec3[]; tail: Vec3[] } {
  if (tailMm <= 0 || pts.length < 2) return { head: pts, tail: [] };
  const total = polylineLengthMm(pts);
  if (tailMm >= total - 1e-4) return { head: [pts[0]], tail: pts };

  let remain = tailMm;
  for (let i = pts.length - 1; i > 0; i--) {
    const a = pts[i - 1];
    const b = pts[i];
    const seg = segmentMm(a, b);
    if (seg < 1e-6) continue;
    if (remain <= seg) {
      const t = remain / seg;
      const cut = {
        x: b.x + (a.x - b.x) * t,
        y: b.y + (a.y - b.y) * t,
        z: b.z + (a.z - b.z) * t,
      };
      const atStart = segmentMm(a, cut) < 0.01;
      const atEnd = segmentMm(b, cut) < 0.01;
      if (atEnd) return { head: pts.slice(0, i + 1), tail: [] };
      if (atStart) return { head: pts.slice(0, i), tail: pts.slice(i - 1) };
      return { head: [...pts.slice(0, i), cut], tail: [cut, ...pts.slice(i)] };
    }
    remain -= seg;
  }
  return { head: [pts[0]], tail: pts };
}

function emitDispenseCycle(
  lines: string[],
  opts: {
    label: string;
    pts: Vec3[];
    path: DispensingPath;
    motion: Project["motion"];
    dispenser: Project["dispenser"];
    dryRun: boolean;
    onCmd: string;
    offCmd: string;
  }
) {
  const { label, pts, path, motion, dispenser, dryRun, onCmd, offCmd } = opts;
  if (pts.length < 2) return;

  const ordered = path.direction === -1 ? [...pts].reverse() : pts;
  const first = ordered[0];
  const last = ordered[ordered.length - 1];

  lines.push(`; --- ${label} ---`);
  lines.push(`G0 Z${fmt(motion.safeZ)} F${fmt(motion.zSpeed)} ; travel height`);
  for (const stop of path.safePoints ?? []) {
    lines.push(
      `G0 X${fmt(stop.x)} Y${fmt(stop.y)} F${fmt(motion.rapidSpeed)} ; safe travel (dispenser OFF)`
    );
  }
  lines.push(
    `G0 X${fmt(first.x + motion.startOffset.x)} Y${fmt(first.y + motion.startOffset.y)} F${fmt(motion.rapidSpeed)} ; rapid travel (dispenser OFF)`
  );
  lines.push(
    `G1 Z${fmt(motion.dispensingZ + path.nozzleClearance)} F${fmt(motion.zSpeed)} ; approach dispensing height`
  );

  if (dispenser.leadInMm > 0) {
    lines.push(`; lead-in ${dispenser.leadInMm} mm`);
  }

  const tailMm = cutoffTailMm(motion.dispensingSpeed, dispenser.cutoffBeforeEndSec ?? 0);
  const { head, tail } = splitPathByTail(ordered, tailMm);
  const cutoffSec = Math.max(0, dispenser.cutoffBeforeEndSec || 0);
  const movingCutoff = tail.length > 1 && !dryRun;

  if (dryRun) {
    lines.push(onCmd);
  } else {
    lines.push(`${onCmd} ; dispensing ON`);
    if (dispenser.activationDelayMs > 0) {
      lines.push(`G4 P${fmt(delaySeconds(dispenser.activationDelayMs), 3)} ; activation delay`);
    }
    if (dispenser.purgeTimeMs > 0) {
      lines.push(`G4 P${fmt(delaySeconds(dispenser.purgeTimeMs), 3)} ; optional purge`);
    }
  }

  const emitFeed = (points: Vec3[], tag: "dispense" | "cutoff") => {
    points.forEach((p, i) => {
      const inlineOff = tag === "cutoff" && i === 0 && movingCutoff;
      const mark = inlineOff
        ? `relay off while moving — ${fmt(cutoffSec, 2)} s before end (${fmt(tailMm, 2)} mm)`
        : tag === "cutoff"
          ? "relay off"
          : i === 0
            ? "dispense start"
            : i === points.length - 1 && tail.length === 0
              ? "dispense end"
              : "dispense";
      lines.push(
        `G1 X${fmt(p.x)} Y${fmt(p.y)} Z${fmt(p.z)}${inlineOff ? " S0" : ""} F${fmt(motion.dispensingSpeed)} ; ${mark}`
      );
    });
  };

  emitFeed(head, "dispense");

  if (dispenser.leadOutMm > 0) {
    lines.push(`; lead-out ${dispenser.leadOutMm} mm`);
  }

  if (movingCutoff) {
    // S0 on the next G1 changes the laser output inside the move. A standalone M5 would stop first.
    emitFeed(tail.slice(1), "cutoff");
    lines.push(`${offCmd} ; dispensing OFF`);
  } else if (dryRun) {
    lines.push(`${offCmd}${tail.length > 1 ? ` — ${fmt(cutoffSec, 2)} s before end` : ""}`);
    if (tail.length > 1) emitFeed(tail.slice(1), "cutoff");
  } else {
    lines.push(`${offCmd} ; dispensing OFF`);
  }

  if (!dryRun && dispenser.deactivationDelayMs > 0) {
    lines.push(`G4 P${fmt(delaySeconds(dispenser.deactivationDelayMs), 3)} ; deactivation delay`);
  }

  lines.push(`G0 Z${fmt(motion.safeZ)} F${fmt(motion.zSpeed)} ; retract (dispenser OFF)`);
  if (motion.endOffset.x || motion.endOffset.y) {
    lines.push(
      `G0 X${fmt(last.x + motion.endOffset.x)} Y${fmt(last.y + motion.endOffset.y)} F${fmt(motion.rapidSpeed)}`
    );
  }
  if (path.retraceAtSafeZ) {
    const departed = Boolean(motion.endOffset.x || motion.endOffset.y);
    const back = [...ordered].reverse().slice(departed ? 0 : 1);
    for (const p of back) {
      lines.push(
        `G0 X${fmt(p.x)} Y${fmt(p.y)} F${fmt(motion.rapidSpeed)} ; retrace at safe Z (dispenser OFF)`
      );
    }
  }
  lines.push("");
}

/**
 * Generate GRBL-compatible adhesive dispensing G-code.
 * One dispense cycle per glue model that has a path with ≥2 points.
 */
export function generateGcode(project: Project): string {
  const { machine, motion, dispenser, dryRun } = project;
  const glueJobs: Array<{ model: StlAsset; path: DispensingPath; pts: Vec3[] }> = [];

  for (const model of project.models.filter((m) => m.role === "glue")) {
    const paths = project.paths.filter((p) => p.modelId === model.id && p.points.length >= 2);
    for (const path of paths) {
      glueJobs.push({
        model,
        path,
        pts: pathPointsWorld(path, model, motion.dispensingZ),
      });
    }
  }

  if (glueJobs.length === 0) {
    throw new Error("No glue paths ready. Add a glue-target model with at least two path points.");
  }

  const lines: string[] = [];
  const onCmd = dryRun ? "; DRY-RUN: dispenser ON skipped" : dispenser.activationCommand.trim();
  const offCmd = dryRun ? "; DRY-RUN: dispenser OFF skipped" : dispenser.deactivationCommand.trim();

  lines.push(`; CNC Glue Dispensing — ${project.name}`);
  lines.push(`; Machine: ${machine.model}`);
  lines.push(`; Generated: ${new Date().toISOString()}`);
  lines.push(`; Mode: ${dryRun ? "DRY-RUN (no dispenser activation)" : "LIVE dispensing commands"}`);
  lines.push(
    `; Models: ${project.models.length} total · ${project.models.filter((m) => m.role === "glue").length} glue · ${project.models.filter((m) => m.role === "obstacle").length} obstacle`
  );
  lines.push(`; Dispense jobs: ${glueJobs.length}`);
  lines.push(`; Units: millimeters | Absolute positioning`);
  lines.push(`; Dispenser via laser output commands — spindle motor unused`);
  const cutoffSec = Math.max(0, dispenser.cutoffBeforeEndSec || 0);
  if (!dryRun && cutoffSec > 0) {
    lines.push("; Relay cutoff while moving needs laser mode. In the UGS command box, type $32=1 once and press enter.");
  }
  lines.push("");
  lines.push("G21 ; millimeters");
  lines.push("G90 ; absolute positioning");
  lines.push("G94 ; feed per minute");
  lines.push(
    `G0 X${fmt(machine.homePosition.x)} Y${fmt(machine.homePosition.y)} F${fmt(motion.rapidSpeed)} ; start park`
  );
  lines.push(`G0 Z${fmt(motion.parkZ)} F${fmt(motion.zSpeed)} ; park height`);
  lines.push(`G0 Z${fmt(motion.safeZ)} F${fmt(motion.zSpeed)} ; rise to travel height`);
  lines.push("");

  glueJobs.forEach((job, index) => {
    emitDispenseCycle(lines, {
      label: `Product ${index + 1}: ${job.model.name} / ${job.path.name}`,
      pts: job.pts,
      path: job.path,
      motion,
      dispenser,
      dryRun,
      onCmd,
      offCmd,
    });
  });

  lines.push("; Return to end park");
  lines.push(`G0 Z${fmt(motion.safeZ)} F${fmt(motion.zSpeed)} ; travel height`);
  lines.push(
    `G0 X${fmt(machine.homePosition.x)} Y${fmt(machine.homePosition.y)} F${fmt(motion.rapidSpeed)} ; park XY`
  );
  lines.push(`G0 Z${fmt(motion.parkZ)} F${fmt(motion.zSpeed)} ; drop to park height`);
  lines.push("M2 ; program end");
  lines.push("");

  return lines.join("\n");
}
