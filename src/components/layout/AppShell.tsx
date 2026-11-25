"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { LeftSidebar } from "@/components/panels/LeftSidebar";
import { BottomPanel } from "@/components/panels/BottomPanel";
import { useProjectStore } from "@/store/project-store";

const DispensingScene = dynamic(
  () =>
    import("@/components/viewport/DispensingScene").then((m) => m.DispensingScene),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-[var(--viewport)] text-sm text-[var(--muted)]">
        Loading 3D viewport…
      </div>
    ),
  }
);

export function AppShell() {
  const hydrate = useProjectStore((s) => s.hydrate);
  const save = useProjectStore((s) => s.save);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const saving = useProjectStore((s) => s.saving);
  const dryRun = useProjectStore((s) => s.project.dryRun);

  useEffect(() => {
    void hydrate();
    const tab = useProjectStore.getState().tab as string;
    if (tab === "fixture") useProjectStore.getState().setTab("model");
  }, [hydrate]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();

      if (key === "s") {
        e.preventDefault();
        void save();
        return;
      }

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const typing =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        Boolean(target?.isContentEditable);
      if (typing) return;

      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redo, save, undo]);

  return (
    <div className="flex h-dvh min-h-[640px] flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--panel)] px-4">
        <div className="flex items-center gap-3">
          <span className="font-display text-base tracking-[0.04em]">GluePath CNC</span>
          <span className="hidden text-[11px] text-[var(--muted)] sm:inline">
            Adhesive dispensing · YoraHome 3018-Pro + GRBL · pneumatic syringe
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          {saving ? (
            <span className="animate-pulse text-[var(--muted)]">Saving…</span>
          ) : null}
          {dryRun ? (
            <span className="rounded border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-2 py-0.5 text-[var(--accent)]">
              DRY-RUN
            </span>
          ) : (
            <span className="rounded border border-[var(--danger)]/40 bg-[var(--danger)]/15 px-2 py-0.5 text-[var(--danger)]">
              LIVE COMMANDS
            </span>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <LeftSidebar />
        <main className="relative min-w-0 flex-1 bg-[var(--viewport)]">
          <DispensingScene />
        </main>
      </div>

      <BottomPanel />
    </div>
  );
}
