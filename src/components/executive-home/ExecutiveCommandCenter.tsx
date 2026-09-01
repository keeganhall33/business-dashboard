"use client";

import type React from "react";
import { useMemo, useState } from "react";
import {
  advanceExecutiveStrategyStepV1,
  type ExecutiveCommandCenterKpiV1,
  type ExecutiveCommandCenterTruthStateV1,
  type ExecutiveCommandCenterV1,
  type ExecutiveExecutionStepV1
} from "@/lib/executive-home/fixtures";
import {
  getSpecialistCommandCenterCardsV1,
  type SpecialistCommandCenterCardV1,
  type SpecialistCommandCenterFreshnessV1,
  type SpecialistCommandCenterTruthStateV1
} from "@/lib/executive-home/specialist-command-center";

const truthStyles: Record<ExecutiveCommandCenterTruthStateV1, string> = {
  KNOWN: "border-emerald-200 bg-emerald-50 text-emerald-900",
  INFERRED: "border-sky-200 bg-sky-50 text-sky-900",
  UNKNOWN: "border-amber-200 bg-amber-50 text-amber-900",
  STALE: "border-orange-200 bg-orange-50 text-orange-900",
  CONFLICTED: "border-rose-200 bg-rose-50 text-rose-900"
};

const specialistTruthStyles: Record<SpecialistCommandCenterTruthStateV1, string> = truthStyles;
const freshnessStyles: Record<SpecialistCommandCenterFreshnessV1, string> = {
  CURRENT: "border-emerald-200 bg-emerald-50 text-emerald-900",
  STALE: "border-orange-200 bg-orange-50 text-orange-900",
  CONFLICTED: "border-rose-200 bg-rose-50 text-rose-900",
  UNKNOWN: "border-amber-200 bg-amber-50 text-amber-900"
};

