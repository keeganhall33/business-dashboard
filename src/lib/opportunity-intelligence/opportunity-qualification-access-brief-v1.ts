import {
  OPPORTUNITY_QUALIFICATION_READINESS_VERSION_V1,
  type OpportunityQualificationReadinessDecisionV1,
  type OpportunityQualificationReadinessDispositionV1,
  type OpportunityQualificationReadinessResultV1
} from "@/lib/relationship-intelligence/opportunity-qualification-readiness-v1";
import {
  type OpportunityAccessFactKindV1,
  type OpportunityAccessMapV1
} from "@/lib/opportunity-intelligence/opportunity-access-map-v1";

export const OPPORTUNITY_QUALIFICATION_ACCESS_BRIEF_VERSION_V1 = "OPPORTUNITY_QUALIFICATION_ACCESS_BRIEF_V1" as const;

export type OpportunityQualificationAccessBriefDispositionV1 =
  | "READY_FOR_INTERNAL_REVIEW"
  | "CONTEXT_ONLY"
  | "RESEARCH_REQUIRED"
  | "VERIFY_REQUIRED"
  | "SUPPRESS";

export type OpportunityQualificationAccessBriefNextActionV1 =
  | "REVIEW_QUALIFICATION_AND_ACCESS_EVIDENCE"
  | "ATTACH_CONTEXT_TO_EXACT_EXISTING_OPPORTUNITY_ONLY"
  | "RESEARCH_ACCESS_OR_QUALIFICATION_GAPS"
  | "VERIFY_CONFLICTED_OR_TAMPERED_EVIDENCE"
  | "NONE";

export type OpportunityQualificationAccessBriefDecisionV1 = Readonly<{
  candidateId: string;
  disposition: OpportunityQualificationAccessBriefDispositionV1;
  signalType: OpportunityQualificationReadinessDecisionV1["signalType"];
  canonicalOrganizationRef: string | null;
  canonicalPersonRef: string | null;
  canonicalOpportunityRef: string | null;
  observedAt: string;
  sourceKinds: OpportunityQualificationReadinessDecisionV1["sourceKinds"];
  qualificationEvidenceRefs: readonly string[];
  accessMapAsOf: string | null;
  decisionMakers: OpportunityAccessMapV1["decisionMakers"];
  sponsorshipLinks: OpportunityAccessMapV1["sponsorshipLinks"];
  warmAccessPaths: OpportunityAccessMapV1["warmAccessPaths"];
  planningWindows: OpportunityAccessMapV1["planningWindows"];
  accessResearchGaps: readonly OpportunityAccessFactKindV1[];
  accessVerificationRequired: boolean;
  evidenceRefs: readonly string[];
  sponsorInterest: "NOT_ESTABLISHED";
  budgetAvailability: "NOT_ESTABLISHED";
  opportunityCertainty: "NOT_ESTABLISHED";
  dealLikelihood: "NOT_ESTABLISHED";
  qualificationOutcome: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
  nextInternalAction: OpportunityQualificationAccessBriefNextActionV1;
  reasonCodes: readonly string[];
}>;

export type OpportunityQualificationAccessBriefInputV1 = Readonly<{
  evaluatedAt: string | Date;
  qualification: OpportunityQualificationReadinessResultV1;
  accessMaps: readonly OpportunityAccessMapV1[];
  maximumQualificationAgeMinutes: number;
  maximumAccessMapAgeMinutes: number;
}>;

export type OpportunityQualificationAccessBriefResultV1 = Readonly<{
  version: typeof OPPORTUNITY_QUALIFICATION_ACCESS_BRIEF_VERSION_V1;
  generatedAt: string;
  status: "READY" | "BLOCKED";
  issues: readonly string[];
  decisions: readonly OpportunityQualificationAccessBriefDecisionV1[];
  counts: Readonly<Record<OpportunityQualificationAccessBriefDispositionV1, number>>;
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    internalReviewAllowed: true;
    qualificationMutationAuthorized: false;
    crmMutationAuthorized: false;
    relationshipMutationAuthorized: false;
    contactDiscoveryAuthorized: false;
    outreachAuthorized: false;
    spendAuthorized: false;
    contractAuthorized: false;
    externalActionAuthorized: false;
  }>;
}>;

const MINUTE_MS = 60_000;
const MAX_AGE_MINUTES = 43_200;
const ACCESS_KINDS: readonly OpportunityAccessFactKindV1[] = [
  "DECISION_MAKER",
  "SPONSORSHIP_LINK",
  "WARM_ACCESS_PATH",
  "PLANNING_WINDOW"
];

