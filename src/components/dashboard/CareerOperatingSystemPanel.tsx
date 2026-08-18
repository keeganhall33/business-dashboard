"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type {
  CareerFeedbackState,
  CareerLane,
  CareerMove,
  CareerOperatingSystemSnapshot,
  CareerResult
} from "@/lib/career/career-operating-system";
import { requestDashboardRefresh } from "@/lib/dashboard/events";
import { publishDashboardToast } from "@/lib/dashboard/toast";

const LANE_COPY: Record<CareerLane, { label: string; purpose: string }> = {
  REVENUE: { label: "Revenue", purpose: "Protect and grow cash flow" },
  RELATIONSHIP: { label: "Relationships", purpose: "Move higher in the power network" },
  AUDIENCE: { label: "Audience", purpose: "Stay visible and compound attention" },
  CAREER: { label: "Career", purpose: "Increase access, prestige, and leverage" },
  OWNED_FUTURE: { label: "Owned Future", purpose: "Build what Keegan can own and scale" }
};

export function CareerOperatingSystemPanel() {
  const [snapshot, setSnapshot] = useState<CareerOperatingSystemSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/career/feedback", { cache: "no-store" });
        if (!response.ok) throw new Error(await responseError(response));
        const data = (await response.json()) as CareerOperatingSystemSnapshot;
        if (!cancelled) setSnapshot(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Career OS unavailable.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const phaseLabel = snapshot
    ? `Phase ${snapshot.currentPhase.number} of 6 · ${snapshot.currentPhase.title}`
    : "Loading current phase…";
  const waitingDue = useMemo(
    () => snapshot?.awaitingResults.filter((item) => item.followUpAt && new Date(item.followUpAt).getTime() <= Date.now()).length ?? 0,
    [snapshot]
  );

  function record(action: CareerMove, state: CareerFeedbackState, result?: CareerResult, keepWaitingDays?: number) {
    setError(null);
    const followUpAt = keepWaitingDays ? addDaysIso(new Date(), keepWaitingDays) : undefined;
    startTransition(async () => {
      try {
        const response = await fetch("/api/career/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actionId: action.id,
            state,
            result,
            note: notes[action.id]?.trim() || undefined,
            followUpAt
          })
        });
        if (!response.ok) throw new Error(await responseError(response));
        const data = (await response.json()) as CareerOperatingSystemSnapshot;
        setSnapshot(data);
        setNotes((current) => ({ ...current, [action.id]: "" }));
        requestDashboardRefresh({ reason: "career-os-feedback" });
        publishDashboardToast({ tone: "success", title: feedbackToast(state, result) });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not save feedback.";
        setError(message);
        publishDashboardToast({ tone: "error", title: "Career feedback failed", description: message });
      }
    });
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6">
      <section className="overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 shadow-2xl shadow-black/20">
        <div className="border-b border-white/10 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-amber-300">Career OS</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">What should Keegan do next?</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                The system moves one phase at a time, records what you actually did, tracks delayed outcomes, and feeds those outcomes back into future strategy runs.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-right">
              <div className="text-xs font-semibold text-zinc-100">{phaseLabel}</div>
              <div className="mt-1 text-xs text-zinc-500">
                {snapshot ? `${snapshot.phaseCompletionPercent}% gate completion` : "Calculating…"}
              </div>
            </div>
          </div>

          <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-amber-300 transition-[width] duration-500"
              style={{ width: `${snapshot?.phaseCompletionPercent ?? 0}%` }}
            />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-zinc-500">Primary bottleneck</div>
              <div className="mt-1 text-sm font-semibold text-zinc-100">
                {snapshot?.primaryBottleneck ?? (loading ? "Loading…" : "Unavailable")}
              </div>
            </div>
            <div className="flex min-w-44 items-center justify-between gap-5 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 md:block md:text-right">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-zinc-500">Waiting on results</div>
                <div className="mt-1 text-xl font-semibold text-white">{snapshot?.awaitingResults.length ?? 0}</div>
              </div>
              {waitingDue > 0 ? <div className="mt-1 text-xs font-semibold text-amber-300">{waitingDue} due for review</div> : null}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
            {(snapshot?.loop ?? ["Ingest", "Prioritize", "Execute", "Feedback", "Observe", "Recalculate"]).map((step, index, steps) => (
              <div key={step} className="flex items-center gap-1.5">
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">{step}</span>
                {index < steps.length - 1 ? <span>→</span> : null}
              </div>
            ))}
          </div>
        </div>

        {error ? (
          <div className="mx-5 mt-5 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 sm:mx-6">
            {error}
          </div>
        ) : null}

        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Today's moves</div>
              <h3 className="mt-1 text-lg font-semibold text-white">Move every important part of the career forward</h3>
            </div>
            <div className="text-xs text-zinc-500">
              {snapshot?.lastFeedbackAt ? `Last feedback ${formatRelative(snapshot.lastFeedbackAt)}` : "No feedback recorded yet"}
            </div>
          </div>

          {loading ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-sm text-zinc-400">Loading prioritized moves…</div>
          ) : snapshot?.todayMoves.length ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {snapshot.todayMoves.map((move) => (
                <MoveCard
                  key={move.id}
                  move={move}
                  note={notes[move.id] ?? ""}
                  disabled={isPending}
                  onNote={(value) => setNotes((current) => ({ ...current, [move.id]: value }))}
                  onRecord={(state, result) => record(move, state, result)}
                />
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 text-sm text-emerald-100">
              All executable moves in this phase are complete. Resolve the outstanding result checks below before the system advances the phase.
            </div>
          )}

          {snapshot?.awaitingResults.length ? (
            <div className="mt-7 border-t border-white/10 pt-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Awaiting results</div>
                  <h3 className="mt-1 text-lg font-semibold text-white">Close the loop when reality answers</h3>
                </div>
                <p className="max-w-xl text-xs leading-relaxed text-zinc-500">
                  These actions are already executed. They do not disappear just because the outcome takes days or weeks.
                </p>
              </div>
              <div className="mt-4 space-y-3">
                {snapshot.awaitingResults.map((move) => (
                  <AwaitingResultRow
                    key={move.id}
                    move={move}
                    note={notes[move.id] ?? ""}
                    disabled={isPending}
                    onNote={(value) => setNotes((current) => ({ ...current, [move.id]: value }))}
                    onResult={(result) => record(move, "DONE_RESULT", result)}
                    onStillWaiting={() => record(move, "DONE_WAITING", "UNKNOWN", move.reviewAfterDays || 7)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {snapshot ? (
            <details className="mt-7 rounded-2xl border border-white/10 bg-black/20">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-zinc-200">View all six phases and gates</summary>
              <div className="border-t border-white/10 p-4">
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {snapshot.phaseRoadmap.map((phase) => (
                    <div key={phase.id} className={`rounded-2xl border p-4 ${phaseTone(phase.state)}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">Phase {phase.number}</div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em]">{phase.state}</div>
                      </div>
                      <div className="mt-1 text-sm font-semibold text-zinc-100">{phase.title}</div>
                      <p className="mt-2 text-xs leading-relaxed text-zinc-500">{phase.objective}</p>
                      <div className="mt-3 text-xs text-zinc-400">Gates {phase.completed}/{phase.total} · {phase.percent}%</div>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          ) : null}

          <p className="mt-4 text-[11px] leading-relaxed text-zinc-600">
            Feedback is stored in outcome memory, which is part of the shared agent context. Future intelligence and strategy runs can therefore use what actually happened, not just what was planned.
          </p>
        </div>
      </section>
    </div>
  );
}

function MoveCard({
  move,
  note,
  disabled,
  onNote,
  onRecord
}: {
  move: CareerMove;
  note: string;
  disabled: boolean;
  onNote: (value: string) => void;
  onRecord: (state: CareerFeedbackState, result?: CareerResult) => void;
}) {
  const lane = LANE_COPY[move.lane];
  const needsAdjustment = move.status === "ADJUST";
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-amber-300">{lane.label}</div>
          <div className="mt-1 text-xs text-zinc-600">{lane.purpose}</div>
        </div>
        {needsAdjustment ? <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-300">Adjust</span> : null}
      </div>
      <h4 className="mt-3 text-base font-semibold text-zinc-50">{needsAdjustment ? `Adjust: ${move.title}` : move.title}</h4>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">{move.description}</p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-white/5 bg-black/20 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">Why now</div>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">{move.why}</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-black/20 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">Done when</div>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">{move.doneWhen}</p>
        </div>
      </div>

      {move.latestNote ? (
        <div className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs text-rose-200">
          Previous feedback: {move.latestNote}
        </div>
      ) : null}

      <input
        value={note}
        onChange={(event) => onNote(event.target.value)}
        placeholder="Optional: what happened, blocker, or useful context"
        className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-zinc-200 outline-none placeholder:text-zinc-700 focus:border-white/20"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        {move.feedbackMode === "DELAYED" ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onRecord("DONE_WAITING", "UNKNOWN")}
            className="rounded-xl border border-emerald-600/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-40"
          >
            Done · track result
          </button>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onRecord("DONE_RESULT", "NEUTRAL")}
            className="rounded-xl border border-emerald-600/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-40"
          >
            Done
          </button>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onRecord("DONE_RESULT", "POSITIVE")}
          className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/[0.06] disabled:opacity-40"
        >
          Worked
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onRecord("DONE_RESULT", "NEGATIVE")}
          className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/[0.06] disabled:opacity-40"
        >
          Didn't work
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onRecord("BLOCKED", "UNKNOWN")}
          className="rounded-xl border border-amber-600/30 bg-amber-500/5 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/10 disabled:opacity-40"
        >
          Blocked
        </button>
      </div>
    </article>
  );
}

function AwaitingResultRow({
  move,
  note,
  disabled,
  onNote,
  onResult,
  onStillWaiting
}: {
  move: CareerMove;
  note: string;
  disabled: boolean;
  onNote: (value: string) => void;
  onResult: (result: CareerResult) => void;
  onStillWaiting: () => void;
}) {
  const due = move.followUpAt ? new Date(move.followUpAt) : null;
  const overdue = due ? due.getTime() <= Date.now() : false;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.23em] text-zinc-600">{LANE_COPY[move.lane].label}</div>
          <div className="mt-1 text-sm font-semibold text-zinc-100">{move.title}</div>
        </div>
        <div className={`text-xs font-semibold ${overdue ? "text-amber-300" : "text-zinc-500"}`}>
          {due ? `${overdue ? "Review due" : "Check"} ${formatDate(due)}` : "Follow-up date unavailable"}
        </div>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
        <input
          value={note}
          onChange={(event) => onNote(event.target.value)}
          placeholder="What changed since you did it?"
          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-zinc-200 outline-none placeholder:text-zinc-700 focus:border-white/20"
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={disabled} onClick={() => onResult("POSITIVE")} className="rounded-xl border border-emerald-600/30 px-3 py-2 text-xs font-semibold text-emerald-200 disabled:opacity-40">Positive</button>
          <button type="button" disabled={disabled} onClick={() => onResult("NEUTRAL")} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-300 disabled:opacity-40">Neutral</button>
          <button type="button" disabled={disabled} onClick={() => onResult("NEGATIVE")} className="rounded-xl border border-rose-600/30 px-3 py-2 text-xs font-semibold text-rose-200 disabled:opacity-40">Negative</button>
          <button type="button" disabled={disabled} onClick={onStillWaiting} className="rounded-xl border border-amber-600/30 px-3 py-2 text-xs font-semibold text-amber-200 disabled:opacity-40">Still waiting</button>
        </div>
      </div>
    </div>
  );
}

function feedbackToast(state: CareerFeedbackState, result?: CareerResult) {
  if (state === "DONE_WAITING") return "Move logged · result follow-up scheduled";
  if (state === "BLOCKED") return "Blocker recorded · strategy can adjust";
  if (result === "NEGATIVE") return "Negative result recorded · move reopened";
  return "Career feedback recorded";
}

function phaseTone(state: "COMPLETE" | "CURRENT" | "FUTURE") {
  if (state === "COMPLETE") return "border-emerald-500/20 bg-emerald-500/5 text-emerald-300";
  if (state === "CURRENT") return "border-amber-500/30 bg-amber-500/5 text-amber-300";
  return "border-white/10 bg-white/[0.02] text-zinc-600";
}

function formatDate(date: Date) {
  if (Number.isNaN(date.getTime())) return "later";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatRelative(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "recently";
  const diffMinutes = Math.max(0, Math.round((Date.now() - time) / 60000));
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const hours = Math.round(diffMinutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function addDaysIso(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + Math.max(1, days));
  return next.toISOString();
}

async function responseError(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? `Request failed: ${response.status}`;
  } catch {
    return `Request failed: ${response.status}`;
  }
}
