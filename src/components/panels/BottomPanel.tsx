"use client";

import { downloadText } from "@/lib/storage";
import { useProjectStore } from "@/store/project-store";
import { Button } from "@/components/ui/primitives";

export function BottomPanel() {
  const project = useProjectStore((s) => s.project);
  const setGcode = useProjectStore((s) => s.setGcode);
  const generate = useProjectStore((s) => s.generate);
  const sim = useProjectStore((s) => s.sim);
  const play = useProjectStore((s) => s.play);
  const pause = useProjectStore((s) => s.pause);
  const stop = useProjectStore((s) => s.stop);
  const restart = useProjectStore((s) => s.restart);
  const setSimSpeed = useProjectStore((s) => s.setSimSpeed);
  const stepForward = useProjectStore((s) => s.stepForward);
  const stepBackward = useProjectStore((s) => s.stepBackward);

  return (
    <footer className="flex h-[220px] shrink-0 border-t border-[var(--border)] bg-[var(--panel)]">
      <div className="flex w-[42%] flex-col border-r border-[var(--border)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-1.5">
          <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
            G-code {project.dryRun ? "(dry-run)" : "(live commands)"}
          </span>
          <div className="flex gap-1">
            <Button className="!px-2 !py-1 text-[10px]" variant="primary" onClick={generate}>
              Generate
            </Button>
            <Button
              className="!px-2 !py-1 text-[10px]"
              disabled={!project.gcode}
              onClick={() =>
                downloadText(
                  `${project.name.replace(/\s+/g, "_").toLowerCase()}.gcode`,
                  project.gcode
                )
              }
            >
              Download
            </Button>
          </div>
        </div>
        <textarea
          className="input h-full min-h-0 flex-1 resize-none rounded-none border-0 bg-[var(--panel-2)] font-mono text-[11px] leading-relaxed"
          value={project.gcode}
          onChange={(e) => setGcode(e.target.value)}
          spellCheck={false}
          placeholder="Generate G-code to preview and edit. Simulation uses this text as source of truth."
        />
      </div>

      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-1.5">
          <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
            Simulation (from generated G-code)
          </span>
          <div className="flex items-center gap-2 text-[11px]">
            <span
              className={`rounded px-2 py-0.5 font-semibold ${
                sim.dispenserOn
                  ? "bg-[var(--danger)]/20 text-[var(--danger)]"
                  : "bg-[var(--panel-2)] text-[var(--muted)]"
              }`}
            >
              Dispenser {sim.dispenserOn ? "ON" : "OFF"}
            </span>
            <span className="font-mono text-[var(--muted)]">
              P{sim.productIndex + 1} · {(sim.progress * 100).toFixed(0)}%
            </span>
          </div>
        </div>
        <div className="flex flex-1 flex-col justify-center gap-3 px-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="primary" onClick={play} disabled={sim.playing || !project.gcode}>
              Play
            </Button>
            <Button onClick={pause} disabled={!sim.playing}>
              Pause
            </Button>
            <Button onClick={stop}>Stop</Button>
            <Button onClick={restart} disabled={!project.gcode}>
              Restart
            </Button>
            <Button onClick={stepBackward} disabled={!project.gcode}>
              Step −
            </Button>
            <Button onClick={stepForward} disabled={!project.gcode}>
              Step +
            </Button>
            <label className="ml-2 flex items-center gap-2 text-[11px] text-[var(--muted)]">
              Speed
              <input
                type="range"
                min={0.5}
                max={20}
                step={0.5}
                value={sim.speed}
                onChange={(e) => setSimSpeed(Number(e.target.value))}
                className="w-28"
              />
              <span className="font-mono w-8">{sim.speed}×</span>
            </label>
          </div>
          <div className="h-2 overflow-hidden rounded bg-[var(--panel-2)]">
            <div
              className="h-full bg-[var(--accent)] transition-[width] duration-100"
              style={{ width: `${sim.progress * 100}%` }}
            />
          </div>
          <div className="grid grid-cols-4 gap-2 font-mono text-[11px] text-[var(--muted)]">
            <div>X {sim.position.x.toFixed(2)}</div>
            <div>Y {sim.position.y.toFixed(2)}</div>
            <div>Z {sim.position.z.toFixed(2)}</div>
            <div>
              {project.machine.model} · travel {project.machine.travelX}×{project.machine.travelY}×
              {project.machine.travelZ}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
