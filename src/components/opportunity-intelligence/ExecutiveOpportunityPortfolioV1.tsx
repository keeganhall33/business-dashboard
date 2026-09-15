import type {
  ExecutiveOpportunityEvidenceStateV1,
  ExecutiveOpportunityPortfolioItemV1,
  ExecutiveOpportunityPortfolioV1
} from "@/lib/opportunity-intelligence/executive-opportunity-portfolio-v1";

const EVIDENCE_STYLE: Record<ExecutiveOpportunityEvidenceStateV1, string> = {
  INFERRED: "border-sky-200 bg-sky-50 text-sky-900",
  UNKNOWN: "border-amber-200 bg-amber-50 text-amber-900",
  STALE: "border-orange-200 bg-orange-50 text-orange-900",
  CONFLICTED: "border-rose-200 bg-rose-50 text-rose-900"
};

function humanize(value: string): string {
  return value.replaceAll("_", " ");
}

function EvidenceBadge({ state }: { state: ExecutiveOpportunityEvidenceStateV1 }) {
  const label = state === "STALE" ? "Needs review" : state === "INFERRED" ? "Estimated" : state === "UNKNOWN" ? "Missing data" : "Conflicting data";
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${EVIDENCE_STYLE[state]}`}>
      {label}
    </span>
  );
}

function PulseMetric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-2xl font-semibold tabular-nums text-slate-950">{value}</div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</div>
      <div className="mt-1 text-xs leading-5 text-slate-600">{detail}</div>
    </div>
  );
}

function OpportunityCard({ item }: { item: ExecutiveOpportunityPortfolioItemV1 }) {
  return (
    <article className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            {item.organization ?? item.opportunityType}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">{item.title}</h2>
          <p className="mt-1 text-sm capitalize text-slate-600">{humanize(item.status)}</p>
        </div>
        <EvidenceBadge state={item.evidenceState} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        {item.timing ? <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">Due {item.timing}</span> : null}
        {item.supportedValue ? <span className="rounded-full bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-800">{item.supportedValue}</span> : null}
      </div>
      <div className="mt-4 flex-1 rounded-2xl bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Next move</p>
        <p className="mt-2 text-sm leading-6 text-slate-800">{item.nextMove}</p>
      </div>
      <a
        href={item.detailHref}
        className="mt-4 inline-flex w-fit rounded-full bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
      >
        View opportunity
      </a>
    </article>
  );
}

export function ExecutiveOpportunityPortfolioV1({
  portfolio
}: {
  portfolio: ExecutiveOpportunityPortfolioV1;
}) {
  const primary = portfolio.items.find((item) => item.evidenceState === "STALE" || item.evidenceState === "CONFLICTED") ?? portfolio.items[0] ?? null;

  return (
    <main
      className="min-h-screen bg-[#f4f7fb] px-4 py-6 text-slate-950 sm:px-6 lg:px-8"
      data-testid="executive-opportunity-portfolio-v1"
      data-visual-mode="light"
    >
      <div className="mx-auto max-w-[1600px]">
        <header className="rounded-[2rem] border border-slate-200 bg-[#ffffff] p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Mission Control · Opportunities
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
                Opportunities &amp; Actions
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                The relationships and projects most likely to matter next, with a clear next move for each.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href="/dashboard" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800">
                Executive Home
              </a>
              <a href="/relationships" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800">
                Relationships / CRM
              </a>
            </div>
          </div>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Opportunity portfolio summary">
          <PulseMetric label="Active" value={portfolio.summary.total} detail="Current opportunities" />
          <PulseMetric label="Needs review" value={portfolio.summary.verificationWatch} detail="Stale or incomplete information" />
          <PulseMetric label="Scheduled" value={portfolio.summary.withTiming} detail="Have a next-step date" />
          <PulseMetric label="Value known" value={portfolio.summary.withSupportedValue} detail="Have a supported estimate" />
        </section>

        {primary ? (
          <section className={`mt-5 rounded-3xl border p-5 shadow-sm md:p-6 ${primary.evidenceState === "STALE" || primary.evidenceState === "CONFLICTED" ? "border-orange-200 bg-orange-50 text-slate-950" : "border-blue-800 bg-blue-950 text-white"}`} aria-label="Priority opportunity">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div>
                <p className={`text-xs font-semibold uppercase tracking-[0.12em] ${primary.evidenceState === "STALE" || primary.evidenceState === "CONFLICTED" ? "text-orange-800" : "text-blue-200"}`}>{primary.evidenceState === "STALE" || primary.evidenceState === "CONFLICTED" ? "Review now" : "Top opportunity"}</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">{primary.title}</h2>
                <p className={`mt-2 max-w-3xl text-sm leading-6 ${primary.evidenceState === "STALE" || primary.evidenceState === "CONFLICTED" ? "text-slate-700" : "text-blue-100"}`}>{primary.nextMove}</p>
              </div>
              <a href={primary.detailHref} className="inline-flex justify-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950">
                Review opportunity
              </a>
            </div>
          </section>
        ) : null}

        {portfolio.items.length === 0 ? (
          <section className="mt-5 rounded-3xl border border-dashed border-slate-300 bg-white p-6" aria-label="No verified opportunities">
            <p className="text-sm font-semibold text-slate-950">No canonical opportunities are available for this range.</p>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
              This workspace stays empty rather than substituting planning fixtures or fabricated opportunity values.
            </p>
          </section>
        ) : (
          <section className="mt-5" aria-label="Opportunity portfolio">
            <div className="grid gap-4 lg:grid-cols-2">
              {portfolio.items.map((item) => <OpportunityCard key={item.id} item={item} />)}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
