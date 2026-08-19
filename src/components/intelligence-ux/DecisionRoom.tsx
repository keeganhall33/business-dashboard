import { toDecisionRoomViewModelV1, type DecisionRoomDashboardModelV1 } from "@/lib/decision-room/shell-adapter";
import { AskJeevesControl } from "./AskJeevesControl";

export function DecisionRoom({ decision }: { decision: DecisionRoomDashboardModelV1 }) {
  const viewModel = toDecisionRoomViewModelV1(decision);

  return (
    <section id={viewModel.decision_id} className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm md:p-6">
      <nav aria-label="Decision Room breadcrumb" className="flex flex-wrap gap-2 text-xs text-stone-500">
        {viewModel.breadcrumb.map((item, index) => <span key={`${item}-${index}`}>{index > 0 ? `/ ${item}` : item}</span>)}
      </nav>
      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Decision Room</p>
          <h2 className="mt-2 max-w-3xl text-2xl font-semibold tracking-normal text-stone-950 md:text-3xl">{viewModel.current_recommendation.title}</h2>
          <p className="mt-4 max-w-3xl text-base leading-7 text-stone-700">{viewModel.current_recommendation.summary}</p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Confidence</div><p className="mt-2 text-sm font-semibold text-stone-950">{viewModel.confidence}</p></div>
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Approval</div><p className="mt-2 text-sm font-semibold text-stone-950">{viewModel.approval_class}</p></div>
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Challenge</div><p className="mt-2 text-sm font-semibold text-stone-950">{viewModel.challenge.active ? "VISIBLE" : "None active"}</p></div>
          </div>
          <div className="mt-5 space-y-3">
            <article className="rounded-2xl border border-stone-200 bg-white p-4"><h3 className="text-sm font-semibold text-stone-950">Strongest argument against</h3><p className="mt-2 text-sm leading-6 text-stone-700">{viewModel.strongest_argument_against}</p></article>
            <article className="rounded-2xl border border-stone-200 bg-white p-4"><h3 className="text-sm font-semibold text-stone-950">Weakest assumption</h3><p className="mt-2 text-sm leading-6 text-stone-700">{viewModel.weakest_assumption.label}: {viewModel.weakest_assumption.why_it_matters}</p></article>
            <article className="rounded-2xl border border-stone-200 bg-white p-4"><h3 className="text-sm font-semibold text-stone-950">Opportunity cost</h3><p className="mt-2 text-sm leading-6 text-stone-700">{viewModel.opportunity_cost_note}</p></article>
            {viewModel.challenge.active ? <article className="rounded-2xl border border-rose-200 bg-rose-50 p-4"><h3 className="text-sm font-semibold text-rose-950">Red-team challenge</h3><p className="mt-2 text-sm leading-6 text-rose-900">{viewModel.challenge.red_team_summary}</p><p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-rose-700">Recommendation overwritten: {String(viewModel.challenge.recommendation_overwritten)}</p></article> : null}
          </div>
          <div className="mt-5 rounded-2xl bg-stone-950 p-4 text-white"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-300">Next high-leverage move</div><p className="mt-2 text-sm leading-6">{viewModel.next_action}</p></div>
        </div>
        <aside className="space-y-4">
          {"contextual_ask" in decision ? <AskJeevesControl control={decision.contextual_ask} /> : null}
          {viewModel.strategic_context ? (
            <details className="rounded-2xl border border-stone-200 bg-stone-50 p-4" open>
              <summary className="cursor-pointer text-sm font-semibold text-stone-950">Trajectory and acquisition context</summary>
              <div className="mt-3 space-y-3 text-sm">
                <div className="rounded-xl bg-white p-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Target / preferred path</div>
                  <p className="mt-2 font-semibold text-stone-950">{viewModel.strategic_context.trajectory.target_state}</p>
                  <p className="mt-2 leading-6 text-stone-700">{viewModel.strategic_context.trajectory.preferred_path.label}: {viewModel.strategic_context.trajectory.preferred_path.why_preferred}</p>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Bottleneck</div>
                  <p className="mt-2 leading-6 text-stone-700">{viewModel.strategic_context.trajectory.current_bottleneck}</p>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Next high-leverage move</div>
                  <p className="mt-2 leading-6 text-stone-700">{viewModel.strategic_context.trajectory.next_high_leverage_move}</p>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">What to ignore</div>
                  <ul className="mt-2 space-y-1 leading-6 text-stone-700">{viewModel.strategic_context.trajectory.what_to_ignore.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Fog-of-war / scouting action</div>
                  <ul className="mt-2 space-y-1 leading-6 text-stone-700">{viewModel.strategic_context.trajectory.fog_of_war.map((item) => <li key={item}>{item}</li>)}</ul>
                  <p className="mt-2 leading-6 text-stone-700">{viewModel.strategic_context.trajectory.scouting_action}</p>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Coverage state</div>
                  <p className="mt-2 font-semibold text-stone-950">{viewModel.strategic_context.acquisition.coverage_state} | {viewModel.strategic_context.acquisition.source_health} | {viewModel.strategic_context.acquisition.freshness} | {viewModel.strategic_context.acquisition.approval_class}</p>
                  <p className="mt-2 leading-6 text-stone-700">{viewModel.strategic_context.acquisition.decision_or_capability}</p>
                </div>
                {viewModel.strategic_context.acquisition.critical_gap ? (
                  <div className="rounded-xl bg-white p-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Critical gap</div>
                    <p className="mt-2 font-semibold text-stone-950">{viewModel.strategic_context.acquisition.critical_gap.fact_id}</p>
                    <p className="mt-2 leading-6 text-stone-700">{viewModel.strategic_context.acquisition.critical_gap.materiality} | {viewModel.strategic_context.acquisition.critical_gap.coverage_state} | {viewModel.strategic_context.acquisition.critical_gap.truth_state}</p>
                    <p className="mt-2 leading-6 text-stone-700">{viewModel.strategic_context.acquisition.critical_gap.why_it_matters}</p>
                  </div>
                ) : null}
                <div className="rounded-xl bg-white p-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Next best acquisition action</div>
                  <p className="mt-2 font-semibold text-stone-950">{viewModel.strategic_context.acquisition.next_best_acquisition_action.label}</p>
                  <p className="mt-2 leading-6 text-stone-700">{viewModel.strategic_context.acquisition.next_best_acquisition_action.safety}: {viewModel.strategic_context.acquisition.next_best_acquisition_action.rationale}</p>
                </div>
              </div>
            </details>
          ) : null}
          <details className="rounded-2xl border border-stone-200 bg-stone-50 p-4" open><summary className="cursor-pointer text-sm font-semibold text-stone-950">Evidence</summary><div className="mt-3 space-y-3">{viewModel.evidence_refs.map((item) => <div key={item.ref_id} className="rounded-xl bg-white p-3 text-sm"><div className="font-semibold text-stone-950">{item.label}</div><div className="mt-1 leading-6 text-stone-700">{item.truth_state} | {item.provenance} | {item.detail}</div></div>)}</div></details>
          <details className="rounded-2xl border border-stone-200 bg-stone-50 p-4" open><summary className="cursor-pointer text-sm font-semibold text-stone-950">Disagreement</summary><div className="mt-3 space-y-2">{viewModel.specialist_disagreement.map((item) => <div key={`${item.specialist}-${item.stance}-${item.summary}`} className="rounded-xl bg-white p-3 text-sm"><div className="flex items-center justify-between gap-3"><span className="font-semibold text-stone-950">{item.specialist}</span><span className="rounded-full border border-stone-200 px-2 py-1 text-xs font-semibold text-stone-700">{item.stance}</span></div><p className="mt-2 leading-6 text-stone-700">{item.summary}</p></div>)}</div></details>
          <details className="rounded-2xl border border-stone-200 bg-stone-50 p-4" open><summary className="cursor-pointer text-sm font-semibold text-stone-950">Assumptions / unknowns</summary><div className="mt-3 space-y-2">{viewModel.assumptions_unknowns.map((item) => <div key={item.assumption_id} className="rounded-xl bg-white p-3 text-sm"><div className="flex items-center justify-between gap-3"><span className="text-stone-800">{item.label}</span><span className="rounded-full border border-stone-200 px-2 py-1 text-xs font-semibold text-stone-700">{item.truth_state}</span></div><p className="mt-2 leading-6 text-stone-600">{item.why_it_matters}</p></div>)}</div></details>
          <details className="rounded-2xl border border-stone-200 bg-stone-50 p-4"><summary className="cursor-pointer text-sm font-semibold text-stone-950">What would change my mind</summary><ul className="mt-3 space-y-2 text-sm leading-6 text-stone-700">{viewModel.WHAT_WOULD_CHANGE_MY_MIND.map((item) => <li key={item}>{item}</li>)}</ul></details>
        </aside>
      </div>
    </section>
  );
}
