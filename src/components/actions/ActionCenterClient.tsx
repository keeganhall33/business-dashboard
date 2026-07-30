"use client";

import { useMemo, useState } from "react";
import type { Recommendation } from "@/lib/intelligence/recommendation-contract";
import type { DurableAction } from "@/lib/actions/action-contract";
import { VerticalSliceCard, Pill } from "@/components/vertical-slice/VerticalSliceCard";

type Props = {
  window: { startDate: string; endDate: string };
  recommendations: Recommendation[];
  actions: DurableAction[];
};

async function postJson(url: string, body: unknown, idempotencyKey?: string) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(idempotencyKey ? { "x-idempotency-key": idempotencyKey } : {})
    },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json;
}

export function ActionCenterClient({ window, recommendations, actions }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const topRecs = useMemo(() => recommendations.slice(0, 5), [recommendations]);

  const grouped = useMemo(() => {
    const needsApproval = actions.filter((a) => a.status === "awaiting_approval");
    const drafts = actions.filter((a) => a.status === "draft_prepared");
    const recommended = actions.filter((a) => a.status === "recommended");
    const waiting = actions.filter((a) => a.status === "snoozed" || a.status === "needs_revalidation" || a.status === "execution_blocked");
    const approved = actions.filter((a) => a.status === "approved");
    const completed = actions.filter((a) => a.status === "successful" || a.status === "unsuccessful" || a.status === "inconclusive");
    return { needsApproval, drafts, recommended, waiting, approved, completed };
  }, [actions]);

  async function transition(actionId: string, kind: "prepare" | "ready" | "approve" | "reject" | "snooze") {
    setError(null);
    setBusyId(actionId);
    try {
      const key = `${kind}-${actionId}-${Date.now()}`;
      if (kind === "approve") {
        await postJson(`/api/actions/${actionId}/approve`, { actor: "ceo", confirm: true }, key);
        alert("Approved for future execution. No external action has been performed.");
      } else if (kind === "prepare") {
        await postJson(
          `/api/actions/${actionId}/prepare`,
          {
            actor: "ceo",
            prepared_assets: [{ type: "draft", title: "Draft prepared", body: "Prepared in UI" }],
            execution_plan: { preview: "Internal-only preview. No external execution in Milestone 11.", steps: [{ type: "manual", note: "(Disabled) execute outside system" }] }
          },
          key
        );
      } else if (kind === "ready") {
        await postJson(`/api/actions/${actionId}/ready`, { actor: "ceo", measurement_window: window }, key);
      } else if (kind === "reject") {
        const reason = prompt("Rejection reason?");
        if (!reason) return;
        await postJson(`/api/actions/${actionId}/reject`, { actor: "ceo", reason }, key);
      } else if (kind === "snooze") {
        const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        await postJson(`/api/actions/${actionId}/snooze`, { actor: "ceo", snoozed_until: until }, key);
      }
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function createAction(rec: Recommendation) {
    setError(null);
    setBusyId(rec.id);
    try {
      await postJson(
        "/api/actions",
        {
          actor: "ceo",
          window,
          recommendation: rec,
          evidence_snapshot: {
            window,
            recommendation_id: rec.id,
            score: rec.priority_score,
            confidence: rec.confidence,
            data_missing: rec.data_missing,
            limitations: rec.limitations
          }
        },
        `create-${rec.id}-${window.startDate}-${window.endDate}`
      );
      // Reload hard; simplest for now.
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <VerticalSliceCard
        title="Action Center"
        subtitle="Durable governed actions. This milestone persists and manages L0–L3, and can mark L4 approved internally only. No external execution."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="emerald">External side effects: 0</Pill>
          <Pill tone="amber">Approving only changes internal status</Pill>
          <Pill tone="zinc">Writes gated by ACTIONS_ENABLE_WRITES (non-production only)</Pill>
        </div>
        {error ? <div className="mt-3 text-sm text-rose-200">{error}</div> : null}
      </VerticalSliceCard>

      <VerticalSliceCard title="Recommended next → create durable action" subtitle="Creates an internal action record with immutable evidence snapshot.">
        <div className="space-y-2">
          {topRecs.length ? (
            topRecs.map((rec) => (
              <div key={rec.id} className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">{rec.title}</div>
                  <div className="text-xs text-zinc-400">{rec.category} • {rec.approval_level} • score {rec.priority_score.overallScore}</div>
                </div>
                <button
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50"
                  disabled={busyId === rec.id}
                  onClick={() => createAction(rec)}
                >
                  {busyId === rec.id ? "Creating…" : "Create action"}
                </button>
              </div>
            ))
          ) : (
            <div className="text-sm text-zinc-500">No recommendations available for this window.</div>
          )}
        </div>
      </VerticalSliceCard>

      <VerticalSliceCard title="Current actions" subtitle="Grouped and governed by level/status.">
        {actions.length ? (
          <div className="space-y-6">
            <Section title="Needs your approval" items={grouped.needsApproval} on={transition} busyId={busyId} />
            <Section title="Drafts being prepared" items={grouped.drafts} on={transition} busyId={busyId} />
            <Section title="Recommended next" items={grouped.recommended} on={transition} busyId={busyId} />
            <Section title="Waiting" items={grouped.waiting} on={transition} busyId={busyId} />
            <Section title="Approved (not executed)" items={grouped.approved} on={transition} busyId={busyId} />
            <Section title="Completed + learned (synthetic only)" items={grouped.completed} on={transition} busyId={busyId} />
          </div>
        ) : (
          <div className="text-sm text-zinc-500">No actions yet.</div>
        )}
      </VerticalSliceCard>
    </div>
  );
}

function Section(props: {
  title: string;
  items: DurableAction[];
  busyId: string | null;
  on: (actionId: string, kind: "prepare" | "ready" | "approve" | "reject" | "snooze") => void;
}) {
  const { title, items, busyId, on } = props;
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-white/90">{title}</div>
      {items.length ? (
        items.slice(0, 20).map((a) => (
          <div key={a.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">{a.title}</div>
                <div className="mt-1 text-xs text-zinc-500">
                  {a.category} • {a.channel} • confidence {a.confidence} • approval {a.approval_level} • level {a.current_level}
                </div>
                {a.evidence_snapshot_hash ? <div className="mt-2 text-[11px] text-zinc-500">Evidence hash: {a.evidence_snapshot_hash.slice(0, 12)}…</div> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={a.status === "awaiting_approval" ? "amber" : a.status === "approved" ? "rose" : "zinc"}>{a.status}</Pill>
                {a.status === "recommended" ? (
                  <button className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50" disabled={busyId === a.id} onClick={() => on(a.id, "prepare")}>
                    Prepare
                  </button>
                ) : null}
                {a.status === "draft_prepared" ? (
                  <button className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50" disabled={busyId === a.id} onClick={() => on(a.id, "ready")}>
                    Ready
                  </button>
                ) : null}
                {a.status === "awaiting_approval" ? (
                  <>
                    <button className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50" disabled={busyId === a.id} onClick={() => on(a.id, "approve")}>
                      Approve
                    </button>
                    <button className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50" disabled={busyId === a.id} onClick={() => on(a.id, "reject")}>
                      Reject
                    </button>
                    <button className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50" disabled={busyId === a.id} onClick={() => on(a.id, "snooze")}>
                      Snooze
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        ))
      ) : (
        <div className="text-sm text-zinc-500">None.</div>
      )}
    </div>
  );
}
