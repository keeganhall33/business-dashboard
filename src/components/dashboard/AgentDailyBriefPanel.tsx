import type { AgentDashboardResponse } from "@/lib/types/agent";

type Props = {
  agents: AgentDashboardResponse[];
};

export function AgentDailyBriefPanel({ agents }: Props) {
  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-zinc-500">Daily Briefs</div>
          <p className="text-sm text-zinc-400">Snapshot of what each agent shipped or learned in the last run.</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {agents.map((agent) => (
          <AgentBriefCard key={agent.agent.agentKey} agent={agent} />
        ))}
      </div>
    </section>
  );
}

type CardProps = {
  agent: AgentDashboardResponse;
};

function AgentBriefCard({ agent }: CardProps) {
  const insights = agent.recentUpdates.filter((update) => update.updateType === "insight").slice(0, 2);
  const actions = agent.recentUpdates.filter((update) => update.updateType === "action").slice(0, 2);
  const latestDeliverable = agent.completedTasks.find((task) => task.deliverableSummary);
  const lastUpdatedAt = agent.recentUpdates[0]?.createdAt ?? null;

  return (
    <div className="rounded-2xl border border-zinc-900 bg-zinc-950/85 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-zinc-50">{agent.agent.displayName}</div>
        <div className="text-xs text-zinc-500">{lastUpdatedAt ? formatDate(lastUpdatedAt) : "No brief yet"}</div>
      </div>

      <div className="mt-3 space-y-4 text-sm text-zinc-200">
        <BriefSection label="Insights" items={insights.map((item) => item.summary)} fallback="No fresh insights logged." />
        <BriefSection label="Actions" items={actions.map((item) => item.summary)} fallback="No actions logged." />
        <div>
          <div className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">Deliverable</div>
          {latestDeliverable ? (
            <div className="mt-2 rounded-xl border border-emerald-900/50 bg-emerald-900/10 p-3 text-sm text-emerald-100">
              <div className="font-semibold">{latestDeliverable.title}</div>
              <p className="mt-1 whitespace-pre-line text-emerald-50">{latestDeliverable.deliverableSummary}</p>
            </div>
          ) : (
            <p className="mt-1 text-xs text-zinc-500">No deliverable recorded yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

type BriefSectionProps = {
  label: string;
  items: string[];
  fallback: string;
};

function BriefSection({ label, items, fallback }: BriefSectionProps) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">{label}</div>
      {items.length === 0 ? (
        <p className="mt-1 text-xs text-zinc-500">{fallback}</p>
      ) : (
        <ul className="mt-1 space-y-1 text-sm text-zinc-200">
          {items.map((item, index) => (
            <li key={`${label}-${index}`} className="flex gap-2">
              <span className="text-zinc-500">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(value));
  } catch {
    return value;
  }
}
