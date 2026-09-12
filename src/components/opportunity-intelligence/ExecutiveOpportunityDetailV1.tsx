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
    ["Upside", opportunity.upside],
    ["Fit", opportunity.fit],
    ["Timing", opportunity.timing],
    ["Effort / capacity", opportunity.effort]
  ];

  for (const [label, value] of fields) {
    if (!value.trim() || value.trim().toUpperCase() === "UNKNOWN") {
      unknowns.push(`${label} remains UNKNOWN.`);
    }
  }

  if (opportunity.evidence === "UNKNOWN") {
    unknowns.push("Evidence is UNKNOWN and cannot support action certainty.");
  } else if (opportunity.evidence === "STALE") {
    unknowns.push("Evidence is STALE and needs refresh before action certainty.");
  } else if (opportunity.evidence === "CONFLICTED") {
    unknowns.push("Evidence is CONFLICTED and needs reconciliation before action certainty.");
  } else if (opportunity.evidence === "INFERRED") {
    unknowns.push("Evidence is INFERRED and should be verified before irreversible action.");
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
    <main className="min-h-screen bg-[#f8f4ec] px-4 py-6 text-stone-950 sm:px-6 lg:px-8" data-testid="executive-opportunity-detail-v1">
      <div className="mx-auto max-w-[1400px] space-y-5">
        <header className="rounded-[2rem] border border-stone-200 bg-[#fffdf8] p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-4xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Opportunity decision workspace</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{opportunity.title}</h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-stone-700">
                {opportunity.next_move}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${EVIDENCE_TONE[opportunity.evidence]}`}>
                {opportunity.evidence}
              </span>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${view.verificationRequired ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
                {view.verificationRequired ? "VERIFICATION REQUIRED" : "EVIDENCE READY"}
              </span>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DecisionMetric label="Timing / window" value={opportunity.timing} />
            <DecisionMetric label="Effort / capacity" value={opportunity.effort} />
            <DecisionMetric label="Supported fit" value={opportunity.fit} />
            <DecisionMetric label="Supported upside" value={opportunity.upside} />
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Recommended next move</p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-950">{opportunity.next_move}</h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              This is the same opportunity projection surfaced by Executive Home. The workspace does not invent additional economics, probability, or buyer certainty.
            </p>
          </div>

          <div className="rounded-3xl border border-stone-200 bg-[#fffdf8] p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Key unknowns / gates</p>
            {view.unknowns.length ? (
              <ul className="mt-3 space-y-2 text-sm leading-6 text-stone-700">
                {view.unknowns.map((unknown) => (
                  <li key={unknown} className="rounded-2xl border border-stone-200 bg-white p-3">{unknown}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm leading-6 text-stone-700">No explicit unknown field is present in the canonical opportunity projection.</p>
            )}
          </div>
        </section>

        {view.relatedRelationships.links.length > 0 ? (
          <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm" data-testid="opportunity-related-relationships-v1">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Related relationships</p>
                <h2 className="mt-1 text-xl font-semibold text-stone-950">Evidence-supported CRM context</h2>
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
                  className="rounded-2xl border border-stone-200 bg-[#fffdf8] p-4 transition hover:border-stone-400"
                >
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                    {relationship.entityType === "PERSON" ? "Person" : "Company"}
                  </span>
                  <span className="mt-1 block text-base font-semibold text-stone-950">{relationship.label}</span>
                  <span className="mt-2 block text-sm text-stone-600">Open canonical CRM record</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <details className="rounded-3xl border border-stone-200 bg-[#fffdf8] shadow-sm">
          <summary className="cursor-pointer list-none p-5 text-sm font-semibold text-stone-900">Evidence and secondary context</summary>
          <div className="border-t border-stone-200 p-5">
            <dl className="grid gap-3 md:grid-cols-2">
              <Detail label="Opportunity ID" value={opportunity.id} />
              <Detail label="Evidence state" value={opportunity.evidence} />
              <Detail label="Timing" value={opportunity.timing} />
              <Detail label="Effort / capacity" value={opportunity.effort} />
              <Detail label="Fit" value={opportunity.fit} />
              <Detail label="Upside" value={opportunity.upside} />
              <Detail label="Projection freshness" value={generatedAt || "UNKNOWN"} />
              <Detail label="Source" value="Executive Home canonical opportunity projection" />
            </dl>
          </div>
        </details>

        <nav aria-label="Opportunity workspace destinations" className="flex flex-wrap gap-2">
          <Link href="/relationships" className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800">
            Relationships / CRM
          </Link>
          <Link href="/opportunities-actions" className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800">
            Planning readiness
          </Link>
          <Link href="/dashboard#decision-room-drilldown" className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800">
            Decision Room
          </Link>
          <Link href="/data-evidence" className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800">
            Data & Evidence
          </Link>
          <Link href="/dashboard" className="rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white">
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
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">{label}</dt>
      <dd className={`mt-2 text-base font-semibold ${unknown ? "text-amber-900" : "text-stone-950"}`}>{unknown ? "UNKNOWN" : value}</dd>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-3">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">{label}</dt>
      <dd className="mt-1 break-words text-sm leading-6 text-stone-700">{value}</dd>
    </div>
  );
}
