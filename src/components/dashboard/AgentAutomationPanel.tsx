"use client";

import { useCallback, useMemo, useState } from "react";
import { AgentSlaSnapshot } from "@/lib/types/dashboard";
import { publishDashboardToast } from "@/lib/dashboard/toast";
import { requestDashboardRefresh } from "@/lib/dashboard/events";
import { StatusChip } from "./ui/StatusChip";

const AGENT_METADATA: Array<{ agentKey: string; title: string; subtitle: string }> = [
  { agentKey: "sloan", title: "Sloan", subtitle: "Revenue & Ecommerce" },
  { agentKey: "lyra", title: "Lyra", subtitle: "Brand & Relationships" },
  { agentKey: "noah", title: "Noah", subtitle: "Pipeline & Growth" },
  { agentKey: "avery", title: "Avery", subtitle: "CEO Ops & Strategy" }
];

type Props = {
  agentSla: AgentSlaSnapshot[];
};

function formatRelativeMinutes(minutes?: number | null) {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function AgentAutomationPanel({ agentSla }: Props) {
  const [runningAgentKey, setRunningAgentKey] = useState<string | null>(null);

  const agents = useMemo(() => {
    const slaMap = new Map(agentSla.map((snapshot) => [snapshot.agentKey, snapshot]));
    return AGENT_METADATA.map((meta) => ({ ...meta, sla: slaMap.get(meta.agentKey) ?? null }));
  }, [agentSla]);

  const runAgent = useCallback(
    async (agentKey: string) => {
      if (runningAgentKey) return;
      setRunningAgentKey(agentKey);
      try {
        const response = await fetch(`/api/agents/run/${agentKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runType: "manual" })
        });
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Failed to run agent automation.");
        }
        publishDashboardToast({
          tone: "success",
          title: `${agentKey} run queued`,
          description: "Automation run triggered from the dashboard."
        });
        requestDashboardRefresh({ reason: `agent-run:${agentKey}` });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to run agent automation.";
        publishDashboardToast({
          tone: "error",
          title: "Agent run failed",
          description: message
        });
      } finally {
        setRunningAgentKey(null);
      }
    },
    [runningAgentKey]
  );

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Agent automations</div>
          <div className="mt-1 text-sm text-zinc-400">Run individual agent loops without leaving the dashboard.</div>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {agents.map(({ agentKey, title, subtitle, sla }) => (
          <div key={agentKey} className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-50">{title}</div>
                <div className="text-xs text-zinc-500">{subtitle}</div>
              </div>
              <StatusChip label={sla?.minutesSinceRun != null ? formatRelativeMinutes(sla.minutesSinceRun) : "No runs yet"} tone="zinc" />
            </div>
            <div className="mt-3 text-xs text-zinc-500">
              Next due: {sla?.nextRunDueAt ? new Date(sla.nextRunDueAt).toLocaleString() : "—"}
            </div>
            <button
              type="button"
              onClick={() => runAgent(agentKey)}
              disabled={runningAgentKey === agentKey}
              className="mt-3 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-semibold text-zinc-100 transition hover:border-white/20 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {runningAgentKey === agentKey ? "Running…" : "Run agent"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
