import {
  projectOpportunityAccessMapV1,
  type OpportunityAccessCoverageStateV1,
  type OpportunityAccessEvidenceV1,
  type OpportunityAccessFactKindV1,
  type OpportunityAccessMapV1
} from "@/lib/opportunity-intelligence/opportunity-access-map-v1";

export const RELATIONSHIP_UNIVERSE_DOMAINS_V1 = [
  "COLLEGE_ATHLETICS",
  "PROFESSIONAL_SPORTS",
  "ATHLETES_TALENT",
  "MUSIC",
  "FILM_TV_ENTERTAINMENT",
  "BRANDS_CORPORATE",
  "AGENCIES_INTERMEDIARIES",
  "COLLECTIBLES_LICENSING_CULTURAL"
] as const;

export type RelationshipUniverseDomainV1 = (typeof RELATIONSHIP_UNIVERSE_DOMAINS_V1)[number];

export const RELATIONSHIP_UNIVERSE_PRIORITY_TIERS_V1 = ["TIER_1", "TIER_2", "TIER_3"] as const;
export type RelationshipUniversePriorityTierV1 = (typeof RELATIONSHIP_UNIVERSE_PRIORITY_TIERS_V1)[number];

export type RelationshipUniverseCoverageSubjectInputV1 = {
  subjectId: string;
  subjectLabel: string;
  domain: RelationshipUniverseDomainV1;
  priorityTier: RelationshipUniversePriorityTierV1;
  opportunityId: string;
  scopeEvidenceRefs: readonly string[];
  accessEvidence: readonly OpportunityAccessEvidenceV1[];
};

export type RelationshipUniverseCoverageSubjectV1 = {
  subjectId: string;
  subjectLabel: string;
  domain: RelationshipUniverseDomainV1;
  priorityTier: RelationshipUniversePriorityTierV1;
  opportunityId: string;
  scopeEvidenceRefs: readonly string[];
  observedAccessEvidenceCount: number;
  accessMap: OpportunityAccessMapV1;
};

export type RelationshipUniverseCoverageCountsV1 = Readonly<
  Record<OpportunityAccessCoverageStateV1, number>
>;

export type RelationshipUniverseCoverageGroupV1 = {
  domain: RelationshipUniverseDomainV1;
  priorityTier: RelationshipUniversePriorityTierV1;
  subjectCount: number;
  subjectsWithObservedAccessEvidence: number;
  subjectsWithEvidencedAccess: number;
  subjectsNeedingVerification: number;
  researchGapCount: number;
  accessCoverage: Readonly<
    Record<OpportunityAccessFactKindV1, RelationshipUniverseCoverageCountsV1>
  >;
};

export type RelationshipUniverseResearchGapV1 = {
  subjectId: string;
  subjectLabel: string;
  domain: RelationshipUniverseDomainV1;
  priorityTier: RelationshipUniversePriorityTierV1;
  opportunityId: string;
  kind: OpportunityAccessFactKindV1;
  coverageState: Exclude<OpportunityAccessCoverageStateV1, "EVIDENCED">;
  scopeEvidenceRefs: readonly string[];
};

export type RelationshipUniverseCoverageScorecardV1 = {
  asOf: string;
  totalSubjects: number;
  subjectsWithObservedAccessEvidence: number;
  subjectsWithEvidencedAccess: number;
  subjectsNeedingVerification: number;
  subjects: readonly RelationshipUniverseCoverageSubjectV1[];
  groups: readonly RelationshipUniverseCoverageGroupV1[];
  researchQueue: readonly RelationshipUniverseResearchGapV1[];
};

const INPUT_KEYS = new Set(["asOf", "subjects"]);
const SUBJECT_KEYS = new Set([
  "subjectId",
  "subjectLabel",
  "domain",
  "priorityTier",
  "opportunityId",
  "scopeEvidenceRefs",
  "accessEvidence"
]);
const DOMAINS = new Set<RelationshipUniverseDomainV1>(RELATIONSHIP_UNIVERSE_DOMAINS_V1);
const PRIORITY_TIERS = new Set<RelationshipUniversePriorityTierV1>(RELATIONSHIP_UNIVERSE_PRIORITY_TIERS_V1);
const FACT_KINDS: readonly OpportunityAccessFactKindV1[] = [
  "DECISION_MAKER",
  "SPONSORSHIP_LINK",
  "WARM_ACCESS_PATH",
  "PLANNING_WINDOW"
];
const DOMAIN_ORDER = new Map(RELATIONSHIP_UNIVERSE_DOMAINS_V1.map((domain, index) => [domain, index]));
const TIER_ORDER = new Map(RELATIONSHIP_UNIVERSE_PRIORITY_TIERS_V1.map((tier, index) => [tier, index]));