const LIMITATIONS = Object.freeze([
  "This brief joins already-governed opportunity qualification readiness to an exact canonical opportunity access map for internal review only.",
  "Exact canonical opportunity identity is the only join key. Similar names, organizations, titles, people, source count, or prose never create a join.",
  "Decision makers, sponsorship links, warm paths, and planning windows are surfaced only as already-evidenced access-map facts. Missing access evidence remains a research gap.",
  "The brief does not establish sponsor interest, budget, opportunity certainty, deal likelihood, qualification outcome, confidence, monetary value, willingness to introduce Keegan, or causal attribution.",
  "No CRM/graph mutation, contact discovery, outreach, spend, contract, approval bypass, or external action is authorized."
] as const);

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  internalReviewAllowed: true as const,
  qualificationMutationAuthorized: false as const,
  crmMutationAuthorized: false as const,
  relationshipMutationAuthorized: false as const,
  contactDiscoveryAuthorized: false as const,
  outreachAuthorized: false as const,
  spendAuthorized: false as const,
  contractAuthorized: false as const,
  externalActionAuthorized: false as const
});

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function timestamp(value: string | Date, label: string): string {
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return parsed.toISOString();
}

function boundedAge(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > MAX_AGE_MINUTES) {
    throw new Error(`${label} must be an integer between 1 and ${MAX_AGE_MINUTES}`);
  }
  return value;
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0).map((value) => value.trim()))].sort((a, b) => a.localeCompare(b)));
}

function projectionFreshnessIssue(
  observedAt: string,
  evaluatedAtMs: number,
  maximumAgeMinutes: number,
  prefix: string
): string | null {
  const observedAtMs = Date.parse(observedAt);
  if (!Number.isFinite(observedAtMs)) return `${prefix}_TIMESTAMP_INVALID`;
  if (observedAtMs > evaluatedAtMs) return `${prefix}_IN_FUTURE`;
  if (evaluatedAtMs - observedAtMs > maximumAgeMinutes * MINUTE_MS) return `${prefix}_STALE`;
  return null;
}

function expectedQualificationCounts(decisions: readonly OpportunityQualificationReadinessDecisionV1[]) {
  const counts: Record<OpportunityQualificationReadinessDispositionV1, number> = {
    READY_FOR_INTERNAL_QUALIFICATION_REVIEW: 0,
    CONTEXT_ONLY: 0,
    RESEARCH_REQUIRED: 0,
    VERIFY_REQUIRED: 0,
    SUPPRESS: 0
  };
  for (const decision of decisions) counts[decision.disposition] += 1;
  return counts;
}

function qualificationIntegrityIssues(qualification: OpportunityQualificationReadinessResultV1): readonly string[] {
  const issues = new Set<string>();
  if (qualification.version !== OPPORTUNITY_QUALIFICATION_READINESS_VERSION_V1) issues.add("QUALIFICATION_VERSION_UNSUPPORTED");
  if (qualification.status !== "READY") issues.add("QUALIFICATION_NOT_READY");
  if (qualification.issues.length > 0) issues.add("QUALIFICATION_HAS_UPSTREAM_ISSUES");
  if (
    qualification.authority.analysisOnly !== true ||
    qualification.authority.internalQualificationReviewAllowed !== true ||
    qualification.authority.qualificationMutationAuthorized !== false ||
    qualification.authority.crmMutationAuthorized !== false ||
    qualification.authority.relationshipMutationAuthorized !== false ||
    qualification.authority.contactDiscoveryAuthorized !== false ||
    qualification.authority.outreachAuthorized !== false ||
    qualification.authority.spendAuthorized !== false ||
    qualification.authority.contractAuthorized !== false ||
    qualification.authority.externalActionAuthorized !== false
  ) issues.add("QUALIFICATION_AUTHORITY_WIDENED");

  const seen = new Set<string>();
  for (const decision of qualification.decisions) {
    if (!decision.candidateId?.trim()) issues.add("QUALIFICATION_CANDIDATE_ID_INVALID");
    else if (seen.has(decision.candidateId)) issues.add("QUALIFICATION_DUPLICATE_CANDIDATE_ID");
    else seen.add(decision.candidateId);
  }
  const expected = expectedQualificationCounts(qualification.decisions);
  for (const disposition of Object.keys(expected) as OpportunityQualificationReadinessDispositionV1[]) {
    if (qualification.counts[disposition] !== expected[disposition]) issues.add("QUALIFICATION_COUNTS_MISMATCH");
  }
  return uniqueSorted([...issues]);
}

