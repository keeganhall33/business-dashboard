import Link from "next/link";

import type {
  OpportunityAccessCoverageStateV1,
  OpportunityAccessFactKindV1,
  OpportunityAccessMapV1,
  OpportunityAccessPathNodeV1
} from "@/lib/opportunity-intelligence/opportunity-access-map-v1";

const COVERAGE: ReadonlyArray<{
  kind: OpportunityAccessFactKindV1;
  label: string;
  missing: string;
}> = [
  { kind: "DECISION_MAKER", label: "Decision makers", missing: "Identify who can approve the opportunity." },
  { kind: "SPONSORSHIP_LINK", label: "Sponsor connections", missing: "Confirm any evidenced sponsor relationship." },
  { kind: "WARM_ACCESS_PATH", label: "Warm introduction paths", missing: "Find a verified referrer or introduction route." },
  { kind: "PLANNING_WINDOW", label: "Planning windows", missing: "Confirm the buyer's planning or budget window." }
];

const STATE_LABEL: Record<OpportunityAccessCoverageStateV1, string> = {
  EVIDENCED: "Evidence found",
  NEEDS_VERIFICATION: "Needs verification",
  MISSING: "Not yet evidenced"
};

const STATE_TONE: Record<OpportunityAccessCoverageStateV1, string> = {
  EVIDENCED: "border-emerald-200 bg-emerald-50 text-emerald-900",
  NEEDS_VERIFICATION: "border-amber-200 bg-amber-50 text-amber-900",
  MISSING: "border-slate-200 bg-slate-50 text-slate-700"
};

export function OpportunityAccessIntelligenceV1({ accessMap }: { accessMap: OpportunityAccessMapV1 }) {
  const evidencedCount = COVERAGE.filter(({ kind }) => accessMap.coverage[kind] === "EVIDENCED").length;

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="opportunity-access-intelligence-v1">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">Opportunity access</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">What is known about reaching the buyer</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Only current, source-backed CRM records appear here. Missing coverage is a research prompt, not a negative finding.
          </p>
        </div>
        <p className="text-sm font-semibold text-slate-700">{`${evidencedCount} of ${COVERAGE.length} areas evidenced`}</p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {COVERAGE.map(({ kind, label, missing }) => {
          const state = accessMap.coverage[kind];
          return (
            <article key={kind} className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-950">{label}</p>
              <span className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${STATE_TONE[state]}`}>
                {STATE_LABEL[state]}
              </span>
              {state !== "EVIDENCED" ? <p className="mt-3 text-sm leading-5 text-slate-600">{missing}</p> : null}
            </article>
          );
        })}
      </div>

      {accessMap.warmAccessPaths.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-slate-950">Verified warm paths</h3>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {accessMap.warmAccessPaths.map((warmPath) => (
              <article key={warmPath.evidenceIds.join(":")} className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-950">
                  {warmPath.path.map((node, index) => (
                    <span key={`${node.entityType}:${node.canonicalId}`} className="inline-flex items-center gap-2">
                      {index > 0 ? <span aria-hidden="true" className="text-emerald-700">→</span> : null}
                      <AccessNodeLink node={node} />
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-700">{warmPath.reasonForIntroduction}</p>
                <p className="mt-2 text-xs text-slate-500">Observed {formatDate(warmPath.observedAt)}</p>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
          Access intelligence has not yet been evidenced for this opportunity. The gaps above show what to verify next.
        </p>
      )}

      {accessMap.withheld.length > 0 ? (
        <p className="mt-4 text-xs font-medium text-amber-800">
          {accessMap.withheld.length} potential access record{accessMap.withheld.length === 1 ? "" : "s"} withheld because the evidence is incomplete, stale, or conflicted.
        </p>
      ) : null}
    </section>
  );
}

function AccessNodeLink({ node }: { node: OpportunityAccessPathNodeV1 }) {
  const href = `${node.entityType === "PERSON" ? "/relationships/people/" : "/relationships/companies/"}${encodeURIComponent(node.canonicalId)}`;
  return (
    <Link href={href} className="text-blue-700 underline-offset-2 hover:underline">
      {node.label}
    </Link>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "date unavailable";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}
