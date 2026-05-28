"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { OpportunityStatus } from "@/lib/types/requests";
import type { Opportunity } from "@/lib/types/dashboard";
import {
  explainOpportunityTransition,
  getOpportunityPipelineStage
} from "@/lib/opportunity-approval-pipeline";
import { trackDashboardEvent } from "@/lib/dashboard-telemetry";
import { requestDashboardRefresh } from "@/lib/dashboard/events";
import { publishDashboardToast } from "@/lib/dashboard/toast";
import { extractResponseError } from "@/lib/dashboard/http";

type Props = {
  opportunity: Pick<Opportunity, "id" | "name" | "organization" | "ownerAgent" | "status" | "nextStep" | "supportingDocs">;
  variant?: "compact" | "full";
};

const REVIEW_STATUS: OpportunityStatus = "researching";
const APPROVE_STATUS: OpportunityStatus = "ready_for_outreach";
const IMPLEMENT_STATUS: OpportunityStatus = "outreach_drafted";
const DISMISS_STATUS: OpportunityStatus = "lost";

export function OpportunityInlineActions({ opportunity, variant = "full" }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"review" | "approve" | "implement" | "dismiss" | null>(null);
  const [isPending, startTransition] = useTransition();

  const disabled = isPending;
  const currentStatus = opportunity.status as OpportunityStatus;
  const stage = getOpportunityPipelineStage(currentStatus);

  const canReview = currentStatus === "identified";
  const canApprove = currentStatus === "researching";
  const canImplement = currentStatus === "ready_for_outreach";
  const canDismiss = !["won", "lost", "parked"].includes(currentStatus);

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
    setSuccess(null);
    if (!canReview) {
      const reason = explainOpportunityTransition(currentStatus, REVIEW_STATUS);
      setError(reason);
      void trackDashboardEvent({
        name: "opportunity.transition_blocked",
        properties: { opportunityId: opportunity.id, from: currentStatus, to: REVIEW_STATUS, reason }
      });
      return;
    }
    setPendingAction("review");
    startTransition(async () => {
      try {
        void trackDashboardEvent({
          name: "opportunity.review",
          properties: { opportunityId: opportunity.id, from: currentStatus, to: REVIEW_STATUS }
        });
        await updateStatus(opportunity.id, REVIEW_STATUS);
        router.refresh();
        requestDashboardRefresh({ reason: "opportunity-inline" });
        const message = "Opportunity reviewed";
        setSuccess(message);
        publishDashboardToast({ tone: "success", title: message, description: opportunity.name });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to review opportunity.");
        publishDashboardToast({ tone: "error", title: "Review failed", description: err instanceof Error ? err.message : String(err) });
      } finally {
        setPendingAction(null);
      }
    });
  }

  function handleApprove() {
    setError(null);
    setSuccess(null);
    if (!canApprove) {
      const reason = explainOpportunityTransition(currentStatus, APPROVE_STATUS);
      setError(reason);
      void trackDashboardEvent({
        name: "opportunity.transition_blocked",
        properties: { opportunityId: opportunity.id, from: currentStatus, to: APPROVE_STATUS, reason }
      });
      return;
    }
    setPendingAction("approve");
    startTransition(async () => {
      try {
        void trackDashboardEvent({
          name: "opportunity.approve",
          properties: { opportunityId: opportunity.id, from: currentStatus, to: APPROVE_STATUS }
        });
        await updateStatus(opportunity.id, APPROVE_STATUS);
        router.refresh();
        requestDashboardRefresh({ reason: "opportunity-inline" });
        const message = "Opportunity approved";
        setSuccess(message);
        publishDashboardToast({ tone: "success", title: message, description: opportunity.name });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to approve opportunity.");
        publishDashboardToast({ tone: "error", title: "Approval failed", description: err instanceof Error ? err.message : String(err) });
      } finally {
        setPendingAction(null);
      }
    });
  }

  function handleImplement() {
    setError(null);
    setSuccess(null);
    if (!canImplement) {
      const reason = explainOpportunityTransition(currentStatus, IMPLEMENT_STATUS);
      setError(reason);
      void trackDashboardEvent({
        name: "opportunity.transition_blocked",
        properties: { opportunityId: opportunity.id, from: currentStatus, to: IMPLEMENT_STATUS, reason }
      });
      return;
    }
    setPendingAction("implement");
    startTransition(async () => {
      try {
        void trackDashboardEvent({
          name: "opportunity.implement",
          properties: { opportunityId: opportunity.id, from: currentStatus, to: IMPLEMENT_STATUS }
        });
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
        requestDashboardRefresh({ reason: "opportunity-inline" });
        const message = "Implementation queued";
        setSuccess(message);
        publishDashboardToast({ tone: "success", title: message, description: opportunity.name });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to implement opportunity.");
        publishDashboardToast({ tone: "error", title: "Implementation failed", description: err instanceof Error ? err.message : String(err) });
      } finally {
        setPendingAction(null);
      }
    });
  }

  function handleDismiss() {
    if (!canDismiss) return;
    setError(null);
    setSuccess(null);
    setPendingAction("dismiss");
    startTransition(async () => {
      try {
        void trackDashboardEvent({
          name: "opportunity.dismiss",
          properties: { opportunityId: opportunity.id, from: currentStatus, to: DISMISS_STATUS }
        });
        await updateStatus(opportunity.id, DISMISS_STATUS);
        router.refresh();
        requestDashboardRefresh({ reason: "opportunity-inline" });
        const message = "Opportunity dismissed";
        setSuccess(message);
        publishDashboardToast({ tone: "warning", title: message, description: opportunity.name });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to dismiss opportunity.");
        publishDashboardToast({
          tone: "error",
          title: "Dismiss failed",
          description: err instanceof Error ? err.message : String(err)
        });
      } finally {
        setPendingAction(null);
      }
    });
  }

  const buttonBase =
    variant === "compact"
      ? "rounded-lg px-2.5 py-1.5 text-xs font-semibold"
      : "rounded-xl px-3 py-2 text-sm font-semibold";

  const reviewLabel = stage === "review" || stage === "approved" || stage === "implemented" || stage === "closed" ? "Reviewed" : "Review";
  const approveLabel = stage === "approved" || stage === "implemented" || stage === "closed" ? "Approved" : "Approve";
  const implementLabel = stage === "implemented" || stage === "closed" ? "Implemented" : "Implement";

  return (
    <div className="mt-4" data-opportunity-stage={stage}>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || !canReview}
          onClick={handleReview}
          className={`${buttonBase} border border-[var(--ui-border)] bg-white/[0.02] text-zinc-200 hover:bg-white/[0.04] disabled:opacity-40`}
        >
          {pendingAction === "review" ? "Reviewing…" : reviewLabel}
        </button>
        <button
          type="button"
          disabled={disabled || !canApprove}
          onClick={handleApprove}
          className={`${buttonBase} border border-[var(--ui-accent)]/40 bg-[color-mix(in_oklab,var(--ui-accent)_18%,transparent)] text-zinc-50 hover:bg-[color-mix(in_oklab,var(--ui-accent)_24%,transparent)] disabled:opacity-40`}
        >
          {pendingAction === "approve" ? "Approving…" : approveLabel}
        </button>
        <button
          type="button"
          disabled={disabled || !canImplement}
          onClick={handleImplement}
          className={`${buttonBase} border border-[var(--ui-accent-2)]/40 bg-[color-mix(in_oklab,var(--ui-accent-2)_18%,transparent)] text-zinc-50 hover:bg-[color-mix(in_oklab,var(--ui-accent-2)_24%,transparent)] disabled:opacity-40`}
        >
          {pendingAction === "implement" ? "Queuing…" : implementLabel}
        </button>
        <button
          type="button"
          disabled={disabled || !canDismiss}
          onClick={handleDismiss}
          className={`${buttonBase} border border-rose-400/40 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20 disabled:opacity-40`}
        >
          {pendingAction === "dismiss" ? "Dismissing…" : "Dismiss"}
        </button>
      </div>
      {error ? <div className="mt-2 text-xs text-rose-300">{error}</div> : null}
      {success ? <div className="mt-2 text-xs text-emerald-300">{success}</div> : null}
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
    throw new Error(await extractResponseError(response));
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
    throw new Error(await extractResponseError(response));
  }
}
