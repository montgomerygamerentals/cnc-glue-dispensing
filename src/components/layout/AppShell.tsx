"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { LeftSidebar } from "@/components/panels/LeftSidebar";
import { RightSidebar } from "@/components/panels/RightSidebar";
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
  const dryRun = useProjectStore((s) => s.project.dryRun);
  const verified = useProjectStore((s) => s.project.dispenser.verifiedHardware);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <div className="flex h-dvh min-h-[640px] flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--panel)] px-4">
        <div className="flex items-center gap-3">
          <span className="font-display text-base tracking-[0.04em]">GluePath CNC</span>
          <span className="hidden text-[11px] text-[var(--muted)] sm:inline">
            Adhesive dispensing · Genmitsu + GRBL · pneumatic syringe
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          {dryRun ? (
            <span className="rounded border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-2 py-0.5 text-[var(--accent)]">
              DRY-RUN
            </span>
          ) : (
            <span className="rounded border border-[var(--danger)]/40 bg-[var(--danger)]/15 px-2 py-0.5 text-[var(--danger)]">
              LIVE COMMANDS
            </span>
          )}
          {!verified ? (
            <span className="rounded border border-[var(--warn-border)] bg-[var(--warn-bg)] px-2 py-0.5 text-[var(--warn-text)]">
              Hardware unverified
            </span>
          ) : null}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <LeftSidebar />
        <main className="relative min-w-0 flex-1 bg-[var(--viewport)]">
          <DispensingScene />
        </main>
        <RightSidebar />
      </div>

      <BottomPanel />
    </div>
  );
}
