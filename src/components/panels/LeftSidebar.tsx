"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { downloadText } from "@/lib/storage";
import { pathLengthMm } from "@/lib/fixture";
import { useProjectStore } from "@/store/project-store";
import {
  Button,
  Field,
  NumberInput,
  Section,
  SelectInput,
  TextInput,
  Toggle,
} from "@/components/ui/primitives";
import type { WorkspaceTab } from "@/lib/types";

const MIN_SIDEBAR_WIDTH = 240;
const DEFAULT_SIDEBAR_WIDTH = 300;
const SIDEBAR_WIDTH_KEY = "gluepath-left-sidebar-width";

function clampSidebarWidth(width: number) {
  const max = Math.max(MIN_SIDEBAR_WIDTH, Math.floor(window.innerWidth * 0.45));
  return Math.min(max, Math.max(MIN_SIDEBAR_WIDTH, Math.round(width)));
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function CopyIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CopyValueButton({ value, label }: { value: number; label: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <button
      type="button"
      title={copied ? "Copied" : `Copy ${label}`}
      aria-label={copied ? "Copied" : `Copy ${label}`}
      className={`shrink-0 rounded border px-1.5 py-1.5 transition-colors ${
        copied
          ? "border-[var(--accent)]/50 bg-[var(--accent-soft)] text-[var(--accent)]"
          : "border-[var(--border)] bg-[var(--panel-2)] text-[var(--muted)] hover:text-[var(--text)]"
      }`}
      onClick={() => {
        void copyText(value.toFixed(2)).then((ok) => {
          if (ok) setCopied(true);
        });
      }}
    >
      <CopyIcon />
    </button>
  );
}

const TABS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: "projects", label: "Projects" },
  { id: "model", label: "Model" },
  { id: "path", label: "Path" },
  { id: "dispenser", label: "Dispenser" },
  { id: "machine", label: "Machine" },
  { id: "calibration", label: "Calibration" },
  { id: "gcode", label: "G-code" },
];

