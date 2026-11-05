"use client";

import { useMemo, useRef } from "react";
import { HARDWARE_WARNING } from "@/lib/defaults";
import { downloadText } from "@/lib/storage";
import { useProjectStore } from "@/store/project-store";
import {
  Button,
  Field,
  NumberInput,
  Section,
  SelectInput,
  TextInput,
  Toggle,
  WarningBanner,
} from "@/components/ui/primitives";
import type { WorkspaceTab } from "@/lib/types";

const TABS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: "model", label: "Model" },
  { id: "fixture", label: "Fixture" },
  { id: "path", label: "Path" },
  { id: "dispenser", label: "Dispenser" },
  { id: "machine", label: "Machine" },
  { id: "calibration", label: "Calibration" },
  { id: "gcode", label: "G-code" },
];

export function LeftSidebar() {
  const tab = useProjectStore((s) => s.tab);
  const setTab = useProjectStore((s) => s.setTab);
  const project = useProjectStore((s) => s.project);
  const setProjectName = useProjectStore((s) => s.setProjectName);
  const save = useProjectStore((s) => s.save);
  const newProject = useProjectStore((s) => s.newProject);
  const load = useProjectStore((s) => s.load);
  const listSaved = useProjectStore((s) => s.listSaved);
  const generate = useProjectStore((s) => s.generate);
  const setDryRun = useProjectStore((s) => s.setDryRun);
  const issues = useProjectStore((s) => s.issues);

  const saved = useMemo(() => listSaved(), [project.updatedAt, project.id]);

  return (
    <aside className="flex h-full w-[300px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--panel)]">
      <div className="border-b border-[var(--border)] px-3 py-3">
        <div className="font-display text-lg tracking-wide text-[var(--text)]">GluePath</div>
        <div className="text-[11px] text-[var(--muted)]">Automated CNC adhesive dispensing</div>
        <div className="mt-3">
          <TextInput value={project.name} onChange={setProjectName} />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button variant="primary" onClick={save}>
            Save
          </Button>
          <Button onClick={newProject}>New</Button>
          <Button variant="primary" onClick={generate}>
            Generate
          </Button>
        </div>
        <div className="mt-2">
          <Toggle checked={project.dryRun} onChange={setDryRun} label="Dry-run mode" />
        </div>
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
        {tab === "model" && <ModelPanel />}
        {tab === "fixture" && <FixturePanel />}
        {tab === "path" && <PathPanelBrief />}
        {tab === "dispenser" && <DispenserPanel />}
        {tab === "machine" && <MachinePanel />}
        {tab === "calibration" && <CalibrationPanel />}
        {tab === "gcode" && <GcodePanelBrief />}

        <Section title="Saved projects">
          {saved.length === 0 ? (
            <p className="text-[11px] text-[var(--muted)]">No saved projects yet.</p>
          ) : (
            <ul className="space-y-1">
              {saved.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="w-full rounded border border-[var(--border)] px-2 py-1.5 text-left text-[11px] hover:bg-[var(--panel-2)]"
                    onClick={() => load(p.id)}
                  >
                    <div className="truncate text-[var(--text)]">{p.name}</div>
                    <div className="text-[var(--muted-2)]">{new Date(p.updatedAt).toLocaleString()}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Validation">
          {issues.length === 0 ? (
            <p className="text-[11px] text-[var(--ok)]">No issues.</p>
          ) : (
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
          )}
        </Section>
      </div>
    </aside>
  );
}

function ModelPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const importStl = useProjectStore((s) => s.importStl);
  const loadSampleStl = useProjectStore((s) => s.loadSampleStl);
  const stl = useProjectStore((s) => s.project.stl);
  const updateModelTransform = useProjectStore((s) => s.updateModelTransform);

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
          }}
        />
        <div className="flex gap-1.5">
          <Button variant="primary" onClick={() => inputRef.current?.click()}>
            Import STL
          </Button>
          <Button onClick={loadSampleStl}>Sample Dangle</Button>
        </div>
        {stl ? (
          <div className="text-[11px] text-[var(--muted)]">
            {stl.name}
            <br />
            {stl.dimensions.x.toFixed(2)} × {stl.dimensions.y.toFixed(2)} × {stl.dimensions.z.toFixed(2)} mm
          </div>
        ) : null}
      </Section>
      {stl ? (
        <Section title="Model registration (machine coords)">
          <div className="grid grid-cols-3 gap-1.5">
            <Field label="Pos X">
              <NumberInput
                value={stl.transform.position.x}
                onChange={(x) =>
                  updateModelTransform({ position: { ...stl.transform.position, x } })
                }
              />
            </Field>
            <Field label="Pos Y">
              <NumberInput
                value={stl.transform.position.y}
                onChange={(y) =>
                  updateModelTransform({ position: { ...stl.transform.position, y } })
                }
              />
            </Field>
            <Field label="Pos Z">
              <NumberInput
                value={stl.transform.position.z}
                onChange={(z) =>
                  updateModelTransform({ position: { ...stl.transform.position, z } })
                }
              />
            </Field>
            <Field label="Rot X°">
              <NumberInput
                value={stl.transform.rotation.x}
                onChange={(x) =>
                  updateModelTransform({ rotation: { ...stl.transform.rotation, x } })
                }
              />
            </Field>
            <Field label="Rot Y°">
              <NumberInput
                value={stl.transform.rotation.y}
                onChange={(y) =>
                  updateModelTransform({ rotation: { ...stl.transform.rotation, y } })
                }
              />
            </Field>
            <Field label="Rot Z°">
              <NumberInput
                value={stl.transform.rotation.z}
                onChange={(z) =>
                  updateModelTransform({ rotation: { ...stl.transform.rotation, z } })
                }
              />
            </Field>
          </div>
          <Field label="Scale">
            <NumberInput
              value={stl.transform.scale}
              step={0.01}
              min={0.01}
              onChange={(scale) => updateModelTransform({ scale })}
            />
          </Field>
          <p className="text-[10px] text-[var(--muted-2)]">
            STL origin is independent of machine origin. Register the model within the work area before generating paths.
          </p>
        </Section>
      ) : null}
    </>
  );
}

