import { pathLengthMm, replicatePathAcrossFixture } from "./fixture";
import type { Project, ValidationIssue } from "./types";

export function validateProject(project: Project): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const path = project.paths.find((p) => p.id === project.activePathId) ?? project.paths[0];
  const { machine, motion, dispenser, fixture } = project;

  if (project.paths.length === 0 || !path) {
    issues.push({
      level: "error",
      message: "No adhesive path defined. Create a dispensing path before generating G-code.",
    });
  } else if (path.points.length < 2) {
    issues.push({ level: "error", message: "Dispensing path requires at least two points." });
  }

  if (!project.stl) {
    issues.push({
      level: "warning",
      message: "No STL imported yet. Import a workpiece model to visualize products in the fixture.",
    });
  }

  if (!dispenser.activationCommand.trim() || !dispenser.deactivationCommand.trim()) {
    issues.push({ level: "error", message: "Dispenser ON and OFF commands must be configured." });
  }

  if (!dispenser.verifiedHardware) {
    issues.push({
      level: "warning",
      message:
        "Hardware not marked verified. Confirm Genmitsu model, relay isolation, and pedal pinout before live dispensing.",
    });
  }

  if (project.dryRun) {
    issues.push({
      level: "info",
      message: "Dry-run mode is ON — generated G-code will not emit live dispenser activation commands.",
    });
  }

  if (path?.mode === "surface") {
    issues.push({
      level: "warning",
      message:
        "Surface-following mode: three-axis machines cannot reach arbitrary orientations. Verify reachability and clearances.",
    });
  }

  if (motion.dispensingZ + (path?.nozzleClearance ?? 0) >= motion.safeZ) {
    issues.push({
      level: "warning",
      message: "Dispensing Z (plus clearance) should be below safe Z for retract clearance.",
    });
  }

  if (motion.dispensingSpeed > machine.maxSpeed || motion.rapidSpeed > machine.maxSpeed) {
    issues.push({
      level: "error",
      message: `Configured speeds exceed machine max speed (${machine.maxSpeed} mm/min).`,
    });
  }

  if (path && path.points.length >= 2) {
    const batches = replicatePathAcrossFixture(path, fixture);
    for (const batch of batches) {
      for (const p of batch.points) {
        if (p.x < 0 || p.y < 0 || p.x > machine.travelX || p.y > machine.travelY) {
          issues.push({
            level: "error",
            message: `Product ${batch.index + 1} path point outside XY travel (${machine.travelX}×${machine.travelY} mm).`,
          });
          break;
        }
        if (p.z < 0 || p.z > machine.travelZ) {
          issues.push({
            level: "error",
            message: `Product ${batch.index + 1} path Z outside travel (0–${machine.travelZ} mm).`,
          });
          break;
        }
      }
    }

    const len = pathLengthMm(path.points);
    if (len < 0.1) {
      issues.push({ level: "warning", message: "Path length is near zero." });
    }
  }

  if (fixture.rows * fixture.columns < 1) {
    issues.push({ level: "error", message: "Fixture must contain at least one product slot." });
  }

  if (project.nozzle.horizontalOffset < 0) {
    issues.push({ level: "warning", message: "Nozzle horizontal offset is negative — verify mounting." });
  }

  // Approximate collision: nozzle tip below machine table
  if (motion.dispensingZ + path?.nozzleClearance! < 0) {
    issues.push({
      level: "error",
      message: "Nozzle tip would go below Z=0 — raise dispensing height or clearance.",
    });
  }

  return issues;
}

export function canGenerate(project: Project): boolean {
  return !validateProject(project).some((i) => i.level === "error");
}
