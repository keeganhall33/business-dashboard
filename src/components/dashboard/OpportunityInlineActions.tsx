"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { OpportunityStatus } from "@/lib/types/requests";
import type { Opportunity } from "@/lib/types/dashboard";

type Props = {
  opportunity: Pick<Opportunity, "id" | "name" | "organization" | "ownerAgent" | "status" | "nextStep" | "supportingDocs">;
  variant?: "compact" | "full";
};

const REVIEW_STATUS: OpportunityStatus = "researching";
const APPROVE_STATUS: OpportunityStatus = "ready_for_outreach";
const IMPLEMENT_STATUS: OpportunityStatus = "outreach_drafted";

export function OpportunityInlineActions({ opportunity, variant = "full" }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"review" | "approve" | "implement" | null>(null);
  const [isPending, startTransition] = useTransition();

  const disabled = isPending;

  const taskDescription = useMemo(() => {
    const lines: string[] = [];
    if (opportunity.organization) lines.push(`Org: ${opportunity.organization}`);
    if (opportunity.nextStep) lines.push(`Next step: ${opportunity.nextStep}`);
    if (opportunity.supportingDocs?.length) {
      lines.push("\nDocs:");
      for (const doc of opportunity.supportingDocs.slice(0, 3)) {
        lines.push(`- ${doc.label}: ${doc.url}`);
      }
    }
    lines.push(`\nOpportunity ID: ${opportunity.id}`);
    return lines.join("\n");
  }, [opportunity.id, opportunity.nextStep, opportunity.organization, opportunity.supportingDocs]);

  function handleReview() {
    setError(null);
    setPendingAction("review");
    startTransition(async () => {
      try {
        await updateStatus(opportunity.id, REVIEW_STATUS);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to review opportunity.");
      } finally {
        setPendingAction(null);
      }
    });
  }

  function handleApprove() {
    setError(null);
    setPendingAction("approve");
    startTransition(async () => {
      try {
        await updateStatus(opportunity.id, APPROVE_STATUS);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to approve opportunity.");
      } finally {
        setPendingAction(null);
      }
    });
  }

  function handleImplement() {
    setError(null);
    setPendingAction("implement");
    startTransition(async () => {
      try {
        await updateStatus(opportunity.id, IMPLEMENT_STATUS);
        await createTask({
          title: `Draft outreach: ${opportunity.name}`,
          description: taskDescription,
          agentKey: (opportunity.ownerAgent as "avery" | "sloan" | "lyra" | "noah") ?? "avery",
          priority: "high",
          executionType: "outreach_prep",
          requiresApproval: false
        });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to implement opportunity.");
      } finally {
        setPendingAction(null);
      }
    });
  }

  const buttonBase =
    variant === "compact"
      ? "rounded-lg px-2.5 py-1.5 text-xs font-semibold"
      : "rounded-xl px-3 py-2 text-sm font-semibold";

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={handleReview}
          className={`${buttonBase} border border-zinc-700 bg-zinc-950/50 text-zinc-200 hover:bg-zinc-900/30 disabled:opacity-50`}
        >
          {pendingAction === "review" ? "Reviewing…" : "Review"}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={handleApprove}
          className={`${buttonBase} border border-emerald-700 bg-emerald-900/15 text-emerald-200 hover:bg-emerald-900/25 disabled:opacity-50`}
        >
          {pendingAction === "approve" ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={handleImplement}
          className={`${buttonBase} border border-amber-700 bg-amber-900/15 text-amber-200 hover:bg-amber-900/25 disabled:opacity-50`}
        >
          {pendingAction === "implement" ? "Queuing…" : "Implement"}
        </button>
      </div>
      {error ? <div className="mt-2 text-xs text-rose-300">{error}</div> : null}
      <div className="mt-2 text-[11px] uppercase tracking-[0.22em] text-zinc-600">
        Status now: <span className="text-zinc-300">{opportunity.status}</span>
      </div>
    </div>
  );
}

async function updateStatus(id: string, status: OpportunityStatus) {
  const response = await fetch(`/api/opportunities/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status })
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Failed to update status (${response.status}).`);
  }
}

async function createTask(payload: {
  title: string;
  description: string;
  agentKey: "avery" | "sloan" | "lyra" | "noah";
  priority: "critical" | "high" | "medium" | "low";
  executionType: "analysis" | "content" | "outreach_prep" | "pricing" | "research" | "design" | "data" | "strategy";
  requiresApproval: boolean;
}) {
  const response = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Failed to create task (${response.status}).`);
  }
}