function FixturePanel() {
  const fixture = useProjectStore((s) => s.project.fixture);
  const patchFixture = useProjectStore((s) => s.patchFixture);

  return (
    <Section title="Batch fixture (default 12)">
      <div className="grid grid-cols-2 gap-1.5">
        <Field label="Rows">
          <NumberInput value={fixture.rows} step={1} min={1} onChange={(rows) => patchFixture({ rows })} />
        </Field>
        <Field label="Columns">
          <NumberInput
            value={fixture.columns}
            step={1}
            min={1}
            onChange={(columns) => patchFixture({ columns })}
          />
        </Field>
        <Field label="Spacing X">
          <NumberInput value={fixture.spacingX} onChange={(spacingX) => patchFixture({ spacingX })} />
        </Field>
        <Field label="Spacing Y">
          <NumberInput value={fixture.spacingY} onChange={(spacingY) => patchFixture({ spacingY })} />
        </Field>
        <Field label="Width">
          <NumberInput value={fixture.width} onChange={(width) => patchFixture({ width })} />
        </Field>
        <Field label="Depth">
          <NumberInput value={fixture.depth} onChange={(depth) => patchFixture({ depth })} />
        </Field>
        <Field label="Height">
          <NumberInput value={fixture.height} onChange={(height) => patchFixture({ height })} />
        </Field>
        <Field label="Orient °">
          <NumberInput
            value={fixture.orientationDeg}
            onChange={(orientationDeg) => patchFixture({ orientationDeg })}
          />
        </Field>
        <Field label="Machine X">
          <NumberInput
            value={fixture.machinePosition.x}
            onChange={(x) => patchFixture({ machinePosition: { ...fixture.machinePosition, x } })}
          />
        </Field>
        <Field label="Machine Y">
          <NumberInput
            value={fixture.machinePosition.y}
            onChange={(y) => patchFixture({ machinePosition: { ...fixture.machinePosition, y } })}
          />
        </Field>
        <Field label="Machine Z">
          <NumberInput
            value={fixture.machinePosition.z}
            onChange={(z) => patchFixture({ machinePosition: { ...fixture.machinePosition, z } })}
          />
        </Field>
      </div>
      <p className="text-[11px] text-[var(--muted)]">
        Slots: {fixture.rows * fixture.columns}. The active path replicates to every product automatically.
      </p>
    </Section>
  );
}

