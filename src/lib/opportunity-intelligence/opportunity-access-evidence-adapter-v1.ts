import type { OpportunityAccessEvidenceV1 } from "@/lib/opportunity-intelligence/opportunity-access-map-v1";

export type OpportunityAccessRelationshipEntryV1 = {
  opportunityId: string;
  entityType: "PERSON" | "COMPANY";
  canonicalId: string | null;
  label: string | null;
  resolution: "RESOLVED" | "UNAVAILABLE";
  evidenceState: "KNOWN" | "INFERRED" | "UNKNOWN" | "STALE" | "CONFLICTED";
  evidenceRefs: readonly string[];
  role: string | null;
  freshnessState: "CURRENT" | "STALE" | "UNKNOWN";
  observedAt: string | null;
};

type EligibleEntry = OpportunityAccessRelationshipEntryV1 & {
  canonicalId: string;
  label: string;
  observedAt: string;
};

function eligible(entry: OpportunityAccessRelationshipEntryV1): entry is EligibleEntry {
  return entry.resolution === "RESOLVED" &&
    entry.evidenceState === "KNOWN" &&
    entry.freshnessState === "CURRENT" &&
    Boolean(entry.canonicalId && entry.label && entry.observedAt && entry.evidenceRefs.length > 0);
}

export function buildOpportunityAccessEvidenceFromRelationshipRowsV1(input: {
  opportunityId: string;
  entries: readonly OpportunityAccessRelationshipEntryV1[];
}): OpportunityAccessEvidenceV1[] {
  const referrers = input.entries.filter((entry): entry is EligibleEntry => entry.role === "REFERRER" && eligible(entry));
  const organizations = input.entries.filter(
    (entry): entry is EligibleEntry =>
      ["ORGANIZATION", "BRAND"].includes(entry.role ?? "") &&
      entry.entityType === "COMPANY" &&
      eligible(entry)
  );

  return referrers.flatMap((referrer) =>
    organizations.map((organization) => ({
      evidenceId: `crm-opportunity-access:${input.opportunityId}:${referrer.canonicalId}:${organization.canonicalId}`,
      opportunityId: input.opportunityId,
      kind: "WARM_ACCESS_PATH" as const,
      truthState: "KNOWN" as const,
      freshnessState: "CURRENT" as const,
      observedAt: [referrer.observedAt, organization.observedAt].sort().at(-1)!,
      evidenceRefs: [...new Set([...referrer.evidenceRefs, ...organization.evidenceRefs])].sort(),
      path: [
        {
          entityType: referrer.entityType,
          canonicalId: referrer.canonicalId,
          label: referrer.label
        },
        {
          entityType: "COMPANY" as const,
          canonicalId: organization.canonicalId,
          label: organization.label
        }
      ],
      reasonForIntroduction: `CRM records ${referrer.label} as a referrer for this opportunity and ${organization.label} as a connected organization.`
    }))
  );
}
