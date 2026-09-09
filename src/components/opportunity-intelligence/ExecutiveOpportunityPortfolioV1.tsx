import type { ReactNode } from "react";

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

function display(value: string | null): string {
  return value ?? "Unknown";
}

function humanize(value: string): string {
  return value.replaceAll("_", " ");
}

function EvidenceBadge({ state }: { state: ExecutiveOpportunityEvidenceStateV1 }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${EVIDENCE_STYLE[state]}`}>
      {state}
    </span>
  );
}

function PulseMetric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
      <div className="text-2xl font-semibold tabular-nums text-stone-950">{value}</div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-stone-500">{label}</div>
      <div className="mt-1 text-xs leading-5 text-stone-600">{detail}</div>
    </div>
  );
}

function SmallMetric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-stone-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-stone-900">{children}</dd>
    </div>
  );
}

function OpportunityMobileCard({ item }: { item: ExecutiveOpportunityPortfolioItemV1 }) {
  return (
    <article className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm md:hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-stone-500">
            {item.organization ?? item.opportunityType}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-stone-950">{item.title}</h2>
        </div>
        <EvidenceBadge state={item.evidenceState} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <SmallMetric label="Timing">{display(item.timing)}</SmallMetric>
        <SmallMetric label="Supported value">{display(item.supportedValue)}</SmallMetric>
        <SmallMetric label="Prestige">{display(item.prestigeScore)}</SmallMetric>
        <SmallMetric label="Source probability">{display(item.probabilityScore)}</SmallMetric>
      </dl>
      <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-stone-500">Next move</p>
        <p className="mt-1 text-sm leading-6 text-stone-800">{item.nextMove}</p>
      </div>
      <a
        href={item.detailHref}
        className="mt-4 inline-flex rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white"
      >
        Open opportunity
      </a>
    </article>
  );
}

export function ExecutiveOpportunityPortfolioV1({
  portfolio
}: {
  portfolio: ExecutiveOpportunityPortfolioV1;
}) {
  const primary = portfolio.items[0] ?? null;

  return (
    <main
      className="min-h-screen bg-[#f8f4ec] px-4 py-6 text-stone-950 sm:px-6 lg:px-8"
      data-testid="executive-opportunity-portfolio-v1"
      data-visual-mode="light"
    >
      <div className="mx-auto max-w-[1600px]">
        <header className="rounded-[2rem] border border-stone-200 bg-[#fffdf8] p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                Mission Control · Opportunities
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
                Opportunities &amp; Actions
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
                Current opportunity evidence, timing, supported upside, and the next move. Missing evidence stays unknown instead of becoming a fake score.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href="/dashboard" className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800">
                Executive Home
              </a>
              <a href="/relationships" className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800">
                Relationships / CRM
              </a>
            </div>
          </div>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Opportunity portfolio summary">
          <PulseMetric label="Opportunities" value={portfolio.summary.total} detail="Canonical radar records" />
          <PulseMetric label="Evidence watch" value={portfolio.summary.verificationWatch} detail="Unknown, stale, or conflicted" />
          <PulseMetric label="Timed" value={portfolio.summary.withTiming} detail="Next-step date is supported" />
          <PulseMetric label="Value supported" value={portfolio.summary.withSupportedValue} detail="Source includes a value estimate" />
        </section>

        {primary ? (
          <section className="mt-5 rounded-3xl border border-stone-200 bg-stone-950 p-5 text-white shadow-sm md:p-6" aria-label="First canonical opportunity">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-stone-300">First in canonical radar order</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">{primary.title}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-300">{primary.nextMove}</p>
              </div>
              <a href={primary.detailHref} className="inline-flex justify-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-stone-950">
                Open decision detail
              </a>
            </div>
          </section>
        ) : null}

        {portfolio.items.length === 0 ? (
          <section className="mt-5 rounded-3xl border border-dashed border-stone-300 bg-white p-6" aria-label="No verified opportunities">
            <p className="text-sm font-semibold text-stone-950">No canonical opportunities are available for this range.</p>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-600">
              This workspace stays empty rather than substituting planning fixtures or fabricated opportunity values.
            </p>
          </section>
        ) : (
          <section className="mt-5" aria-label="Opportunity portfolio">
            <div className="space-y-3 md:hidden">
              {portfolio.items.map((item) => <OpportunityMobileCard key={item.id} item={item} />)}
            </div>

            <div className="hidden overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm md:block">
              <div className="overflow-x-auto">
                <table className="min-w-[1240px] w-full border-collapse text-left text-sm">
                  <thead className="bg-stone-50 text-xs uppercase tracking-[0.08em] text-stone-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Opportunity</th>
                      <th className="px-4 py-3 font-semibold">Evidence</th>
                      <th className="px-4 py-3 font-semibold">Timing</th>
                      <th className="px-4 py-3 font-semibold">Supported value</th>
                      <th className="px-4 py-3 font-semibold">Prestige</th>
                      <th className="px-4 py-3 font-semibold">Source probability</th>
                      <th className="px-4 py-3 font-semibold">Effort signal</th>
                      <th className="px-4 py-3 font-semibold">Next move</th>
                      <th className="px-4 py-3 font-semibold">Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {portfolio.items.map((item) => (
                      <tr key={item.id} data-opportunity-id={item.id} className="align-top">
                        <td className="px-4 py-4">
                          <div className="font-semibold text-stone-950">{item.title}</div>
                          <div className="mt-1 text-xs text-stone-500">{item.organization ?? item.opportunityType}</div>
                          <div className="mt-1 text-xs text-stone-500">{item.status}</div>
                        </td>
                        <td className="px-4 py-4"><EvidenceBadge state={item.evidenceState} /></td>
                        <td className="px-4 py-4 tabular-nums">
                          <div>{display(item.timing)}</div>
                          <div className="mt-1 text-xs text-stone-500">Verified {display(item.lastVerified)}</div>
                        </td>
                        <td className="px-4 py-4 font-medium">{display(item.supportedValue)}</td>
                        <td className="px-4 py-4">{display(item.prestigeScore)}</td>
                        <td className="px-4 py-4">{display(item.probabilityScore)}</td>
                        <td className="px-4 py-4 text-xs font-semibold text-stone-600">{humanize(item.effortSignal)}</td>
                        <td className="max-w-sm px-4 py-4 leading-6 text-stone-700">{item.nextMove}</td>
                        <td className="px-4 py-4">
                          <a href={item.detailHref} className="inline-flex whitespace-nowrap rounded-full bg-stone-950 px-3 py-2 text-xs font-semibold text-white">
                            Open opportunity
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        <p className="mt-4 text-xs leading-5 text-stone-500">
          Source order is preserved by default. Existing value, prestige, and probability fields are displayed only when supplied by the canonical opportunity radar; missing values remain Unknown.
        </p>
      </div>
    </main>
  );
}
