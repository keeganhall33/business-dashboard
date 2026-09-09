import type {
  ExecutiveEventEvidenceStateV1,
  ExecutiveEventPlanningWindowV1,
  ExecutiveEventPortfolioItemV1,
  ExecutiveEventPortfolioV1 as ExecutiveEventPortfolioModelV1
} from "@/lib/event-intelligence/executive-event-portfolio-v1";

const EVIDENCE_TONE: Record<ExecutiveEventEvidenceStateV1, string> = {
  KNOWN: "border-emerald-200 bg-emerald-50 text-emerald-900",
  INFERRED: "border-sky-200 bg-sky-50 text-sky-900",
  UNKNOWN: "border-amber-200 bg-amber-50 text-amber-900",
  STALE: "border-orange-200 bg-orange-50 text-orange-900",
  CONFLICTED: "border-rose-200 bg-rose-50 text-rose-900"
};

const WINDOW_LABEL: Record<ExecutiveEventPlanningWindowV1, string> = {
  NOW: "Now",
  NEAR_TERM: "Next 90 days",
  PREPARE: "Prepare",
  EARLY: "Early window",
  PAST: "Past",
  DATE_UNKNOWN: "Date unknown"
};

const WINDOW_ORDER: ExecutiveEventPlanningWindowV1[] = [
  "NOW",
  "NEAR_TERM",
  "PREPARE",
  "EARLY",
  "DATE_UNKNOWN",
  "PAST"
];

