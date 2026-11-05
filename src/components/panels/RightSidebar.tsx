"use client";

import { pathLengthMm } from "@/lib/fixture";
import { useProjectStore } from "@/store/project-store";
import { Button, Field, NumberInput, Section, SelectInput, TextInput } from "@/components/ui/primitives";

export function RightSidebar() {
  const project = useProjectStore((s) => s.project);
  const path = project.paths.find((p) => p.id === project.activePathId) ?? project.paths[0];
  const updatePath = useProjectStore((s) => s.updatePath);
  const updatePoint = useProjectStore((s) => s.updatePoint);
  const deletePoint = useProjectStore((s) => s.deletePoint);
  const clearPathPoints = useProjectStore((s) => s.clearPathPoints);
  const addPoint = useProjectStore((s) => s.addPoint);
  const setActivePath = useProjectStore((s) => s.setActivePath);
  const addPath = useProjectStore((s) => s.addPath);
  const deletePath = useProjectStore((s) => s.deletePath);
  const nozzle = project.nozzle;

  const length = path ? pathLengthMm(path.points) : 0;

  return (
    <aside className="flex h-full w-[300px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--panel)]">
      <div className="border-b border-[var(--border)] px-3 py-3">
        <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">Selection</div>
        <div className="mt-1 font-medium">Dispensing path & nozzle</div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {path ? (
          <>
            <Section
              title="Active path"
              action={
                <Button
                  variant="danger"
                  className="!px-2 !py-1 text-[10px]"
                  onClick={() => deletePath(path.id)}
                >
                  Delete path
                </Button>
              }
            >
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
              <div className="text-[11px] text-[var(--muted)]">
                Total path length: {length.toFixed(2)} mm
              </div>
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
              {path.points.length === 0 ? (
                <p className="text-[11px] text-[var(--muted)]">
                  No points. Add points or click the product in the viewport (Path tab).
                </p>
              ) : (
                <ul className="space-y-2">
                  {path.points.map((pt, idx) => (
                    <li key={pt.id} className="rounded border border-[var(--border)] p-2">
                      <div className="mb-1 flex items-center justify-between text-[11px] text-[var(--muted)]">
                        <span>
                          {idx === 0
                            ? "Start"
                            : idx === path.points.length - 1
                              ? "End"
                              : `Point ${idx + 1}`}
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
              )}
            </Section>
          </>
        ) : (
          <Section title="Active path">
            <p className="text-[11px] leading-relaxed text-[var(--muted)]">
              No adhesive paths in this project. Create a dispensing path to place glue on products.
            </p>
          </Section>
        )}

        <Section title="Paths in project">
          {project.paths.length === 0 ? (
            <p className="mb-2 text-[11px] text-[var(--muted)]">No dispensing paths yet.</p>
          ) : (
            <ul className="mb-2 space-y-1">
              {project.paths.map((p) => (
                <li
                  key={p.id}
                  className={`flex items-center gap-1 rounded border border-[var(--border)] ${
                    path && p.id === path.id ? "border-[var(--accent)]/40 bg-[var(--accent-soft)]" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setActivePath(p.id)}
                    className={`min-w-0 flex-1 truncate px-2 py-1.5 text-left text-[11px] ${
                      path && p.id === path.id ? "text-[var(--accent)]" : "hover:bg-[var(--panel-2)]"
                    }`}
                  >
                    {p.name}
                  </button>
                  <button
                    type="button"
                    title="Delete dispensing path"
                    className="shrink-0 px-2 py-1.5 text-[10px] text-[var(--danger)] hover:bg-[var(--panel-2)]"
                    onClick={() => deletePath(p.id)}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button variant="primary" onClick={addPath}>
            New path
          </Button>
        </Section>

        <Section title="Nozzle preview">
          <div className="text-[11px] leading-relaxed text-[var(--muted)]">
            Horizontal offset {nozzle.horizontalOffset.toFixed(1)} mm · length{" "}
            {nozzle.nozzleLength.toFixed(1)} mm · clearance {nozzle.nozzleClearance.toFixed(1)} mm
          </div>
          <p className="text-[10px] text-[var(--muted-2)]">
            Adjust offsets under Calibration. Tip glow indicates dispenser ON during simulation.
          </p>
        </Section>
      </div>
    </aside>
  );
}
