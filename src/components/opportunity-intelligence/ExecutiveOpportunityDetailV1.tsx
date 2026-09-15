import Link from "next/link";

import type {
  ExecutiveCommandCenterOpportunityV1,
  ExecutiveCommandCenterTruthStateV1
} from "@/lib/executive-home/fixtures";
import {
  projectOpportunityRelationshipLinksV1,
  type OpportunityRelationshipEvidenceV1,
  type OpportunityRelationshipLinksV1
} from "@/lib/opportunity-intelligence/opportunity-relationship-links-v1";

const EVIDENCE_TONE: Record<ExecutiveCommandCenterTruthStateV1, string> = {
  KNOWN: "border-emerald-200 bg-emerald-50 text-emerald-900",
  INFERRED: "border-sky-200 bg-sky-50 text-sky-900",
  UNKNOWN: "border-amber-200 bg-amber-50 text-amber-900",
  STALE: "border-orange-200 bg-orange-50 text-orange-900",
  CONFLICTED: "border-rose-200 bg-rose-50 text-rose-900"
};

export type ExecutiveOpportunityDetailViewV1 = {
  opportunity: ExecutiveCommandCenterOpportunityV1;
  verificationRequired: boolean;
  unknowns: string[];
  relatedRelationships: OpportunityRelationshipLinksV1;
};

export function buildExecutiveOpportunityDetailViewV1(
  opportunity: ExecutiveCommandCenterOpportunityV1,
  relationshipEvidence: readonly OpportunityRelationshipEvidenceV1[] | null = null
): ExecutiveOpportunityDetailViewV1 {
  const unknowns: string[] = [];
  const fields: Array<[string, string]> = [
    ["Revenue potential", opportunity.upside],
    ["Business fit", opportunity.fit],
    ["Target date", opportunity.timing],
    ["Next step status", opportunity.effort]
  ];

  for (const [label, value] of fields) {
    if (!value.trim() || value.trim().toUpperCase() === "UNKNOWN") {
      unknowns.push(`${label} has not been confirmed yet.`);
    }
  }

  if (opportunity.evidence === "UNKNOWN") {
    unknowns.push("The source still needs to be confirmed before acting.");
  } else if (opportunity.evidence === "STALE") {
    unknowns.push("The source is out of date and needs a refresh.");
  } else if (opportunity.evidence === "CONFLICTED") {
    unknowns.push("The available sources disagree and need to be reconciled.");
  } else if (opportunity.evidence === "INFERRED") {
    unknowns.push("Some details came from indirect signals. Confirm the contact and next step before outreach.");
  }

  const relatedRelationships = projectOpportunityRelationshipLinksV1({
    opportunityId: opportunity.id,
    evidence: relationshipEvidence
  });

  return {
    opportunity,
    verificationRequired:
      opportunity.evidence !== "KNOWN" ||
      unknowns.length > 0 ||
      relatedRelationships.verificationRequired,
    unknowns,
    relatedRelationships
  };
}

export function ExecutiveOpportunityDetailV1({
  opportunity,
  generatedAt,
  relationshipEvidence = null
}: {
  opportunity: ExecutiveCommandCenterOpportunityV1;
  generatedAt?: string | null;
  relationshipEvidence?: readonly OpportunityRelationshipEvidenceV1[] | null;
}) {
  const view = buildExecutiveOpportunityDetailViewV1(opportunity, relationshipEvidence);

  return (
    <main className="min-h-screen bg-[#f4f7fb] px-4 py-6 text-slate-950 sm:px-6 lg:px-8" data-testid="executive-opportunity-detail-v1">
      <div className="mx-auto max-w-[1400px] space-y-5">
        <header className="rounded-[2rem] border border-slate-200 bg-[#ffffff] p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-4xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Opportunity</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{opportunity.title}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${EVIDENCE_TONE[opportunity.evidence]}`}>
                {opportunity.evidence === "KNOWN" ? "Verified" : opportunity.evidence === "INFERRED" ? "Needs confirmation" : "Needs review"}
              </span>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${view.verificationRequired ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
                {view.verificationRequired ? "Needs your input" : "Current"}
              </span>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DecisionMetric label="Target date" value={opportunity.timing} />
            <DecisionMetric label="Next step status" value={opportunity.effort} />
            <DecisionMetric label="Business fit" value={opportunity.fit} />
            <DecisionMetric label="Revenue potential" value={opportunity.upside} />
          </div>
        </header>

        <section>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Next move</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">{opportunity.next_move}</h2>
            {view.unknowns.length ? (
              <ul className="mt-4 list-disc space-y-1 pl-5 text-sm leading-6 text-amber-900">
                {view.unknowns.map((unknown) => (
                  <li key={unknown}>{unknown}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>

        {view.relatedRelationships.links.length > 0 ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="opportunity-related-relationships-v1">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Related relationships</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-950">People and companies connected to this opportunity</h2>
              </div>
              {view.relatedRelationships.withheld.length > 0 ? (
                <p className="text-xs font-medium text-amber-800">
                  {view.relatedRelationships.withheld.length} relationship link{view.relatedRelationships.withheld.length === 1 ? "" : "s"} withheld pending verification.
                </p>
              ) : null}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {view.relatedRelationships.links.map((relationship) => (
                <Link
                  key={`${relationship.entityType}:${relationship.canonicalId}`}
                  href={relationship.href}
                  className="rounded-2xl border border-slate-200 bg-[#ffffff] p-4 transition hover:border-slate-400"
                >
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {relationship.entityType === "PERSON" ? "Person" : "Company"}
                  </span>
                  <span className="mt-1 block text-base font-semibold text-slate-950">{relationship.label}</span>
                  <span className="mt-2 block text-sm text-slate-600">Open CRM record</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <details className="rounded-3xl border border-slate-200 bg-[#ffffff] shadow-sm">
          <summary className="cursor-pointer list-none p-5 text-sm font-semibold text-slate-900">When this was last updated</summary>
          <div className="border-t border-slate-200 p-5">
            <dl className="grid gap-3 md:grid-cols-2">
              <Detail label="Last refreshed" value={formatTimestamp(generatedAt)} />
              <Detail label="Record status" value={opportunity.evidence === "KNOWN" ? "Verified from connected records" : "Needs confirmation from you or a connected source"} />
            </dl>
          </div>
        </details>

        <nav aria-label="Opportunity workspace destinations" className="flex flex-wrap gap-2">
          <Link href="/relationships" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800">
            Relationships / CRM
          </Link>
          <Link href="/opportunities-actions" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800">
            Planning readiness
          </Link>
          <Link href="/dashboard#decision-room-drilldown" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800">
            Decision Room
          </Link>
          <Link href="/data-evidence" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800">
            Data & Evidence
          </Link>
          <Link href="/dashboard" className="rounded-full bg-blue-700 px-4 py-2 text-sm font-semibold text-white">
            Back to Executive Home
          </Link>
        </nav>
      </div>
    </main>
  );
}

function DecisionMetric({ label, value }: { label: string; value: string }) {
  const unknown = !value.trim() || value.trim().toUpperCase() === "UNKNOWN";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</dt>
      <dd className={`mt-2 text-base font-semibold ${unknown ? "text-amber-800" : "text-slate-950"}`}>{unknown ? "Not yet confirmed" : value}</dd>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm leading-6 text-slate-700">{value}</dd>
    </div>
  );
}

function formatTimestamp(value?: string | null): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Not available";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(date);
}
