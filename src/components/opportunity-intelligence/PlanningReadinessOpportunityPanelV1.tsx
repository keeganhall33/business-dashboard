import {
  evaluateOpportunityPlanningReadinessV1,
  type OpportunityPlanningReadinessInputV1,
  type OpportunityPlanningReadinessResultV1,
  type OpportunityTruthStateV1
} from "@/lib/opportunity-intelligence/planning-readiness-v1";

export type PlanningReadinessOpportunityCardV1 = {
  title: string;
  context: string;
  result: OpportunityPlanningReadinessResultV1;
};

const DETECTED_AT = "2026-09-08T18:10:00.000Z";

function daysAfter(days: number): string {
  return new Date(Date.parse(DETECTED_AT) + days * 86_400_000).toISOString();
}

function baseInput(
  opportunityId: string,
  overrides: Partial<OpportunityPlanningReadinessInputV1> = {}
): OpportunityPlanningReadinessInputV1 {
  return {
    opportunityId,
    now: DETECTED_AT,
    detectedAt: DETECTED_AT,
    engageBy: daysAfter(30),
    deliverBy: daysAfter(120),
    planningSignalClass: "ATHLETE_BRAND_CAMPAIGN",
    artworkClass: "STANDARD_ORIGINAL",
    productionWindowDays: { minDays: 45, maxDays: 75 },
    capacityFit: "FIT",
    differentiationRole: "STRATEGIC_COLLABORATOR",
    economics: {
      originalSaleAllowed: "YES",
      printProceedsDonation: "NO",
      sponsorUnderwriting: "NO",
      artistFeeCostRecovery: "YES",
      smallerFasterWorkOption: "YES"
    },
    strategicUpside: {
      access: "HIGH",
      prestige: "HIGH",
      relationship: "HIGH",
      charityImpact: "LOW"
    },
    collectibles: {
      genericSketchCard: "NO",
      differentiatedRecurringPlatform: "NO",
      licensingAdvantage: "NO",
      marqueeRelationshipAccess: "NO"
    },
    evidenceRefs: [`evidence:${opportunityId}:brief`, `evidence:${opportunityId}:timing`],
    truthState: "KNOWN",
    ...overrides
  };
}

function card(
  title: string,
  context: string,
  input: OpportunityPlanningReadinessInputV1
): PlanningReadinessOpportunityCardV1 {
  return { title, context, result: evaluateOpportunityPlanningReadinessV1(input) };
}

