import { AgentSlaSnapshot, ApprovalBottleneck, SchedulerJobHealth, TaskSummary } from "@/lib/types/dashboard";
import { TaskCard } from "./TaskCard";

type AgentCommentary = {
  title: string | null;
  summary: string | null;
  createdAt: string | null;
};

type AgentCommentaryMap = Record<string, AgentCommentary | null>;

type Props = {
  tasks: TaskSummary[];
  schedulerJobs: SchedulerJobHealth[];
  agentSla: AgentSlaSnapshot[];
  approvalBottlenecks: ApprovalBottleneck;
  agentCommentary?: AgentCommentaryMap;
};

export function TaskBoard({ tasks, schedulerJobs, agentSla, approvalBottlenecks, agentCommentary }: Props) {
  const normalizedTasks = dedupeTasks(condenseFacebookTasks(tasks, agentCommentary));
  const columns = {
    critical: normalizedTasks.filter((t) => t.priority === "critical" && t.status !== "completed"),
    high: normalizedTasks.filter((t) => t.priority === "high" && t.status !== "completed"),
    medium: normalizedTasks.filter((t) => t.priority === "medium" && t.status !== "completed"),
    completed: normalizedTasks.filter((t) => t.status === "completed")
  };

  return (
    <section className="ui-glass ui-glass-hover rounded-3xl p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Task Queue</div>
          <div className="text-lg font-semibold text-zinc-100">{normalizedTasks.length} active items</div>
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
          <div key={column} className="flex h-full flex-col rounded-2xl border border-[var(--ui-border)] bg-white/[0.02] p-4">
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
      <div className="rounded-2xl border border-[var(--ui-border)] bg-white/[0.02] p-4">
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

      <div className="rounded-2xl border border-[var(--ui-border)] bg-white/[0.02] p-4">
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

      <div className="rounded-2xl border border-[var(--ui-border)] bg-white/[0.02] p-4">
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

function condenseFacebookTasks(tasks: TaskSummary[], agentCommentary?: AgentCommentaryMap) {
  const pattern = /facebook ads review/i;
  const grouped = tasks.filter((task) => pattern.test(task.title));
  if (grouped.length <= 1) return tasks;
  const sorted = grouped.slice().sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });
  const latest = sorted[0];
  const commentary = latest.agentKey ? agentCommentary?.[latest.agentKey] : null;
  const descriptionParts = [
    `${grouped.length} pending reviews. Latest logged ${formatShortDate(latest.createdAt)}.`
  ];
  if (commentary && (commentary.summary || commentary.title)) {
    const note = commentary.summary ?? commentary.title;
    const relative = formatRelativeCommentaryTime(commentary.createdAt);
    descriptionParts.push(`Latest commentary${relative ? ` (${relative})` : ""}: ${note}`);
  }
  const aggregatedTitle = latest.title?.trim()?.length
    ? `${latest.title} (Grouped)`
    : "Facebook Ads Review (Grouped)";
  const aggregated: TaskSummary = {
    ...latest,
    id: `${latest.id}-fb-aggregate`,
    description: descriptionParts.join(" "),
    title: aggregatedTitle
  };
  return [...tasks.filter((task) => !pattern.test(task.title)), aggregated];
}

function formatShortDate(iso?: string | null) {
  if (!iso) return "recently";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "recently";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function formatRelativeCommentaryTime(iso?: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffDays = Math.round((Date.now() - date.getTime()) / 86400000);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 10) return `${diffDays}d ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function dedupeTasks(tasks: TaskSummary[]) {
  const seen = new Set<string>();
  const deduped: TaskSummary[] = [];

  // Prefer most-recent tasks when duplicates exist.
  const sorted = tasks.slice().sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });

  for (const task of sorted) {
    const titleKey = (task.title ?? "").trim().toLowerCase();
    const dedupeKey = [titleKey, task.agentKey ?? "", task.requiresApproval ? "approval" : ""].join("|");
    if (titleKey.length === 0) {
      deduped.push(task);
      continue;
    }
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    deduped.push(task);
  }

  // Restore stable-ish ordering (priority then createdAt).
  return deduped.sort((a, b) => {
    const priorityRank = (value: string) =>
      value === "critical" ? 0 : value === "high" ? 1 : value === "medium" ? 2 : value === "low" ? 3 : 4;
    const pri = priorityRank(String(a.priority)) - priorityRank(String(b.priority));
    if (pri !== 0) return pri;
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });
}
