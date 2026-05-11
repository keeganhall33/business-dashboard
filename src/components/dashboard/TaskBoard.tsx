import { AgentSlaSnapshot, ApprovalBottleneck, SchedulerJobHealth, TaskSummary } from "@/lib/types/dashboard";
import { TaskCard } from "./TaskCard";

type Props = {
  tasks: TaskSummary[];
  schedulerJobs: SchedulerJobHealth[];
  agentSla: AgentSlaSnapshot[];
  approvalBottlenecks: ApprovalBottleneck;
};

export function TaskBoard({ tasks, schedulerJobs, agentSla, approvalBottlenecks }: Props) {
  const columns = {
    critical: tasks.filter((t) => t.priority === "critical" && t.status !== "completed"),
    high: tasks.filter((t) => t.priority === "high" && t.status !== "completed"),
    medium: tasks.filter((t) => t.priority === "medium" && t.status !== "completed"),
    completed: tasks.filter((t) => t.status === "completed")
  };

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950/90 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Task Queue</div>
          <div className="text-lg font-semibold text-zinc-100">{tasks.length} active items</div>
        </div>
        <div className="text-xs text-zinc-500">Critical → Completed</div>
      </div>

      <ExecutionTrustStrip
        schedulerJobs={schedulerJobs}
        agentSla={agentSla}
        approvalBottlenecks={approvalBottlenecks}
      />

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Object.entries(columns).map(([column, items]) => (
          <div key={column} className="flex h-full flex-col rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
            <div className="flex items-center justify-between text-sm font-semibold capitalize text-zinc-100">
              <span>{column}</span>
              <span className="text-xs text-zinc-500">{items.length}</span>
            </div>
            <div className="mt-4 space-y-4">
              {items.length === 0 ? (
                <div className="text-sm text-zinc-600">No items</div>
              ) : (
                items.map((task) => <TaskCard key={task.id} task={task} />)
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ExecutionTrustStrip({
  schedulerJobs,
  agentSla,
  approvalBottlenecks
}: {
  schedulerJobs: SchedulerJobHealth[];
  agentSla: AgentSlaSnapshot[];
  approvalBottlenecks: ApprovalBottleneck;
}) {
  const timeFormatter = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });

  function formatTimestamp(iso: string | null) {
    if (!iso) return "—";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "—";
    return timeFormatter.format(date);
  }

  const topAgents = agentSla.slice(0, 3);

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-3">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
        <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Scheduler health</div>
        <div className="mt-3 space-y-2">
          {schedulerJobs.length === 0 && <div className="text-sm text-zinc-500">No jobs configured.</div>}
          {schedulerJobs.map((job) => (
            <div key={job.jobKey} className="flex items-center justify-between text-sm text-zinc-200">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${statusDot(job.lastStatus)}`} />
                <span>{job.jobName}</span>
              </div>
              <span className="text-xs text-zinc-500">{formatTimestamp(job.lastRunAt)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
        <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Agent SLA</div>
        <div className="mt-3 space-y-2">
          {topAgents.length === 0 && <div className="text-sm text-zinc-500">No active agents.</div>}
          {topAgents.map((agent) => (
            <div key={agent.agentKey} className="flex items-center justify-between text-sm text-zinc-200">
              <div className="flex flex-col">
                <span className="font-semibold text-zinc-100">{agent.agentKey}</span>
                <span className="text-xs text-zinc-500">{agent.inProgressShare != null ? `${agent.inProgressShare}% in progress` : "No load"}</span>
              </div>
              <div className="text-right text-xs text-zinc-500">
                {agent.minutesSinceRun != null ? `${agent.minutesSinceRun}m ago` : "—"}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
        <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Approvals</div>
        <div className="mt-3 text-3xl font-semibold text-zinc-50">{approvalBottlenecks.pendingCount}</div>
        <div className="text-sm text-zinc-500">waiting for approval</div>
        {approvalBottlenecks.oldestPendingHours != null && (
          <div className="mt-2 text-xs text-zinc-500">Oldest: {approvalBottlenecks.oldestPendingHours}h</div>
        )}
      </div>
    </div>
  );
}

function statusDot(status: string | null | undefined) {
  if (status === "failed") return "bg-red-500";
  if (status === "running") return "bg-amber-400";
  return "bg-emerald-500";
}
