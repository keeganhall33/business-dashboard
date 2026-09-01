import { toDecisionRoomViewModelV1, type DecisionRoomDashboardModelV1 } from "@/lib/decision-room/shell-adapter";
import type { DecisionRoomAlternativeV1, DecisionRoomEvidenceRefV1, DecisionRoomTruthStateV1 } from "@/lib/decision-room/contracts";
import { DecisionConversationPanel } from "@/components/intelligence/conversation/DecisionConversationPanel";
import { AskJeevesControl } from "./AskJeevesControl";

const truthStatePriority: Record<DecisionRoomTruthStateV1 | "STALE", number> = {
  CONFLICTED: 4,
  STALE: 3,
  UNKNOWN: 2,
  INFERRED: 1,
  KNOWN: 0,
};

const truthStateTone: Record<DecisionRoomTruthStateV1 | "STALE", string> = {
  KNOWN: "border-emerald-200 bg-emerald-50 text-emerald-900",
  INFERRED: "border-sky-200 bg-sky-50 text-sky-900",
  UNKNOWN: "border-amber-200 bg-amber-50 text-amber-900",
  STALE: "border-orange-200 bg-orange-50 text-orange-900",
  CONFLICTED: "border-rose-200 bg-rose-50 text-rose-900",
};

const decisionSignalTone: Record<DecisionRoomTruthStateV1 | "STALE", string> = {
  KNOWN: "bg-emerald-500",
  INFERRED: "bg-sky-500",
  UNKNOWN: "border border-dashed border-amber-400 bg-amber-50",
  STALE: "border border-dashed border-orange-400 bg-orange-50",
  CONFLICTED: "border border-dashed border-rose-400 bg-rose-50",
};

function resolveAlternativeTruthState(alternative: DecisionRoomAlternativeV1, evidenceRefs: DecisionRoomEvidenceRefV1[]) {
  const refs = alternative.evidence_refs
    .map((refId) => evidenceRefs.find((evidence) => evidence.ref_id === refId))
    .filter((evidence): evidence is DecisionRoomEvidenceRefV1 => Boolean(evidence));

  if (refs.length === 0) {
    return { truthState: "UNKNOWN" as const, refs };
  }

  return refs.reduce(
    (current, evidence) => {
      const evidenceState = evidence.truth_state as DecisionRoomTruthStateV1 | "STALE";
      return truthStatePriority[evidenceState] > truthStatePriority[current.truthState]
        ? { truthState: evidenceState, refs }
        : current;
    },
    { truthState: refs[0].truth_state as DecisionRoomTruthStateV1 | "STALE", refs },
  );
}