function accessMapIntegrityIssues(map: OpportunityAccessMapV1): readonly string[] {
  const issues = new Set<string>();
  if (!map.opportunityId?.trim()) issues.add("ACCESS_MAP_OPPORTUNITY_ID_INVALID");
  if (!Number.isFinite(Date.parse(map.asOf))) issues.add("ACCESS_MAP_AS_OF_INVALID");

  const counts: Readonly<Record<OpportunityAccessFactKindV1, number>> = {
    DECISION_MAKER: map.decisionMakers.length,
    SPONSORSHIP_LINK: map.sponsorshipLinks.length,
    WARM_ACCESS_PATH: map.warmAccessPaths.length,
    PLANNING_WINDOW: map.planningWindows.length
  };
  for (const kind of ACCESS_KINDS) {
    const expectedCoverage = counts[kind] > 0
      ? "EVIDENCED"
      : map.withheld.some((entry) => entry.kind === kind)
        ? "NEEDS_VERIFICATION"
        : "MISSING";
    if (map.coverage[kind] !== expectedCoverage) issues.add("ACCESS_MAP_COVERAGE_MISMATCH");
  }
  const expectedGaps = ACCESS_KINDS.filter((kind) => map.coverage[kind] !== "EVIDENCED");
  if (JSON.stringify(map.researchGaps) !== JSON.stringify(expectedGaps)) issues.add("ACCESS_MAP_RESEARCH_GAPS_MISMATCH");
  if (map.verificationRequired !== (map.withheld.length > 0)) issues.add("ACCESS_MAP_VERIFICATION_STATE_MISMATCH");

  const projected = [
    ...map.decisionMakers,
    ...map.sponsorshipLinks,
    ...map.warmAccessPaths,
    ...map.planningWindows
  ];
  for (const item of projected) {
    if (!Array.isArray(item.evidenceIds) || item.evidenceIds.length === 0) issues.add("ACCESS_MAP_EVIDENCE_IDS_MISSING");
    if (!Array.isArray(item.evidenceRefs) || item.evidenceRefs.length === 0) issues.add("ACCESS_MAP_EVIDENCE_REFS_MISSING");
    const observedAtMs = Date.parse(item.observedAt);
    if (!Number.isFinite(observedAtMs) || observedAtMs > Date.parse(map.asOf)) issues.add("ACCESS_MAP_PROJECTED_EVIDENCE_TIME_INVALID");
  }
  for (const window of map.planningWindows) {
    if (!Number.isFinite(Date.parse(window.windowStart)) || !Number.isFinite(Date.parse(window.windowEnd)) || Date.parse(window.windowEnd) < Date.parse(map.asOf)) {
      issues.add("ACCESS_MAP_PLANNING_WINDOW_INVALID");
    }
  }
  return uniqueSorted([...issues]);
}

function mapUpstreamDisposition(disposition: OpportunityQualificationReadinessDispositionV1): OpportunityQualificationAccessBriefDispositionV1 {
  if (disposition === "READY_FOR_INTERNAL_QUALIFICATION_REVIEW") return "READY_FOR_INTERNAL_REVIEW";
  return disposition;
}

function nextAction(disposition: OpportunityQualificationAccessBriefDispositionV1): OpportunityQualificationAccessBriefNextActionV1 {
  switch (disposition) {
    case "READY_FOR_INTERNAL_REVIEW": return "REVIEW_QUALIFICATION_AND_ACCESS_EVIDENCE";
    case "CONTEXT_ONLY": return "ATTACH_CONTEXT_TO_EXACT_EXISTING_OPPORTUNITY_ONLY";
    case "RESEARCH_REQUIRED": return "RESEARCH_ACCESS_OR_QUALIFICATION_GAPS";
    case "VERIFY_REQUIRED": return "VERIFY_CONFLICTED_OR_TAMPERED_EVIDENCE";
    case "SUPPRESS": return "NONE";
  }
}

