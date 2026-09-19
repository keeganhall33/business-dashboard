import {
  projectOpportunityAccessMapV1,
  type OpportunityAccessEvidenceV1,
  type OpportunityAccessMapV1,
  type OpportunityDecisionMakerV1,
  type OpportunitySponsorshipLinkV1
} from "@/lib/opportunity-intelligence/opportunity-access-map-v1";

export type SponsorDecisionMakerSideV1 =
  | "SPONSOR_SIDE"
  | "PROPERTY_SIDE"
  | "AMBIGUOUS_SIDE"
  | "UNRESOLVED";

export type SponsorDecisionMakerSideBindingV1 = {
  personCanonicalId: string;
  personLabel: string;
  organizationCanonicalId: string;
  organizationLabel: string;
  decisionClass: string;
  side: SponsorDecisionMakerSideV1;
  decisionMakerEvidenceIds: readonly string[];
  matchedSponsorshipEvidenceIds: readonly string[];
  evidenceRefs: readonly string[];
};

export type SponsorDecisionMakerSideReviewV1 = {
  opportunityId: string;
  asOf: string;
  accessMap: OpportunityAccessMapV1;
  decisionMakers: readonly SponsorDecisionMakerSideBindingV1[];
  sponsorSideCount: number;
  propertySideCount: number;
  ambiguousSideCount: number;
  unresolvedCount: number;
  verificationRequired: boolean;
};

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function matchingLinks(
  decisionMaker: OpportunityDecisionMakerV1,
  sponsorshipLinks: readonly OpportunitySponsorshipLinkV1[]
): {
  sponsorMatches: OpportunitySponsorshipLinkV1[];
  propertyMatches: OpportunitySponsorshipLinkV1[];
} {
  return {
    sponsorMatches: sponsorshipLinks.filter(
      (link) => link.sponsorCanonicalId === decisionMaker.organizationCanonicalId
    ),
    propertyMatches: sponsorshipLinks.filter(
      (link) => link.propertyCanonicalId === decisionMaker.organizationCanonicalId
    )
  };
}

function sideFor(
  sponsorMatches: readonly OpportunitySponsorshipLinkV1[],
  propertyMatches: readonly OpportunitySponsorshipLinkV1[]
): SponsorDecisionMakerSideV1 {
  const isSponsor = sponsorMatches.length > 0;
  const isProperty = propertyMatches.length > 0;
  if (isSponsor && isProperty) return "AMBIGUOUS_SIDE";
  if (isSponsor) return "SPONSOR_SIDE";
  if (isProperty) return "PROPERTY_SIDE";
  return "UNRESOLVED";
}

export function reviewSponsorDecisionMakerSidesV1(input: {
  opportunityId: string;
  asOf: string | Date;
  evidence: readonly OpportunityAccessEvidenceV1[];
}): SponsorDecisionMakerSideReviewV1 {
  const accessMap = projectOpportunityAccessMapV1(input);

  const decisionMakers = accessMap.decisionMakers.map((decisionMaker) => {
    const { sponsorMatches, propertyMatches } = matchingLinks(
      decisionMaker,
      accessMap.sponsorshipLinks
    );
    const matchedLinks = [...sponsorMatches, ...propertyMatches];

    return {
      personCanonicalId: decisionMaker.personCanonicalId,
      personLabel: decisionMaker.personLabel,
      organizationCanonicalId: decisionMaker.organizationCanonicalId,
      organizationLabel: decisionMaker.organizationLabel,
      decisionClass: decisionMaker.decisionClass,
      side: sideFor(sponsorMatches, propertyMatches),
      decisionMakerEvidenceIds: decisionMaker.evidenceIds,
      matchedSponsorshipEvidenceIds: uniqueSorted(
        matchedLinks.flatMap((link) => [...link.evidenceIds])
      ),
      evidenceRefs: uniqueSorted([
        ...decisionMaker.evidenceRefs,
        ...matchedLinks.flatMap((link) => [...link.evidenceRefs])
      ])
    } satisfies SponsorDecisionMakerSideBindingV1;
  });

  decisionMakers.sort(
    (left, right) =>
      left.organizationLabel.localeCompare(right.organizationLabel) ||
      left.personLabel.localeCompare(right.personLabel) ||
      left.decisionClass.localeCompare(right.decisionClass) ||
      left.personCanonicalId.localeCompare(right.personCanonicalId)
  );

  const sponsorSideCount = decisionMakers.filter((item) => item.side === "SPONSOR_SIDE").length;
  const propertySideCount = decisionMakers.filter((item) => item.side === "PROPERTY_SIDE").length;
  const ambiguousSideCount = decisionMakers.filter((item) => item.side === "AMBIGUOUS_SIDE").length;
  const unresolvedCount = decisionMakers.filter((item) => item.side === "UNRESOLVED").length;

  return {
    opportunityId: accessMap.opportunityId,
    asOf: accessMap.asOf,
    accessMap,
    decisionMakers,
    sponsorSideCount,
    propertySideCount,
    ambiguousSideCount,
    unresolvedCount,
    verificationRequired:
      accessMap.verificationRequired || ambiguousSideCount > 0 || unresolvedCount > 0
  };
}
