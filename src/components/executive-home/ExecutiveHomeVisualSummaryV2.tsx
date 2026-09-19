import type { ReactNode } from "react";
import type {
  ExecutiveBusinessPulseMetricV1,
  ExecutiveCommandCenterTruthStateV1,
  ExecutiveHomeFixtureV1,
  ExecutiveIntelligenceCardV1
} from "@/lib/executive-home/fixtures";
import type { DashboardOverviewResponse } from "@/lib/types/dashboard";
import { DateRangeControls } from "@/components/dashboard/DateRangeControls";
import { formatRangeLabel } from "@/lib/date/range";
import { computeComparisonDateRange } from "@/lib/dashboard/performance-baseline";
import { HomeAskFormV1 } from "@/components/ask-jeeves/HomeAskFormV1";

const TRUTH_TONE: Record<ExecutiveCommandCenterTruthStateV1, string> = {
  KNOWN: "border-emerald-200 bg-emerald-50 text-emerald-800",
  INFERRED: "border-sky-200 bg-sky-50 text-sky-800",
  UNKNOWN: "border-amber-200 bg-amber-50 text-amber-800",
  STALE: "border-orange-200 bg-orange-50 text-orange-800",
  CONFLICTED: "border-rose-200 bg-rose-50 text-rose-800"
};

const SOURCE_SECTION_LIMIT = 4;

export type ExecutiveHomeVisualSummaryModelV2 = {
  businessPulse: ExecutiveBusinessPulseMetricV1[];
  primaryFocus: ExecutiveIntelligenceCardV1 | null;
  result: ExecutiveIntelligenceCardV1 | null;
  needsYouNow: ExecutiveIntelligenceCardV1[];
  biggestOpportunities: ExecutiveHomeFixtureV1["command_center"]["opportunities"];
  whatChanged: ExecutiveHomeFixtureV1["command_center"]["what_changed"];
  pulse: {
    approvalRequired: number;
    activeWork: number;
    opportunityCount: number;
    evidenceWatch: number;
    totalEvidenceSignals: number;
  };
};

function attentionBudgetedCards(data: ExecutiveHomeFixtureV1) {
  const sectionCounts = new Map<ExecutiveIntelligenceCardV1["section"], number>();
  return data.cards.filter((card) => {
    const count = sectionCounts.get(card.section) ?? 0;
    sectionCounts.set(card.section, count + 1);
    return count < SOURCE_SECTION_LIMIT;
  });
}

export function buildExecutiveHomeVisualSummaryV2(data: ExecutiveHomeFixtureV1): ExecutiveHomeVisualSummaryModelV2 {
  const attentionCards = attentionBudgetedCards(data);
  const approvalRequired = attentionCards.filter((card) => card.approval_state === "KEEGAN_ACTION_REQUIRED");
  const doNow = attentionCards.filter(
    (card) => card.priority === "DO_NOW" && !approvalRequired.some((approval) => approval.id === card.id)
  );
  const evidenceStates = [
    ...data.command_center.business_pulse.map((item) => item.truth_state),
    ...data.command_center.opportunities.map((item) => item.evidence)
  ];

  return {
    businessPulse: data.command_center.business_pulse.slice(0, 4),
    primaryFocus: data.cards.find((card) => card.section === "WHAT_MATTERS_NOW" && !/automation cadence|scheduler telemetry|data connection/i.test(`${card.title} ${card.summary} ${card.next_action}`)) ?? doNow.find((card) => !/automation cadence|scheduler telemetry|data connection/i.test(`${card.title} ${card.summary} ${card.next_action}`)) ?? null,
    result: data.cards.find((card) => card.section === "LEARNING_SINCE_LAST_REVIEW" && !/no verified|no measured|unavailable/i.test(`${card.title} ${card.summary}`)) ?? null,
    needsYouNow: [...approvalRequired, ...doNow].filter((card) => !/approval items require|review approval queue|automation cadence|scheduler telemetry/i.test(`${card.title} ${card.summary} ${card.next_action}`)).slice(0, 3),
    biggestOpportunities: data.command_center.opportunities.slice(0, 3),
    whatChanged: data.command_center.what_changed.filter((item) => item.truth_state === "KNOWN" && !/material movement may|industry pulse/i.test(`${item.label} ${item.why_it_matters}`)).slice(0, 3),
    pulse: {
      approvalRequired: approvalRequired.length,
      activeWork: data.command_center.do_now.filter((item) => item.state !== "COMPLETED").length,
      opportunityCount: data.command_center.opportunities.length,
      evidenceWatch: evidenceStates.filter((state) => state === "UNKNOWN" || state === "STALE" || state === "CONFLICTED").length,
      totalEvidenceSignals: evidenceStates.length
    }
  };
}

