"use client";

import { useCallback, useEffect, useState } from "react";

type Proposal = {
  id: string;
  object_type: "campaign" | "adset";
  object_id: string;
  before_state: Record<string, unknown>;
  proposed_state: Record<string, unknown>;
  rationale: string;
  supporting_metrics: Record<string, unknown>;
  confidence: string;
  risk_tier: string;
  approval_state: string;
  execution_state: string;
  meta_response?: unknown;
};

export function MetaReviewQueueV1() {
  const [items, setItems] = useState<Proposal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/meta-control-plane", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message ?? "Unable to load proposals");
    setItems(payload.proposals ?? []);
  }, []);

  useEffect(() => {
    refresh().catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [refresh]);

  async function decide(item: Proposal, action: "approve" | "reject" | "execute" | "rollback") {
    setBusy(`${item.id}:${action}`);
    setError(null);
    try {
      const response = await fetch("/api/meta-control-plane", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          id: item.id,
          actor: "dashboard-reviewer",
          reason: action === "reject" ? "Rejected in dashboard review" : undefined,
          dryRun: action === "execute" || action === "rollback"
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "Review action failed");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="meta-review-title" className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 text-zinc-100">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-blue-400">Meta Ads · review mode</p>
          <h2 id="meta-review-title" className="mt-1 text-xl font-semibold">Pending changes</h2>
          <p className="mt-1 text-sm text-zinc-400">Autopilot is disabled. Execute and rollback buttons below are dry runs.</p>
        </div>
        <button className="rounded-lg border border-zinc-700 px-3 py-2 text-sm" onClick={() => refresh().catch(() => undefined)}>Refresh</button>
      </div>
      {error ? <p role="alert" className="mt-4 rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-200">{error}</p> : null}
      <div className="mt-5 space-y-4">
        {items.length === 0 ? <p className="text-sm text-zinc-400">No proposals awaiting review.</p> : null}
        {items.map((item) => (
          <article key={item.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">{item.object_type} · {item.object_id}</p>
                <p className="text-xs text-zinc-400">{item.confidence} confidence · {item.risk_tier} risk · {item.approval_state} / {item.execution_state}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button disabled={!!busy || item.approval_state !== "PENDING"} onClick={() => decide(item, "approve")} className="rounded-lg bg-blue-600 px-3 py-2 text-sm disabled:opacity-40">Approve</button>
                <button disabled={!!busy || item.approval_state !== "PENDING"} onClick={() => decide(item, "reject")} className="rounded-lg border border-zinc-600 px-3 py-2 text-sm disabled:opacity-40">Reject</button>
                <button disabled={!!busy || item.approval_state !== "APPROVED"} onClick={() => decide(item, "execute")} className="rounded-lg border border-blue-500 px-3 py-2 text-sm disabled:opacity-40">Dry run</button>
                <button disabled={!!busy || item.execution_state !== "SUCCEEDED"} onClick={() => decide(item, "rollback")} className="rounded-lg border border-amber-700 px-3 py-2 text-sm disabled:opacity-40">Rollback dry run</button>
              </div>
            </div>
            <p className="mt-3 text-sm text-zinc-300">{item.rationale}</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <pre className="overflow-auto rounded-lg bg-black/40 p-3 text-xs text-zinc-300">Before{`\n`}{JSON.stringify(item.before_state, null, 2)}</pre>
              <pre className="overflow-auto rounded-lg bg-black/40 p-3 text-xs text-blue-200">Proposed{`\n`}{JSON.stringify(item.proposed_state, null, 2)}</pre>
            </div>
            <details className="mt-3 text-xs text-zinc-400"><summary>Evidence and execution result</summary><pre className="mt-2 overflow-auto">{JSON.stringify({ evidence: item.supporting_metrics, result: item.meta_response ?? null }, null, 2)}</pre></details>
          </article>
        ))}
      </div>
    </section>
  );
}