function emptyAccess() {
  return {
    accessMapAsOf: null,
    decisionMakers: [] as OpportunityAccessMapV1["decisionMakers"],
    sponsorshipLinks: [] as OpportunityAccessMapV1["sponsorshipLinks"],
    warmAccessPaths: [] as OpportunityAccessMapV1["warmAccessPaths"],
    planningWindows: [] as OpportunityAccessMapV1["planningWindows"],
    accessResearchGaps: [] as readonly OpportunityAccessFactKindV1[],
    accessVerificationRequired: false,
    accessEvidenceRefs: [] as readonly string[]
  };
}

function accessEvidenceRefs(map: OpportunityAccessMapV1): readonly string[] {
  return uniqueSorted([
    ...map.decisionMakers.flatMap((item) => [...item.evidenceRefs]),
    ...map.sponsorshipLinks.flatMap((item) => [...item.evidenceRefs]),
    ...map.warmAccessPaths.flatMap((item) => [...item.evidenceRefs]),
    ...map.planningWindows.flatMap((item) => [...item.evidenceRefs])
  ]);
}

function buildDecision(
  decision: OpportunityQualificationReadinessDecisionV1,
  accessMaps: ReadonlyMap<string, OpportunityAccessMapV1>,
  evaluatedAtMs: number,
  maximumAccessMapAgeMinutes: number
): OpportunityQualificationAccessBriefDecisionV1 {
  const reasons = new Set<string>(decision.reasonCodes.map((reason) => `QUALIFICATION:${reason}`));
  let disposition = mapUpstreamDisposition(decision.disposition);
  let access = emptyAccess();

  if (decision.disposition === "READY_FOR_INTERNAL_QUALIFICATION_REVIEW") {
    if (!decision.canonicalOpportunityRef) {
      disposition = "VERIFY_REQUIRED";
      reasons.add("READY_QUALIFICATION_MISSING_CANONICAL_OPPORTUNITY");
    } else {
      const map = accessMaps.get(decision.canonicalOpportunityRef);
      if (!map) {
        disposition = "RESEARCH_REQUIRED";
        reasons.add("EXACT_OPPORTUNITY_ACCESS_MAP_REQUIRED");
      } else {
        const freshness = projectionFreshnessIssue(map.asOf, evaluatedAtMs, maximumAccessMapAgeMinutes, "ACCESS_MAP");
        const integrity = accessMapIntegrityIssues(map);
        if (freshness === "ACCESS_MAP_IN_FUTURE" || freshness === "ACCESS_MAP_TIMESTAMP_INVALID" || integrity.length > 0) {
          disposition = "VERIFY_REQUIRED";
          if (freshness) reasons.add(freshness);
          for (const issue of integrity) reasons.add(issue);
        } else if (freshness === "ACCESS_MAP_STALE") {
          disposition = "RESEARCH_REQUIRED";
          reasons.add(freshness);
        } else {
          access = {
            accessMapAsOf: map.asOf,
            decisionMakers: map.decisionMakers,
            sponsorshipLinks: map.sponsorshipLinks,
            warmAccessPaths: map.warmAccessPaths,
            planningWindows: map.planningWindows,
            accessResearchGaps: map.researchGaps,
            accessVerificationRequired: map.verificationRequired,
            accessEvidenceRefs: accessEvidenceRefs(map)
          };
          if (map.verificationRequired) {
            disposition = "VERIFY_REQUIRED";
            reasons.add("ACCESS_MAP_CONTAINS_WITHHELD_EVIDENCE_REQUIRING_VERIFICATION");
          } else if (map.researchGaps.length > 0) {
            reasons.add("ACCESS_MAP_HAS_EXPLICIT_RESEARCH_GAPS");
          } else {
            reasons.add("EXACT_CURRENT_ACCESS_EVIDENCE_AVAILABLE_FOR_INTERNAL_REVIEW");
          }
        }
      }
    }
  }

  const qualificationEvidenceRefs = uniqueSorted(decision.evidenceRefs);
  return freezeDeep({
    candidateId: decision.candidateId,
    disposition,
    signalType: decision.signalType,
    canonicalOrganizationRef: decision.canonicalOrganizationRef,
    canonicalPersonRef: decision.canonicalPersonRef,
    canonicalOpportunityRef: decision.canonicalOpportunityRef,
    observedAt: decision.observedAt,
    sourceKinds: [...decision.sourceKinds],
    qualificationEvidenceRefs,
    accessMapAsOf: access.accessMapAsOf,
    decisionMakers: [...access.decisionMakers],
    sponsorshipLinks: [...access.sponsorshipLinks],
    warmAccessPaths: [...access.warmAccessPaths],
    planningWindows: [...access.planningWindows],
    accessResearchGaps: [...access.accessResearchGaps],
    accessVerificationRequired: access.accessVerificationRequired,
    evidenceRefs: uniqueSorted([...qualificationEvidenceRefs, ...access.accessEvidenceRefs]),
    sponsorInterest: "NOT_ESTABLISHED" as const,
    budgetAvailability: "NOT_ESTABLISHED" as const,
    opportunityCertainty: "NOT_ESTABLISHED" as const,
    dealLikelihood: "NOT_ESTABLISHED" as const,
    qualificationOutcome: "NOT_ESTABLISHED" as const,
    confidence: "NOT_ESTABLISHED" as const,
    monetaryValue: null,
    nextInternalAction: nextAction(disposition),
    reasonCodes: uniqueSorted([...reasons])
  });
}

