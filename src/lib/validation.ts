import { pathLengthMm } from "./fixture";
import { cutoffTailMm, polylineLengthMm } from "./gcode/generator";
import { pathPointsWorld } from "./models";
import type { Project, ValidationIssue } from "./types";

export function validateProject(project: Project): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { machine, motion, dispenser } = project;

  const glueModels = project.models.filter((m) => m.role === "glue");
  const readyJobs = glueModels.flatMap((model) =>
    project.paths.filter((p) => p.modelId === model.id && p.points.length >= 2).map((path) => ({ model, path }))
  );

  if (project.models.length === 0) {
    issues.push({
      level: "warning",
      message: "No models imported. Import glue targets and any bed obstacles for clearance.",
    });
  }

  if (glueModels.length === 0) {
    issues.push({
      level: "error",
      message: "No glue-target models. Mark at least one model as Glue (or import one).",
    });
  } else if (readyJobs.length === 0) {
    issues.push({
      level: "error",
      message: "No adhesive path ready. Select a glue model and add at least two path points.",
    });
  }

  if (!dispenser.activationCommand.trim() || !dispenser.deactivationCommand.trim()) {
    issues.push({ level: "error", message: "Dispenser ON and OFF commands must be configured." });
  }

  if (project.dryRun) {
    issues.push({
      level: "info",
      message: "Dry-run mode is ON — generated G-code will not emit live dispenser activation commands.",
    });
  }

  const cutoffMm = cutoffTailMm(motion.dispensingSpeed, dispenser.cutoffBeforeEndSec ?? 0);

  for (const { model, path } of readyJobs) {
    if (path.mode === "surface") {
      issues.push({
        level: "warning",
        message: `Path "${path.name}": surface-following on a three-axis machine — verify reachability.`,
      });
    }
    if (motion.dispensingZ + path.nozzleClearance >= motion.safeZ) {
      issues.push({
        level: "warning",
        message: `Path "${path.name}": dispensing Z (plus clearance) should be below safe Z.`,
      });
    }
    if (pathLengthMm(path.points) < 0.1) {
      issues.push({ level: "warning", message: `Path "${path.name}" length is near zero.` });
    }
    for (const stop of path.safePoints ?? []) {
      if (stop.x < 0 || stop.y < 0 || stop.x > machine.travelX || stop.y > machine.travelY) {
        issues.push({
          level: "error",
          message: `Path "${path.name}" safe travel point is outside XY travel (${machine.travelX}×${machine.travelY} mm).`,
        });
        break;
      }
    }
    if (cutoffMm > 0 && polylineLengthMm(pathPointsWorld(path, model, motion.dispensingZ)) < cutoffMm) {
      issues.push({
        level: "warning",
        message: `Path "${path.name}" is shorter than the relay cutoff (${cutoffMm.toFixed(1)} mm). The relay turns off at the start of that run.`,
      });
    }
  }

  if (motion.dispensingSpeed > machine.maxSpeed || motion.rapidSpeed > machine.maxSpeed) {
    issues.push({
      level: "error",
      message: `Configured speeds exceed machine max speed (${machine.maxSpeed} mm/min).`,
    });
  }

  for (const { model, path } of readyJobs) {
    const pts = pathPointsWorld(path, model, motion.dispensingZ);
    for (const p of pts) {
      if (p.x < 0 || p.y < 0 || p.x > machine.travelX || p.y > machine.travelY) {
        issues.push({
          level: "error",
          message: `"${model.name}" path outside XY travel (${machine.travelX}×${machine.travelY} mm).`,
        });
        break;
      }
      if (p.z < 0 || p.z > machine.travelZ) {
        issues.push({
          level: "error",
          message: `"${model.name}" path Z outside travel (0–${machine.travelZ} mm).`,
        });
        break;
      }
    }
  }

  if (motion.dispensingZ < 0) {
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
