import Link from "next/link";
import type { ExecutiveWorkspaceTruthStateV1, ExecutiveWorkspaceViewModelV1 } from "@/lib/executive-workspace/ia";

const stateStyles: Record<ExecutiveWorkspaceTruthStateV1, string> = {
  KNOWN: "border-emerald-200 bg-emerald-50 text-emerald-900",
  INFERRED: "border-sky-200 bg-sky-50 text-sky-900",
  UNKNOWN: "border-amber-200 bg-amber-50 text-amber-900",
  STALE: "border-orange-200 bg-orange-50 text-orange-900",
  CONFLICTED: "border-rose-200 bg-rose-50 text-rose-900"
};

export function ExecutiveWorkspacePage({ model }: { model: ExecutiveWorkspaceViewModelV1 }) {
  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-stone-200 bg-[#fffdf8] p-5 shadow-sm md:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Executive workspace</p>
        <div className="mt-3 grid gap-5 lg:grid-cols-[1fr_22rem] lg:items-end">
          <div>
            <h1 className="text-3xl font-semibold tracking-normal text-stone-950 md:text-5xl">{model.headline}</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-stone-700">{model.description}</p>
            <p className="mt-4 rounded-2xl border border-stone-200 bg-white p-3 text-sm font-semibold text-stone-900">{model.primary_question}</p>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Owns</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {model.workspace.owns.map((item) => (
                <span key={item} className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-semibold text-stone-700">
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4" aria-label="Workspace evidence policy">
        <PolicyChip label="Ingestion noise hidden" value={model.evidence_policy.hides_low_level_ingestion_noise} />
        <PolicyChip label="UNKNOWN stays explicit" value={model.evidence_policy.unknown_stale_conflicted_remain_explicit} />
        <PolicyChip label="No duplicate truth store" value={model.evidence_policy.no_duplicate_truth_store} />
        <PolicyChip label="History preserved" value={model.evidence_policy.canonical_state_updates_preserve_history} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[1fr_24rem]">
        <div className="space-y-5">
          {model.sections.map((section) => (
            <section key={section.id} id={section.id} className="rounded-3xl border border-stone-200 bg-[#fffdf8] p-4 shadow-sm">
              <div className="mb-4">
                <h2 className="text-xl font-semibold tracking-normal text-stone-950">{section.title}</h2>
                <p className="mt-1 text-sm leading-6 text-stone-600">{section.summary}</p>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {section.cards.map((card) => (
                  <article key={card.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-base font-semibold text-stone-950">{card.title}</h3>
                      <StatePill state={card.state} />
                    </div>
                    <dl className="mt-4 space-y-3 text-sm leading-6">
                      <Detail label="What matters" value={card.what_matters} />
                      <Detail label="Why this" value={card.why} />
                      <Detail label="Next" value={card.next} />
                    </dl>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-semibold text-stone-700">Owner: {card.owner}</span>
                      <Link href={card.detail_href} className="rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white">
                        Open detail
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>

        <aside className="space-y-5">
          <section className="rounded-3xl border border-stone-200 bg-[#fffdf8] p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-stone-950">Entity deep links</h2>
            <p className="mt-1 text-sm leading-6 text-stone-600">Complex objects have route homes instead of modal-only dead ends.</p>
            <div className="mt-4 grid gap-2">
              {model.entity_routes.map((route) => (
                <div key={route.kind} className="rounded-2xl border border-stone-200 bg-white p-3">
                  <div className="text-sm font-semibold text-stone-950">{route.label}</div>
                  <div className="mt-1 break-words text-xs text-stone-500">{route.href_pattern}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-stone-200 bg-[#fffdf8] p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-stone-950">Feedback standard</h2>
            <p className="mt-1 text-sm leading-6 text-stone-600">
              Feedback updates canonical state with actor, timestamp, provenance, reason note, and history when the owning backend supports it.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {model.feedback_actions.map((action) => (
                <span key={action} className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-semibold text-stone-700">
                  {action}
                </span>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function PolicyChip({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-stone-950">{value ? "YES" : "NO"}</div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">{label}</dt>
      <dd className="mt-1 text-stone-700">{value}</dd>
    </div>
  );
}

function StatePill({ state }: { state: ExecutiveWorkspaceTruthStateV1 }) {
  return <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${stateStyles[state]}`}>{state}</span>;
}