export function ExecutiveEventPortfolioV1({
  portfolio,
  sourceStatus
}: {
  portfolio: ExecutiveEventPortfolioModelV1;
  sourceStatus: "AVAILABLE" | "UNAVAILABLE";
}) {
  const groups = WINDOW_ORDER.map((window) => ({
    window,
    items: portfolio.items.filter((item) => item.planningWindow === window)
  })).filter((group) => group.items.length > 0);

  return (
    <main
      className="min-h-screen bg-[#f8f4ec] px-4 py-6 text-stone-950 sm:px-6 lg:px-8"
      data-visual-mode="light"
      data-testid="executive-event-portfolio-v1"
      aria-label="Events and market windows"
    >
      <div className="mx-auto max-w-[1600px]">
        <header className="rounded-[2rem] border border-stone-200 bg-[#fffdf8] p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                Mission Control · Timing
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
                Events &amp; Market Windows
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
                See what is coming, how much runway remains, and which windows deserve preparation before they become urgent.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Event planning pulse">
              <Pulse label="Supported windows" value={portfolio.summary.total} />
              <Pulse label="Upcoming" value={portfolio.summary.upcoming} />
              <Pulse label="Next 90 days" value={portfolio.summary.next90Days} />
              <Pulse label="Verify" value={portfolio.summary.verificationWatch} />
            </div>
          </div>
        </header>

        {sourceStatus === "UNAVAILABLE" ? (
          <UnavailableState />
        ) : portfolio.items.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="mt-5 space-y-5">
            {groups.map((group) => (
              <section
                key={group.window}
                className="rounded-[2rem] border border-stone-200 bg-[#fffdf8] p-4 shadow-sm sm:p-5"
                aria-labelledby={`event-window-${group.window}`}
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                      Planning window
                    </p>
                    <h2 id={`event-window-${group.window}`} className="mt-1 text-lg font-semibold text-stone-950">
                      {WINDOW_LABEL[group.window]}
                    </h2>
                  </div>
                  <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-semibold text-stone-600">
                    {group.items.length}
                  </span>
                </div>

                <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                  {group.items.map((item) => (
                    <EventCard key={item.id} item={item} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <section className="mt-5 rounded-3xl border border-stone-200 bg-white p-4 shadow-sm" aria-label="Event evidence policy">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-stone-950">Evidence-first planning</p>
              <p className="mt-1 text-xs leading-5 text-stone-600">
                Dates come from the canonical sports-milestone store. Access remains unknown unless supported, and uncertain evidence never becomes action certainty.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
              {(["KNOWN", "INFERRED", "UNKNOWN", "STALE", "CONFLICTED"] as const).map((state) => (
                <span key={state} className={`rounded-full border px-2 py-1 ${EVIDENCE_TONE[state]}`}>
                  {state}
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function EventCard({ item }: { item: ExecutiveEventPortfolioItemV1 }) {
  return (
    <article className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm" data-testid="event-window-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
            {item.eventDate ?? "Date unknown"}
          </p>
          <h3 className="mt-1 text-base font-semibold leading-6 text-stone-950">{item.title}</h3>
          <p className="mt-1 text-xs leading-5 text-stone-600">
            {[item.market, item.category].filter(Boolean).join(" · ") || "Context not yet verified"}
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${EVIDENCE_TONE[item.evidenceState]}`}>
          {item.evidenceState}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <Metric label="Runway" value={item.runwayLabel} />
        <Metric label="Access" value={item.accessReadiness === "REVIEW_REQUIRED" ? "Review required" : item.accessReadiness === "SUPPORTED" ? "Supported" : "Unknown"} />
        <Metric label="Collector fit" value={titleCase(item.collectorRelevance)} />
        <Metric label="Partner potential" value={titleCase(item.partnershipPotential)} />
      </div>

      <div className="mt-4 rounded-2xl border border-stone-200 bg-[#fffdf8] p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Next move</p>
        <p className="mt-1 text-sm font-medium leading-5 text-stone-900">{item.nextMove}</p>
      </div>

      <details className="mt-3 rounded-2xl border border-stone-200 bg-stone-50 p-3">
        <summary className="cursor-pointer text-xs font-semibold text-stone-800">Evidence &amp; constraints</summary>
        <div className="mt-3 space-y-3 text-xs leading-5 text-stone-600">
          <p>
            Confidence <strong className="text-stone-800">{titleCase(item.confidence)}</strong> · Historical significance{" "}
            <strong className="text-stone-800">{titleCase(item.historicalSignificance)}</strong>
          </p>
          <div>
            <p className="font-semibold text-stone-800">Evidence</p>
            {item.evidenceLabels.length ? (
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {item.evidenceLabels.map((label, index) => <li key={`${label}-${index}`}>{label}</li>)}
              </ul>
            ) : (
              <p className="mt-1">Unknown</p>
            )}
          </div>
          <div>
            <p className="font-semibold text-stone-800">Rights / access constraints</p>
            {item.rightsConsiderations.length ? (
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {item.rightsConsiderations.map((consideration, index) => <li key={`${consideration}-${index}`}>{consideration}</li>)}
              </ul>
            ) : (
              <p className="mt-1">Access and rights are not established by this milestone record.</p>
            )}
          </div>
          <p className="text-[11px] text-stone-500">Source references: {item.sourceIds.length || "Unknown"}</p>
        </div>
      </details>
    </article>
  );
}

function Pulse({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-28 rounded-2xl border border-stone-200 bg-white px-3 py-2 shadow-sm">
      <div className="text-xl font-semibold tabular-nums text-stone-950">{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-stone-500">{label}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-stone-500">{label}</p>
      <p className="mt-1 font-semibold text-stone-800">{value}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <section className="mt-5 rounded-[2rem] border border-dashed border-stone-300 bg-white p-6 shadow-sm" data-testid="events-empty-state">
      <p className="text-base font-semibold text-stone-950">No verified event windows are currently available.</p>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
        The canonical milestone store returned no current records. Nothing is substituted from planning fixtures, and missing events are not treated as zero-value opportunities.
      </p>
    </section>
  );
}

function UnavailableState() {
  return (
    <section className="mt-5 rounded-[2rem] border border-amber-200 bg-amber-50 p-6 shadow-sm" data-testid="events-unavailable-state">
      <p className="text-base font-semibold text-amber-950">Unable to verify current event windows.</p>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-amber-900">
        Canonical milestone evidence is unavailable for this request. The workspace remains intentionally empty rather than falling back to synthetic events or invented timing.
      </p>
    </section>
  );
}

function titleCase(value: string): string {
  return value === "UNKNOWN" ? "Unknown" : value.charAt(0) + value.slice(1).toLowerCase();
}
