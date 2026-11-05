import { replicatePathAcrossFixture } from "../fixture";
import type { Project } from "../types";

function fmt(n: number, digits = 3): string {
  return Number(n.toFixed(digits)).toString();
}

function delaySeconds(ms: number): number {
  return Math.max(0, ms) / 1000;
}

/**
 * Generate GRBL-compatible adhesive dispensing G-code.
 * Never emits spindle (M3/M4) or cutting/tool-change commands.
 */
export function generateGcode(project: Project): string {
  const { machine, motion, dispenser, fixture, dryRun } = project;
  const path = project.paths.find((p) => p.id === project.activePathId) ?? project.paths[0];
  if (!path || path.points.length < 2) {
    throw new Error("Active dispensing path needs at least two points.");
  }

  const lines: string[] = [];
  const onCmd = dryRun ? "; DRY-RUN: dispenser ON skipped" : dispenser.activationCommand.trim();
  const offCmd = dryRun ? "; DRY-RUN: dispenser OFF skipped" : dispenser.deactivationCommand.trim();

  lines.push(`; CNC Glue Dispensing — ${project.name}`);
  lines.push(`; Machine: ${machine.model}`);
  lines.push(`; Generated: ${new Date().toISOString()}`);
  lines.push(`; Mode: ${dryRun ? "DRY-RUN (no dispenser activation)" : "LIVE dispensing commands"}`);
  lines.push(`; Fixture: ${fixture.rows}x${fixture.columns} = ${fixture.rows * fixture.columns} products`);
  lines.push(`; Path: ${path.name} (${path.mode})`);
  lines.push(`; Units: millimeters | Absolute positioning`);
  lines.push(`; Spindle unused — adhesive dispensing only`);
  lines.push("");
  lines.push("G21 ; millimeters");
  lines.push("G90 ; absolute positioning");
  lines.push("G94 ; feed per minute");
  lines.push(`G0 Z${fmt(motion.safeZ)} F${fmt(motion.zSpeed)} ; safe clearance`);
  lines.push("");

  const batches = replicatePathAcrossFixture(path, fixture);

  batches.forEach((batch) => {
    const pts = [...batch.points];
    if (path.direction === -1) pts.reverse();

    lines.push(`; --- Product ${batch.index + 1} (row ${batch.row + 1}, col ${batch.col + 1}) ---`);

    const first = pts[0];
    const last = pts[pts.length - 1];

    // Approach above first point
    lines.push(
      `G0 X${fmt(first.x + motion.startOffset.x)} Y${fmt(first.y + motion.startOffset.y)} F${fmt(motion.rapidSpeed)} ; rapid travel (dispenser OFF)`
    );
    lines.push(`G0 Z${fmt(motion.safeZ)} F${fmt(motion.zSpeed)}`);
    lines.push(
      `G1 Z${fmt(motion.dispensingZ + path.nozzleClearance)} F${fmt(motion.zSpeed)} ; approach dispensing height`
    );

    if (dispenser.leadInMm > 0) {
      lines.push(`; lead-in ${dispenser.leadInMm} mm (approach already at start)`);
    }

    // Activate dispenser
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

    // Dispense path
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const z = path.mode === "planar" ? motion.dispensingZ + path.nozzleClearance : p.z + path.nozzleClearance;
      lines.push(
        `G1 X${fmt(p.x)} Y${fmt(p.y)} Z${fmt(z)} F${fmt(motion.dispensingSpeed)} ; dispense${i === 0 ? " start" : i === pts.length - 1 ? " end" : ""}`
      );
    }

    if (dispenser.leadOutMm > 0) {
      lines.push(`; lead-out ${dispenser.leadOutMm} mm`);
    }

    // Deactivate
    if (dryRun) {
      lines.push(offCmd);
    } else {
      lines.push(`${offCmd} ; dispensing OFF`);
      if (dispenser.deactivationDelayMs > 0) {
        lines.push(`G4 P${fmt(delaySeconds(dispenser.deactivationDelayMs), 3)} ; deactivation delay`);
      }
    }

    // Retract — no dispensing during travel
    lines.push(`G0 Z${fmt(motion.safeZ)} F${fmt(motion.zSpeed)} ; retract (dispenser OFF)`);
    if (motion.endOffset.x || motion.endOffset.y) {
      lines.push(
        `G0 X${fmt(last.x + motion.endOffset.x)} Y${fmt(last.y + motion.endOffset.y)} F${fmt(motion.rapidSpeed)}`
      );
    }
    lines.push("");
  });

  lines.push("; Return to safe end");
  lines.push(
    `G0 X${fmt(machine.homePosition.x)} Y${fmt(machine.homePosition.y)} F${fmt(motion.rapidSpeed)}`
  );
  lines.push(`G0 Z${fmt(motion.safeZ)} F${fmt(motion.zSpeed)}`);
  lines.push("M2 ; program end");
  lines.push("");

  return lines.join("\n");
}
