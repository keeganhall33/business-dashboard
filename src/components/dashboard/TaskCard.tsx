"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TaskSummary } from "@/lib/types/dashboard";
import { DeliverableAttachmentList } from "./DeliverableAttachmentList";
import { ProgressBar } from "./ui/ProgressBar";
import { StatusChip } from "./ui/StatusChip";

type Props = { task: TaskSummary };

export function TaskCard({ task }: Props) {
  const router = useRouter();
  const [reason, setReason] = useState("Rejected from dashboard");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [openDetails, setOpenDetails] = useState(false);
  const [openDeliverables, setOpenDeliverables] = useState(Boolean(task.deliverableSummary));

  const pct = estimateProgress(task.status);
  const tone = statusToTone(task.status);

  async function approveTask() {
    setError(null);
    const res = await fetch(`/api/tasks/${task.id}/approve`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedByUser: true })
    });
    if (!res.ok) throw new Error(`Approve failed (${res.status})`);
  }

  async function rejectTask() {
    setError(null);
    const res = await fetch(`/api/tasks/${task.id}/reject`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rejectedBy: "user", reason })
    });
    if (!res.ok) throw new Error(`Reject failed (${res.status})`);
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-zinc-50">{task.title}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusChip label={task.agentKey} />
            <StatusChip label={String(task.priority)} tone={task.priority === "critical" ? "rose" : task.priority === "high" ? "amber" : "zinc"} />
            <StatusChip label={String(task.status).replace(/_/g, " ")} tone={tone} />
            {typeof task.expectedDurationDays === "number" ? (
              <StatusChip label={`ETA ${task.expectedDurationDays}d`} />
            ) : null}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-semibold text-zinc-100">{Math.round(pct)}%</div>
          <div className="mt-1 w-28">
            <ProgressBar value={pct} tone={tone} />
          </div>
        </div>
      </div>

      {task.expectedImpact ? <div className="mt-3 text-sm text-zinc-300">{task.expectedImpact}</div> : null}

      {(task.description || task.whyThisMatters || task.relatedMetricKeys?.length) && (
        <div className="mt-4 rounded-2xl border border-zinc-900 bg-zinc-950/70">
          <button
            type="button"
            onClick={() => setOpenDetails((v) => !v)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
          >
            <div className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">Details</div>
            <div className="text-xs text-zinc-500">{openDetails ? "Hide" : "Show"}</div>
          </button>
          {openDetails ? (
            <div className="space-y-3 border-t border-zinc-900 px-4 py-3">
              {task.description ? (
                <div>
                  <div className="text-[11px] uppercase tracking-[0.25em] text-zinc-600">Description</div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-200">{task.description}</p>
                </div>
              ) : null}
              {task.whyThisMatters ? (
                <div>
                  <div className="text-[11px] uppercase tracking-[0.25em] text-zinc-600">Why this matters</div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-200">{task.whyThisMatters}</p>
                </div>
              ) : null}
              {task.relatedMetricKeys && task.relatedMetricKeys.length > 0 ? (
                <div>
                  <div className="text-[11px] uppercase tracking-[0.25em] text-zinc-600">Related metrics</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {task.relatedMetricKeys.slice(0, 6).map((key) => (
                      <StatusChip key={`${task.id}-metric-${key}`} label={key} />
                    ))}
                    {task.relatedMetricKeys.length > 6 ? <StatusChip label={`+${task.relatedMetricKeys.length - 6}`} /> : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-zinc-900 bg-zinc-950/70">
        <button
          type="button"
          onClick={() => setOpenDeliverables((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <div className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">Deliverables</div>
          <div className="text-xs text-zinc-500">{openDeliverables ? "Hide" : "Show"}</div>
        </button>
        {openDeliverables ? (
          <div className="border-t border-zinc-900 px-4 py-3">
            {task.deliverableSummary ? (
              <p className="whitespace-pre-wrap text-sm text-zinc-100">{task.deliverableSummary}</p>
            ) : (
              <p className="text-sm text-zinc-400">
                Agents log proof themselves. Once this task ships, you’ll see their summary and links here automatically.
              </p>
            )}
            <DeliverableAttachmentList attachments={task.deliverableLinks} variant="previews" />
          </div>
        ) : null}
      </div>

      {error && <div className="mt-3 text-xs text-red-300">{error}</div>}

      {task.requiresApproval && task.status !== "approved" && task.status !== "completed" && (
        <div className="mt-4 space-y-2">
          <div className="flex gap-2">
            <button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  try {
                    await approveTask();
                    router.refresh();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  }
                })
              }
              className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-900 disabled:opacity-50"
            >
              Approve
            </button>
            <button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  try {
                    await rejectTask();
                    router.refresh();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  }
                })
              }
              className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-900 disabled:opacity-50"
            >
              Reject
            </button>
          </div>

          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Rejection reason"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
          />
        </div>
      )}
    </div>
  );
}

function estimateProgress(status: string) {
  const normalized = status.toLowerCase();
  if (["completed", "done", "shipped"].includes(normalized)) return 100;
  if (["in_progress", "in progress", "running"].includes(normalized)) return 55;
  if (["approved"].includes(normalized)) return 30;
  if (["pending"].includes(normalized)) return 10;
  if (["rejected"].includes(normalized)) return 0;
  return 20;
}

function statusToTone(status: string) {
  const normalized = status.toLowerCase();
  if (["completed"].includes(normalized)) return "emerald" as const;
  if (["rejected"].includes(normalized)) return "rose" as const;
  if (["in_progress", "approved"].includes(normalized)) return "sky" as const;
  return "amber" as const;
}