export function LeftSidebar() {
  const tab = useProjectStore((s) => s.tab);
  const setTab = useProjectStore((s) => s.setTab);
  const issues = useProjectStore((s) => s.issues);

  const [width, setWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
      if (Number.isFinite(saved) && saved > 0) {
        setWidth(clampSidebarWidth(saved));
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const onResize = () => setWidth((w) => clampSidebarWidth(w));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    setWidth(clampSidebarWidth(drag.startWidth + (e.clientX - drag.startX)));
  }, []);

  const endDrag = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
    setWidth((w) => {
      try {
        localStorage.setItem(SIDEBAR_WIDTH_KEY, String(w));
      } catch {
        /* ignore */
      }
      return w;
    });
  }, [onPointerMove]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: width };
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
  };

  return (
    <aside
      className="relative flex h-full shrink-0 flex-col border-r border-[var(--border)] bg-[var(--panel)]"
      style={{ width }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize left panel"
        aria-valuemin={MIN_SIDEBAR_WIDTH}
        aria-valuenow={width}
        onPointerDown={onPointerDown}
        className="absolute inset-y-0 right-0 z-10 flex w-2 translate-x-1/2 cursor-ew-resize items-center justify-center"
      >
        <div className="h-12 w-1 rounded-full bg-[var(--border-strong)] transition-colors hover:bg-[var(--accent)]" />
      </div>
      <nav className="flex flex-wrap gap-1 border-b border-[var(--border)] px-2 py-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded px-2 py-1 text-[11px] ${
              tab === t.id
                ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                : "text-[var(--muted)] hover:bg-[var(--panel-2)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {tab === "projects" && <ProjectsPanel />}
        {tab === "model" && <ModelPanel />}
        {tab === "path" && <PathPanel />}
        {tab === "dispenser" && <DispenserPanel />}
        {tab === "machine" && <MachinePanel />}
        {tab === "calibration" && <CalibrationPanel />}
        {tab === "gcode" && <GcodePanelBrief />}

        {issues.length > 0 ? (
          <Section title="Validation">
            <ul className="space-y-1.5">
              {issues.map((issue, i) => (
                <li
                  key={i}
                  className={`text-[11px] leading-snug ${
                    issue.level === "error"
                      ? "text-[var(--danger)]"
                      : issue.level === "warning"
                        ? "text-[var(--warn-text)]"
                        : "text-[var(--muted)]"
                  }`}
                >
                  {issue.level.toUpperCase()}: {issue.message}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
      </div>
    </aside>
  );
}

function ProjectsPanel() {
  const project = useProjectStore((s) => s.project);
  const setProjectName = useProjectStore((s) => s.setProjectName);
  const save = useProjectStore((s) => s.save);
  const duplicate = useProjectStore((s) => s.duplicate);
  const newProject = useProjectStore((s) => s.newProject);
  const generate = useProjectStore((s) => s.generate);
  const load = useProjectStore((s) => s.load);
  const removeSaved = useProjectStore((s) => s.removeSaved);
  const hydrated = useProjectStore((s) => s.hydrated);
  const saved = useProjectStore((s) => s.savedProjects);
  const saveError = useProjectStore((s) => s.saveError);

  const deleteSavedProject = (id: string, name: string) => {
    const label = name.trim() || "Untitled";
    const ok = window.confirm(`Delete saved project "${label}"? This cannot be undone.`);
    if (!ok) return;
    void removeSaved(id);
  };

  return (
    <>
      <div className="mb-3">
        <TextInput value={project.name} onChange={setProjectName} />
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button variant="primary" onClick={() => void save()}>
            Save
          </Button>
          <Button onClick={() => void duplicate()}>Duplicate</Button>
          <Button onClick={newProject}>New</Button>
          <Button variant="primary" onClick={generate}>
            Generate
          </Button>
        </div>
      </div>
      <Section title="Saved projects">
      {!hydrated ? (
        <p className="text-[11px] text-[var(--muted)]">Loading saved projects…</p>
      ) : saved.length === 0 ? (
        <p className="text-[11px] text-[var(--muted)]">No saved projects yet.</p>
      ) : (
        <ul className="space-y-1">
          {saved.map((p) => (
            <li
              key={p.id}
              className="flex items-stretch gap-1 rounded border border-[var(--border)]"
            >
              <button
                type="button"
                className="min-w-0 flex-1 px-2 py-1.5 text-left text-[11px] hover:bg-[var(--panel-2)]"
                onClick={() => void load(p.id)}
              >
                <div className="truncate text-[var(--text)]">{p.name}</div>
                <div className="text-[var(--muted-2)]">{new Date(p.updatedAt).toLocaleString()}</div>
              </button>
              <button
                type="button"
                title={`Duplicate ${p.name.trim() || "project"}`}
                aria-label={`Duplicate ${p.name.trim() || "project"}`}
                className="shrink-0 px-2 text-[10px] font-medium text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
                onClick={(e) => {
                  e.stopPropagation();
                  void duplicate(p.id);
                }}
              >
                Duplicate
              </button>
              <button
                type="button"
                title={`Delete ${p.name.trim() || "project"}`}
                aria-label={`Delete ${p.name.trim() || "project"}`}
                className="shrink-0 px-2 text-[var(--danger)] hover:bg-[var(--panel-2)]"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSavedProject(p.id, p.name);
                }}
              >
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
      {saveError ? <p className="mt-2 text-[11px] text-[var(--danger)]">{saveError}</p> : null}
    </Section>
    </>
  );
}

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function ModelPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetId = useRef<string | null>(null);
  const importStl = useProjectStore((s) => s.importStl);
  const replaceModel = useProjectStore((s) => s.replaceModel);
  const removeModel = useProjectStore((s) => s.removeModel);
  const setActiveModel = useProjectStore((s) => s.setActiveModel);
  const setModelRole = useProjectStore((s) => s.setModelRole);
  const models = useProjectStore((s) => s.project.models);
  const activeModelId = useProjectStore((s) => s.project.activeModelId);
  const updateModelTransform = useProjectStore((s) => s.updateModelTransform);
  const active = models.find((m) => m.id === activeModelId) ?? models[0];

  return (
    <>
      <Section title="STL import">
        <input
          ref={inputRef}
          type="file"
          accept=".stl"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importStl(f);
            e.target.value = "";
          }}
        />
        <input
          ref={replaceInputRef}
          type="file"
          accept=".stl"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            const id = replaceTargetId.current;
            replaceTargetId.current = null;
            if (f && id) void replaceModel(id, f);
            e.target.value = "";
          }}
        />
        <div className="flex gap-1.5">
          <Button variant="primary" onClick={() => inputRef.current?.click()}>
            Import STL
          </Button>
        </div>
        <p className="text-[11px] text-[var(--muted)]">
          Import adds to the bed. Replace on a model swaps the mesh and keeps its glue path and placement. Mark models as Glue (get adhesive) or Obstacle (clearance only).
        </p>
      </Section>

      <Section title="Models on bed">
        {models.length === 0 ? (
          <p className="text-[11px] text-[var(--muted)]">No models yet.</p>
        ) : (
          <ul className="space-y-1">
            {models.map((m) => {
              const selected = m.id === active?.id;
              return (
                <li
                  key={m.id}
                  className={`rounded border px-2 py-1.5 ${
                    selected
                      ? "border-[var(--accent)]/50 bg-[var(--accent-soft)]"
                      : "border-[var(--border)]"
                  }`}
                >
                  <button
                    type="button"
                    className="w-full truncate text-left text-[11px] font-medium text-[var(--text)]"
                    onClick={() => setActiveModel(m.id)}
                  >
                    {m.name}
                  </button>
                  <div className="mt-1 flex items-center gap-1">
                    <SelectInput
                      value={m.role}
                      onChange={(role) => setModelRole(m.id, role as "glue" | "obstacle")}
                    >
                      <option value="glue">Glue</option>
                      <option value="obstacle">Obstacle</option>
                    </SelectInput>
                    <button
                      type="button"
                      title="Replace STL and keep this model's glue path"
                      aria-label={`Replace ${m.name}`}
                      className="shrink-0 rounded px-1.5 text-[10px] font-medium text-[var(--muted)] hover:text-[var(--text)]"
                      onClick={() => {
                        replaceTargetId.current = m.id;
                        replaceInputRef.current?.click();
                      }}
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      title="Delete model"
                      aria-label={`Delete ${m.name}`}
                      className="shrink-0 px-1.5 text-[var(--danger)]"
                      onClick={() => {
                        const ok = window.confirm(`Remove "${m.name}" from the project?`);
                        if (ok) removeModel(m.id);
                      }}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {active ? (
        <Section title="Active model placement (mm)">
          <div className="mb-1 text-[11px] text-[var(--muted)]">
            {active.name} · {active.dimensions.x.toFixed(1)}×{active.dimensions.y.toFixed(1)}×
            {active.dimensions.z.toFixed(1)} mm
          </div>
          <p className="mb-1.5 text-[10px] text-[var(--muted-2)]">
            Center X/Y = object center on the bed. Z = bottom of the model (unchanged).
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            <Field
              label="Center X"
              tooltip="X position of the object’s center on the bed (mm)."
            >
              <NumberInput
                value={active.transform.position.x}
                step={1}
                decimals={2}
                onChange={(x) =>
                  updateModelTransform({ position: { ...active.transform.position, x } })
                }
              />
            </Field>
            <Field
              label="Center Y"
              tooltip="Y position of the object’s center on the bed (mm)."
            >
              <NumberInput
                value={active.transform.position.y}
                step={1}
                decimals={2}
                onChange={(y) =>
                  updateModelTransform({ position: { ...active.transform.position, y } })
                }
              />
            </Field>
            <Field label="Pos Z" tooltip="Height of the model’s bottom above the bed (mm).">
              <NumberInput
                value={active.transform.position.z}
                step={1}
                decimals={2}
                onChange={(z) =>
                  updateModelTransform({ position: { ...active.transform.position, z } })
                }
              />
            </Field>
            <Field label="Rot X°" tooltip="Rotate the model around the X axis (degrees).">
              <NumberInput
                value={active.transform.rotation.x}
                onChange={(x) =>
                  updateModelTransform({ rotation: { ...active.transform.rotation, x } })
                }
              />
            </Field>
            <Field label="Rot Y°" tooltip="Rotate the model around the Y axis (degrees).">
              <NumberInput
                value={active.transform.rotation.y}
                onChange={(y) =>
                  updateModelTransform({ rotation: { ...active.transform.rotation, y } })
                }
              />
            </Field>
            <Field label="Rot Z°" tooltip="Rotate the model around the Z axis (degrees).">
              <NumberInput
                value={active.transform.rotation.z}
                onChange={(z) =>
                  updateModelTransform({ rotation: { ...active.transform.rotation, z } })
                }
              />
            </Field>
          </div>
          <Field label="Scale" tooltip="Uniform size multiplier for the imported model.">
            <NumberInput
              value={active.transform.scale}
              step={0.01}
              min={0.01}
              onChange={(scale) => updateModelTransform({ scale })}
            />
          </Field>
        </Section>
      ) : null}
    </>
  );
}

function PathPanel() {
  const project = useProjectStore((s) => s.project);
  const path = project.paths.find((p) => p.id === project.activePathId) ?? project.paths[0];
  const updatePath = useProjectStore((s) => s.updatePath);
  const updatePoint = useProjectStore((s) => s.updatePoint);
  const deletePoint = useProjectStore((s) => s.deletePoint);
  const clearPathPoints = useProjectStore((s) => s.clearPathPoints);
  const addPoint = useProjectStore((s) => s.addPoint);
  const placingSafePoint = useProjectStore((s) => s.placingSafePoint);
  const setPlacingSafePoint = useProjectStore((s) => s.setPlacingSafePoint);
  const addSafePoint = useProjectStore((s) => s.addSafePoint);
  const updateSafePoint = useProjectStore((s) => s.updateSafePoint);
  const deleteSafePoint = useProjectStore((s) => s.deleteSafePoint);
  const clearSafePoints = useProjectStore((s) => s.clearSafePoints);
  const setActivePath = useProjectStore((s) => s.setActivePath);
  const setAllRetrace = useProjectStore((s) => s.setAllRetrace);
  const addPath = useProjectStore((s) => s.addPath);
  const duplicatePath = useProjectStore((s) => s.duplicatePath);
  const deletePath = useProjectStore((s) => s.deletePath);
  const patchMotion = useProjectStore((s) => s.patchMotion);
  const motion = project.motion;
  const length = path ? pathLengthMm(path.points) : 0;
  const canAddPath = project.models.some((m) => m.id === project.activeModelId && m.role === "glue");
  useEffect(() => () => setPlacingSafePoint(false), [setPlacingSafePoint]);

  if (!path) {
    return (
      <>
        <Section title="Active path">
          <p className="text-[11px] leading-relaxed text-[var(--muted)]">
            No adhesive path selected. Import a Glue model on the Model tab, or add a path below. Click a glue model in the viewport to place points.
          </p>
        </Section>
        <Section title="Paths in project">
          <Button variant="primary" onClick={addPath} disabled={!canAddPath}>
            New path
          </Button>
        </Section>
      </>
    );
  }

  return (
    <>
      <Section
        title="Active path"
        action={
          <div className="flex gap-1">
            <Button className="!px-2 !py-1 text-[10px]" onClick={() => duplicatePath(path.id)}>
              Duplicate
            </Button>
            <Button variant="danger" className="!px-2 !py-1 text-[10px]" onClick={() => deletePath(path.id)}>
              Delete
            </Button>
          </div>
        }
      >
        <Field label="Name" tooltip="Display name for this adhesive path.">
          <TextInput value={path.name} onChange={(name) => updatePath(path.id, { name })} />
        </Field>
        <Field
          label="Mode"
          tooltip="Planar uses one fixed Z for all points. Surface lets each point have its own Z."
        >
          <SelectInput
            value={path.mode}
            onChange={(mode) => updatePath(path.id, { mode: mode as "planar" | "surface" })}
          >
            <option value="planar">Planar (fixed Z)</option>
            <option value="surface">Surface-following (XYZ)</option>
          </SelectInput>
        </Field>
        <div className="grid grid-cols-2 gap-1.5">
          <Field
            label="Dispense Z"
            tooltip="Working height where glue is applied (mm). Same as Motion → Dispense Z."
          >
            <NumberInput
              value={motion.dispensingZ}
              step={0.1}
              decimals={2}
              onChange={(dispensingZ) => {
                patchMotion({ dispensingZ });
                if (path.mode === "planar") {
                  updatePath(path.id, { planarZ: dispensingZ });
                }
              }}
            />
          </Field>
          <Field
            label="Nozzle clearance"
            tooltip="Extra height added when approaching this path before dispensing (mm)."
          >
            <NumberInput
              value={path.nozzleClearance}
              onChange={(nozzleClearance) => updatePath(path.id, { nozzleClearance })}
            />
          </Field>
          <Field
            label="Planar Z"
            tooltip="Fixed Z used for planar path points (mm). Usually matches Dispense Z."
          >
            <NumberInput
              value={path.planarZ}
              step={0.1}
              decimals={2}
              onChange={(planarZ) => updatePath(path.id, { planarZ })}
            />
          </Field>
          <Field
            label="Direction"
            tooltip="Forward runs points in order; Reverse runs them last-to-first."
          >
            <SelectInput
              value={String(path.direction)}
              onChange={(d) => updatePath(path.id, { direction: Number(d) as 1 | -1 })}
            >
              <option value="1">Forward</option>
              <option value="-1">Reverse</option>
            </SelectInput>
          </Field>
        </div>
        <Button
          variant={path.retraceAtSafeZ ? "primary" : "default"}
          onClick={() => updatePath(path.id, { retraceAtSafeZ: !path.retraceAtSafeZ })}
        >
          {path.retraceAtSafeZ ? "Retrace at Safe Z: on" : "Retrace at Safe Z"}
        </Button>
        <p className="text-[11px] text-[var(--muted)]">
          After this glue line, the nozzle lifts to Safe Z and rapids back along the same line in reverse, then goes to the next path. Each path has its own switch.
        </p>
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
        {path.points.length === 0 ? (
          <p className="text-[11px] text-[var(--muted)]">
            No points. Add points or click the model in the viewport.
          </p>
        ) : (
          <ul className="space-y-2">
            {path.points.map((pt, idx) => (
              <li key={pt.id} className="rounded border border-[var(--border)] p-2">
                <div className="mb-1 flex items-center justify-between text-[11px] text-[var(--muted)]">
                  <span>
                    {idx === 0 ? "Start" : idx === path.points.length - 1 ? "End" : `Point ${idx + 1}`}
                  </span>
                  <button type="button" className="text-[var(--danger)]" onClick={() => deletePoint(pt.id)}>
                    Delete
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <NumberInput
                    value={pt.position.x}
                    step={1}
                    onChange={(x) => updatePoint(pt.id, { ...pt.position, x })}
                  />
                  <NumberInput
                    value={pt.position.y}
                    step={1}
                    onChange={(y) => updatePoint(pt.id, { ...pt.position, y })}
                  />
                  <NumberInput
                    value={pt.position.z}
                    step={1}
                    onChange={(z) => updatePoint(pt.id, { ...pt.position, z })}
                    disabled={path.mode === "planar"}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Safe Z travel"
        action={
          <div className="flex gap-1">
            <Button
              className="!px-2 !py-1 text-[10px]"
              onClick={() =>
                addSafePoint(
                  (path.safePoints ?? []).at(-1)?.x ?? 0,
                  ((path.safePoints ?? []).at(-1)?.y ?? 0) + 10
                )
              }
            >
              Add
            </Button>
            <Button className="!px-2 !py-1 text-[10px]" onClick={clearSafePoints}>
              Clear
            </Button>
          </div>
        }
      >
        <p className="text-[11px] text-[var(--muted)]">
          Points the nozzle visits at Safe Z ({motion.safeZ} mm) on the way to this path, before glue starts. The relay stays off.
        </p>
        <Button
          className="!px-2 !py-1 text-[10px]"
          variant={placingSafePoint ? "primary" : "default"}
          onClick={() => setPlacingSafePoint(!placingSafePoint)}
        >
          {placingSafePoint ? "Click the bed to place a point" : "Place on bed"}
        </Button>
        {(path.safePoints ?? []).length === 0 ? (
          <p className="text-[11px] text-[var(--muted)]">No safe travel points. The move stays a straight line.</p>
        ) : (
          <ul className="space-y-2">
            {(path.safePoints ?? []).map((pt, idx) => (
              <li key={pt.id} className="rounded border border-[var(--border)] p-2">
                <div className="mb-1 flex items-center justify-between text-[11px] text-[var(--muted)]">
                  <span>Travel {idx + 1}</span>
                  <button type="button" className="text-[var(--danger)]" onClick={() => deleteSafePoint(pt.id)}>
                    Delete
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <NumberInput value={pt.x} step={1} onChange={(x) => updateSafePoint(pt.id, x, pt.y)} />
                  <NumberInput value={pt.y} step={1} onChange={(y) => updateSafePoint(pt.id, pt.x, y)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Paths in project"
        action={
          project.paths.length > 1 ? (
            <Button
              className="!px-2 !py-1 text-[10px]"
              variant={project.paths.every((p) => p.retraceAtSafeZ) ? "primary" : "default"}
              onClick={() => setAllRetrace(!project.paths.every((p) => p.retraceAtSafeZ))}
            >
              {project.paths.every((p) => p.retraceAtSafeZ) ? "Retrace all: on" : "Retrace all"}
            </Button>
          ) : null
        }
      >
        {project.paths.length === 0 ? (
          <p className="mb-2 text-[11px] text-[var(--muted)]">No dispensing paths yet.</p>
        ) : (
          <ul className="mb-2 space-y-1">
            {project.paths.map((p) => {
              const modelName = project.models.find((m) => m.id === p.modelId)?.name ?? "model";
              const selected = p.id === path.id;
              return (
                <li
                  key={p.id}
                  className={`flex items-center gap-1 rounded border border-[var(--border)] ${
                    selected ? "border-[var(--accent)]/40 bg-[var(--accent-soft)]" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setActivePath(p.id)}
                    className={`min-w-0 flex-1 truncate px-2 py-1.5 text-left text-[11px] ${
                      selected ? "text-[var(--accent)]" : "hover:bg-[var(--panel-2)]"
                    }`}
                  >
                    {p.name}
                    <span className="block truncate text-[10px] text-[var(--muted-2)]">{modelName}</span>
                  </button>
                  <button
                    type="button"
                    title="Retrace this path at Safe Z after gluing"
                    className={`shrink-0 px-2 py-1.5 text-[10px] ${
                      p.retraceAtSafeZ
                        ? "text-[var(--accent)]"
                        : "text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
                    }`}
                    onClick={() => updatePath(p.id, { retraceAtSafeZ: !p.retraceAtSafeZ })}
                  >
                    {p.retraceAtSafeZ ? "Retrace on" : "Retrace"}
                  </button>
                  <button
                    type="button"
                    title="Duplicate path (+15.3 mm X)"
                    className="shrink-0 px-2 py-1.5 text-[10px] text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
                    onClick={() => duplicatePath(p.id)}
                  >
                    Dup
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
              );
            })}
          </ul>
        )}
        <Button variant="primary" onClick={addPath} disabled={!canAddPath}>
          New path
        </Button>
      </Section>
    </>
  );
}

function DispenserPanel() {
  const dispenser = useProjectStore((s) => s.project.dispenser);
  const dispensingSpeed = useProjectStore((s) => s.project.motion.dispensingSpeed);
  const patchDispenser = useProjectStore((s) => s.patchDispenser);
  const cutoffSec = dispenser.cutoffBeforeEndSec ?? 0;
  const cutoffMm = (Math.max(0, dispensingSpeed) / 60) * Math.max(0, cutoffSec);

  return (
    <>
      <Section title="Pneumatic dispenser commands">
        <Field
          label="Dispensing ON command"
          hint="Laser port — default M3 S1000 (relay on laser output, not spindle)"
          tooltip="G-code sent to turn the pneumatic dispenser ON (usually via laser port + relay)."
        >
          <TextInput
            value={dispenser.activationCommand}
            onChange={(activationCommand) => patchDispenser({ activationCommand })}
          />
        </Field>
        <Field
          label="Dispensing OFF command"
          hint="Laser port off — default M5"
          tooltip="G-code sent to turn the pneumatic dispenser OFF."
        >
          <TextInput
            value={dispenser.deactivationCommand}
            onChange={(deactivationCommand) => patchDispenser({ deactivationCommand })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-1.5">
          <Field
            label="ON delay ms"
            tooltip="Wait after dispenser ON before starting the glue move, so pressure builds."
          >
            <NumberInput
              value={dispenser.activationDelayMs}
              step={10}
              onChange={(activationDelayMs) => patchDispenser({ activationDelayMs })}
            />
          </Field>
          <Field
            label="OFF delay ms"
            tooltip="Wait after dispenser OFF before retracting, so glue stops cleanly."
          >
            <NumberInput
              value={dispenser.deactivationDelayMs}
              step={10}
              onChange={(deactivationDelayMs) => patchDispenser({ deactivationDelayMs })}
            />
          </Field>
          <Field
            label="Purge ms"
            tooltip="Optional pre-path purge time with dispenser ON before the first point."
          >
            <NumberInput
              value={dispenser.purgeTimeMs}
              step={10}
              onChange={(purgeTimeMs) => patchDispenser({ purgeTimeMs })}
            />
          </Field>
          <Field
            label="Lead-in mm"
            tooltip="Extra approach distance before the first glue point (helps start the bead)."
          >
            <NumberInput
              value={dispenser.leadInMm}
              onChange={(leadInMm) => patchDispenser({ leadInMm })}
            />
          </Field>
          <Field
            label="Lead-out mm"
            tooltip="Extra travel after the last glue point before turning the dispenser OFF."
          >
            <NumberInput
              value={dispenser.leadOutMm}
              onChange={(leadOutMm) => patchDispenser({ leadOutMm })}
            />
          </Field>
        </div>
        <Field
          label="Cutoff before end (s)"
          hint={
            cutoffSec > 0
              ? `${cutoffMm.toFixed(1)} mm before the end at ${dispensingSpeed} mm/min. The relay drops while the nozzle is still moving.`
              : "0 turns the relay off at the last point."
          }
          tooltip="Turn the relay off this many seconds before each glue run ends, using the Dispense speed. The shutoff is on the next move, so the nozzle does not stop. GRBL only allows that after laser mode is on: in the UGS command box, type $32=1 and press enter once. Do not put that in the G-code file. Regenerate after changing."
        >
          <NumberInput
            value={cutoffSec}
            min={0}
            step={0.1}
            decimals={2}
            onChange={(cutoffBeforeEndSec) => patchDispenser({ cutoffBeforeEndSec })}
          />
        </Field>
      </Section>
    </>
  );
}

function MachinePanel() {
  const machine = useProjectStore((s) => s.project.machine);
  const motion = useProjectStore((s) => s.project.motion);
  const dryRun = useProjectStore((s) => s.project.dryRun);
  const setDryRun = useProjectStore((s) => s.setDryRun);
  const patchMachine = useProjectStore((s) => s.patchMachine);
  const patchMotion = useProjectStore((s) => s.patchMotion);
  const [parkXyCopied, setParkXyCopied] = useState(false);

  useEffect(() => {
    if (!parkXyCopied) return;
    const t = setTimeout(() => setParkXyCopied(false), 1500);
    return () => clearTimeout(t);
  }, [parkXyCopied]);

  const parkXyGcode = [
    `G0 Z${motion.safeZ.toFixed(2)} F${motion.zSpeed.toFixed(0)}`,
    `G0 X${machine.homePosition.x.toFixed(2)} Y${machine.homePosition.y.toFixed(2)} F${motion.rapidSpeed.toFixed(0)}`,
    `G0 Z${motion.parkZ.toFixed(2)} F${motion.zSpeed.toFixed(0)}`,
  ].join("\n");

  return (
    <>
      <div className="mb-3">
        <Toggle checked={dryRun} onChange={setDryRun} label="Dry-run mode" />
      </div>
      <Section title="Machine profile">
        <Field label="Model">
          <TextInput value={machine.model} onChange={(model) => patchMachine({ model })} />
        </Field>
        <div className="grid grid-cols-3 gap-1.5">
          <Field label="Travel X" tooltip="Machine’s maximum X travel (mm).">
            <NumberInput value={machine.travelX} onChange={(travelX) => patchMachine({ travelX })} />
          </Field>
          <Field label="Travel Y" tooltip="Machine’s maximum Y travel (mm).">
            <NumberInput value={machine.travelY} onChange={(travelY) => patchMachine({ travelY })} />
          </Field>
          <Field label="Travel Z" tooltip="Machine’s maximum Z travel (mm).">
            <NumberInput value={machine.travelZ} onChange={(travelZ) => patchMachine({ travelZ })} />
          </Field>
          <Field label="Work X" tooltip="Usable work area width shown in the viewport (mm).">
            <NumberInput value={machine.workAreaX} onChange={(workAreaX) => patchMachine({ workAreaX })} />
          </Field>
          <Field label="Work Y" tooltip="Usable work area depth shown in the viewport (mm).">
            <NumberInput value={machine.workAreaY} onChange={(workAreaY) => patchMachine({ workAreaY })} />
          </Field>
          <Field label="Work Z" tooltip="Usable work area height shown in the viewport (mm).">
            <NumberInput value={machine.workAreaZ} onChange={(workAreaZ) => patchMachine({ workAreaZ })} />
          </Field>
          <Field label="Max mm/min" tooltip="Machine speed limit used for validation warnings.">
            <NumberInput value={machine.maxSpeed} onChange={(maxSpeed) => patchMachine({ maxSpeed })} />
          </Field>
          <Field label="Accel" tooltip="Reference acceleration value for your controller profile.">
            <NumberInput
              value={machine.acceleration}
              onChange={(acceleration) => patchMachine({ acceleration })}
            />
          </Field>
        </div>
        <Field label="Units" tooltip="Coordinate units for generated G-code (keep mm for GRBL).">
          <SelectInput value={machine.units} onChange={(units) => patchMachine({ units: units as "mm" | "inch" })}>
            <option value="mm">Millimeters</option>
            <option value="inch">Inches</option>
          </SelectInput>
        </Field>
        <Toggle
          checked={machine.grblCompatible}
          onChange={(grblCompatible) => patchMachine({ grblCompatible })}
          label="GRBL-compatible controller"
        />
      </Section>
      <Section title="Start / end park">
        <p className="text-[11px] text-[var(--muted)]">
          Where the nozzle begins and returns after all paths. Regenerate G-code after changing.
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          <Field
            label="Home X"
            tooltip="Program start and end X (mm). Simulation shows travel from here to the first path."
          >
            <div className="flex gap-1">
              <div className="min-w-0 flex-1">
                <NumberInput
                  value={machine.homePosition.x}
                  onChange={(x) =>
                    patchMachine({ homePosition: { ...machine.homePosition, x } })
                  }
                />
              </div>
              <CopyValueButton value={machine.homePosition.x} label="Home X" />
            </div>
          </Field>
          <Field
            label="Home Y"
            tooltip="Program start and end Y (mm). Simulation shows travel from here to the first path."
          >
            <div className="flex gap-1">
              <div className="min-w-0 flex-1">
                <NumberInput
                  value={machine.homePosition.y}
                  onChange={(y) =>
                    patchMachine({ homePosition: { ...machine.homePosition, y } })
                  }
                />
              </div>
              <CopyValueButton value={machine.homePosition.y} label="Home Y" />
            </div>
          </Field>
          <Field
            label="Park Z"
            tooltip="Height at start and end park (mm). Separate from Safe Z used between paths."
          >
            <div className="flex gap-1">
              <div className="min-w-0 flex-1">
                <NumberInput value={motion.parkZ} onChange={(parkZ) => patchMotion({ parkZ })} />
              </div>
              <CopyValueButton value={motion.parkZ} label="Park Z" />
            </div>
          </Field>
        </div>
        <div className="rounded border border-[var(--border)] bg-[var(--panel-2)]/40 p-2">
          <Button
            className="w-full !text-[11px]"
            onClick={() => {
              void copyText(parkXyGcode).then((ok) => {
                if (ok) setParkXyCopied(true);
              });
            }}
          >
            {parkXyCopied ? "Copied park for UGS" : "Copy park for UGS"}
          </Button>
          <p className="mt-1.5 whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-[var(--muted-2)]">
            {parkXyGcode}
          </p>
        </div>
      </Section>
      <Section title="Motion / heights">
        <div className="grid grid-cols-2 gap-1.5">
          <Field
            label="Rapid mm/min"
            tooltip="XY travel speed with the dispenser OFF (moves between paths)."
          >
            <NumberInput value={motion.rapidSpeed} onChange={(rapidSpeed) => patchMotion({ rapidSpeed })} />
          </Field>
          <Field
            label="Dispense mm/min"
            tooltip="XY speed while laying glue with the dispenser ON. Slower = more controlled bead."
          >
            <NumberInput
              value={motion.dispensingSpeed}
              onChange={(dispensingSpeed) => patchMotion({ dispensingSpeed })}
            />
          </Field>
          <Field label="Z speed" tooltip="How fast the nozzle moves up and down (mm/min).">
            <NumberInput value={motion.zSpeed} onChange={(zSpeed) => patchMotion({ zSpeed })} />
          </Field>
          <Field
            label="Safe Z"
            tooltip="Clearance height while traveling between paths (mm)."
          >
            <NumberInput value={motion.safeZ} onChange={(safeZ) => patchMotion({ safeZ })} />
          </Field>
          <Field
            label="Dispense Z"
            tooltip="Working height where glue is applied, usually just above the surface (mm)."
          >
            <NumberInput
              value={motion.dispensingZ}
              onChange={(dispensingZ) => patchMotion({ dispensingZ })}
            />
          </Field>
        </div>
      </Section>
    </>
  );
}

function CalibrationPanel() {
  const dryRun = useProjectStore((s) => s.project.dryRun);
  const setDryRun = useProjectStore((s) => s.setDryRun);

  return (
    <>
      <Section title="Work zero (nozzle tip)">
        <p className="text-[11px] leading-relaxed text-[var(--muted)]">
          Place the model in this app to match the real part on the bed. Jog the machine until the
          nozzle tip is at your intended origin, set work zero there, then dry-run before adhesive.
        </p>
      </Section>
      <Section title="Dry-run & relay test">
        <Toggle checked={dryRun} onChange={setDryRun} label="Dry-run (no dispenser commands)" />
        <p className="text-[11px] text-[var(--muted)]">
          Generate G-code in dry-run, simulate motion, then test the isolated relay and 983A-style pedal input independently before adhesive.
        </p>
      </Section>
    </>
  );
}

function GcodePanelBrief() {
  const gcode = useProjectStore((s) => s.project.gcode);
  const name = useProjectStore((s) => s.project.name);
  const generate = useProjectStore((s) => s.generate);

  return (
    <Section title="G-code">
      <Button variant="primary" onClick={generate}>
        Generate G-code
      </Button>
      <Button
        disabled={!gcode}
        onClick={() =>
          downloadText(
            `${name.replace(/\s+/g, "_").toLowerCase()}.gcode`,
            gcode,
            "text/plain"
          )
        }
      >
        Download .gcode
      </Button>
      <p className="text-[11px] text-[var(--muted)]">
        Load into Candle / UGS. This app does not connect to the machine.
      </p>
    </Section>
  );
}
