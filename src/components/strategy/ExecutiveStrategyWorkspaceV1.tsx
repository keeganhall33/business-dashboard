import Link from "next/link";
import { AutonomousGrowthBriefingV1 } from "@/components/executive-home/AutonomousGrowthBriefingV1";
import type { AutonomousGrowthBriefingV1 as AutonomousGrowthBriefingModelV1 } from "@/lib/executive-home/autonomous-growth-briefing-v1";
import type { ExecutiveStrategyWorkspaceModelV1, StrategyWorkspaceRecordV1 } from "@/lib/strategy/executive-strategy-v1";

function badgeClass(state: StrategyWorkspaceRecordV1["epistemicState"]) {
  if (state === "KNOWN") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (state === "CONFLICTED") return "border-rose-200 bg-rose-50 text-rose-800";
  if (state === "STALE") return "border-amber-200 bg-amber-50 text-amber-800";
  if (state === "INFERRED") return "border-blue-200 bg-blue-50 text-blue-800";
  return "border-slate-300 bg-slate-100 text-slate-700";
}

function laneClass(lane: StrategyWorkspaceRecordV1["lane"]) {
  if (lane === "DO_NOW") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (lane === "PREPARE") return "border-blue-200 bg-blue-50 text-blue-800";
  if (lane === "MONITOR") return "border-violet-200 bg-violet-50 text-violet-800";
  if (lane === "DEPRIORITIZE") return "border-slate-300 bg-slate-100 text-slate-600";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function money(cents: number | null) {
  if (cents == null) return "Unknown";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function laneLabel(lane: StrategyWorkspaceRecordV1["lane"]) {
  if (lane === "DO_NOW") return "Ready now";
  if (lane === "PREPARE") return "Prepare next";
  if (lane === "MONITOR") return "Keep watching";
  if (lane === "DEPRIORITIZE") return "Lower priority";
  return "Needs more evidence";
}

function truthLabel(state: StrategyWorkspaceRecordV1["epistemicState"]) {
  if (state === "KNOWN") return "Evidence verified";
  if (state === "CONFLICTED") return "Evidence conflicts";
  if (state === "STALE") return "Needs fresh data";
  if (state === "INFERRED") return "Reasoned estimate";
  return "Not yet verified";
}

function confidenceLabel(confidence: StrategyWorkspaceRecordV1["confidence"]) {
  if (confidence === "strongly_supported") return "Strong evidence";
  if (confidence === "likely") return "Good evidence";
  if (confidence === "possible") return "Early signal";
  if (confidence === "insufficient_evidence") return "Not enough evidence";
  return "Not assessed";
}

function approvalLabel(level: StrategyWorkspaceRecordV1["approvalLevel"]) {
  if (level === "L4_APPROVED_FOR_EXECUTION") return "Approved to execute";
  if (level === "L3_APPROVED_FOR_ACTION") return "Approved for action";
  if (level === "L2_DRAFT_PREPARED") return "Draft prepared";
  if (level === "L1_RECOMMENDATION") return "Idea for review";
  return "No approval needed yet";
}

function plainTitle(item: StrategyWorkspaceRecordV1) {
  const title = item.title.toLowerCase();
  if (title.includes("traffic-driven change")) return "Figure out what changed your website traffic";
  if (title.includes("email telemetry missing")) return "Connect email campaign performance";
  if (title.includes("matchback")) return "Connect ad spend to actual orders";
  return item.title;
}

function plainAction(action: string) {
  return action
    .replace(/Do not scale spend yet\./gi, "Do not increase ad spend yet.")
    .replace(/Identify which channel\(s\) changed traffic and validate attribution coverage\.?/gi, "First identify which marketing channels caused the traffic change and confirm we can reliably connect those visits to sales.")
    .replace(/Identify which channel\(s\) increased\/decreased traffic; avoid scaling without attribution/gi, "Identify which marketing channels changed traffic before increasing ad spend.");
}

function plainBlocker(blocker: string | null) {
  if (!blocker) return null;
  if (/Evidence truth remains UNKNOWN/i.test(blocker)) return "We do not yet have enough verified data to act confidently.";
  if (/freshness remains UNKNOWN/i.test(blocker)) return "We cannot confirm that the supporting data is current yet.";
  if (/freshness requires review/i.test(blocker)) return "The supporting data needs to be refreshed before acting.";
  if (/conflicted evidence/i.test(blocker)) return "The available data points disagree, so this needs review before acting.";
  return blocker;
}

function Economics({ item }: { item: StrategyWorkspaceRecordV1 }) {
  if (!item.economics) return <span className="text-slate-500">Financial impact: Not estimated yet</span>;
  const { lowCents, expectedCents, highCents, horizon } = item.economics;
  if (item.confidence === "possible" || item.confidence === "insufficient_evidence") {
    return <span className="text-slate-500">Financial impact: Too uncertain to rely on yet</span>;
  }
  return (
    <span className="text-slate-500">
      Estimated upside: {money(lowCents)} to {money(highCents)} over {horizon}
      {expectedCents != null ? ` (midpoint ${money(expectedCents)})` : ""}
    </span>
  );
}

function PriorityCard({ item, compact = false }: { item: StrategyWorkspaceRecordV1; compact?: boolean }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${laneClass(item.lane)}`}>{laneLabel(item.lane)}</span>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badgeClass(item.epistemicState)}`}>{truthLabel(item.epistemicState)}</span>
          </div>
          <h3 className="mt-3 text-base font-semibold text-slate-950">{plainTitle(item)}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-700">{plainAction(item.recommendedAction)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2 text-right">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Priority</div>
          <div className="text-lg font-semibold text-slate-950">{item.priorityScore ?? "Unknown"}</div>
        </div>
      </div>

      {!compact ? (
        <>
          <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
            <span className="text-slate-500">Evidence strength: <strong className="text-slate-800">{confidenceLabel(item.confidence)}</strong></span>
            <span className="text-slate-500">Timing: <strong className="text-slate-800">{item.urgency === "high" ? "Act soon" : item.urgency === "medium" ? "Important, not immediate" : item.urgency === "low" ? "Can wait" : "Not assessed"}</strong></span>
            <span className="text-slate-500">Status: <strong className="text-slate-800">{approvalLabel(item.approvalLevel)}</strong></span>
            <Economics item={item} />
          </div>
          {plainBlocker(item.blocker) ? <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900"><strong>Why we cannot act yet:</strong> {plainBlocker(item.blocker)}</p> : null}
          {item.dataMissing.length ? <p className="mt-2 text-xs text-slate-600"><strong>Still needed:</strong> {item.dataMissing.join(", ")}</p> : null}
          {item.dependencies.length ? <p className="mt-2 text-xs text-slate-600"><strong>Depends on:</strong> {item.dependencies.join(", ")}</p> : null}
        </>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
        <Link href={item.reviewHref} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-slate-800 hover:bg-slate-50">Review details</Link>
        <Link href={item.evidenceHref} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-slate-800 hover:bg-slate-50">See why</Link>
      </div>
    </article>
  );
}

function EmptyState({ children }: { children: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-5 text-sm text-slate-600">{children}</div>;
}

export function ExecutiveStrategyWorkspaceV1({
  model,
  chiefOfStaffBriefing,
}: {
  model: ExecutiveStrategyWorkspaceModelV1;
  chiefOfStaffBriefing?: AutonomousGrowthBriefingModelV1 | null;
}) {
  return (
    <main className="min-h-screen bg-[#f4f7fb] py-6 text-slate-950">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-[2rem] border border-slate-200 bg-[#ffffff] p-6 shadow-sm md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Strategy workspace</p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">What matters, what is blocked, and what is safe next</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">A simple view of what deserves attention, what you can do next, and what still needs better data. Technical evidence stays available underneath when you want to inspect it.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Data status</div>
              <div className="mt-1 font-semibold text-slate-900">{model.sourceMode}</div>
            </div>
          </div>
          <p className="mt-5 rounded-2xl bg-slate-100 px-4 py-3 text-sm leading-6 text-slate-700">{model.notice}</p>
        </header>

        {chiefOfStaffBriefing ? <AutonomousGrowthBriefingV1 briefing={chiefOfStaffBriefing} embedded /> : null}

        <section aria-label="Strategy status" className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Total", model.counts.total],
            ["Do now", model.counts.doNow],
            ["Prepare", model.counts.prepare],
            ["Monitor", model.counts.monitor],
            ["Wait", model.counts.wait],
            ["Unknown/conflicted", model.counts.unknownOrConflicted],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
              <div className="mt-2 text-2xl font-semibold text-slate-950">{value}</div>
            </div>
          ))}
        </section>

        <section>
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Current priorities</p>
              <h2 className="mt-1 text-2xl font-semibold">What deserves your attention now</h2>
            </div>
            <Link href="/recommend" className="text-sm font-semibold text-slate-700 underline decoration-slate-300 underline-offset-4">See all recommendations</Link>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {model.currentPriorities.length ? model.currentPriorities.map((item) => <PriorityCard key={item.id} item={item} />) : <EmptyState>No supported current priorities are available for this window.</EmptyState>}
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Active bets</p>
            <h2 className="mt-1 text-xl font-semibold">Recommendations still in play</h2>
            <div className="mt-3 space-y-3">
              {model.activeBets.length ? model.activeBets.map((item) => <PriorityCard key={item.id} item={item} compact />) : <EmptyState>No active bet is supported by the current recommendation set.</EmptyState>}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Dependencies and blockers</p>
            <h2 className="mt-1 text-xl font-semibold">What prevents stronger action</h2>
            <div className="mt-3 space-y-3">
              {model.blockers.length ? model.blockers.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap gap-2"><span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badgeClass(item.epistemicState)}`}>{truthLabel(item.epistemicState)}</span></div>
                  <h3 className="mt-3 font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.blocker ?? item.dataMissing[0] ?? item.dependencies[0] ?? "Evidence certainty is not current."}</p>
                  <Link href={item.evidenceHref} className="mt-3 inline-block text-xs font-semibold text-slate-700 underline decoration-slate-300 underline-offset-4">Inspect evidence</Link>
                </div>
              )) : <EmptyState>No explicit blocker is present in the current recommendation set.</EmptyState>}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Decision points</p>
            <h2 className="mt-1 text-xl font-semibold">Where judgment or new evidence matters</h2>
            <div className="mt-3 space-y-3">
              {model.decisionPoints.length ? model.decisionPoints.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap gap-2"><span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${laneClass(item.lane)}`}>{laneLabel(item.lane)}</span></div>
                  <h3 className="mt-3 font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.blocker ?? item.nextSafeMove}</p>
                  <Link href={item.reviewHref} className="mt-3 inline-block text-xs font-semibold text-slate-700 underline decoration-slate-300 underline-offset-4">Review recommendation</Link>
                </div>
              )) : <EmptyState>No additional decision point is exposed by the current action synthesis.</EmptyState>}
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-[#ffffff] p-6 shadow-sm md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Next safe moves</p>
          <h2 className="mt-1 text-2xl font-semibold">Best next steps</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {model.nextSafeMoves.length ? model.nextSafeMoves.map((item, index) => (
              <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold text-slate-500">{index + 1}. {item.title}</div>
                <p className="mt-2 text-sm leading-6 text-slate-800">{item.nextSafeMove}</p>
              </div>
            )) : <EmptyState>No next move is asserted because canonical strategy evidence is unavailable.</EmptyState>}
          </div>
        </section>
      </div>
    </main>
  );
}
