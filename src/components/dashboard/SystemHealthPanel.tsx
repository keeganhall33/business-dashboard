import { SystemHealth } from "@/lib/types/dashboard";

type Props = {
  data: SystemHealth;
};

export function SystemHealthPanel({ data }: Props) {
  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
      <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">System Health</div>

      <div className="mt-4 space-y-4">
        <div className="rounded-2xl border border-zinc-800 p-4">
          <div className="text-sm text-zinc-400">Data Freshness</div>
          <div className="mt-2 text-3xl font-semibold text-zinc-50">
            {data.dataFreshnessHours != null ? `${data.dataFreshnessHours}h` : "—"}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 p-4">
          <div className="text-sm text-zinc-400">Task Completion Rate</div>
          <div className="mt-2 text-3xl font-semibold text-zinc-50">
            {data.agentTaskCompletionRate != null ? `${data.agentTaskCompletionRate}%` : "—"}
          </div>
        </div>

        <div className="space-y-3">
          {data.agents.map((agent) => (
            <div key={agent.agentKey} className="rounded-2xl border border-zinc-800 p-4">
              <div className="text-sm font-medium text-zinc-50">{agent.agentKey}</div>
              <div className="mt-1 text-sm text-zinc-400">
                Open {agent.openTaskCount} • Completed {agent.completedTaskCount}
              </div>
              <div className="mt-1 text-xs uppercase tracking-[0.14em] text-zinc-500">{agent.health}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