function DecisionOptionComparison({ viewModel }: { viewModel: ReturnType<typeof toDecisionRoomViewModelV1> }) {
  const options = viewModel.alternatives.slice(0, 4).map((alternative) => ({
    ...alternative,
    ...resolveAlternativeTruthState(alternative, viewModel.evidence_refs),
  }));

  if (options.length < 2) {
    return null;
  }

  return (
    <section data-testid="decision-option-comparison" className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Option comparison</p>
          <h3 className="mt-1 text-sm font-semibold text-stone-950">Competing paths at a glance</h3>
        </div>
        <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-semibold text-stone-700">{options.length} options</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {options.map((option) => {
          const isUnprovenState = option.truthState === "UNKNOWN" || option.truthState === "STALE" || option.truthState === "CONFLICTED";

          return (
            <article key={option.alternative_id} data-testid="decision-option-card" className="rounded-xl border border-stone-200 bg-white p-3">
              <div className="flex min-h-12 items-start justify-between gap-3">
                <h4 className="text-sm font-semibold leading-5 text-stone-950">{option.label}</h4>
                <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold ${truthStateTone[option.truthState]}`}>{option.truthState}</span>
              </div>
              <div aria-label={`Evidence signal for ${option.label}`} className="mt-3 h-2 rounded-full bg-stone-200">
                {isUnprovenState ? (
                  <div className={`h-2 w-full rounded-full ${decisionSignalTone[option.truthState]}`} />
                ) : (
                  <div className={`h-2 rounded-full ${option.truthState === "KNOWN" ? "w-full" : "w-2/3"} ${decisionSignalTone[option.truthState]}`} />
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-600">
                {option.refs.length > 0 ? option.refs.map((evidence) => (
                  <span key={evidence.ref_id} className="rounded-full border border-stone-200 bg-stone-50 px-2 py-1">{evidence.provenance}</span>
                )) : <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-900">UNKNOWN evidence</span>}
              </div>
              <details data-testid="decision-option-detail" className="mt-3">
                <summary className="cursor-pointer text-xs font-semibold text-stone-700">Tradeoff and proof</summary>
                <p className="mt-2 text-sm leading-6 text-stone-700">{option.tradeoff}</p>
                <p className="mt-2 text-xs leading-5 text-stone-500">{option.refs.map((evidence) => evidence.label).join(" / ") || "No supporting evidence ref in the current view model."}</p>
              </details>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function DecisionEvidenceSummary({ evidenceRefs }: { evidenceRefs: DecisionRoomEvidenceRefV1[] }) {
  const counts = evidenceRefs.reduce<Record<string, number>>((acc, evidence) => {
    acc[evidence.truth_state] = (acc[evidence.truth_state] ?? 0) + 1;
    return acc;
  }, {});
  const riskStates = evidenceRefs.filter((evidence) => ["UNKNOWN", "STALE", "CONFLICTED"].includes(evidence.truth_state));

  return (
    <details data-testid="decision-evidence-summary" className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-stone-950">
        Evidence
        <span className="ml-2 text-xs font-medium text-stone-500">{evidenceRefs.length} sources</span>
      </summary>
      <div className="mt-3 grid gap-3">
        <div className="flex flex-wrap gap-2">
          {["KNOWN", "INFERRED", "UNKNOWN", "STALE", "CONFLICTED"].map((state) => (
            <span key={state} className={`rounded-full border px-2 py-1 text-xs font-semibold ${truthStateTone[state as DecisionRoomTruthStateV1 | "STALE"]}`}>
              {state} {counts[state] ?? 0}
            </span>
          ))}
        </div>
        {riskStates.length > 0 ? (
          <div data-testid="decision-evidence-risk-strip" className="grid gap-2 sm:grid-cols-2">
            {riskStates.map((item) => (
              <div key={item.ref_id} className="rounded-xl border border-stone-200 bg-white p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-stone-950">{item.label}</span>
                  <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold ${truthStateTone[item.truth_state as DecisionRoomTruthStateV1 | "STALE"]}`}>{item.truth_state}</span>
                </div>
                <p className="mt-2 leading-5 text-stone-600">{item.provenance}</p>
              </div>
            ))}
          </div>
        ) : null}
        <details data-testid="decision-evidence-source-drilldown" className="rounded-xl border border-stone-200 bg-white p-3">
          <summary className="cursor-pointer text-xs font-semibold text-stone-700">Source drill-down</summary>
          <div className="mt-3 space-y-2">
            {evidenceRefs.map((item) => (
              <div key={item.ref_id} className="rounded-lg bg-stone-50 p-3 text-sm">
                <div className="font-semibold text-stone-950">{item.label}</div>
                <div className="mt-1 leading-6 text-stone-700">{item.truth_state} | {item.provenance} | {item.detail}</div>
              </div>
            ))}
          </div>
        </details>
      </div>
    </details>
  );
}