export const PLANNING_READINESS_OPPORTUNITY_FIXTURES_V1: readonly PlanningReadinessOpportunityCardV1[] = [
  card("Early museum exhibition", "Start the long planning runway while the major-original window is still viable.", baseInput("museum-early", {
    planningSignalClass: "MUSEUM_EXHIBITION",
    engageBy: daysAfter(90),
    deliverBy: daysAfter(273),
    artworkClass: "MAJOR_ORIGINAL",
    productionWindowDays: { minDays: 120, maxDays: 210 },
    differentiationRole: "EXCLUSIVE_OR_FEATURED_ARTIST"
  })),
  card("Athlete and brand campaign", "Protect concept and production time for a differentiated collaboration.", baseInput("athlete-brand", {
    engageBy: daysAfter(60),
    deliverBy: daysAfter(181),
    productionWindowDays: { minDays: 60, maxDays: 100 },
    capacityFit: "TIGHT"
  })),
  card("Late major-original request", "The supported production window is already longer than the available runway.", baseInput("late-major-original", {
    planningSignalClass: "EVENT_FESTIVAL",
    engageBy: daysAfter(3),
    deliverBy: daysAfter(17),
    artworkClass: "MAJOR_ORIGINAL",
    productionWindowDays: { minDays: 75, maxDays: 150 },
    capacityFit: "NOT_FIT",
    economics: {
      originalSaleAllowed: "YES",
      printProceedsDonation: "NO",
      sponsorUnderwriting: "NO",
      artistFeeCostRecovery: "NO",
      smallerFasterWorkOption: "NO"
    }
  })),
  card("Existing-art short window", "A bounded activation can fit without creating a new original.", baseInput("existing-art-short-window", {
    planningSignalClass: "EVENT_FESTIVAL",
    engageBy: daysAfter(4),
    deliverBy: daysAfter(12),
    artworkClass: "EXISTING_ARTWORK",
    productionWindowDays: { minDays: 0, maxDays: 5 }
  })),
  card("Crowded gallery open call", "Commodity positioning limits strategic value without exceptional evidence.", baseInput("crowded-gallery", {
    planningSignalClass: "GALLERY_OPEN_CALL",
    differentiationRole: "ONE_OF_MANY_INTERCHANGEABLE_ARTISTS",
    strategicUpside: { access: "LOW", prestige: "LOW", relationship: "LOW", charityImpact: "LOW" },
    economics: {
      originalSaleAllowed: "YES",
      printProceedsDonation: "NO",
      sponsorUnderwriting: "NO",
      artistFeeCostRecovery: "NO",
      smallerFasterWorkOption: "NO"
    }
  })),
  card("Attractive charity structure", "Original-sale permission and donated print proceeds preserve an attractive structure.", baseInput("charity-attractive", {
    planningSignalClass: "CHARITY_BENEFIT",
    economics: {
      originalSaleAllowed: "YES",
      printProceedsDonation: "YES",
      sponsorUnderwriting: "NO",
      artistFeeCostRecovery: "NO",
      smallerFasterWorkOption: "YES"
    },
    strategicUpside: { access: "MEDIUM", prestige: "MEDIUM", relationship: "HIGH", charityImpact: "HIGH" }
  })),
  card("Uncompensated donated original", "High production demand is unsupported by recovery or exceptional upside.", baseInput("charity-uncompensated", {
    planningSignalClass: "CHARITY_BENEFIT",
    artworkClass: "MAJOR_ORIGINAL",
    productionWindowDays: { minDays: 120, maxDays: 240 },
    deliverBy: daysAfter(240),
    economics: {
      originalSaleAllowed: "NO",
      printProceedsDonation: "YES",
      sponsorUnderwriting: "NO",
      artistFeeCostRecovery: "NO",
      smallerFasterWorkOption: "NO"
    },
    strategicUpside: { access: "LOW", prestige: "LOW", relationship: "LOW", charityImpact: "MEDIUM" }
  })),
  card("Generic sketch-card request", "A one-off commodity card does not establish strategic differentiation.", baseInput("generic-sketch-card", {
    planningSignalClass: "COLLECTIBLES_PLATFORM",
    artworkClass: "SMALL_FAST_ORIGINAL",
    productionWindowDays: { minDays: 2, maxDays: 7 },
    differentiationRole: "ONE_OF_MANY_INTERCHANGEABLE_ARTISTS",
    collectibles: {
      genericSketchCard: "YES",
      differentiatedRecurringPlatform: "NO",
      licensingAdvantage: "NO",
      marqueeRelationshipAccess: "NO"
    },
    strategicUpside: { access: "LOW", prestige: "LOW", relationship: "LOW", charityImpact: "LOW" }
  })),
  card("Recurring collectibles platform", "Recurring, licensing, and relationship evidence creates differentiated upside.", baseInput("recurring-collectibles", {
    planningSignalClass: "COLLECTIBLES_PLATFORM",
    artworkClass: "SMALL_FAST_ORIGINAL",
    productionWindowDays: { minDays: 3, maxDays: 10 },
    differentiationRole: "STRATEGIC_COLLABORATOR",
    collectibles: {
      genericSketchCard: "YES",
      differentiatedRecurringPlatform: "YES",
      licensingAdvantage: "YES",
      marqueeRelationshipAccess: "YES"
    },
    strategicUpside: { access: "HIGH", prestige: "MEDIUM", relationship: "HIGH", charityImpact: "LOW" }
  }))
];

export const PLANNING_READINESS_TRUTH_GUARDRAILS_V1: readonly OpportunityPlanningReadinessResultV1[] = (
  ["UNKNOWN", "STALE", "CONFLICTED"] as const satisfies readonly OpportunityTruthStateV1[]
).map((truthState) => evaluateOpportunityPlanningReadinessV1(baseInput(`truth-${truthState.toLowerCase()}`, {
  truthState,
  evidenceRefs: [`evidence:truth:${truthState.toLowerCase()}`]
})));

function humanize(value: string): string {
  return value.replaceAll("_", " ");
}

function eligibilityTone(eligibility: OpportunityPlanningReadinessResultV1["eligibility"]): string {
  if (eligibility === "ACTIONABLE") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (eligibility === "PREPARE_EARLY") return "border-sky-200 bg-sky-50 text-sky-800";
  if (eligibility === "DEPRIORITIZE") return "border-rose-200 bg-rose-50 text-rose-800";
  if (eligibility === "UNKNOWN") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-stone-300 bg-stone-100 text-stone-800";
}

function recommendedTiming(result: OpportunityPlanningReadinessResultV1): string {
  switch (result.eligibility) {
    case "ACTIONABLE": return "Evaluate now within the supported window";
    case "PREPARE_EARLY": return "Begin preparation before the window compresses";
    case "MONITOR": return "Monitor for stronger evidence";
    case "DEPRIORITIZE": return "Do not allocate scarce production capacity now";
    default: return "Verify evidence before choosing timing";
  }
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-stone-900">{humanize(value)}</dd>
    </div>
  );
}

