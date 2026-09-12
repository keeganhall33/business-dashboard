import Link from "next/link";
import type { ExecutiveStrategyWorkspaceModelV1, StrategyWorkspaceRecordV1 } from "@/lib/strategy/executive-strategy-v1";

function badgeClass(state: StrategyWorkspaceRecordV1["epistemicState"]) {
  if (state === "KNOWN") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (state === "CONFLICTED") return "border-rose-200 bg-rose-50 text-rose-800";
  if (state === "STALE") return "border-amber-200 bg-amber-50 text-amber-800";
  if (state === "INFERRED") return "border-blue-200 bg-blue-50 text-blue-800";
  return "border-stone-300 bg-stone-100 text-stone-700";
}

function laneClass(lane: StrategyWorkspaceRecordV1["lane"]) {
  if (lane === "DO_NOW") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (lane === "PREPARE") return "border-blue-200 bg-blue-50 text-blue-800";
  if (lane === "MONITOR") return "border-violet-200 bg-violet-50 text-violet-800";
  if (lane === "DEPRIORITIZE") return "border-stone-300 bg-stone-100 text-stone-600";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function money(cents: number | null) {
  if (cents == null) return "Unknown";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function Economics({ item }: { item: StrategyWorkspaceRecordV1 }) {
  if (!item.economics) return <span className="text-stone-500">Economics: Unknown</span>;
  const { lowCents, expectedCents, highCents, horizon } = item.economics;
  return (
    <span className="text-stone-500">
      Economics: {money(lowCents)} / {money(expectedCents)} / {money(highCents)} ({horizon})
    </span>
  );
}

function PriorityCard({ item, compact = false }: { item: StrategyWorkspaceRecordV1; compact?: boolean }) {
  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${laneClass(item.lane)}`}>{item.lane.replaceAll("_", " ")}</span>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badgeClass(item.epistemicState)}`}>{item.epistemicState}</span>
          </div>
          <h3 className="mt-3 text-base font-semibold text-stone-950">{item.title}</h3>
          <p className="mt-2 text-sm leading-6 text-stone-700">{item.recommendedAction}</p>
        </div>
        <div className="rounded-xl bg-stone-50 px-3 py-2 text-right">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">Existing score</div>
          <div className="text-lg font-semibold text-stone-950">{item.priorityScore ?? "Unknown"}</div>
        </div>
      </div>

      {!compact ? (
        <>
          <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
            <span className="text-stone-500">Confidence: <strong className="text-stone-800">{item.confidence ?? "Unknown"}</strong></span>
            <span className="text-stone-500">Urgency: <strong className="text-stone-800">{item.urgency ?? "Unknown"}</strong></span>
            <span className="text-stone-500">Approval: <strong className="text-stone-800">{item.approvalLevel ?? "Unknown"}</strong></span>
            <Economics item={item} />
          </div>
          {item.blocker ? <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">Blocker: {item.blocker}</p> : null}
          {item.dataMissing.length ? <p className="mt-2 text-xs text-stone-600">Missing: {item.dataMissing.join(", ")}</p> : null}
          {item.dependencies.length ? <p className="mt-2 text-xs text-stone-600">Dependencies: {item.dependencies.join(", ")}</p> : null}
        </>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
        <Link href={item.reviewHref} className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-stone-800 hover:bg-stone-50">Review recommendation</Link>
        <Link href={item.evidenceHref} className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-stone-800 hover:bg-stone-50">Inspect evidence</Link>
      </div>
    </article>
  );
}

function EmptyState({ children }: { children: string }) {
  return <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 p-5 text-sm text-stone-600">{children}</div>;
}

export function ExecutiveStrategyWorkspaceV1({ model }: { model: ExecutiveStrategyWorkspaceModelV1 }) {
  return (
    <main className="min-h-screen bg-[#f7f2ea] py-6 text-stone-950">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-[2rem] border border-stone-200 bg-[#fffdf8] p-6 shadow-sm md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Strategy workspace</p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">What matters, what is blocked, and what is safe next</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">A scan-first view over the existing recommendation and executive-action contracts. Unsupported owners, deadlines, economics, dependencies, and certainty stay Unknown.</p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Evidence mode</div>
              <div className="mt-1 font-semibold text-stone-900">{model.sourceMode}</div>
            </div>
          </div>
          <p className="mt-5 rounded-2xl bg-stone-100 px-4 py-3 text-sm leading-6 text-stone-700">{model.notice}</p>
        </header>

        <section aria-label="Strategy status" className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Total", model.counts.total],
            ["Do now", model.counts.doNow],
            ["Prepare", model.counts.prepare],
            ["Monitor", model.counts.monitor],
            ["Wait", model.counts.wait],
            ["Unknown/conflicted", model.counts.unknownOrConflicted],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">{label}</div>
              <div className="mt-2 text-2xl font-semibold text-stone-950">{value}</div>
            </div>
          ))}
        </section>

        <section>
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Current priorities</p>
              <h2 className="mt-1 text-2xl font-semibold">Highest existing recommendation scores</h2>
            </div>
            <Link href="/recommend" className="text-sm font-semibold text-stone-700 underline decoration-stone-300 underline-offset-4">Open Recommend</Link>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {model.currentPriorities.length ? model.currentPriorities.map((item) => <PriorityCard key={item.id} item={item} />) : <EmptyState>No supported current priorities are available for this window.</EmptyState>}
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Active bets</p>
            <h2 className="mt-1 text-xl font-semibold">Recommendations still in play</h2>
            <div className="mt-3 space-y-3">
              {model.activeBets.length ? model.activeBets.map((item) => <PriorityCard key={item.id} item={item} compact />) : <EmptyState>No active bet is supported by the current recommendation set.</EmptyState>}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Dependencies and blockers</p>
            <h2 className="mt-1 text-xl font-semibold">What prevents stronger action</h2>
            <div className="mt-3 space-y-3">
              {model.blockers.length ? model.blockers.map((item) => (
                <div key={item.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap gap-2"><span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badgeClass(item.epistemicState)}`}>{item.epistemicState}</span></div>
                  <h3 className="mt-3 font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-stone-600">{item.blocker ?? item.dataMissing[0] ?? item.dependencies[0] ?? "Evidence certainty is not current."}</p>
                  <Link href={item.evidenceHref} className="mt-3 inline-block text-xs font-semibold text-stone-700 underline decoration-stone-300 underline-offset-4">Inspect evidence</Link>
                </div>
              )) : <EmptyState>No explicit blocker is present in the current recommendation set.</EmptyState>}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Decision points</p>
            <h2 className="mt-1 text-xl font-semibold">Where judgment or new evidence matters</h2>
            <div className="mt-3 space-y-3">
              {model.decisionPoints.length ? model.decisionPoints.map((item) => (
                <div key={item.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap gap-2"><span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${laneClass(item.lane)}`}>{item.lane.replaceAll("_", " ")}</span></div>
                  <h3 className="mt-3 font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-stone-600">{item.blocker ?? item.nextSafeMove}</p>
                  <Link href={item.reviewHref} className="mt-3 inline-block text-xs font-semibold text-stone-700 underline decoration-stone-300 underline-offset-4">Review recommendation</Link>
                </div>
              )) : <EmptyState>No additional decision point is exposed by the current action synthesis.</EmptyState>}
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-stone-200 bg-[#fffdf8] p-6 shadow-sm md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Next safe moves</p>
          <h2 className="mt-1 text-2xl font-semibold">Advance evidence before certainty</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {model.nextSafeMoves.length ? model.nextSafeMoves.map((item, index) => (
              <div key={item.id} className="rounded-2xl border border-stone-200 bg-white p-4">
                <div className="text-xs font-semibold text-stone-500">{index + 1}. {item.title}</div>
                <p className="mt-2 text-sm leading-6 text-stone-800">{item.nextSafeMove}</p>
              </div>
            )) : <EmptyState>No next move is asserted because canonical strategy evidence is unavailable.</EmptyState>}
          </div>
        </section>
      </div>
    </main>
  );
}
