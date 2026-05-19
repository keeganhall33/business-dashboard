import Link from "next/link";
import type { ActionQueue, SchedulerJobHealth } from "@/lib/types/dashboard";

type Props = {
  actionQueue: ActionQueue;
  schedulerJobs: SchedulerJobHealth[];
  refreshedAtIso?: string;
};

export function CommandBar({ actionQueue, schedulerJobs, refreshedAtIso }: Props) {
  const pendingApprovals = actionQueue.needsApprovalTasks.count + actionQueue.pendingPlans.count;
  const decisionsDue = actionQueue.decisionsDue.count;
  const invoicesDue = actionQueue.invoicesToSend.count;

  const automationMissing = schedulerJobs.filter((job) => !job.lastRunAt).length;
  const automationFailed = schedulerJobs.filter((job) => job.lastStatus === "failed").length;

  return (
    <div className="sticky top-0 z-50 -mx-4 border-b border-zinc-800/70 bg-zinc-950/70 px-4 py-3 backdrop-blur-xl md:-mx-6 md:px-6">
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
            <Pill tone={automationFailed > 0 ? "rose" : automationMissing > 0 ? "amber" : "emerald"}>
              Automation {automationFailed > 0 ? `${automationFailed} failed` : automationMissing > 0 ? `${automationMissing} missing` : "green"}
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
          {refreshedAtIso ? (
            <div className="text-xs text-zinc-500">Updated {new Date(refreshedAtIso).toLocaleTimeString()}</div>
          ) : null}
        </div>
      </div>
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