function RevisionDiff({ revision }: { revision: NonNullable<ReturnType<typeof toDecisionRoomViewModelV1>["conversation_revision"]>["recommendation_revision"] }) {
  const diff = revision.diff;

  if (!diff) {
    return (
      <section className="border border-amber-200 bg-amber-50 p-4">
        <h3 className="text-sm font-semibold text-amber-950">New information preview</h3>
        <p className="mt-2 text-sm leading-6 text-amber-900">No recommendation version changed. Hypothetical input remains scenario-only and cannot appear as fact.</p>
      </section>
    );
  }

  return (
    <section className="border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">WHY_CHANGED</p>
          <h3 className="mt-2 text-base font-semibold text-stone-950">Recommendation {diff.previous_version} to {diff.next_version}</h3>
        </div>
        <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900">Confidence {diff.confidence_delta.before} to {diff.confidence_delta.after} ({diff.confidence_delta.direction})</span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <article className="border border-stone-200 bg-stone-50 p-3">
          <h4 className="text-sm font-semibold text-stone-950">Before v{diff.previous_version}</h4>
          <p className="mt-2 text-sm leading-6 text-stone-700">{diff.before.recommendation_summary}</p>
          <p className="mt-2 text-sm font-semibold text-stone-950">{diff.before.recommended_action}</p>
          <p className="mt-2 text-xs font-semibold text-stone-600">UNKNOWN: {diff.before.unknowns.join(", ") || "none"}</p>
        </article>
        <article className="border border-stone-200 bg-stone-50 p-3">
          <h4 className="text-sm font-semibold text-stone-950">After v{diff.next_version}</h4>
          <p className="mt-2 text-sm leading-6 text-stone-700">{diff.after.recommendation_summary}</p>
          <p className="mt-2 text-sm font-semibold text-stone-950">{diff.after.recommended_action}</p>
          <p className="mt-2 text-xs font-semibold text-stone-600">UNKNOWN: {diff.after.unknowns.join(", ") || "none"}</p>
        </article>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="border border-stone-200 bg-stone-50 p-3 text-sm leading-6 text-stone-700">
          <div className="font-semibold text-stone-950">Changed evidence / assumptions</div>
          <p>Added evidence: {diff.added_evidence_ids.join(", ") || "none"}</p>
          <p>Changed assumptions: {diff.changed_assumption_ids.join(", ") || "none"}</p>
          <p>Preserved evidence: {diff.preserved_evidence_ids.join(", ") || "none"}</p>
        </div>
        <div className="border border-stone-200 bg-stone-50 p-3 text-sm leading-6 text-stone-700">
          <div className="font-semibold text-stone-950">Version audit</div>
          <p>Old recommendation remains inspectable as v{revision.old_recommendation.version}.</p>
          <p>Facts mutated: {String(revision.facts_mutated)}. Memory mutated: {String(revision.memory_mutated)}.</p>
          <p>UNKNOWN explicit: {String(revision.unknowns_explicit)}. CONFLICTED explicit: {String(revision.conflicted_evidence_explicit)}.</p>
        </div>
      </div>
      <ul className="mt-4 space-y-2 text-sm leading-6 text-stone-700">
        {diff.why_changed.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </section>
  );
}

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
          <DecisionOptionComparison viewModel={viewModel} />
          <div className="mt-5 space-y-3">
            <article className="rounded-2xl border border-stone-200 bg-white p-4"><h3 className="text-sm font-semibold text-stone-950">Strongest argument against</h3><p className="mt-2 text-sm leading-6 text-stone-700">{viewModel.strongest_argument_against}</p></article>
            <article className="rounded-2xl border border-stone-200 bg-white p-4"><h3 className="text-sm font-semibold text-stone-950">Weakest assumption</h3><p className="mt-2 text-sm leading-6 text-stone-700">{viewModel.weakest_assumption.label}: {viewModel.weakest_assumption.why_it_matters}</p></article>
            <article className="rounded-2xl border border-stone-200 bg-white p-4"><h3 className="text-sm font-semibold text-stone-950">Opportunity cost</h3><p className="mt-2 text-sm leading-6 text-stone-700">{viewModel.opportunity_cost_note}</p></article>
            {viewModel.challenge.active ? <article className="rounded-2xl border border-rose-200 bg-rose-50 p-4"><h3 className="text-sm font-semibold text-rose-950">Red-team challenge</h3><p className="mt-2 text-sm leading-6 text-rose-900">{viewModel.challenge.red_team_summary}</p><p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-rose-700">Recommendation overwritten: {String(viewModel.challenge.recommendation_overwritten)}</p></article> : null}
          </div>
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Next high-leverage move</div><p className="mt-2 text-sm leading-6">{viewModel.next_action}</p></div>
          {viewModel.conversation_revision ? (
            <div className="mt-5 space-y-4">
              <DecisionConversationPanel viewModel={viewModel.conversation_revision.conversation} />
              <section className="border border-stone-200 bg-stone-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Fixture-backed new information preview</p>
                <p className="mt-2 text-sm leading-6 text-stone-700">{viewModel.conversation_revision.new_information_preview.input.transcript}</p>
                <p className="mt-2 text-xs font-semibold text-stone-600">Canonical payload: {viewModel.conversation_revision.new_information_preview.input.classification} / {viewModel.conversation_revision.new_information_preview.input.mode} / read_only_fixture={String(viewModel.conversation_revision.new_information_preview.input.read_only_fixture)}</p>
              </section>
              <RevisionDiff revision={viewModel.conversation_revision.recommendation_revision} />
            </div>
          ) : null}
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
          <DecisionEvidenceSummary evidenceRefs={viewModel.evidence_refs} />
          <details className="rounded-2xl border border-stone-200 bg-stone-50 p-4" open><summary className="cursor-pointer text-sm font-semibold text-stone-950">Disagreement</summary><div className="mt-3 space-y-2">{viewModel.specialist_disagreement.map((item) => <div key={`${item.specialist}-${item.stance}-${item.summary}`} className="rounded-xl bg-white p-3 text-sm"><div className="flex items-center justify-between gap-3"><span className="font-semibold text-stone-950">{item.specialist}</span><span className="rounded-full border border-stone-200 px-2 py-1 text-xs font-semibold text-stone-700">{item.stance}</span></div><p className="mt-2 leading-6 text-stone-700">{item.summary}</p></div>)}</div></details>
          <details className="rounded-2xl border border-stone-200 bg-stone-50 p-4" open><summary className="cursor-pointer text-sm font-semibold text-stone-950">Assumptions / unknowns</summary><div className="mt-3 space-y-2">{viewModel.assumptions_unknowns.map((item) => <div key={item.assumption_id} className="rounded-xl bg-white p-3 text-sm"><div className="flex items-center justify-between gap-3"><span className="text-stone-800">{item.label}</span><span className="rounded-full border border-stone-200 px-2 py-1 text-xs font-semibold text-stone-700">{item.truth_state}</span></div><p className="mt-2 leading-6 text-stone-600">{item.why_it_matters}</p></div>)}</div></details>
          <details className="rounded-2xl border border-stone-200 bg-stone-50 p-4"><summary className="cursor-pointer text-sm font-semibold text-stone-950">What would change my mind</summary><ul className="mt-3 space-y-2 text-sm leading-6 text-stone-700">{viewModel.WHAT_WOULD_CHANGE_MY_MIND.map((item) => <li key={item}>{item}</li>)}</ul></details>
        </aside>
      </div>
    </section>
  );
}