function PathPanelBrief() {
  return (
    <Section title="Adhesive path">
      <p className="text-[11px] leading-relaxed text-[var(--muted)]">
        Use the right sidebar for point editing. Click the master product in the viewport to append dispensing points. Paths replicate across the fixture.
      </p>
    </Section>
  );
}

function DispenserPanel() {
  const dispenser = useProjectStore((s) => s.project.dispenser);
  const patchDispenser = useProjectStore((s) => s.patchDispenser);

  return (
    <>
      <WarningBanner>
        <pre className="whitespace-pre-wrap font-sans text-[10px] leading-relaxed">{HARDWARE_WARNING}</pre>
      </WarningBanner>
      <Section title="Pneumatic dispenser commands">
        <Field label="Dispensing ON command" hint="Placeholder until relay/pinout confirmed">
          <TextInput
            value={dispenser.activationCommand}
            onChange={(activationCommand) => patchDispenser({ activationCommand })}
          />
        </Field>
        <Field label="Dispensing OFF command">
          <TextInput
            value={dispenser.deactivationCommand}
            onChange={(deactivationCommand) => patchDispenser({ deactivationCommand })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-1.5">
          <Field label="ON delay ms">
            <NumberInput
              value={dispenser.activationDelayMs}
              step={10}
              onChange={(activationDelayMs) => patchDispenser({ activationDelayMs })}
            />
          </Field>
          <Field label="OFF delay ms">
            <NumberInput
              value={dispenser.deactivationDelayMs}
              step={10}
              onChange={(deactivationDelayMs) => patchDispenser({ deactivationDelayMs })}
            />
          </Field>
          <Field label="Purge ms">
            <NumberInput
              value={dispenser.purgeTimeMs}
              step={10}
              onChange={(purgeTimeMs) => patchDispenser({ purgeTimeMs })}
            />
          </Field>
          <Field label="Lead-in mm">
            <NumberInput
              value={dispenser.leadInMm}
              onChange={(leadInMm) => patchDispenser({ leadInMm })}
            />
          </Field>
          <Field label="Lead-out mm">
            <NumberInput
              value={dispenser.leadOutMm}
              onChange={(leadOutMm) => patchDispenser({ leadOutMm })}
            />
          </Field>
        </div>
        <Toggle
          checked={dispenser.verifiedHardware}
          onChange={(verifiedHardware) => patchDispenser({ verifiedHardware })}
          label="I verified relay isolation & pedal wiring"
        />
      </Section>
    </>
  );
}

function MachinePanel() {
  const machine = useProjectStore((s) => s.project.machine);
  const motion = useProjectStore((s) => s.project.motion);
  const patchMachine = useProjectStore((s) => s.patchMachine);
  const patchMotion = useProjectStore((s) => s.patchMotion);

  return (
    <>
      <Section title="Genmitsu profile">
        <Field label="Model (confirm before use)">
          <TextInput value={machine.model} onChange={(model) => patchMachine({ model })} />
        </Field>
        <div className="grid grid-cols-3 gap-1.5">
          <Field label="Travel X">
            <NumberInput value={machine.travelX} onChange={(travelX) => patchMachine({ travelX })} />
          </Field>
          <Field label="Travel Y">
            <NumberInput value={machine.travelY} onChange={(travelY) => patchMachine({ travelY })} />
          </Field>
          <Field label="Travel Z">
            <NumberInput value={machine.travelZ} onChange={(travelZ) => patchMachine({ travelZ })} />
          </Field>
          <Field label="Work X">
            <NumberInput value={machine.workAreaX} onChange={(workAreaX) => patchMachine({ workAreaX })} />
          </Field>
          <Field label="Work Y">
            <NumberInput value={machine.workAreaY} onChange={(workAreaY) => patchMachine({ workAreaY })} />
          </Field>
          <Field label="Work Z">
            <NumberInput value={machine.workAreaZ} onChange={(workAreaZ) => patchMachine({ workAreaZ })} />
          </Field>
          <Field label="Max mm/min">
            <NumberInput value={machine.maxSpeed} onChange={(maxSpeed) => patchMachine({ maxSpeed })} />
          </Field>
          <Field label="Accel">
            <NumberInput
              value={machine.acceleration}
              onChange={(acceleration) => patchMachine({ acceleration })}
            />
          </Field>
        </div>
        <Field label="Units">
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
      <Section title="Motion / heights">
        <div className="grid grid-cols-2 gap-1.5">
          <Field label="Rapid mm/min">
            <NumberInput value={motion.rapidSpeed} onChange={(rapidSpeed) => patchMotion({ rapidSpeed })} />
          </Field>
          <Field label="Dispense mm/min">
            <NumberInput
              value={motion.dispensingSpeed}
              onChange={(dispensingSpeed) => patchMotion({ dispensingSpeed })}
            />
          </Field>
          <Field label="Z speed">
            <NumberInput value={motion.zSpeed} onChange={(zSpeed) => patchMotion({ zSpeed })} />
          </Field>
          <Field label="Safe Z">
            <NumberInput value={motion.safeZ} onChange={(safeZ) => patchMotion({ safeZ })} />
          </Field>
          <Field label="Dispense Z">
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
  const nozzle = useProjectStore((s) => s.project.nozzle);
  const patchNozzle = useProjectStore((s) => s.patchNozzle);
  const dryRun = useProjectStore((s) => s.project.dryRun);
  const setDryRun = useProjectStore((s) => s.setDryRun);

  return (
    <>
      <WarningBanner>
        Before adhesive: verify work coordinates, nozzle clearance, dispenser OFF during rapids, relay test, dry cycle, and path match to the physical product.
      </WarningBanner>
      <Section title="Nozzle assembly (~50 mm offset)">
        <div className="grid grid-cols-2 gap-1.5">
          <Field label="Horiz offset">
            <NumberInput
              value={nozzle.horizontalOffset}
              onChange={(horizontalOffset) => patchNozzle({ horizontalOffset })}
            />
          </Field>
          <Field label="Vert offset">
            <NumberInput
              value={nozzle.verticalOffset}
              onChange={(verticalOffset) => patchNozzle({ verticalOffset })}
            />
          </Field>
          <Field label="Nozzle length">
            <NumberInput
              value={nozzle.nozzleLength}
              onChange={(nozzleLength) => patchNozzle({ nozzleLength })}
            />
          </Field>
          <Field label="Clearance">
            <NumberInput
              value={nozzle.nozzleClearance}
              onChange={(nozzleClearance) => patchNozzle({ nozzleClearance })}
            />
          </Field>
          <Field label="Syringe °">
            <NumberInput
              value={nozzle.syringeAngleDeg}
              onChange={(syringeAngleDeg) => patchNozzle({ syringeAngleDeg })}
            />
          </Field>
          <Field label="Nozzle °">
            <NumberInput
              value={nozzle.nozzleAngleDeg}
              onChange={(nozzleAngleDeg) => patchNozzle({ nozzleAngleDeg })}
            />
          </Field>
        </div>
        <p className="text-[10px] text-[var(--muted-2)]">
          Collision checks are approximate until physical assembly dimensions are calibrated.
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