function fail(code: string): never {
  throw new Error(code);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requiredText(value: unknown, code: string): string {
  if (typeof value !== "string" || !value.trim()) return fail(code);
  return value.trim();
}

function iso(value: unknown, code: string): string {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return fail(code);
    return value.toISOString();
  }
  const text = requiredText(value, code);
  const time = Date.parse(text);
  if (!Number.isFinite(time)) return fail(code);
  return new Date(time).toISOString();
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function evidenceRefs(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    return fail("RELATIONSHIP_UNIVERSE_SCOPE_EVIDENCE_REFS_REQUIRED");
  }
  if (value.some((item) => typeof item !== "string" || !item.trim())) {
    return fail("RELATIONSHIP_UNIVERSE_SCOPE_EVIDENCE_REFS_INVALID");
  }
  return uniqueSorted(value.map((item) => (item as string).trim()));
}

function emptyCounts(): Record<OpportunityAccessCoverageStateV1, number> {
  return { EVIDENCED: 0, NEEDS_VERIFICATION: 0, MISSING: 0 };
}

function emptyAccessCoverage(): Record<
  OpportunityAccessFactKindV1,
  Record<OpportunityAccessCoverageStateV1, number>
> {
  return {
    DECISION_MAKER: emptyCounts(),
    SPONSORSHIP_LINK: emptyCounts(),
    WARM_ACCESS_PATH: emptyCounts(),
    PLANNING_WINDOW: emptyCounts()
  };
}

function normalizeSubject(
  raw: unknown,
  asOf: string
): RelationshipUniverseCoverageSubjectV1 {
  if (!isPlainObject(raw) || Object.keys(raw).some((key) => !SUBJECT_KEYS.has(key))) {
    return fail("RELATIONSHIP_UNIVERSE_SUBJECT_INVALID");
  }

  if (!DOMAINS.has(raw.domain as RelationshipUniverseDomainV1)) {
    return fail("RELATIONSHIP_UNIVERSE_DOMAIN_INVALID");
  }
  if (!PRIORITY_TIERS.has(raw.priorityTier as RelationshipUniversePriorityTierV1)) {
    return fail("RELATIONSHIP_UNIVERSE_PRIORITY_TIER_INVALID");
  }
  if (!Array.isArray(raw.accessEvidence)) {
    return fail("RELATIONSHIP_UNIVERSE_ACCESS_EVIDENCE_SET_REQUIRED");
  }

  const opportunityId = requiredText(raw.opportunityId, "RELATIONSHIP_UNIVERSE_OPPORTUNITY_ID_INVALID");
  const accessEvidence = raw.accessEvidence as OpportunityAccessEvidenceV1[];
  const accessMap = projectOpportunityAccessMapV1({
    opportunityId,
    asOf,
    evidence: accessEvidence
  });

  return {
    subjectId: requiredText(raw.subjectId, "RELATIONSHIP_UNIVERSE_SUBJECT_ID_INVALID"),
    subjectLabel: requiredText(raw.subjectLabel, "RELATIONSHIP_UNIVERSE_SUBJECT_LABEL_INVALID"),
    domain: raw.domain as RelationshipUniverseDomainV1,
    priorityTier: raw.priorityTier as RelationshipUniversePriorityTierV1,
    opportunityId,
    scopeEvidenceRefs: evidenceRefs(raw.scopeEvidenceRefs),
    observedAccessEvidenceCount: accessEvidence.length,
    accessMap
  };
}

function subjectSort(
  left: RelationshipUniverseCoverageSubjectV1,
  right: RelationshipUniverseCoverageSubjectV1
): number {
  return (
    (TIER_ORDER.get(left.priorityTier) ?? 99) - (TIER_ORDER.get(right.priorityTier) ?? 99) ||
    (DOMAIN_ORDER.get(left.domain) ?? 99) - (DOMAIN_ORDER.get(right.domain) ?? 99) ||
    left.subjectLabel.localeCompare(right.subjectLabel) ||
    left.subjectId.localeCompare(right.subjectId)
  );
}

