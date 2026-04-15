"use client";

import { Children, useMemo, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { AgentDashboardResponse } from "@/lib/types/agent";
import type { AgentKey } from "@/lib/types/requests";

const agentAreaConfig: AgentAreaDefinition[] = [
  {
    key: "ceo",
    title: "CEO",
    subtitle: "Executive direction, approvals, and cross-agent enforcement",
    agentKeys: ["avery"],
    kpiMetricKeys: ["monthly_revenue", "active_brand_conversations", "aov", "conversion_rate"]
  },
  {
    key: "product",
    title: "Product & Ecommerce",
    subtitle: "Offer architecture, conversion, and digital commerce operations",
    agentKeys: ["sloan"],
    kpiMetricKeys: ["aov", "conversion_rate", "cart_abandonment_rate"]
  },
  {
    key: "brand",
    title: "Brand Strategy",
    subtitle: "Positioning, storytelling, and premium demand generation",
    agentKeys: ["lyra"],
    kpiMetricKeys: ["engagement_rate", "cultural_relevance_score", "conversion_rate"]
  },
  {
    key: "research",
    title: "Research & Intelligence",
    subtitle: "Market reconnaissance, collector intel, and partner diligence",
    agentKeys: ["noah"],
    kpiMetricKeys: ["active_brand_conversations", "tier1_brand_collabs"]
  }
];

type AgentAreaDefinition = {
  key: string;
  title: string;
  subtitle: string;
  agentKeys: AgentKey[];
  kpiMetricKeys?: string[];
};

type Props = {
  agents: AgentDashboardResponse[];
};

export function AgentAreaBoard({ agents }: Props) {
  const agentMap = useMemo(() => new Map(agents.map((agent) => [agent.agent.agentKey, agent])), [agents]);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {agentAreaConfig.map((area) => {
        const areaAgents = area.agentKeys
          .map((key) => agentMap.get(key))
          .filter((agent): agent is AgentDashboardResponse => Boolean(agent));
        if (areaAgents.length === 0) return null;
        const areaMetrics = buildAreaMetrics(areaAgents, area.kpiMetricKeys);
        return (
          <section key={area.key} className="rounded-3xl border border-zinc-800 bg-zinc-950/80 p-6">
            <div className="flex flex-col gap-1">
              <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">{area.title}</div>
              <p className="text-sm text-zinc-400">{area.subtitle}</p>
            </div>
            {areaMetrics.length > 0 && (
              <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                {areaMetrics.map((metric) => (
                  <AreaKpiCard key={`${area.key}-${metric.metricKey}-${metric.agentKey}`} metric={metric} />
                ))}
              </div>
            )}
            <div className={`${areaMetrics.length > 0 ? "mt-8" : "mt-6"} space-y-4`}>
              {areaAgents.map((agent) => (
                <AgentDetailCard
                  key={agent.agent.agentKey}
                  agent={agent}
                  expanded={expandedAgent === agent.agent.agentKey}
                  onToggle={() =>
                    setExpandedAgent((current) => (current === agent.agent.agentKey ? null : agent.agent.agentKey))
                  }
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

type AgentCardProps = {
  agent: AgentDashboardResponse;
  expanded: boolean;
  onToggle: () => void;
};

function AgentDetailCard({ agent, expanded, onToggle }: AgentCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const pendingPlan = agent.planQueue.pending;
  const lastPlan = agent.planQueue.recent[0] ?? null;
  const latestThreadUpdate = agent.conversation.messages.at(-1) ?? null;
  const conversationMessages = expanded ? agent.conversation.messages.slice(-10) : [];
  const activeTasks = agent.openTasks.slice(0, 3);
  const deliverables = agent.completedTasks.filter((task) => task.deliverableSummary).slice(0, 3);
  const insights = agent.recentUpdates.filter((update) => update.updateType === "insight").slice(0, 3);
  const actions = agent.recentUpdates.filter((update) => update.updateType === "action").slice(0, 3);
  const autoPlan = !pendingPlan && !lastPlan ? buildAutoPlan(agent) : null;

  const planStatusLabel = pendingPlan
    ? "Awaiting approval"
    : lastPlan
    ? "Running approved plan"
    : autoPlan
    ? "Auto-brief"
    : "No plan submitted";

  function handleDecision(decision: "approve" | "changes_requested") {
    if (!pendingPlan) return;
    let feedback: string | undefined;
    if (decision === "changes_requested") {
      feedback = window.prompt("Share any feedback for the agent", "Please tighten the plan.") ?? undefined;
      if (!feedback) return;
    }

    startTransition(async () => {
      await fetch(`/api/agents/plans/${pendingPlan.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, feedback, approvedBy: "keegan" })
      });
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-zinc-900 bg-zinc-950/90 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-zinc-500">{agent.agent.roleTitle}</div>
          <div className="text-xl font-semibold text-zinc-50">{agent.agent.displayName}</div>
          <p className="mt-1 max-w-xl text-sm text-zinc-400">{agent.agent.mandate}</p>
        </div>
        <div className="text-right text-xs text-zinc-500">
          <div>Plan status: {planStatusLabel}</div>
          {latestThreadUpdate && (
            <div className="mt-1 text-[11px] text-zinc-400">
              Last thread update {formatDate(latestThreadUpdate.createdAt)} · {summarizeMessage(latestThreadUpdate.body)}
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
          <div className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">Plan & approvals</div>
          <div className="mt-3 space-y-3 text-sm text-zinc-200">
            {pendingPlan ? (
              <div className="space-y-3">
                <div>
                  <div className="text-base font-semibold text-zinc-50">{pendingPlan.title}</div>
                  <div className="text-xs text-zinc-500">Submitted {formatDate(pendingPlan.submittedAt)}</div>
                  {pendingPlan.summary && <p className="mt-2 text-zinc-300">{pendingPlan.summary}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-lg bg-emerald-600/20 px-3 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-emerald-100 hover:bg-emerald-600/30"
                    onClick={() => handleDecision("approve")}
                    disabled={isPending}
                  >
                    Approve
                  </button>
                  <button
                    className="rounded-lg bg-amber-600/20 px-3 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-amber-200 hover:bg-amber-600/30"
                    onClick={() => handleDecision("changes_requested")}
                    disabled={isPending}
                  >
                    Request changes
                  </button>
                </div>
              </div>
            ) : lastPlan ? (
              <div>
                <div className="text-base font-semibold text-zinc-50">{lastPlan.title}</div>
                <div className="text-xs text-zinc-500">
                  Approved {lastPlan.approvedAt ? formatDate(lastPlan.approvedAt) : "previously"}
                </div>
                {lastPlan.summary && <p className="mt-2 text-zinc-300">{lastPlan.summary}</p>}
                <div className="mt-2 text-[11px] uppercase tracking-[0.3em] text-zinc-500">Status: {lastPlan.status}</div>
              </div>
            ) : autoPlan ? (
              <div>
                <div className="text-base font-semibold text-zinc-50">Auto brief (no submitted plan)</div>
                <ul className="mt-2 space-y-2 text-sm text-zinc-200">
                  {autoPlan.map((line, index) => (
                    <li key={`auto-plan-${agent.agent.agentKey}-${index}`} className="flex gap-2">
                      <span className="text-zinc-600">•</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">No plan currently on deck.</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
          <div className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">Active work & deliverables</div>
          <div className="mt-3 space-y-3">
            <Subsection title="Active tasks" empty="No open tasks assigned.">
              {activeTasks.map((task) => (
                <div key={task.id} className="rounded-xl border border-zinc-900 bg-zinc-950/80 p-3 text-sm text-zinc-100">
                  <div className="font-semibold">{task.title}</div>
                  <div className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">
                    {task.priority} • {task.status}
                  </div>
                  {task.expectedImpact && <p className="mt-2 text-zinc-300">{task.expectedImpact}</p>}
                </div>
              ))}
            </Subsection>
            <Subsection title="Deliverables" empty="No deliverables recorded yet.">
              {deliverables.map((task) => (
                <div key={`deliverable-${task.id}`} className="rounded-xl border border-emerald-900/50 bg-emerald-900/10 p-3 text-sm text-emerald-50">
                  <div className="font-semibold text-emerald-100">{task.title}</div>
                  <p className="mt-1 whitespace-pre-line text-emerald-50">{task.deliverableSummary}</p>
                  <div className="mt-1 text-xs text-emerald-200">
                    Logged {task.createdAt ? formatDate(task.createdAt) : "recently"}
                  </div>
                </div>
              ))}
            </Subsection>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
          <div className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">Signals & insights</div>
          <div className="mt-3 space-y-4">
            <Subsection title="Insights" empty="No fresh insights logged.">
              {insights.map((insight) => (
                <div key={insight.id} className="rounded-lg bg-zinc-900/70 p-3 text-sm text-zinc-200">
                  <div className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">
                    {formatDate(insight.createdAt)} • {insight.priority}
                  </div>
                  <div className="mt-1 font-semibold text-zinc-50">{insight.title}</div>
                  <p>{insight.summary}</p>
                </div>
              ))}
            </Subsection>
            <Subsection title="Actions" empty="No actions logged yet.">
              {actions.map((action) => (
                <div key={action.id} className="rounded-lg bg-zinc-900/70 p-3 text-sm text-zinc-200">
                  <div className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">
                    {formatDate(action.createdAt)} • {action.priority}
                  </div>
                  <div className="mt-1 font-semibold text-zinc-50">{action.title}</div>
                  <p>{action.summary}</p>
                </div>
              ))}
            </Subsection>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          className="rounded-full border border-zinc-700 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-zinc-200 hover:border-zinc-500"
          onClick={onToggle}
        >
          {expanded ? "Hide command thread" : "View command thread"}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 space-y-3">
          {conversationMessages.length === 0 && <p className="text-xs text-zinc-500">No conversation activity yet.</p>}
          {conversationMessages.map((message) => (
            <ConversationMessage key={message.id} message={message} agentName={agent.agent.displayName} />
          ))}
        </div>
      )}
    </div>
  );
}

type AreaMetric = {
  agentKey: string;
  agentName: string;
  metricKey: string;
  metricName: string;
  currentValue: number;
  targetValue: number;
  status: string;
  unit: string | null;
};

type SubsectionProps = {
  title: string;
  empty: string;
  children: ReactNode;
};

function Subsection({ title, empty, children }: SubsectionProps) {
  const hasContent = Children.count(children) > 0;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">{title}</div>
      {hasContent ? <div className="mt-2 space-y-2">{children}</div> : <p className="mt-1 text-xs text-zinc-600">{empty}</p>}
    </div>
  );
}

function AreaKpiCard({ metric }: { metric: AreaMetric }) {
  const percent = metric.targetValue > 0 ? Math.round((metric.currentValue / metric.targetValue) * 100) : null;
  const { textClass, barClass } = resolveStatusColors(metric.status);
  return (
    <div className="rounded-2xl border border-zinc-900 bg-zinc-950/90 p-4">
      <div className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">{metric.metricName}</div>
      <div className={`mt-2 text-2xl font-semibold ${textClass}`}>
        {formatMetricValue(metric.currentValue, metric.unit, metric.metricKey)}
      </div>
      <div className="text-xs text-zinc-500">
        Target
        {metric.targetValue || metric.targetValue === 0
          ? ` ${formatMetricValue(metric.targetValue, metric.unit, metric.metricKey)}`
          : " —"}
      </div>
      <div className="mt-1 text-[11px] uppercase tracking-[0.25em] text-zinc-500">Owner · {metric.agentName}</div>
      {percent != null && metric.targetValue > 0 && (
        <div className="mt-3 h-1.5 w-full rounded-full bg-zinc-900">
          <div className={`${barClass} h-1.5 rounded-full`} style={{ width: `${Math.min(130, Math.max(0, percent))}%` }} />
        </div>
      )}
    </div>
  );
}

type MessageProps = {
  message: AgentDashboardResponse["conversation"]["messages"][number];
  agentName: string;
};

function ConversationMessage({ message, agentName }: MessageProps) {
  const sender =
    message.senderType === "agent"
      ? agentName
      : message.senderType === "ceo"
      ? "Keegan"
      : message.senderType === "avery"
      ? "Avery"
      : "System";
  return (
    <div className="rounded-xl border border-zinc-900 bg-zinc-950/80 p-4 text-sm text-zinc-200">
      <div className="text-xs uppercase tracking-[0.25em] text-zinc-500">
        {sender} · {formatDate(message.createdAt)}
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-100">{message.body}</p>
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

function summarizeMessage(body: string) {
  const clean = body.replace(/\s+/g, " ").trim();
  if (clean.length <= 90) return clean;
  return `${clean.slice(0, 87)}…`;
}

function buildAutoPlan(agent: AgentDashboardResponse) {
  const bullets: string[] = [];
  agent.openTasks.slice(0, 2).forEach((task) => {
    bullets.push(`Push "${task.title}" (${task.priority})`);
  });
  agent.recentUpdates
    .filter((update) => update.updateType === "action" || update.updateType === "insight")
    .slice(0, 2)
    .forEach((update) => {
      bullets.push(`${update.updateType}: ${update.summary}`);
    });
  return bullets.length ? bullets : null;
}

function buildAreaMetrics(agents: AgentDashboardResponse[], preferredKeys?: string[]) {
  const metrics: AreaMetric[] = agents.flatMap((agent) =>
    agent.ownedMetrics.map((metric) => ({
      agentKey: agent.agent.agentKey,
      agentName: agent.agent.displayName,
      metricKey: metric.metricKey,
      metricName: metric.metricName,
      currentValue: metric.currentValue,
      targetValue: metric.targetValue,
      status: metric.status,
      unit: metric.unit
    }))
  );
  if (!metrics.length) return [];
  if (!preferredKeys || preferredKeys.length === 0) {
    return metrics.slice(0, 4);
  }
  const prioritized: AreaMetric[] = [];
  for (const key of preferredKeys) {
    const metric = metrics.find(
      (item) => item.metricKey === key && !prioritized.some((selected) => selected.metricKey === item.metricKey && selected.agentKey === item.agentKey)
    );
    if (metric) prioritized.push(metric);
  }
  const remainder = metrics.filter(
    (metric) => !prioritized.some((selected) => selected.metricKey === metric.metricKey && selected.agentKey === metric.agentKey)
  );
  return [...prioritized, ...remainder].slice(0, 4);
}

function resolveStatusColors(status?: string | null) {
  const normalized = status?.toLowerCase() ?? "";
  if (["success", "good", "on_track", "healthy"].includes(normalized)) {
    return { textClass: "text-emerald-200", barClass: "bg-emerald-500" };
  }
  if (["warning", "attention", "lagging"].includes(normalized)) {
    return { textClass: "text-amber-200", barClass: "bg-amber-500" };
  }
  if (["danger", "critical", "off_track"].includes(normalized)) {
    return { textClass: "text-rose-200", barClass: "bg-rose-500" };
  }
  return { textClass: "text-sky-100", barClass: "bg-sky-500" };
}

function formatMetricValue(value: number, unit?: string | null, metricKey?: string) {
  if (value == null || Number.isNaN(value)) return "—";
  const normalizedUnit = unit?.toLowerCase() ?? "";
  if (normalizedUnit === "usd" || normalizedUnit === "dollars") {
    return formatCurrency(value);
  }
  if (normalizedUnit === "percent" || (metricKey && metricKey.includes("rate"))) {
    return `${value.toFixed(1)}%`;
  }
  if (!unit && metricKey && metricKey.includes("conversion")) {
    return `${value.toFixed(1)}%`;
  }
  if (!unit && metricKey && metricKey.includes("score")) {
    return value.toFixed(1);
  }
  if (Math.abs(value) >= 1000) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
  }
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return value.toFixed(2);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value >= 1000 ? 0 : 0,
    maximumFractionDigits: value >= 1000 ? 0 : 0
  }).format(value);
}
