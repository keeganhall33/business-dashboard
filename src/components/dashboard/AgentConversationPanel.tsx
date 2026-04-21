"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { AgentDashboardResponse, AgentConversationMessage } from "@/lib/types/agent";
import { DeliverableAttachmentList } from "./DeliverableAttachmentList";

type Props = {
  agents: AgentDashboardResponse[];
};

export function AgentConversationPanel({ agents }: Props) {
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950/70 p-6 shadow-xl">
      <div className="flex flex-col gap-2">
        <div className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">Agent Command Center</div>
        <h2 className="text-2xl font-semibold text-zinc-50">Plans, active work, and deliverables</h2>
        <p className="text-sm text-zinc-400">
          Review each agent’s current plan, see their top tasks, and check the latest deliverable without leaving the dashboard.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {agents.map((agent) => (
          <AgentConversationCard
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
}

type CardProps = {
  agent: AgentDashboardResponse;
  expanded: boolean;
  onToggle: () => void;
};

function AgentConversationCard({ agent, expanded, onToggle }: CardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const pendingPlan = agent.planQueue.pending;
  const lastPlan = agent.planQueue.recent[0] ?? null;
  const latestThreadUpdate = agent.conversation.messages.at(-1) ?? null;
  const activeTasks = agent.openTasks.slice(0, 2);
  const latestDeliverable = agent.completedTasks.find((task) => task.deliverableSummary);
  const statusUpdates = agent.recentUpdates.slice(0, 2);
  const conversationMessages = expanded
    ? agent.conversation.messages.slice(-8)
    : [];
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
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/85 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">{agent.agent.roleTitle}</div>
          <div className="text-lg font-semibold text-zinc-100">{agent.agent.displayName}</div>
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

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
          <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Plan review</div>
          {pendingPlan ? (
            <div className="mt-3 space-y-3">
              <div>
                <div className="text-sm font-semibold text-zinc-100">{pendingPlan.title}</div>
                <div className="text-xs text-zinc-500">Submitted {formatDate(pendingPlan.submittedAt)}</div>
                {pendingPlan.summary && <p className="mt-2 text-sm text-zinc-300">{pendingPlan.summary}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-lg bg-emerald-600/20 px-3 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-600/30"
                  onClick={() => handleDecision("approve")}
                  disabled={isPending}
                >
                  Approve plan
                </button>
                <button
                  className="rounded-lg bg-amber-600/20 px-3 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-600/30"
                  onClick={() => handleDecision("changes_requested")}
                  disabled={isPending}
                >
                  Request changes
                </button>
              </div>
            </div>
          ) : lastPlan ? (
            <div className="mt-3">
              <div className="text-sm font-semibold text-zinc-100">{lastPlan.title}</div>
              <div className="text-xs text-zinc-500">
                Approved {lastPlan.approvedAt ? formatDate(lastPlan.approvedAt) : "previously"}
              </div>
              {lastPlan.summary && <p className="mt-2 text-sm text-zinc-300">{lastPlan.summary}</p>}
              <div className="mt-2 text-xs uppercase tracking-[0.2em] text-zinc-500">Status: {lastPlan.status}</div>
            </div>
          ) : autoPlan ? (
            <div className="mt-3">
              <div className="text-sm font-semibold text-zinc-100">Auto brief (no submitted plan)</div>
              <p className="mt-2 text-sm text-zinc-300">Focus generated from current tasks and updates:</p>
              <ul className="mt-2 space-y-1 text-sm text-zinc-200">
                {autoPlan.map((line, index) => (
                  <li key={`auto-plan-${agent.agent.agentKey}-${index}`} className="flex gap-2">
                    <span className="text-zinc-500">•</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-500">No plan on deck. The last directive is still active.</p>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
          <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Active work</div>
          <div className="mt-3 space-y-3">
            {activeTasks.length === 0 && <p className="text-xs text-zinc-500">No open tasks assigned.</p>}
            {activeTasks.map((task) => (
              <div key={task.id} className="rounded-xl border border-zinc-900 bg-zinc-950 p-3">
                <div className="text-sm font-medium text-zinc-100">{task.title}</div>
                <div className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">
                  {task.priority} • {task.status}
                </div>
                {task.expectedImpact && <p className="mt-2 text-sm text-zinc-300">{task.expectedImpact}</p>}
              </div>
            ))}
          </div>

          <div className="mt-4 border-t border-zinc-900/60 pt-4">
            <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Latest deliverable</div>
            {latestDeliverable ? (
              <div className="mt-3 rounded-xl border border-emerald-900/40 bg-emerald-900/10 p-3">
                <div className="text-sm font-semibold text-emerald-100">{latestDeliverable.title}</div>
                <p className="mt-2 whitespace-pre-line text-sm text-emerald-50">{latestDeliverable.deliverableSummary}</p>
                <DeliverableAttachmentList attachments={latestDeliverable.deliverableLinks} tone="emerald" />
                <div className="mt-2 text-xs text-emerald-200">
                  Logged {formatLoggedAt(latestDeliverable.completedAt ?? latestDeliverable.createdAt)}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs text-zinc-500">No deliverables recorded yet.</p>
            )}
          </div>

          {statusUpdates.length > 0 && (
            <div className="mt-4 border-t border-zinc-900/60 pt-4">
              <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Recent signals</div>
              <div className="mt-3 space-y-2">
                {statusUpdates.map((update) => (
                  <div key={update.id} className="rounded-lg bg-zinc-900/70 p-3 text-sm text-zinc-200">
                    <div className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">
                      {formatDate(update.createdAt)} • {update.priority}
                    </div>
                    <div className="mt-1 font-semibold text-zinc-50">{update.title}</div>
                    <p className="text-sm text-zinc-200">{update.summary}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="rounded-full border border-zinc-700 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-zinc-200 hover:border-zinc-500"
          onClick={onToggle}
        >
          {expanded ? "Hide plan thread" : "View plan thread"}
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

type MessageProps = {
  message: AgentConversationMessage;
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

function formatLoggedAt(value?: string | null) {
  if (!value) return "recently";
  return formatDate(value);
}

function summarizeMessage(body: string) {
  const clean = body.replace(/\s+/g, " ").trim();
  if (clean.length <= 80) return clean;
  return `${clean.slice(0, 77)}…`;
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
