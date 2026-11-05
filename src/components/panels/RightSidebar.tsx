"use client";

import { pathLengthMm } from "@/lib/fixture";
import { useProjectStore } from "@/store/project-store";
import { Button, Field, NumberInput, Section, SelectInput, TextInput } from "@/components/ui/primitives";
import { uid } from "@/lib/defaults";

export function RightSidebar() {
  const project = useProjectStore((s) => s.project);
  const path = project.paths.find((p) => p.id === project.activePathId) ?? project.paths[0];
  const updatePath = useProjectStore((s) => s.updatePath);
  const updatePoint = useProjectStore((s) => s.updatePoint);
  const deletePoint = useProjectStore((s) => s.deletePoint);
  const clearPathPoints = useProjectStore((s) => s.clearPathPoints);
  const addPoint = useProjectStore((s) => s.addPoint);
  const setActivePath = useProjectStore((s) => s.setActivePath);
  const nozzle = project.nozzle;

  if (!path) return null;

  const length = pathLengthMm(path.points);

  return (
    <aside className="flex h-full w-[300px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--panel)]">
      <div className="border-b border-[var(--border)] px-3 py-3">
        <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">Selection</div>
        <div className="mt-1 font-medium">Dispensing path & nozzle</div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <Section title="Active path">
          <Field label="Name">
            <TextInput value={path.name} onChange={(name) => updatePath(path.id, { name })} />
          </Field>
          <Field label="Mode">
            <SelectInput
              value={path.mode}
              onChange={(mode) => updatePath(path.id, { mode: mode as "planar" | "surface" })}
            >
              <option value="planar">Planar (fixed Z)</option>
              <option value="surface">Surface-following (XYZ)</option>
            </SelectInput>
          </Field>
          <div className="grid grid-cols-2 gap-1.5">
            <Field label="Planar Z">
              <NumberInput
                value={path.planarZ}
                onChange={(planarZ) => updatePath(path.id, { planarZ })}
              />
            </Field>
            <Field label="Nozzle clearance">
              <NumberInput
                value={path.nozzleClearance}
                onChange={(nozzleClearance) => updatePath(path.id, { nozzleClearance })}
              />
            </Field>
            <Field label="Direction">
              <SelectInput
                value={String(path.direction)}
                onChange={(d) => updatePath(path.id, { direction: Number(d) as 1 | -1 })}
              >
                <option value="1">Forward</option>
                <option value="-1">Reverse</option>
              </SelectInput>
            </Field>
          </div>
          <div className="text-[11px] text-[var(--muted)]">Total path length: {length.toFixed(2)} mm</div>
          {path.mode === "surface" ? (
            <p className="text-[10px] text-[var(--warn-text)]">
              Three-axis CNC cannot follow arbitrary orientations. Confirm reachability.
            </p>
          ) : null}
        </Section>

        <Section
          title="Path points"
          action={
            <div className="flex gap-1">
              <Button
                className="!px-2 !py-1 text-[10px]"
                onClick={() =>
                  addPoint({
                    x: path.points.at(-1)?.position.x ?? 0,
                    y: (path.points.at(-1)?.position.y ?? 0) + 5,
                    z: path.planarZ,
                  })
                }
              >
                Add
              </Button>
              <Button className="!px-2 !py-1 text-[10px]" onClick={clearPathPoints}>
                Clear
              </Button>
            </div>
          }
        >
          <ul className="space-y-2">
            {path.points.map((pt, idx) => (
              <li key={pt.id} className="rounded border border-[var(--border)] p-2">
                <div className="mb-1 flex items-center justify-between text-[11px] text-[var(--muted)]">
                  <span>
                    {idx === 0 ? "Start" : idx === path.points.length - 1 ? "End" : `Point ${idx + 1}`}
                  </span>
                  <button
                    type="button"
                    className="text-[var(--danger)]"
                    onClick={() => deletePoint(pt.id)}
                  >
                    Delete
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <NumberInput
                    value={pt.position.x}
                    onChange={(x) => updatePoint(pt.id, { ...pt.position, x })}
                  />
                  <NumberInput
                    value={pt.position.y}
                    onChange={(y) => updatePoint(pt.id, { ...pt.position, y })}
                  />
                  <NumberInput
                    value={pt.position.z}
                    onChange={(z) => updatePoint(pt.id, { ...pt.position, z })}
                    disabled={path.mode === "planar"}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Paths in project">
          <ul className="space-y-1">
            {project.paths.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setActivePath(p.id)}
                  className={`w-full rounded px-2 py-1.5 text-left text-[11px] ${
                    p.id === path.id
                      ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "hover:bg-[var(--panel-2)]"
                  }`}
                >
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
          <Button
            onClick={() => {
              const id = uid("path");
              useProjectStore.setState((s) => ({
                project: {
                  ...s.project,
                  paths: [
                    ...s.project.paths,
                    {
                      id,
                      name: `Path ${s.project.paths.length + 1}`,
                      mode: "planar",
                      points: [
                        { id: uid("pt"), position: { x: -10, y: 0, z: 2 } },
                        { id: uid("pt"), position: { x: 10, y: 0, z: 2 } },
                      ],
                      planarZ: 2,
                      nozzleClearance: 1.5,
                      direction: 1,
                    },
                  ],
                  activePathId: id,
                },
              }));
            }}
          >
            New path
          </Button>
        </Section>

        <Section title="Nozzle preview">
          <div className="text-[11px] leading-relaxed text-[var(--muted)]">
            Horizontal offset {nozzle.horizontalOffset.toFixed(1)} mm · length {nozzle.nozzleLength.toFixed(1)} mm
            · clearance {nozzle.nozzleClearance.toFixed(1)} mm
          </div>
          <p className="text-[10px] text-[var(--muted-2)]">
            Adjust offsets under Calibration. Tip glow indicates dispenser ON during simulation.
          </p>
        </Section>
      </div>
    </aside>
  );
}