export function ExecutiveCommandCenter({
  data,
  onOpenDecisionRoom
}: {
  data: ExecutiveCommandCenterV1;
  onOpenDecisionRoom?: (decisionRoomId: string) => void;
}) {
  const [commandCenter, setCommandCenter] = useState(data);
  const [activeDetailId, setActiveDetailId] = useState<string | null>(null);
  const specialistCards = useMemo(() => getSpecialistCommandCenterCardsV1(), []);
  const activeDetail = useMemo(() => detailFor(commandCenter, activeDetailId, specialistCards), [commandCenter, activeDetailId, specialistCards]);

  function completeCurrentStep() {
    setCommandCenter((current) =>
      advanceExecutiveStrategyStepV1(current, current.strategy_path.current_step_id, "2026-08-23T12:00:00.000Z", "KEEGAN")
    );
  }

  return (
    <section className="bg-[#f8f4ec] text-stone-950" aria-label="Executive command center">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {commandCenter.kpis.map((kpi) => (
            <button
              key={kpi.id}
              type="button"
              onClick={() => setActiveDetailId(kpi.id)}
              className="min-h-36 rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">{kpi.label}</span>
                <TruthPill state={kpi.truth_state} />
              </div>
              <div className="mt-3 text-2xl font-semibold tracking-normal text-stone-950">{kpi.value}</div>
              <Sparkline values={kpi.trend} />
              <p className="mt-2 line-clamp-2 text-sm leading-5 text-stone-600">{kpi.detail}</p>
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_1.4fr_1fr]">
          <Panel title="What changed" subtitle="Material shifts only; missing evidence stays explicit.">
            <div className="grid gap-3 sm:grid-cols-2">
              {commandCenter.what_changed.map((item) => (
                <button key={item.id} type="button" onClick={() => setActiveDetailId(item.id)} className="rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-base font-semibold text-stone-950">{item.label}</h3>
                    <TruthPill state={item.truth_state} />
                  </div>
                  <div className="mt-2 text-3xl font-semibold text-stone-950">{item.value}</div>
                  <Sparkline values={item.trend} />
                  <p className="mt-2 text-sm leading-5 text-stone-600">{item.why_it_matters}</p>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Strategy and next steps" subtitle={commandCenter.strategy_path.dependency_note}>
            <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Current initiative</p>
                  <h3 className="mt-1 text-xl font-semibold text-stone-950">{commandCenter.strategy_path.title}</h3>
                </div>
                <button
                  type="button"
                  onClick={completeCurrentStep}
                  className="rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-stone-300"
                  disabled={!commandCenter.strategy_path.steps.some((step) => step.id === commandCenter.strategy_path.current_step_id && step.state === "IN_PROGRESS")}
                >
                  Mark current step complete
                </button>
              </div>
              <div className="mt-5 space-y-3">
                {commandCenter.strategy_path.steps.map((step, index) => (
                  <StepRow key={step.id} step={step} index={index} />
                ))}
              </div>
              <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Completion history</p>
                {commandCenter.strategy_path.history.length ? (
                  <ul className="mt-2 space-y-2 text-sm leading-5 text-stone-700">
                    {commandCenter.strategy_path.history.map((entry) => (
                      <li key={`${entry.step_id}-${entry.changed_at}`}>{entry.changed_at}: {entry.actor} moved {entry.step_id} from {entry.from_state} to {entry.to_state}. {entry.provenance}. {entry.note}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-stone-600">No step has been explicitly completed yet.</p>
                )}
              </div>
            </div>
          </Panel>

          <Panel title="Do now" subtitle="Operational work, separated from Keegan approvals.">
            <div className="space-y-3">
              {commandCenter.do_now.map((item) => (
                <article key={item.id} className="rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-sm">
                  <button type="button" onClick={() => setActiveDetailId(item.id)} className="w-full text-left">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-sm font-semibold text-stone-950">{item.label}</h3>
                      <span className="rounded-full border border-stone-200 bg-stone-50 px-2 py-1 text-[11px] font-semibold text-stone-700">{item.state}</span>
                    </div>
                    <ProgressBar value={item.progress} />
                    <p className="mt-2 text-sm leading-5 text-stone-600">{item.detail}</p>
                  </button>
                  <a href="/action-workspace" className="mt-3 inline-flex rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-800">
                    Open Action Workspace
                  </a>
                </article>
              ))}
            </div>
          </Panel>
        </div>

        <Panel title="Specialist intelligence" subtitle="Decision-changing specialist signals with grounded drill-downs.">
          <div className="grid gap-3 lg:grid-cols-3">
            {specialistCards.map((card) => (
              <article key={card.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-semibold text-stone-950">{card.title}</h3>
                  <div className="flex flex-wrap justify-end gap-2">
                    <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${specialistTruthStyles[card.truth_state]}`}>{card.truth_state}</span>
                    <button
                      type="button"
                      onClick={() => setActiveDetailId(`specialist-evidence:${card.id}`)}
                      className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${freshnessStyles[card.evidence_freshness]}`}
                      aria-label={`${card.title} evidence freshness ${card.evidence_freshness}`}
                    >
                      {card.evidence_freshness}
                    </button>
                  </div>
                </div>
                <dl className="mt-4 space-y-3 text-sm leading-6">
                  <SpecialistDetail label="WHAT_CHANGED" value={card.what_changed} />
                  <SpecialistDetail label="WHY_IT_MATTERS" value={card.why_it_matters} />
                  <SpecialistDetail label="NEXT_BEST_ACTION" value={card.next_best_action} />
                  <SpecialistDetail label="EVIDENCE" value={card.evidence} />
                  <SpecialistDetail label="FRESHNESS" value={card.evidence_context.freshness_detail} />
                  {card.approval_class ? <SpecialistDetail label="Approval class" value={card.approval_class} /> : null}
                  <SpecialistDetail label="Confidence" value={card.confidence} />
                  <SpecialistDetail label="Gap / risk" value={card.material_gap_or_risk} />
                </dl>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-semibold text-stone-700">Source: {card.source}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {card.decision_room_id && onOpenDecisionRoom ? (
                      <a
                        href="#decision-room-drilldown"
                        onClick={() => onOpenDecisionRoom(card.decision_room_id!)}
                        className="rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white"
                      >
                        Review in Decision Room
                      </a>
                    ) : null}
                    <a href={card.detail_href} className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800">
                      Open detail
                    </a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </Panel>

        <div className="mt-5 grid gap-5 lg:grid-cols-2 xl:grid-cols-4">
          <Panel title="Keegan action required" subtitle="Approvals stay separate from awareness.">
            {commandCenter.keegan_actions.map((action) => (
              <div key={action.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-semibold text-stone-950">{action.label}</h3>
                  <span className="rounded-full border border-stone-200 bg-stone-50 px-2 py-1 text-[11px] font-semibold text-stone-700">{action.approval_state}</span>
                </div>
                <p className="mt-2 text-sm leading-5 text-stone-600">{action.detail}</p>
              </div>
            ))}
          </Panel>

          <Panel title="Top opportunities" subtitle="Comparison without fake precision.">
            {commandCenter.opportunities.map((opportunity) => (
              <a key={opportunity.id} href={opportunity.detail_href} className="block rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-semibold text-stone-950">{opportunity.title}</h3>
                  <TruthPill state={opportunity.evidence} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <MiniMetric label="Upside" value={opportunity.upside} />
                  <MiniMetric label="Fit" value={opportunity.fit} />
                  <MiniMetric label="Timing" value={opportunity.timing} />
                  <MiniMetric label="Effort" value={opportunity.effort} />
                </div>
                <p className="mt-3 text-sm leading-5 text-stone-600">{opportunity.next_move}</p>
              </a>
            ))}
          </Panel>

          <Panel title="System at a glance" subtitle="Projects, insights, decisions, sources.">
            <div className="grid grid-cols-2 gap-2">
              {commandCenter.system_glance.map((item) => (
                <button key={item.id} type="button" onClick={() => setActiveDetailId(item.id)} className="rounded-2xl border border-stone-200 bg-white p-3 text-left shadow-sm">
                  <TruthPill state={item.truth_state} />
                  <div className="mt-2 text-xl font-semibold text-stone-950">{item.value}</div>
                  <div className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">{item.label}</div>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Intelligence engine" subtitle="Lane status without noise.">
            <div className="space-y-2">
              {commandCenter.intelligence_engine.map((lane) => (
                <div key={lane.id} className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
                  <div>
                    <div className="text-sm font-semibold text-stone-950">{lane.lane}</div>
                    <div className="text-xs text-stone-600">{lane.status}</div>
                  </div>
                  <TruthPill state={lane.truth_state} />
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      {activeDetail ? (
        <div className="fixed inset-0 z-50 bg-stone-950/20 p-0 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label={`${activeDetail.label} detail`}>
          <div className="ml-auto flex h-full w-full flex-col overflow-auto border-l border-stone-200 bg-[#fffdf8] p-5 shadow-2xl sm:max-w-xl sm:rounded-l-3xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Drill-down</p>
                <h2 className="mt-1 text-2xl font-semibold text-stone-950">{activeDetail.label}</h2>
              </div>
              <button type="button" onClick={() => setActiveDetailId(null)} className="rounded-full border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-800">
                Close
              </button>
            </div>
            <div className="mt-5 space-y-4 text-sm leading-6 text-stone-700">
              <DetailRow label="Current state" value={activeDetail.value} />
              <DetailRow label="Source / provenance" value={activeDetail.source} />
              <DetailRow label="Last updated" value={activeDetail.lastUpdated ?? "UNKNOWN"} />
              <DetailRow label="Truth state" value={activeDetail.truthState} />
              <DetailRow label="Why it matters" value={activeDetail.detail} />
              <DetailRow label="Unknowns / conflicts" value={activeDetail.truthState === "KNOWN" ? "No explicit conflict in this view." : `${activeDetail.truthState} is preserved and not converted to zero or false.`} />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-stone-200 bg-[#fffdf8] p-4 shadow-sm">
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-stone-950">{title}</h2>
        <p className="mt-1 text-sm leading-5 text-stone-600">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function StepRow({ step, index }: { step: ExecutiveExecutionStepV1; index: number }) {
  return (
    <div className="grid gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-3 sm:grid-cols-[2rem_1fr_auto] sm:items-start">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-950 text-sm font-semibold text-white">{index + 1}</div>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-semibold text-stone-950">{step.label}</h4>
          <span className="rounded-full border border-stone-200 bg-white px-2 py-1 text-[11px] font-semibold text-stone-700">{step.state}</span>
          {step.requires_verification ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900">needs verification</span> : null}
        </div>
        <p className="mt-1 text-sm leading-5 text-stone-600">{step.why_it_matters}</p>
        {step.dependency_ids.length ? <p className="mt-1 text-xs text-stone-500">Depends on: {step.dependency_ids.join(", ")}</p> : null}
      </div>
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">{step.provenance}</div>
    </div>
  );
}

function TruthPill({ state }: { state: ExecutiveCommandCenterTruthStateV1 }) {
  return <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${truthStyles[state]}`}>{state}</span>;
}

function Sparkline({ values }: { values: Array<number | null> }) {
  const usable = values.some((value) => typeof value === "number");
  return (
    <div className="mt-4 flex h-10 items-end gap-1" aria-label={usable ? "trend" : "trend unavailable"}>
      {values.map((value, index) => (
        <span
          key={`${value ?? "unknown"}-${index}`}
          className={`w-full rounded-t ${value == null ? "h-2 bg-stone-200" : "bg-stone-900"}`}
          style={{ height: value == null ? 8 : Math.max(10, Math.min(40, Number(value))) }}
        />
      ))}
    </div>
  );
}

function ProgressBar({ value }: { value: number | null }) {
  return (
    <div className="mt-3 h-2 rounded-full bg-stone-100">
      <div className="h-2 rounded-full bg-stone-950" style={{ width: value == null ? "0%" : `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">{label}</div>
      <div className="mt-1 font-semibold text-stone-950">{value}</div>
    </div>
  );
}

function SpecialistDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">{label}</dt>
      <dd className="mt-1 text-stone-700">{value}</dd>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-3">
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">{label}</div>
      <div className="mt-1 text-stone-800">{value}</div>
    </div>
  );
}

function detailFor(data: ExecutiveCommandCenterV1, id: string | null, specialistCards: SpecialistCommandCenterCardV1[] = []) {
  if (!id) return null;
  if (id.startsWith("specialist-evidence:")) {
    const specialistId = id.replace("specialist-evidence:", "");
    const card = specialistCards.find((item) => item.id === specialistId);
    if (card) {
      return {
        label: `${card.title} evidence freshness`,
        value: card.evidence_freshness,
        source: card.evidence_context.source_label,
        lastUpdated: card.evidence_context.last_updated,
        truthState: card.truth_state,
        detail: `${card.evidence_context.freshness_detail} ${card.evidence_context.truth_detail}`
      };
    }
  }
  const kpi = data.kpis.find((item) => item.id === id);
  if (kpi) return detailFromKpi(kpi);
  const changed = data.what_changed.find((item) => item.id === id);
  if (changed) return { label: changed.label, value: changed.value, source: "dashboard change model", lastUpdated: data.generated_at, truthState: changed.truth_state, detail: changed.why_it_matters };
  const action = data.do_now.find((item) => item.id === id);
  if (action) return { label: action.label, value: action.state, source: "execution queue", lastUpdated: data.generated_at, truthState: "INFERRED" as const, detail: action.detail };
  const glance = data.system_glance.find((item) => item.id === id);
  if (glance) return { label: glance.label, value: glance.value, source: glance.source, lastUpdated: data.generated_at, truthState: glance.truth_state, detail: "System-at-a-glance metric from the existing dashboard view model." };
  return null;
}

function detailFromKpi(kpi: ExecutiveCommandCenterKpiV1) {
  return { label: kpi.label, value: kpi.value, source: kpi.source, lastUpdated: kpi.last_updated, truthState: kpi.truth_state, detail: kpi.detail };
}
