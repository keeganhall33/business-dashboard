"use client";

import type { KnowledgeHealthQueueItemV1, KnowledgeHealthViewV1 } from "@/lib/intelligence/knowledge-compilation/knowledge-health-view-v1";

const healthStyle = {
  HEALTHY: "border-emerald-200 bg-emerald-50 text-emerald-900",
  NEEDS_ATTENTION: "border-amber-200 bg-amber-50 text-amber-900",
  DEGRADED: "border-orange-200 bg-orange-50 text-orange-900",
  BLOCKED: "border-rose-200 bg-rose-50 text-rose-900",
  UNKNOWN: "border-stone-300 bg-stone-100 text-stone-800"
} as const;

const truthStyle = {
  KNOWN: "border-emerald-200 bg-emerald-50 text-emerald-900",
  INFERRED: "border-sky-200 bg-sky-50 text-sky-900",
  UNKNOWN: "border-amber-200 bg-amber-50 text-amber-900",
  STALE: "border-orange-200 bg-orange-50 text-orange-900",
  CONFLICTED: "border-rose-200 bg-rose-50 text-rose-900"
} as const;

export function KnowledgeHealthPanelV1({ view }: { view: KnowledgeHealthViewV1 }) {
  const metrics = [
    ["Blocking", view.summary.blocking_findings],
    ["Important", view.summary.important_findings],
    ["Unresolved identities", view.summary.unresolved_or_ambiguous_references],
    ["Material conflicts", view.summary.material_conflicts],
    ["Stale decisions", view.summary.stale_decision_knowledge],
    ["Missing provenance", view.summary.missing_provenance],
    ["Commitments / next actions", view.summary.overdue_or_missing_next_actions],
    ["Learning review", view.summary.learning_items_awaiting_review]
  ] as const;

  return (
    <main className="min-h-screen bg-[#f8f4ec] text-stone-950" aria-label="Knowledge Health workspace">
      <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <header className="rounded-3xl border border-stone-200 bg-[#fffdf8] p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Company brain integrity</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Knowledge Health</h1>
              <p className="mt-3 text-sm leading-6 text-stone-700 sm:text-base">
                See whether current business knowledge is trustworthy, what could distort a decision, and what requires governed review.
              </p>
            </div>
            <span className={`w-fit rounded-full border px-4 py-2 text-sm font-semibold ${healthStyle[view.health]}`}>
              {view.health.replaceAll("_", " ")}
            </span>
          </div>
          <p className="mt-4 rounded-2xl border border-stone-200 bg-white p-4 text-sm leading-6 text-stone-700">{view.status_message}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-stone-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.1em] text-stone-500">{label}</div>
                <div className="mt-2 text-2xl font-semibold text-stone-950">{value}</div>
              </div>
            ))}
          </div>
        </header>

        <section className="mt-5" aria-label="Knowledge integrity priority queue">
          <div className="mb-3">
            <h2 className="text-xl font-semibold">Priority review queue</h2>
            <p className="mt-1 text-sm text-stone-600">Decision-corrupting conflicts appear before lower-impact housekeeping.</p>
          </div>
          {view.queue.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {view.queue.map((item) => <QueueCard key={item.id} item={item} />)}
            </div>
          ) : (
            <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
              <h3 className="font-semibold">No detected integrity issues</h3>
              <p className="mt-2 text-sm leading-6 text-stone-600">Only the supplied canonical data was checked. Missing coverage remains visible as UNKNOWN.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function QueueCard({ item }: { item: KnowledgeHealthQueueItemV1 }) {
  return (
    <article className="rounded-3xl border border-stone-200 bg-[#fffdf8] p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">{item.affected}</p>
          <h3 className="mt-1 text-lg font-semibold">{item.issue_type}</h3>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${truthStyle[item.truth_state]}`}>
          {item.truth_state}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-stone-700">{item.why_it_matters}</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-xs font-semibold text-stone-500">Evidence</dt><dd className="mt-1">{item.evidence_count}</dd></div>
        <div><dt className="text-xs font-semibold text-stone-500">Sources</dt><dd className="mt-1">{item.source_count}</dd></div>
        <div><dt className="text-xs font-semibold text-stone-500">Freshness</dt><dd className="mt-1">{item.freshness_state}</dd></div>
        <div><dt className="text-xs font-semibold text-stone-500">Next safe step</dt><dd className="mt-1">{item.next_step.replaceAll("_", " ")}</dd></div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        {item.detail_href ? <a href={item.detail_href} className="rounded-full border border-stone-300 bg-white px-3 py-2 text-xs font-semibold">Open supported record</a> : null}
        <button type="button" disabled className="cursor-not-allowed rounded-full bg-stone-200 px-3 py-2 text-xs font-semibold text-stone-500">
          {item.review_required ? "Governed review required" : "Read only"}
        </button>
      </div>
    </article>
  );
}
