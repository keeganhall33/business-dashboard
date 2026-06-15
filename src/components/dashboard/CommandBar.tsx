"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ActionQueue, SchedulerJobHealth } from "@/lib/types/dashboard";
import { CommandPalette, type CommandPaletteAction, useJumpAction } from "./CommandPalette";

type Props = {
  actionQueue: ActionQueue;
  schedulerJobs: SchedulerJobHealth[];
  refreshedAtIso?: string;
};

export function CommandBar({ actionQueue, schedulerJobs, refreshedAtIso }: Props) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const jumpTo = useJumpAction();

  const pendingApprovals = actionQueue.needsApprovalTasks.count + actionQueue.pendingPlans.count;
  const decisionsDue = actionQueue.decisionsDue.count;
  const invoicesDue = actionQueue.invoicesToSend.count;

  const automationMissing = schedulerJobs.filter((job) => !job.lastRunAt).length;
  const automationFailed = schedulerJobs.filter((job) => job.lastStatus === "failed").length;
  const automationTelemetryUnavailable = schedulerJobs.length === 0;

  const runCommand = useCallback(async (path: string) => {
    try {
      const response = await fetch(path, { method: "POST" });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Failed to run ${path}.`);
      }
      window.location.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Command failed.";
      window.alert(message);
    }
  }, []);

  const actions = useMemo<CommandPaletteAction[]>(() => {
    return [
      {
        id: "run-weekly-cycle",
        label: "Run weekly automation cycle (Sloan → Lyra → Noah → Avery)",
        hint: "Automation · Generates updates/tasks/opportunities",
        requiresConfirm: true,
        confirmTitle: "Run weekly automation cycle",
        confirmBody:
          "This will run the full agent sequence now (Sloan → Lyra → Noah → Avery), evaluate rules, and refresh the dashboard when complete.",
        onRun: () => {
          void runCommand("/api/automation/weekly-cycle");
        }
      },
      {
        id: "evaluate-rules",
        label: "Evaluate automation rules",
        hint: "Automation · Dry evaluation + trigger log",
        requiresConfirm: true,
        confirmTitle: "Evaluate automation rules",
        confirmBody: "Runs the rule engine and records triggers. No agent sequence.",
        onRun: () => {
          void runCommand("/api/automation/evaluate-rules");
        }
      },
      {
        id: "jump-approvals",
        label: "Jump to approvals",
        hint: "Command Center → Action Queue",
        badge: pendingApprovals ? String(pendingApprovals) : undefined,
        onRun: () => jumpTo("#command-center")
      },
      {
        id: "jump-pipeline",
        label: "Jump to pipeline",
        hint: "Pipeline & Partnerships",
        onRun: () => jumpTo("#pipeline")
      },
      {
        id: "jump-domains",
        label: "Jump to agent domains",
        hint: "CEO, Product, Brand, Research",
        onRun: () => jumpTo("#dashboard-section-domains")
      },
      {
        id: "refresh",
        label: "Refresh dashboard",
        hint: "Reloads server data",
        shortcut: "R",
        onRun: () => window.location.reload()
      }
    ];
  }, [jumpTo, pendingApprovals, runCommand]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isCmdK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (isCmdK) {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="sticky top-0 z-50 -mx-4 border-b border-zinc-800/70 bg-zinc-950/70 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur-xl md:-mx-6 md:px-6">
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} actions={actions} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.35em] text-zinc-400">Command Center</div>
            <div className="mt-0.5 text-sm font-semibold text-zinc-50">Fortune Dashboard</div>
          </div>

          <div className="hidden h-8 w-px bg-zinc-800 md:block" />

          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={pendingApprovals > 0 ? "amber" : "zinc"}>
              Approvals {pendingApprovals}
            </Pill>
            <Pill tone={decisionsDue > 0 ? "amber" : "zinc"}>Decisions {decisionsDue}</Pill>
            <Pill tone={invoicesDue > 0 ? "amber" : "zinc"}>Invoices {invoicesDue}</Pill>
            <Pill tone={automationTelemetryUnavailable ? "amber" : automationFailed > 0 ? "rose" : automationMissing > 0 ? "amber" : "emerald"}>
              {automationTelemetryUnavailable
                ? "Automation telemetry unavailable"
                : automationFailed > 0
                  ? `Automation ${automationFailed} failed`
                  : automationMissing > 0
                    ? `Automation ${automationMissing} missing`
                    : "Automation green"}
            </Pill>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="#command-center"
            className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-semibold text-zinc-200 hover:border-zinc-700"
          >
            Jump to approvals
          </Link>
          <Link
            href="#pipeline"
            className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-semibold text-zinc-200 hover:border-zinc-700"
          >
            Jump to pipeline
          </Link>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-zinc-200 hover:border-white/15"
            aria-label="Open command palette"
            title="Cmd+K"
          >
            Cmd+K
          </button>
          {refreshedAtIso ? <RefreshedAt refreshedAtIso={refreshedAtIso} /> : null}
        </div>
      </div>
    </div>
  );
}

function RefreshedAt({ refreshedAtIso }: { refreshedAtIso: string }) {
  const label = useMemo(() => {
    return new Date(refreshedAtIso).toLocaleTimeString();
  }, [refreshedAtIso]);

  return (
    <div className="text-xs text-zinc-500" suppressHydrationWarning>
      Updated {label}
    </div>
  );
}

function Pill({ children, tone = "zinc" }: { children: React.ReactNode; tone?: "zinc" | "amber" | "emerald" | "rose" }) {
  const toneClasses =
    tone === "emerald"
      ? "border-emerald-800/40 bg-emerald-950/20 text-emerald-200"
      : tone === "amber"
        ? "border-amber-800/40 bg-amber-950/20 text-amber-200"
        : tone === "rose"
          ? "border-rose-800/40 bg-rose-950/20 text-rose-200"
          : "border-zinc-800 bg-zinc-950 text-zinc-300";

  return (
    <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${toneClasses}`}>{children}</span>
  );
}
