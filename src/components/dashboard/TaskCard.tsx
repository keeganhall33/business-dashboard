"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TaskSummary } from "@/lib/types/dashboard";

type Props = { task: TaskSummary };

export function TaskCard({ task }: Props) {
  const router = useRouter();
  const [reason, setReason] = useState("Rejected from dashboard");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function approveTask() {
    setError(null);
    const res = await fetch(`/api/tasks/${task.id}/approve`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedBy: "user" })
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
    <div className="rounded-2xl border border-zinc-800 p-4">
      <div className="text-sm font-medium text-zinc-50">{task.title}</div>
      <div className="mt-1 text-xs uppercase tracking-[0.14em] text-zinc-500">
        {task.agentKey} • {task.priority} • {task.status}
      </div>

      {task.expectedImpact && <div className="mt-3 text-sm text-zinc-300">{task.expectedImpact}</div>}

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

