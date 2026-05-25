"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { QuickActionItem } from "@/lib/action-queue";
import { requestDashboardRefresh } from "@/lib/dashboard/events";
import { publishDashboardToast } from "@/lib/dashboard/toast";
import { ensureOk, extractResponseError } from "@/lib/dashboard/http";
import { formatRelativeTimeFromNow } from "@/lib/date";

type Props = {
  items: QuickActionItem[];
};

export function ActionQueueQuickActions({ items }: Props) {
  return (
    <div className="rounded-2xl border border-amber-900/30 bg-amber-950/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-amber-300">Quick actions</div>
          <div className="text-lg font-semibold text-zinc-50">Approve tasks and plans without scrolling</div>
        </div>
        <div className="text-xs text-zinc-400">Oldest first · auto-refresh after every decision</div>
      </div>

      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-sm text-zinc-400">
            All clear. Pending approvals will pop up here automatically.
          </div>
        ) : (
          items.map((item) => <QuickActionRow key={`${item.actionType}-${item.id}`} item={item} />)
        )}
      </div>
    </div>
  );
}

type RowProps = {
  item: QuickActionItem;
};

function QuickActionRow({ item }: RowProps) {
  const router = useRouter();
  const isTask = item.actionType === "task";
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"approve" | "reject" | "changes" | null>(null);
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState<string | null>(null);
  const disabled = isPending;

  const relativeTime = formatRelativeTimeFromNow(item.createdAt);

  function handleDecision(decision: "approve" | "reject" | "changes") {
    const needsFeedback = decision !== "approve";
    if (needsFeedback && feedback.trim().length === 0) {
      setError("Add a quick reason before sending.");
      return;
    }

    setError(null);
    setSuccess(null);
    setPendingAction(decision);

    startTransition(async () => {
      try {
        if (isTask) {
          if (decision === "approve") {
            await approveTask(item.id);
          } else {
            await rejectTask(item.id, feedback.trim());
          }
        } else {
          await decidePlan(item.id, decision === "approve" ? "approve" : "changes_requested", feedback.trim());
        }
        router.refresh();
        requestDashboardRefresh({ reason: "action-queue" });
        const message = isTask
          ? decision === "approve"
            ? "Task approved"
            : "Task updated"
          : decision === "approve"
            ? "Plan approved"
            : "Plan feedback sent";
        setSuccess(message);
        publishDashboardToast({ tone: "success", title: message });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to process action.";
        setError(message);
        publishDashboardToast({ tone: "error", title: "Action failed", description: message });
      } finally {
        setPendingAction(null);
      }
    });
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4 shadow-inner">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">
            {isTask ? "Task approval" : "Plan approval"}
          </div>
          <div className="text-sm font-semibold text-zinc-100">{item.title}</div>
          {item.summary ? <div className="mt-1 text-sm text-zinc-400">{item.summary}</div> : null}
        </div>
        <div className="text-right text-xs text-zinc-500">
          {item.actor && <div className="font-semibold text-zinc-200">{item.actor}</div>}
          <div>{relativeTime ?? "unknown"}</div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => handleDecision("approve")}
            className="flex-1 rounded-xl border border-emerald-700 bg-emerald-900/20 px-3 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-900/30 disabled:opacity-50"
          >
            {pendingAction === "approve" ? "Approving…" : isTask ? "Approve" : "Approve plan"}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => handleDecision(isTask ? "reject" : "changes")}
            className="flex-1 rounded-xl border border-amber-700 bg-amber-900/20 px-3 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-900/30 disabled:opacity-50"
          >
            {pendingAction && pendingAction !== "approve" ? "Sending…" : isTask ? "Reject" : "Request changes"}
          </button>
        </div>
        <input
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          placeholder={isTask ? "Reason for rejection" : "Feedback or change request"}
          className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
        />
        {!feedback.trim() && <p className="text-xs text-zinc-500">Required for rejections/changes. Optional when approving.</p>}
        {error ? <p className="text-xs text-rose-300">{error}</p> : null}
        {success ? <p className="text-xs text-emerald-300">{success}</p> : null}
      </div>
    </div>
  );
}

async function approveTask(id: string) {
  const response = await fetch(`/api/tasks/${id}/approve`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approvedByUser: true })
  });
  await ensureOk(response);
}

async function rejectTask(id: string, reason: string) {
  const response = await fetch(`/api/tasks/${id}/reject`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rejectedBy: "user", reason })
  });
  if (!response.ok) {
    throw new Error(await extractResponseError(response));
  }
}

async function decidePlan(id: string, decision: "approve" | "changes_requested", feedback?: string) {
  const response = await fetch(`/api/agents/plans/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision, feedback: feedback || undefined, approvedBy: "keegan" })
  });
  if (!response.ok) {
    throw new Error(await extractResponseError(response));
  }
}