function emptyCounts(): Record<OpportunityQualificationAccessBriefDispositionV1, number> {
  return {
    READY_FOR_INTERNAL_REVIEW: 0,
    CONTEXT_ONLY: 0,
    RESEARCH_REQUIRED: 0,
    VERIFY_REQUIRED: 0,
    SUPPRESS: 0
  };
}

export function buildOpportunityQualificationAccessBriefV1(
  input: OpportunityQualificationAccessBriefInputV1
): OpportunityQualificationAccessBriefResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!input.qualification || typeof input.qualification !== "object" || Array.isArray(input.qualification)) throw new Error("qualification must be an object");
  if (!Array.isArray(input.accessMaps)) throw new Error("accessMaps must be an array");

  const generatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(generatedAt);
  const maximumQualificationAgeMinutes = boundedAge(input.maximumQualificationAgeMinutes, "maximumQualificationAgeMinutes");
  const maximumAccessMapAgeMinutes = boundedAge(input.maximumAccessMapAgeMinutes, "maximumAccessMapAgeMinutes");

  const issues = new Set<string>(qualificationIntegrityIssues(input.qualification));
  const qualificationFreshness = projectionFreshnessIssue(
    input.qualification.generatedAt,
    evaluatedAtMs,
    maximumQualificationAgeMinutes,
    "QUALIFICATION"
  );
  if (qualificationFreshness) issues.add(qualificationFreshness);

  const accessMaps = new Map<string, OpportunityAccessMapV1>();
  for (const map of input.accessMaps) {
    if (!map || typeof map !== "object" || Array.isArray(map)) {
      issues.add("ACCESS_MAP_INVALID");
      continue;
    }
    if (!map.opportunityId?.trim()) {
      issues.add("ACCESS_MAP_OPPORTUNITY_ID_INVALID");
      continue;
    }
    if (accessMaps.has(map.opportunityId)) {
      issues.add("DUPLICATE_ACCESS_MAP_FOR_CANONICAL_OPPORTUNITY");
      continue;
    }
    accessMaps.set(map.opportunityId, map);
  }

  if (issues.size > 0) {
    return freezeDeep({
      version: OPPORTUNITY_QUALIFICATION_ACCESS_BRIEF_VERSION_V1,
      generatedAt,
      status: "BLOCKED" as const,
      issues: uniqueSorted([...issues]),
      decisions: [],
      counts: emptyCounts(),
      limitations: [...LIMITATIONS],
      authority: AUTHORITY
    });
  }

  const decisions = input.qualification.decisions
    .map((decision) => buildDecision(decision, accessMaps, evaluatedAtMs, maximumAccessMapAgeMinutes))
    .sort((a, b) => {
      const order: Record<OpportunityQualificationAccessBriefDispositionV1, number> = {
        VERIFY_REQUIRED: 0,
        READY_FOR_INTERNAL_REVIEW: 1,
        RESEARCH_REQUIRED: 2,
        CONTEXT_ONLY: 3,
        SUPPRESS: 4
      };
      return order[a.disposition] - order[b.disposition] || Date.parse(b.observedAt) - Date.parse(a.observedAt) || a.candidateId.localeCompare(b.candidateId);
    });

  const counts = emptyCounts();
  for (const decision of decisions) counts[decision.disposition] += 1;

  return freezeDeep({
    version: OPPORTUNITY_QUALIFICATION_ACCESS_BRIEF_VERSION_V1,
    generatedAt,
    status: "READY" as const,
    issues: [],
    decisions,
    counts,
    limitations: [...LIMITATIONS],
    authority: AUTHORITY
  });
}