function OpportunityCard({ item }: { item: PlanningReadinessOpportunityCardV1 }) {
  const { result } = item;
  return (
    <article className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${eligibilityTone(result.eligibility)}`}>
          {humanize(result.eligibility)}
        </span>
        <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-semibold text-stone-700">
          {result.truthState}
        </span>
        {result.missedPlanningWindow ? (
          <span className="rounded-full border border-rose-300 bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-900">MISSED WINDOW</span>
        ) : null}
      </div>
      <h3 className="mt-4 text-xl font-semibold tracking-tight text-stone-950">{item.title}</h3>
      <p className="mt-2 text-sm leading-6 text-stone-600">{item.context}</p>

      <dl className="mt-4 grid grid-cols-2 gap-2">
        <Metric label="Runway" value={result.planningRunwayDays == null ? "UNKNOWN" : `${result.planningRunwayDays} days`} />
        <Metric label="Production" value={result.productionDemand} />
        <Metric label="Capacity" value={result.capacityFit} />
        <Metric label="Minimum activation" value={result.minimumViableActivation} />
        <Metric label="Differentiation" value={result.differentiationRole} />
        <Metric label="Crowding risk" value={result.crowdingRisk} />
      </dl>

      <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-700">Recommended timing</p>
        <p className="mt-1 text-sm font-semibold text-violet-950">{recommendedTiming(result)}</p>
        <p className="mt-2 text-xs leading-5 text-violet-900">{result.reasons[0]}</p>
      </div>

      <div className="mt-3 rounded-2xl border border-stone-200 bg-[#fffdf8] p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">Strategic upside and economics</p>
        <p className="mt-1 text-sm font-semibold text-stone-900">{humanize(result.netStrategicEconomics)}</p>
        <p className="mt-2 text-xs leading-5 text-stone-600">Qualitative evidence only. No invented revenue, price, buyer, or certainty.</p>
      </div>

      <details className="mt-4 rounded-2xl border border-stone-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-stone-900">Why now, evidence, and what would change</summary>
        <div className="mt-3 space-y-3 text-xs leading-5 text-stone-700">
          <div>
            <p className="font-semibold text-stone-900">Why now</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">{result.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
          </div>
          <div>
            <p className="font-semibold text-stone-900">What would change the recommendation</p>
            {result.whatWouldChange.length ? (
              <ul className="mt-1 list-disc space-y-1 pl-5">{result.whatWouldChange.map((change) => <li key={change}>{change}</li>)}</ul>
            ) : <p className="mt-1">No supported change condition is currently required.</p>}
          </div>
          <p><span className="font-semibold text-stone-900">Evidence:</span> {result.evidenceRefs.join(" · ")}</p>
        </div>
      </details>
    </article>
  );
}

export function PlanningReadinessOpportunityPanelV1({
  opportunities = PLANNING_READINESS_OPPORTUNITY_FIXTURES_V1,
  truthGuardrails = PLANNING_READINESS_TRUTH_GUARDRAILS_V1
}: {
  opportunities?: readonly PlanningReadinessOpportunityCardV1[];
  truthGuardrails?: readonly OpportunityPlanningReadinessResultV1[];
}) {
  const actionable = opportunities.filter((item) => item.result.eligibility === "ACTIONABLE").length;
  const prepare = opportunities.filter((item) => item.result.eligibility === "PREPARE_EARLY").length;
  const deprioritize = opportunities.filter((item) => item.result.eligibility === "DEPRIORITIZE").length;

  return (
    <section aria-label="Opportunity planning readiness" data-testid="planning-readiness-opportunity-panel-v1" data-visual-mode="light" className="bg-[#f8f4ec] px-4 py-8 text-stone-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-[2rem] border border-stone-200 bg-[#fffdf8] p-5 shadow-sm md:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Opportunity intelligence · planning readiness</p>
          <div className="mt-3 grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight md:text-4xl">Choose the right work before the window closes</h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-700 md:text-base">Read-only planning guidance combines runway, production fit, differentiation, and supported economics. It proposes timing without outreach, scheduling, or autonomous action.</p>
            </div>
            <div className="grid grid-cols-3 gap-2" aria-label="Opportunity readiness summary">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-center"><strong className="block text-xl">{actionable}</strong><span className="text-xs">Act now</span></div>
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-center"><strong className="block text-xl">{prepare}</strong><span className="text-xs">Prepare</span></div>
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-center"><strong className="block text-xl">{deprioritize}</strong><span className="text-xs">Protect time</span></div>
            </div>
          </div>
        </header>

        <section aria-label="Evidence truth guardrails" className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-4 md:p-5">
          <h3 className="text-lg font-semibold text-amber-950">Evidence truth stays visible</h3>
          <p className="mt-1 text-sm leading-6 text-amber-900">Unknown, stale, or conflicting inputs remain UNKNOWN and cannot become a timing recommendation.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {truthGuardrails.map((item) => (
              <span key={item.opportunityId} className="rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950">
                {item.truthState} · {item.eligibility} · verify evidence
              </span>
            ))}
          </div>
        </section>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {opportunities.map((item) => <OpportunityCard key={item.result.opportunityId} item={item} />)}
        </div>
      </div>
    </section>
  );
}