export function ExecutiveHomeVisualSummaryV2({
  data,
  reportingRange,
  decisionRoomId,
  onOpenDecisionRoom
}: {
  data: ExecutiveHomeFixtureV1;
  reportingRange?: DashboardOverviewResponse["range"];
  decisionRoomId?: string;
  onOpenDecisionRoom?: () => void;
}) {
  const model = buildExecutiveHomeVisualSummaryV2(data);
  const primaryChange = model.whatChanged[0] ?? null;
  const comparisonRange = reportingRange ? computeComparisonDateRange(reportingRange) : null;

  return (
    <section aria-label="Executive decision scan" data-testid="executive-home-visual-summary-v2" className="pb-6 pt-4 sm:pt-7">
      <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)] sm:p-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Mission Control</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-5xl">Your business, clearly.</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">See what changed, what matters now, and what the system is measuring next.</p>
          <HomeAskFormV1 reportingRange={reportingRange} />
          <p className="mt-2 text-xs text-slate-500">Type or speak a question and get an answer from your connected business data.</p>
        </div>
      </div>

      <section className="mt-5" aria-label="Business pulse">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Business pulse</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">The numbers that matter</h2><p className="mt-1 text-sm text-slate-500">{data.hero.range_label}{comparisonRange ? ` compared with ${formatRangeLabel(comparisonRange, { includeYear: true })}` : ""}</p></div>
          <a href="/data-evidence" className="text-xs font-semibold text-blue-700 underline-offset-4 hover:underline">Check sources</a>
        </div>
        {reportingRange ? <div className="mb-3"><DateRangeControls preset={reportingRange.preset} startDate={reportingRange.startDate} endDate={reportingRange.endDate} /></div> : null}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {model.businessPulse.map((metric) => <BusinessPulseCard key={metric.id} metric={metric} />)}
        </div>
      </section>

      {model.primaryFocus || model.result ? <div className={`mt-5 grid gap-4 ${model.primaryFocus && model.result ? "lg:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.75fr)]" : ""}`}>
        {model.primaryFocus ? <section id="current-direction" className="rounded-3xl border border-blue-200 bg-blue-950 p-5 text-white shadow-sm sm:p-7" aria-label="Current direction">
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">What matters now</p>{model.primaryFocus ? <PlainState state={model.primaryFocus.state} /> : null}</div>
          <h2 className="mt-4 max-w-3xl text-2xl font-semibold leading-tight tracking-[-0.025em] sm:text-3xl">{model.primaryFocus?.title ?? "No verified priority is ready"}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">{model.primaryFocus?.summary ?? "The system needs stronger evidence before recommending a move."}</p>
          <div className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-3">
            <DirectionStep label="What happened" value={primaryChange?.why_it_matters ?? "No material change is verified."} />
            <DirectionStep label="What we are doing" value={model.primaryFocus?.why ?? "Holding until the evidence is sufficient."} />
            <DirectionStep label="What comes next" value={model.primaryFocus?.next_action ?? "Review source coverage."} />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {decisionRoomId && onOpenDecisionRoom ? <button type="button" onClick={onOpenDecisionRoom} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-slate-100">See why</button> : null}
            <a href="/opportunities-actions" className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10">View actions</a>
          </div>
        </section> : null}

        {model.result ? <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="Result and learning">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Result so far</p>
          <h2 className="mt-3 text-lg font-semibold text-slate-950">{model.result?.title ?? "No measured result yet"}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{model.result?.summary ?? "Results will appear after an action has a verified outcome."}</p>
          <div className="mt-5 rounded-2xl bg-slate-100 p-4"><p className="text-xs font-semibold text-slate-500">What this changes</p><p className="mt-1 text-sm leading-6 text-slate-800">{model.result?.next_action ?? "Keep the next recommendation unchanged until evidence arrives."}</p></div>
          <a href="/learning" className="mt-4 inline-flex text-sm font-semibold text-slate-800 underline-offset-4 hover:underline">Open learning loop</a>
        </section> : null}
      </div> : null}

      {model.needsYouNow.length ? <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="Needs you now">
        <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Needs you now</p><h2 className="mt-1 text-lg font-semibold text-slate-950">Decisions and urgent moves</h2></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{model.needsYouNow.length}</span></div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">{model.needsYouNow.map((card) => <article key={card.id} className="rounded-2xl border border-slate-200 p-4"><p className="text-sm font-semibold text-slate-950">{card.title}</p><p className="mt-2 text-xs leading-5 text-slate-600">{card.next_action}</p></article>)}</div>
      </section> : null}

      {model.biggestOpportunities.length || model.whatChanged.length ? <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {model.biggestOpportunities.length ? <DecisionPanel title="Best opportunities" href="/opportunities-actions">
          {model.biggestOpportunities.length ? model.biggestOpportunities.map((opportunity) => <a key={opportunity.id} href={opportunity.detail_href} className="block rounded-2xl border border-slate-200 bg-white p-4 hover:border-slate-400"><p className="text-sm font-semibold text-slate-950">{opportunity.title}</p><p className="mt-1 text-xs leading-5 text-slate-600">{opportunity.next_move}</p></a>) : <CompactEmpty>No supported opportunity is ready.</CompactEmpty>}
        </DecisionPanel> : null}
        {model.whatChanged.length ? <DecisionPanel title="What changed" href="/data-evidence">
          {model.whatChanged.length ? model.whatChanged.map((item) => <article key={item.id} className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4"><div><p className="text-sm font-semibold text-slate-950">{item.label}</p><p className="mt-1 text-xs leading-5 text-slate-600">{item.why_it_matters}</p></div><TruthChip state={item.truth_state} /></article>) : <CompactEmpty>No material change is currently verified.</CompactEmpty>}
        </DecisionPanel> : null}
      </div> : null}
    </section>
  );
}

function BusinessPulseCard({ metric }: { metric: ExecutiveBusinessPulseMetricV1 }) {
  return <article className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><p className="text-xs font-semibold text-slate-600">{metric.label}</p><p className="mt-3 truncate text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{metric.value}</p><p className="mt-1 min-h-8 text-xs leading-4 text-slate-500">{metric.comparison}</p><MiniTrend values={metric.trend} label={`${metric.label} trend`} /></article>;
}

function MiniTrend({ values, label }: { values: Array<number | null>; label: string }) {
  const points = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (points.length < 2) return <div className="mt-4 h-8 border-t border-dashed border-slate-200 pt-2 text-[10px] text-slate-400">Trend unavailable</div>;
  const min = Math.min(...points);
  const spread = Math.max(...points) - min || 1;
  const coordinates = points.map((value, index) => `${(index / (points.length - 1)) * 100},${30 - ((value - min) / spread) * 26}`).join(" ");
  return <svg viewBox="0 0 100 32" preserveAspectRatio="none" role="img" aria-label={label} className="mt-3 h-8 w-full overflow-visible"><polyline points={coordinates} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" className="text-slate-800" /></svg>;
}

function DirectionStep({ label, value }: { label: string; value: string }) {
  return <div className="bg-[#0b1f33] p-4"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p><p className="mt-2 text-sm leading-6 text-slate-200">{value}</p></div>;
}

function DecisionPanel({ title, href, children }: { title: string; href: string; children: ReactNode }) {
  return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold text-slate-950">{title}</h2><a href={href} className="text-xs font-semibold text-blue-700 underline-offset-4 hover:underline">View all</a></div><div className="space-y-2">{children}</div></section>;
}

function PlainState({ state }: { state: ExecutiveIntelligenceCardV1["state"] }) {
  const label = state === "RECOMMENDATION" ? "Recommended" : state === "ACTION" ? "In motion" : state === "FACT" ? "Verified" : state.toLowerCase().replaceAll("_", " ");
  return <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold capitalize text-slate-200">{label}</span>;
}

function TruthChip({ state }: { state: ExecutiveCommandCenterTruthStateV1 }) {
  const label = state === "KNOWN" ? "Verified" : state === "INFERRED" ? "Needs confirmation" : state === "STALE" ? "Needs refresh" : state === "CONFLICTED" ? "Check data" : "Unavailable";
  return <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${TRUTH_TONE[state]}`}>{label}</span>;
}

function CompactEmpty({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm leading-6 text-slate-600">{children}</div>;
}
