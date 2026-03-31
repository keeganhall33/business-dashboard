"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { AgentDashboardResponse, AgentConversationMessage } from "@/lib/types/agent";

type Props = {
  agents: AgentDashboardResponse[];
};

export function AgentConversationPanel({ agents }: Props) {
  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-950/60 p-6 shadow-xl">
      <div className="flex flex-col gap-2">
        <div className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">Agent Conversations</div>
        <h2 className="text-2xl font-semibold text-zinc-50">Plan reviews & command threads</h2>
        <p className="text-sm text-zinc-400">Each agent posts a plan here. Approve or request changes before anything executes.</p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {agents.map((agent) => (
          <AgentConversationCard key={agent.agent.agentKey} agent={agent} />
        ))}
      </div>
    </div>
  );
}

type CardProps = {
  agent: AgentDashboardResponse;
};

function AgentConversationCard({ agent }: CardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const pendingPlan = agent.planQueue.pending;
  const recentMessages = agent.conversation.messages.slice(-3);

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
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">{agent.agent.roleTitle}</div>
          <div className="text-lg font-semibold text-zinc-100">{agent.agent.displayName}</div>
        </div>
        <div className="text-xs text-zinc-500">Plan status: {pendingPlan ? "Awaiting approval" : "No pending plan"}</div>
      </div>

      {pendingPlan ? (
        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
          <div className="text-sm font-semibold text-zinc-100">{pendingPlan.title}</div>
          <div className="mt-1 text-xs text-zinc-400">Submitted {formatDate(pendingPlan.submittedAt)}</div>
          {pendingPlan.summary && <p className="mt-2 text-sm text-zinc-300">{pendingPlan.summary}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
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
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-zinc-800 p-3 text-sm text-zinc-500">
          No pending plan. The last approved plan is still in play.
        </p>
      )}

      <div className="mt-4 space-y-2">
        {recentMessages.length === 0 && <p className="text-xs text-zinc-500">No conversation activity yet.</p>}
        {recentMessages.map((message) => (
          <ConversationMessage key={message.id} message={message} agentName={agent.agent.displayName} />
        ))}
      </div>
    </div>
  );
}

type MessageProps = {
  message: AgentConversationMessage;
  agentName: string;
};

function ConversationMessage({ message, agentName }: MessageProps) {
  const sender = message.senderType === "agent" ? agentName : message.senderType === "ceo" ? "Keegan" : message.senderType === "avery" ? "Avery" : "System";
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-3 text-sm text-zinc-200">
      <div className="text-xs uppercase tracking-[0.25em] text-zinc-500">
        {sender} · {formatDate(message.createdAt)}
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-100">{message.body}</p>
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
