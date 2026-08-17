import type { DecisionRoomFixtureV1 } from "@/lib/intelligence-ux/responsive-shell-fixtures";
import { AskJeevesControl } from "./AskJeevesControl";

export function DecisionRoom({ decision }: { decision: DecisionRoomFixtureV1 }) {
  return (
    <section id={decision.decision_id} className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm md:p-6">
      <nav aria-label="Decision Room breadcrumb" className="flex flex-wrap gap-2 text-xs text-stone-500">
        {decision.breadcrumb.map((item, index) => <span key={`${item}-${index}`}>{index > 0 ? `/ ${item}` : item}</span>)}
      </nav>
      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Decision Room</p>
          <h2 className="mt-2 max-w-3xl text-2xl font-semibold tracking-normal text-stone-950 md:text-3xl">{decision.title}</h2>
          <p className="mt-4 max-w-3xl text-base leading-7 text-stone-700">{decision.recommendation_summary}</p>
          <div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 p-4"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Strategic question</div><p className="mt-2 text-lg leading-7 text-stone-950">{decision.strategic_question}</p></div>
          <div className="mt-5 space-y-3">
            {decision.written_answer_sections.map((section) => <article key={section.heading} className="rounded-2xl border border-stone-200 bg-white p-4"><h3 className="text-sm font-semibold text-stone-950">{section.heading}</h3><p className="mt-2 text-sm leading-6 text-stone-700">{section.body}</p></article>)}
          </div>
          <div className="mt-5 rounded-2xl bg-stone-950 p-4 text-white"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-300">Next high-leverage move</div><p className="mt-2 text-sm leading-6">{decision.primary_action}</p></div>
        </div>
        <aside className="space-y-4">
          <AskJeevesControl control={decision.contextual_ask} />
          <details className="rounded-2xl border border-stone-200 bg-stone-50 p-4" open><summary className="cursor-pointer text-sm font-semibold text-stone-950">Evidence</summary><div className="mt-3 space-y-3">{decision.evidence.map((item) => <div key={item.id} className="rounded-xl bg-white p-3 text-sm"><div className="font-semibold text-stone-950">{item.label}</div><div className="mt-1 leading-6 text-stone-700">{item.detail}</div></div>)}</div></details>
          <details className="rounded-2xl border border-stone-200 bg-stone-50 p-4"><summary className="cursor-pointer text-sm font-semibold text-stone-950">Assumptions</summary><div className="mt-3 space-y-2">{decision.assumptions.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 text-sm"><span className="text-stone-800">{item.label}</span><span className="rounded-full border border-stone-200 px-2 py-1 text-xs font-semibold text-stone-700">{item.status}</span></div>)}</div></details>
        </aside>
      </div>
    </section>
  );
}
