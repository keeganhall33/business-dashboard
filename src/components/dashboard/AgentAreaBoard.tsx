"use client";

import { Children, useEffect, useMemo, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { AgentDashboardResponse } from "@/lib/types/agent";
import type { AgentKey } from "@/lib/types/requests";
import { DeliverableAttachmentList } from "./DeliverableAttachmentList";
import { InsightCard, type InsightObject } from "./ui/InsightCard";
import { requestDashboardRefresh } from "@/lib/dashboard/events";
import { publishDashboardToast } from "@/lib/dashboard/toast";
import { extractResponseError } from "@/lib/dashboard/http";

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
    <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
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
  const [decisionStatus, setDecisionStatus] = useState<{ state: "idle" | "success" | "error"; message?: string }>({
    state: "idle"
  });
  const pendingPlan = agent.planQueue.pending;
  const lastPlan = agent.planQueue.recent[0] ?? null;
  const latestThreadUpdate = agent.conversation.messages.at(-1) ?? null;
  const conversationMessages = expanded ? agent.conversation.messages.slice(-10) : [];
  const liveTaskList = agent.openTasks.filter((task) => task.status === "in_progress");
  const blockedTaskList = agent.openTasks.filter((task) => task.status === "blocked");
  const queuedTaskList = agent.openTasks.filter((task) => !["in_progress", "blocked"].includes(task.status));
  const liveTasks = liveTaskList.slice(0, 3);
  const blockedTasks = blockedTaskList.slice(0, 3);
  const queuedTasks = queuedTaskList.slice(0, 3);
  const liveOverflow = Math.max(0, liveTaskList.length - liveTasks.length);
  const blockedOverflow = Math.max(0, blockedTaskList.length - blockedTasks.length);
  const queuedOverflow = Math.max(0, queuedTaskList.length - queuedTasks.length);
  const deliverables = agent.completedTasks.filter((task) => task.deliverableSummary).slice(0, 3);
  const fallbackDeliverables = deliverables.length
    ? []
    : agent.recentUpdates
        .filter((update) => ["action", "big_bet", "directive"].includes(update.updateType))
        .slice(0, 3);
  const insights = agent.recentUpdates.filter((update) => update.updateType === "insight").slice(0, 5);
  const actions = agent.recentUpdates.filter((update) => update.updateType === "action").slice(0, 5);
  const prioritySignals = agent.recentUpdates.filter((update) => {
    const priority = (update.priority ?? "").toLowerCase();
    return priority === "critical" || priority === "high";
  }).slice(0, 3);
  const highPrioritySignalIds = new Set(prioritySignals.map((signal) => signal.id));
  const filteredInsights = insights.filter((item) => !highPrioritySignalIds.has(item.id));
  const filteredActions = actions.filter((item) => !highPrioritySignalIds.has(item.id));
  const latestDirective = agent.recentUpdates.find((update) => update.updateType === "directive") ?? null;
  const autoPlan = !pendingPlan && !lastPlan ? buildAutoPlan(agent) : null;

  const planStatusLabel = pendingPlan
    ? "Awaiting approval"
    : lastPlan
    ? "Running approved plan"
    : autoPlan
    ? "Auto brief"
    : "No plan submitted";

  useEffect(() => {
    setDecisionStatus({ state: "idle" });
  }, [pendingPlan?.id]);

  function handleDecision(decision: "approve" | "changes_requested") {
    if (!pendingPlan) return;
    let feedback: string | undefined;
    if (decision === "changes_requested") {
      feedback = window.prompt("Share any feedback for the agent", "Please tighten the plan.") ?? undefined;
      if (!feedback) return;
    }

    startTransition(async () => {
      try {
        const response = await fetch(`/api/agents/plans/${pendingPlan.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, feedback, approvedBy: "keegan" })
        });
        if (!response.ok) {
          throw new Error(await extractResponseError(response));
        }
        setDecisionStatus({
          state: "success",
          message: decision === "approve" ? "Plan approved" : "Changes requested"
        });
        router.refresh();
        requestDashboardRefresh({ reason: "agent-area" });
        publishDashboardToast({
          tone: decision === "approve" ? "success" : "warning",
          title: decision === "approve" ? "Plan approved" : "Changes requested",
          description: pendingPlan.title
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to submit decision";
        setDecisionStatus({ state: "error", message });
        publishDashboardToast({ tone: "error", title: "Plan decision failed", description: message });
      }
    });
  }

  return (
    <div className="rounded-3xl border border-zinc-900 bg-zinc-950/90 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-zinc-500">{agent.agent.roleTitle}</div>
          <div className="text-2xl font-semibold text-zinc-50">{agent.agent.displayName}</div>
          <p className="mt-1 max-w-3xl text-sm text-zinc-400">{agent.agent.mandate}</p>
        </div>
        <div className="flex flex-col items-end gap-2 text-right">
          <PlanStatusBadge label={planStatusLabel} />
          {latestThreadUpdate && (
            <div className="text-[11px] text-zinc-500">
              Last thread update {formatDate(latestThreadUpdate.createdAt)} · {summarizeMessage(latestThreadUpdate.body)}
            </div>
          )}
        </div>
      </div>

      {!expanded && (
        <CollapsedSummary
          pendingPlan={pendingPlan}
          lastPlan={lastPlan}
          autoPlan={autoPlan}
          liveCount={liveTaskList.length}
          queuedCount={queuedTaskList.length}
          blockedCount={blockedTaskList.length}
          priorityCount={prioritySignals.length}
          latestDirective={latestDirective}
        />
      )}

      {expanded && (
        <>
          <section className="mt-6 rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2 text-sm text-zinc-200">
            <div className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">Current plan</div>
            {pendingPlan ? (
              <div>
                <div className="text-lg font-semibold text-zinc-50">{pendingPlan.title}</div>
                <div className="text-xs text-zinc-500">Submitted {formatDate(pendingPlan.submittedAt)}</div>
                {pendingPlan.summary && <p className="mt-2 max-w-2xl text-zinc-300">{pendingPlan.summary}</p>}
              </div>
            ) : lastPlan ? (
              <div>
                <div className="text-lg font-semibold text-zinc-50">{lastPlan.title}</div>
                <div className="text-xs text-zinc-500">
                  Approved {lastPlan.approvedAt ? formatDate(lastPlan.approvedAt) : "previously"} · Status {lastPlan.status}
                </div>
                {lastPlan.summary && <p className="mt-2 max-w-2xl text-zinc-300">{lastPlan.summary}</p>}
              </div>
            ) : autoPlan ? (
              <div>
                <div className="text-lg font-semibold text-zinc-50">Auto brief</div>
                <p className="mt-1 text-zinc-400">No submitted plan — auto-brief built from current work.</p>
                <ul className="mt-2 space-y-2 text-zinc-200">
                  {autoPlan.map((line, index) => (
                    <li key={`auto-plan-${agent.agent.agentKey}-${index}`} className="flex gap-2 text-sm">
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
          {pendingPlan && (
            <div className="flex flex-col items-end gap-2">
              <button
                className="w-full rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-emerald-100 hover:bg-emerald-500/20"
                onClick={() => handleDecision("approve")}
                disabled={isPending}
              >
                Approve plan
              </button>
              <button
                className="w-full rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-amber-100 hover:bg-amber-500/20"
                onClick={() => handleDecision("changes_requested")}
                disabled={isPending}
              >
                Request changes
              </button>
              {isPending && <p className="text-[11px] text-zinc-500">Submitting decision…</p>}
              {decisionStatus.state === "error" && (
                <p className="text-[11px] text-rose-300">{decisionStatus.message}</p>
              )}
              {decisionStatus.state === "success" && (
                <p className="text-[11px] text-emerald-300">{decisionStatus.message}</p>
              )}
            </div>
          )}
        </div>

        {latestDirective && (
          <div className="mt-4 rounded-xl border border-zinc-900 bg-zinc-900/60 p-4 text-sm text-zinc-200">
            <div className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">Latest directive</div>
            <div className="mt-1 font-semibold text-zinc-50">{latestDirective.title}</div>
            <p className="mt-1 text-zinc-300">{latestDirective.summary}</p>
          </div>
        )}
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
          <div className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">Live initiatives</div>
          <div className="mt-4 space-y-5">
            <Subsection title="Live now" empty="No work is currently running.">
              {liveTasks.map((task) => (
                <TaskSummaryCard key={`live-${task.id}`} task={task} />
              ))}
            </Subsection>
            {liveOverflow > 0 && <OverflowNote text={`+${liveOverflow} more live task${liveOverflow > 1 ? "s" : ""}`} />}

            <Subsection title="Ready next" empty="No queued tasks.">
              {queuedTasks.map((task) => (
                <TaskSummaryCard key={`queued-${task.id}`} task={task} variant="queued" />
              ))}
            </Subsection>
            {queuedOverflow > 0 && <OverflowNote text={`+${queuedOverflow} more in queue`} />}

            <Subsection title="Blocked" empty="No blockers flagged.">
              {blockedTasks.map((task) => (
                <TaskSummaryCard key={`blocked-${task.id}`} task={task} variant="blocked" />
              ))}
            </Subsection>
            {blockedOverflow > 0 && <OverflowNote text={`+${blockedOverflow} additional blocker${blockedOverflow > 1 ? "s" : ""}`} />}
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
          <div className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">Signals & alerts</div>
          <div className="mt-4 space-y-4">
            <Subsection title="Escalations" empty="No escalations on record.">
              {blockedTaskList.length > 0 && (
                <div className="rounded-xl border border-rose-900/40 bg-rose-900/10 p-3 text-sm text-rose-100">
                  <div className="font-semibold">{blockedTaskList.length} blocked task{blockedTaskList.length > 1 ? "s" : ""}</div>
                  <p className="text-rose-200">See details in Live initiatives.</p>
                </div>
              )}
              {prioritySignals.map((signal) => (
                <SignalCard key={`signal-${signal.id}`} item={signal} tone="critical" />
              ))}
            </Subsection>

            <Subsection title="Insights" empty="No fresh insights logged.">
              {filteredInsights.map((insight) => (
                <InsightCard
                  key={`insight-${insight.id}`}
                  insight={agentUpdateToInsight(insight, agent.agent.displayName)}
                />
              ))}
            </Subsection>

            <Subsection title="Latest actions" empty="No actions logged yet.">
              {filteredActions.map((action) => (
                <InsightCard
                  key={`action-${action.id}`}
                  insight={agentUpdateToInsight(action, agent.agent.displayName)}
                />
              ))}
            </Subsection>
          </div>
        </section>
      </div>

          <section className="mt-6 rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
            <div className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">Shipped outputs</div>
            <div className="mt-4 space-y-3">
              {deliverables.length > 0
                ? deliverables.map((task) => {
                    const loggedAt = task.completedAt ?? task.createdAt;
                    return (
                      <div
                        key={`deliverable-${task.id}`}
                        className="rounded-2xl border border-emerald-900/40 bg-emerald-900/10 p-4 text-sm text-emerald-50"
                      >
                        <div className="font-semibold text-emerald-100">{task.title}</div>
                        <p className="mt-1 whitespace-pre-line text-emerald-50">{task.deliverableSummary}</p>
                        <DeliverableAttachmentList attachments={task.deliverableLinks} tone="emerald" />
                        <div className="mt-1 text-xs text-emerald-200">
                          Logged {loggedAt ? formatDate(loggedAt) : "recently"}
                        </div>
                      </div>
                    );
                  })
                : fallbackDeliverables.map((item) => (
                    <div
                      key={`fallback-deliverable-${item.id}`}
                      className="rounded-2xl border border-amber-900/40 bg-amber-900/10 p-4 text-sm text-amber-50"
                    >
                      <div className="text-[11px] uppercase tracking-[0.25em] text-amber-200">
                        {formatDate(item.createdAt)} • {item.updateType}
                      </div>
                      <div className="mt-1 font-semibold text-amber-100">{item.title}</div>
                      <p className="mt-1 whitespace-pre-line text-amber-50">{item.summary}</p>
                    </div>
                  ))}
            </div>
            {!deliverables.length && fallbackDeliverables.length > 0 && (
              <p className="mt-3 text-xs text-amber-200">
                No deliverables logged yet — showing most recent shipped actions.
              </p>
            )}
          </section>
        </>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          className="rounded-full border border-zinc-700 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-zinc-200 hover:border-zinc-500"
          onClick={onToggle}
        >
          {expanded ? "Collapse domain detail" : "Expand domain detail"}
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

type CollapsedSummaryProps = {
  pendingPlan: AgentDashboardResponse["planQueue"]["pending"] | null;
  lastPlan: AgentDashboardResponse["planQueue"]["recent"][number] | null;
  autoPlan: string[] | null;
  liveCount: number;
  queuedCount: number;
  blockedCount: number;
  priorityCount: number;
  latestDirective: AgentDashboardResponse["recentUpdates"][number] | null;
};

function CollapsedSummary({ pendingPlan, lastPlan, autoPlan, liveCount, queuedCount, blockedCount, priorityCount, latestDirective }: CollapsedSummaryProps) {
  const preview = buildPlanPreview(pendingPlan, lastPlan, autoPlan);
  return (
    <section className="mt-6 rounded-2xl border border-zinc-900 bg-zinc-950/70 p-5">
      <div>
        <div className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">Plan snapshot</div>
        <div className="mt-1 text-lg font-semibold text-zinc-50">{preview.title}</div>
        {preview.detail ? <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{preview.detail}</p> : null}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CollapsedStat label="Live tasks" value={liveCount} />
        <CollapsedStat label="Queued" value={queuedCount} />
        <CollapsedStat label="Blocked" value={blockedCount} tone={blockedCount ? "warning" : undefined} />
        <CollapsedStat label="Priority alerts" value={priorityCount} tone={priorityCount ? "warning" : undefined} />
      </div>
      {latestDirective && (
        <p className="mt-4 text-xs text-zinc-500">
          Latest directive: <span className="text-zinc-300">{latestDirective.title}</span>
        </p>
      )}
    </section>
  );
}

function buildPlanPreview(
  pendingPlan: AgentDashboardResponse["planQueue"]["pending"] | null,
  lastPlan: AgentDashboardResponse["planQueue"]["recent"][number] | null,
  autoPlan: string[] | null
) {
  if (pendingPlan) {
    return {
      title: pendingPlan.title,
      detail: pendingPlan.summary ?? `Submitted ${formatDate(pendingPlan.submittedAt)}`
    };
  }
  if (lastPlan) {
    return {
      title: lastPlan.title,
      detail: lastPlan.summary ?? `Approved ${lastPlan.approvedAt ? formatDate(lastPlan.approvedAt) : "previously"}`
    };
  }
  if (autoPlan && autoPlan.length) {
    return {
      title: "Auto brief",
      detail: autoPlan.slice(0, 2).join(" • ")
    };
  }
  return { title: "No plan submitted", detail: "Awaiting direction" };
}

function CollapsedStat({ label, value, tone }: { label: string; value: number; tone?: "warning" }) {
  const toneClasses = tone === "warning" ? "border-amber-500/40 text-amber-100" : "border-zinc-800 text-zinc-200";
  return (
    <div className={`rounded-2xl border ${toneClasses} bg-zinc-950/60 p-4`}>
      <div className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function PlanStatusBadge({ label }: { label: string }) {
  return (
    <span
      className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] ${getPlanStatusClasses(label)}`}
    >
      {label}
    </span>
  );
}

type TaskSummaryCardProps = {
  task: AgentDashboardResponse["openTasks"][number];
  variant?: "live" | "queued" | "blocked";
};

function TaskSummaryCard({ task, variant = "live" }: TaskSummaryCardProps) {
  const classes = getTaskCardStyles(variant);
  return (
    <div className={`rounded-2xl border ${classes.border} ${classes.bg} p-4 text-sm text-zinc-100`}>
      <div className="flex items-start justify-between gap-3">
        <div className="font-semibold">{task.title}</div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.3em] ${classes.badge}`}>
          {formatTaskStatusLabel(task.status)}
        </span>
      </div>
      {task.expectedImpact && <p className="mt-2 text-zinc-300">{task.expectedImpact}</p>}
      <div className="mt-2 text-[11px] uppercase tracking-[0.3em] text-zinc-500">
        {task.priority} • {task.agentKey}
      </div>
    </div>
  );
}

function OverflowNote({ text }: { text: string }) {
  return <p className="text-xs text-zinc-500">{text}</p>;
}

type SignalCardProps = {
  item: AgentDashboardResponse["recentUpdates"][number];
  tone?: "default" | "critical" | "action";
};

function SignalCard({ item, tone = "default" }: SignalCardProps) {
  const toneClasses = getSignalToneClasses(tone);
  return (
    <div className={`rounded-xl border ${toneClasses.border} ${toneClasses.bg} p-3 text-sm ${toneClasses.text}`}>
      <div className={`text-[11px] uppercase tracking-[0.25em] ${toneClasses.eyebrow}`}>
        {formatDate(item.createdAt)} • {item.priority}
      </div>
      <div className="mt-1 font-semibold">{item.title}</div>
      <p className="text-sm">{item.summary}</p>
    </div>
  );
}

function getPlanStatusClasses(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("awaiting")) {
    return "border-amber-500/40 bg-amber-500/10 text-amber-100";
  }
  if (normalized.includes("running")) {
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-100";
  }
  if (normalized.includes("auto")) {
    return "border-sky-500/40 bg-sky-500/10 text-sky-100";
  }
  return "border-zinc-700 bg-zinc-900 text-zinc-200";
}

function getTaskCardStyles(variant: "live" | "queued" | "blocked") {
  if (variant === "blocked") {
    return {
      border: "border-rose-900/50",
      bg: "bg-rose-950/20",
      badge: "border border-rose-500/40 bg-rose-500/10 text-rose-100"
    };
  }
  if (variant === "queued") {
    return {
      border: "border-zinc-900",
      bg: "bg-zinc-950/70",
      badge: "border border-zinc-600/60 bg-zinc-900 text-zinc-300"
    };
  }
  return {
    border: "border-sky-900/40",
    bg: "bg-sky-950/10",
    badge: "border border-sky-500/40 bg-sky-500/10 text-sky-100"
  };
}

function getSignalToneClasses(tone: "default" | "critical" | "action") {
  if (tone === "critical") {
    return {
      border: "border-rose-900/40",
      bg: "bg-rose-950/30",
      text: "text-rose-100",
      eyebrow: "text-rose-300"
    };
  }
  if (tone === "action") {
    return {
      border: "border-sky-900/40",
      bg: "bg-sky-950/20",
      text: "text-sky-100",
      eyebrow: "text-sky-300"
    };
  }
  return {
    border: "border-zinc-900",
    bg: "bg-zinc-900/60",
    text: "text-zinc-100",
    eyebrow: "text-zinc-400"
  };
}

function formatTaskStatusLabel(status?: string | null) {
  if (!status) return "Unknown";
  return status.replace(/_/g, " ").toUpperCase();
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

function agentUpdateToInsight(
  item: AgentDashboardResponse["recentUpdates"][number],
  agentName: string
): InsightObject {
  const priority = (item.priority ?? "").toLowerCase();
  const isHighPriority = priority === "critical" || priority === "high";

  const state: InsightObject["state"] =
    item.updateType === "action" ? "resolved" : isHighPriority ? "action_needed" : "supported";

  return {
    id: item.id,
    title: item.title,
    claim: item.summary,
    state,
    ownerLabel: agentName,
    confidenceLabel: item.updateType,
    updatedAtLabel: item.createdAt ? `Logged ${formatDate(item.createdAt)}` : null,
    definition:
      "Agent updates are standardized insight objects: a claim (what changed), evidence (timestamps + detail), and an action state (supported vs. needs operator attention).",
    evidence: [
      { label: "Type", value: item.updateType },
      { label: "Priority", value: item.priority ?? "—" },
      { label: "Logged", value: item.createdAt ? formatDate(item.createdAt) : "—" },
      { label: "Has detail", value: item.detailMd ? "yes" : "no" }
    ],
    actions: item.detailMd
      ? [{ label: "Read detail", detail: "Open Explain to view evidence + full context." }]
      : [{ label: "Add evidence", detail: "Include detailMd + links so operators can audit the claim." }]
  };
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
