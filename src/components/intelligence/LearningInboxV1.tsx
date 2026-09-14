import type {
  LearningInboxItemV1,
  LearningInboxStateV1,
  LearningInboxViewV1
} from "@/lib/intelligence/organizational-learning/learning-inbox-v1";

const stateStyle: Readonly<Record<LearningInboxStateV1, string>> = Object.freeze({
  CANDIDATE: "border-amber-200 bg-amber-50 text-amber-900",
  CORROBORATED: "border-sky-200 bg-sky-50 text-sky-900",
  REVIEWED: "border-indigo-200 bg-indigo-50 text-indigo-900",
  APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-900",
  CONFLICTED: "border-rose-200 bg-rose-50 text-rose-900",
  REJECTED: "border-stone-300 bg-stone-100 text-stone-800",
  SUPERSEDED: "border-stone-300 bg-white text-stone-600"
});

const truthStyle = {
  KNOWN: "border-emerald-200 bg-emerald-50 text-emerald-900",
  INFERRED: "border-sky-200 bg-sky-50 text-sky-900",
  UNKNOWN: "border-amber-200 bg-amber-50 text-amber-900",
  STALE: "border-orange-200 bg-orange-50 text-orange-900",
  CONFLICTED: "border-rose-200 bg-rose-50 text-rose-900"
} as const;

function LearningCard({ item }: { item: LearningInboxItemV1 }) {
  return (
    <article className="rounded-3xl border border-stone-200 bg-[#fffdf8] p-5 shadow-sm" data-learning-id={item.learning_id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">{item.kind.replaceAll("_", " ")} · {item.scope}</p>
          <h3 className="mt-1 text-lg font-semibold text-stone-950">{item.title}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${stateStyle[item.state]}`}>{item.state}</span>
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${truthStyle[item.truth_state]}`}>{item.truth_state}</span>
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-stone-800">{item.belief}</p>

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-stone-200 bg-white p-3">
          <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-stone-500">Confidence</dt>
          <dd className="mt-1 text-sm font-semibold text-stone-900">{Math.round(item.confidence * 100)}%</dd>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-3">
          <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-stone-500">Evidence</dt>
          <dd className="mt-1 text-sm font-semibold text-stone-900">{item.provenance.length}</dd>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-3">
          <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-stone-500">Company truth</dt>
          <dd className="mt-1 text-sm font-semibold text-stone-900">{item.company_truth ? "Canonical" : "No"}</dd>
        </div>
      </dl>

      <details className="mt-4 rounded-2xl border border-stone-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-stone-950">Why Jeeves believes this</summary>
        {item.provenance.length ? (
          <ul className="mt-3 grid gap-2 text-xs text-stone-700">
            {item.provenance.map((evidence) => (
              <li key={`${evidence.evidence_id}:${evidence.source_lineage_id}`} className="rounded-xl bg-stone-50 p-3">
                <span className="font-semibold">{evidence.evidence_id}</span> from {evidence.source_lineage_id} · {evidence.observed_at}
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 text-sm text-amber-800">No supported provenance is attached.</p>}
      </details>

      <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-stone-500">Affected consumers</p>
        <p className="mt-2 text-sm text-stone-800">
          {item.affected_consumers.length
            ? item.affected_consumers.map((consumer) => consumer.consumer_label).join(" · ")
            : "No evidence-supported downstream consumer is attached."}
        </p>
      </div>

      {item.review_required ? (
        <p className="mt-4 text-xs font-semibold text-amber-900">
          Governed review required. {item.action_available ? "A canonical review command is available." : "This workspace is read-only."}
        </p>
      ) : null}
    </article>
  );
}

export function LearningInboxV1({ view }: { view: LearningInboxViewV1 }) {
  const metrics = [
    ["Candidate", view.summary.candidate],
    ["Corroborated", view.summary.corroborated],
    ["Reviewed", view.summary.reviewed],
    ["Approved", view.summary.approved],
    ["Conflicted", view.summary.conflicted],
    ["Rejected", view.summary.rejected],
    ["Superseded", view.summary.superseded]
  ] as const;

  return (
    <main className="min-h-screen bg-[#f8f4ec] text-stone-950" aria-label="Executive Learning Inbox" data-testid="learning-inbox-v1">
      <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <header className="rounded-3xl border border-stone-200 bg-[#fffdf8] p-5 shadow-sm sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Organizational learning</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Learning Inbox</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-700 sm:text-base">
            Review what Jeeves believes it learned, the evidence behind it, and what could change before anything becomes company truth.
          </p>
          <p className="mt-4 rounded-2xl border border-stone-200 bg-white p-4 text-sm leading-6 text-stone-700">{view.status_message}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7" aria-label="Learning lifecycle summary">
            {metrics.map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-stone-200 bg-white p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-stone-500">{label}</div>
                <div className="mt-1 text-xl font-semibold">{value}</div>
              </div>
            ))}
          </div>
        </header>

        <section className="mt-5" aria-label="Learning review queue">
          <div className="mb-3">
            <h2 className="text-xl font-semibold">Review queue</h2>
            <p className="mt-1 text-sm text-stone-600">Review-required conflicts appear first. Unsupported fields and consumers are omitted.</p>
          </div>
          {view.coverage === "UNAVAILABLE" ? (
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm" data-testid="learning-inbox-unavailable">
              <h3 className="font-semibold text-stone-950">Canonical learning feed unavailable</h3>
              <p className="mt-2 text-sm leading-6 text-stone-700">No fixture, inferred belief, or synthetic record is shown in its place.</p>
            </div>
          ) : view.items.length ? (
            <div className="grid gap-4 xl:grid-cols-2">{view.items.map((item) => <LearningCard key={item.learning_id} item={item} />)}</div>
          ) : (
            <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm" data-testid="learning-inbox-empty">
              <h3 className="font-semibold">No supported learning objects</h3>
              <p className="mt-2 text-sm leading-6 text-stone-600">The connected feed is empty. This is not evidence that the company has nothing left to learn.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
