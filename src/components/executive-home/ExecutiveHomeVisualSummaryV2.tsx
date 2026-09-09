import type { ReactNode } from "react";
import type {
  ExecutiveCommandCenterTruthStateV1,
  ExecutiveHomeFixtureV1,
  ExecutiveIntelligenceCardV1
} from "@/lib/executive-home/fixtures";

const TRUTH_TONE: Record<ExecutiveCommandCenterTruthStateV1, string> = {
  KNOWN: "border-emerald-200 bg-emerald-50 text-emerald-900",
  INFERRED: "border-sky-200 bg-sky-50 text-sky-900",
  UNKNOWN: "border-amber-200 bg-amber-50 text-amber-900",
  STALE: "border-orange-200 bg-orange-50 text-orange-900",
  CONFLICTED: "border-rose-200 bg-rose-50 text-rose-900"
};

export type ExecutiveHomeVisualSummaryModelV2 = {
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

export function buildExecutiveHomeVisualSummaryV2(
  data: ExecutiveHomeFixtureV1
): ExecutiveHomeVisualSummaryModelV2 {
  const approvalRequired = data.cards.filter(
    (card) => card.approval_state === "KEEGAN_ACTION_REQUIRED"
  );
  const doNow = data.cards.filter(
    (card) =>
      card.priority === "DO_NOW" &&
      !approvalRequired.some((approval) => approval.id === card.id)
  );
  const needsYouNow = [...approvalRequired, ...doNow].slice(0, 3);
  const biggestOpportunities = data.command_center.opportunities.slice(0, 3);
  const whatChanged = data.command_center.what_changed.slice(0, 3);
  const activeWork = data.command_center.do_now.filter(
    (item) => item.state !== "COMPLETED"
  ).length;
  const evidenceStates = [
    ...data.command_center.kpis.map((item) => item.truth_state),
    ...data.command_center.opportunities.map((item) => item.evidence)
  ];
  const evidenceWatch = evidenceStates.filter(
    (state) => state === "UNKNOWN" || state === "STALE" || state === "CONFLICTED"
  ).length;

  return {
    needsYouNow,
    biggestOpportunities,
    whatChanged,
    pulse: {
      approvalRequired: approvalRequired.length,
      activeWork,
      opportunityCount: data.command_center.opportunities.length,
      evidenceWatch,
      totalEvidenceSignals: evidenceStates.length
    }
  };
}

export function ExecutiveHomeVisualSummaryV2({ data }: { data: ExecutiveHomeFixtureV1 }) {
  const model = buildExecutiveHomeVisualSummaryV2(data);
  const watchPercent = model.pulse.totalEvidenceSignals === 0
    ? 0
    : Math.round((model.pulse.evidenceWatch / model.pulse.totalEvidenceSignals) * 100);

  return (
    <section
      aria-label="Executive decision scan"
      data-testid="executive-home-visual-summary-v2"
      className="mx-auto w-full max-w-[1600px] px-4 pb-5 pt-5 sm:px-6 lg:px-8"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
            Mission Control
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-stone-950 md:text-4xl">
            {data.hero.title}
          </h1>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Business pulse">
          <PulseMetric label="Needs approval" value={model.pulse.approvalRequired} />
          <PulseMetric label="Active work" value={model.pulse.activeWork} />
          <PulseMetric label="Opportunities" value={model.pulse.opportunityCount} />
          <PulseMetric label="Evidence watch" value={model.pulse.evidenceWatch} />
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.15fr_1.15fr_0.9fr]">
        <DecisionPanel title="Needs you now" count={model.needsYouNow.length}>
          {model.needsYouNow.length ? (
            <div className="space-y-2">
              {model.needsYouNow.map((card) => (
                <article key={card.id} className="rounded-2xl border border-stone-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-stone-950">{card.title}</p>
                      <p className="mt-1 text-xs leading-5 text-stone-600">{card.next_action}</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-stone-200 bg-stone-50 px-2 py-1 text-[11px] font-semibold text-stone-700">
                      {card.approval_state === "KEEGAN_ACTION_REQUIRED" ? "APPROVAL" : card.priority}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <CompactEmpty>No approval or immediate decision is currently required.</CompactEmpty>
          )}
        </DecisionPanel>

        <DecisionPanel title="Biggest opportunities" count={model.biggestOpportunities.length}>
          {model.biggestOpportunities.length ? (
            <div className="space-y-2">
              {model.biggestOpportunities.map((opportunity) => (
                <a
                  key={opportunity.id}
                  href={opportunity.detail_href}
                  className="block rounded-2xl border border-stone-200 bg-white p-4 transition hover:border-stone-300"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-stone-950">{opportunity.title}</p>
                    <TruthChip state={opportunity.evidence} />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-stone-600">
                    <span>{opportunity.fit}</span>
                    <span>{opportunity.timing}</span>
                    <span>{opportunity.upside}</span>
                    <span>{opportunity.effort}</span>
                  </div>
                  <p className="mt-2 text-xs font-medium leading-5 text-stone-800">{opportunity.next_move}</p>
                </a>
              ))}
            </div>
          ) : (
            <CompactEmpty>No supported opportunity is ready for Executive Home.</CompactEmpty>
          )}
        </DecisionPanel>

        <div className="space-y-4">
          <DecisionPanel title="What changed" count={model.whatChanged.length}>
            {model.whatChanged.length ? (
              <div className="space-y-2">
                {model.whatChanged.map((item) => (
                  <article key={item.id} className="rounded-2xl border border-stone-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-stone-950">{item.label}</p>
                        <p className="mt-1 text-xs leading-5 text-stone-600">{item.why_it_matters}</p>
                      </div>
                      <TruthChip state={item.truth_state} />
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <CompactEmpty>No material change is currently verified.</CompactEmpty>
            )}
          </DecisionPanel>

          <div className="rounded-3xl border border-stone-200 bg-[#fffdf8] p-4 shadow-sm" aria-label="Evidence pulse">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Evidence pulse</p>
                <p className="mt-1 text-sm font-semibold text-stone-950">
                  {model.pulse.evidenceWatch} of {model.pulse.totalEvidenceSignals} signals need verification
                </p>
              </div>
              <span className="text-lg font-semibold tabular-nums text-stone-950">{watchPercent}%</span>
            </div>
            <div
              className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200"
              role="img"
              aria-label={`${model.pulse.evidenceWatch} of ${model.pulse.totalEvidenceSignals} evidence signals are unknown, stale, or conflicted`}
            >
              <div className="h-full rounded-full bg-stone-700" style={{ width: `${watchPercent}%` }} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PulseMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-28 rounded-2xl border border-stone-200 bg-white px-3 py-2 shadow-sm">
      <div className="text-xl font-semibold tabular-nums text-stone-950">{value}</div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-stone-500">{label}</div>
    </div>
  );
}

function DecisionPanel({
  title,
  count,
  children
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-stone-200 bg-[#fffdf8] p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-stone-950">{title}</h2>
        <span className="rounded-full border border-stone-200 bg-white px-2 py-1 text-[11px] font-semibold text-stone-600">
          {count}
        </span>
      </div>
      {children}
    </section>
  );
}

function TruthChip({ state }: { state: ExecutiveCommandCenterTruthStateV1 }) {
  return (
    <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${TRUTH_TONE[state]}`}>
      {state}
    </span>
  );
}

function CompactEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-4 text-sm leading-6 text-stone-600">
      {children}
    </div>
  );
}