export function buildRelationshipUniverseCoverageScorecardV1(input: {
  asOf: string | Date;
  subjects: readonly RelationshipUniverseCoverageSubjectInputV1[];
}): RelationshipUniverseCoverageScorecardV1 {
  if (!isPlainObject(input) || Object.keys(input).some((key) => !INPUT_KEYS.has(key))) {
    return fail("RELATIONSHIP_UNIVERSE_COVERAGE_INPUT_INVALID");
  }
  if (!Array.isArray(input.subjects)) return fail("RELATIONSHIP_UNIVERSE_SUBJECTS_REQUIRED");

  const asOf = iso(input.asOf, "RELATIONSHIP_UNIVERSE_AS_OF_INVALID");
  const subjects = input.subjects.map((subject) => normalizeSubject(subject, asOf));
  const seenSubjectIds = new Set<string>();
  for (const subject of subjects) {
    if (seenSubjectIds.has(subject.subjectId)) return fail("RELATIONSHIP_UNIVERSE_DUPLICATE_SUBJECT_ID");
    seenSubjectIds.add(subject.subjectId);
  }
  subjects.sort(subjectSort);

  const mutableGroups = new Map<
    string,
    {
      domain: RelationshipUniverseDomainV1;
      priorityTier: RelationshipUniversePriorityTierV1;
      subjectCount: number;
      subjectsWithObservedAccessEvidence: number;
      subjectsWithEvidencedAccess: number;
      subjectsNeedingVerification: number;
      researchGapCount: number;
      accessCoverage: Record<
        OpportunityAccessFactKindV1,
        Record<OpportunityAccessCoverageStateV1, number>
      >;
    }
  >();
  const researchQueue: RelationshipUniverseResearchGapV1[] = [];

  for (const subject of subjects) {
    const groupKey = `${subject.domain}:${subject.priorityTier}`;
    let group = mutableGroups.get(groupKey);
    if (!group) {
      group = {
        domain: subject.domain,
        priorityTier: subject.priorityTier,
        subjectCount: 0,
        subjectsWithObservedAccessEvidence: 0,
        subjectsWithEvidencedAccess: 0,
        subjectsNeedingVerification: 0,
        researchGapCount: 0,
        accessCoverage: emptyAccessCoverage()
      };
      mutableGroups.set(groupKey, group);
    }

    group.subjectCount += 1;
    if (subject.observedAccessEvidenceCount > 0) group.subjectsWithObservedAccessEvidence += 1;
    if (FACT_KINDS.some((kind) => subject.accessMap.coverage[kind] === "EVIDENCED")) {
      group.subjectsWithEvidencedAccess += 1;
    }
    if (subject.accessMap.verificationRequired) group.subjectsNeedingVerification += 1;

    for (const kind of FACT_KINDS) {
      const state = subject.accessMap.coverage[kind];
      group.accessCoverage[kind][state] += 1;
      if (state === "EVIDENCED") continue;
      group.researchGapCount += 1;
      researchQueue.push({
        subjectId: subject.subjectId,
        subjectLabel: subject.subjectLabel,
        domain: subject.domain,
        priorityTier: subject.priorityTier,
        opportunityId: subject.opportunityId,
        kind,
        coverageState: state,
        scopeEvidenceRefs: subject.scopeEvidenceRefs
      });
    }
  }

  const groups: RelationshipUniverseCoverageGroupV1[] = [...mutableGroups.values()]
    .sort(
      (left, right) =>
        (TIER_ORDER.get(left.priorityTier) ?? 99) - (TIER_ORDER.get(right.priorityTier) ?? 99) ||
        (DOMAIN_ORDER.get(left.domain) ?? 99) - (DOMAIN_ORDER.get(right.domain) ?? 99)
    )
    .map((group) => ({ ...group }));

  researchQueue.sort(
    (left, right) =>
      (TIER_ORDER.get(left.priorityTier) ?? 99) - (TIER_ORDER.get(right.priorityTier) ?? 99) ||
      (DOMAIN_ORDER.get(left.domain) ?? 99) - (DOMAIN_ORDER.get(right.domain) ?? 99) ||
      left.subjectLabel.localeCompare(right.subjectLabel) ||
      FACT_KINDS.indexOf(left.kind) - FACT_KINDS.indexOf(right.kind) ||
      left.subjectId.localeCompare(right.subjectId)
  );

  return {
    asOf,
    totalSubjects: subjects.length,
    subjectsWithObservedAccessEvidence: subjects.filter((subject) => subject.observedAccessEvidenceCount > 0).length,
    subjectsWithEvidencedAccess: subjects.filter((subject) =>
      FACT_KINDS.some((kind) => subject.accessMap.coverage[kind] === "EVIDENCED")
    ).length,
    subjectsNeedingVerification: subjects.filter((subject) => subject.accessMap.verificationRequired).length,
    subjects,
    groups,
    researchQueue
  };
}
