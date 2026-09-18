import {
  OPPORTUNITY_SIGNAL_INTAKE_VERSION_V1,
  type OpportunitySignalIntakeDecisionV1,
  type OpportunitySignalIntakeResultV1,
  type OpportunitySignalTypeV1
} from "@/lib/relationship-intelligence/opportunity-signal-intake-v1";

export const OPPORTUNITY_QUALIFICATION_READINESS_VERSION_V1 = "OPPORTUNITY_QUALIFICATION_READINESS_V1" as const;

export type OpportunityQualificationReadinessDispositionV1 =
  | "READY_FOR_INTERNAL_QUALIFICATION_REVIEW"
  | "CONTEXT_ONLY"
  | "RESEARCH_REQUIRED"
  | "VERIFY_REQUIRED"
  | "SUPPRESS";

export type OpportunityQualificationNextInternalActionV1 =
  | "REVIEW_EVIDENCE_PACKET"
  | "RESEARCH_CANONICAL_OPPORTUNITY_OR_ENTITY"
  | "VERIFY_CONFLICTED_OR_TAMPERED_EVIDENCE"
  | "ATTACH_CONTEXT_TO_EXACT_EXISTING_OPPORTUNITY_ONLY"
  | "NONE";

export type OpportunityQualificationReadinessDecisionV1 = Readonly<{
  candidateId: string;
  disposition: OpportunityQualificationReadinessDispositionV1;
  signalType: OpportunitySignalTypeV1;
  canonicalOrganizationRef: string | null;
  canonicalPersonRef: string | null;
  canonicalOpportunityRef: string | null;
  observedAt: string;
  sourceKinds: OpportunitySignalIntakeDecisionV1["sourceKinds"];
  sourceRefs: readonly string[];
  evidenceRefs: readonly string[];
  supportedContext: readonly (
    | "PLANNING_WINDOW"
    | "DECISION_MAKER_AUTHORITY"
    | "SPONSORSHIP_RELATIONSHIP"
    | "WARM_ACCESS"
  )[];
  sponsorInterest: "NOT_ESTABLISHED";
  budgetAvailability: "NOT_ESTABLISHED";
  opportunityCertainty: "NOT_ESTABLISHED";
  dealLikelihood: "NOT_ESTABLISHED";
  confidenceFromSourceCount: "NOT_ESTABLISHED";
  qualificationOutcome: "NOT_ESTABLISHED";
  nextInternalAction: OpportunityQualificationNextInternalActionV1;
  evidenceGaps: readonly string[];
  reasonCodes: readonly string[];
}>;

export type OpportunityQualificationReadinessInputV1 = Readonly<{
  evaluatedAt: string | Date;
  intake: OpportunitySignalIntakeResultV1;
  maximumProjectionAgeMinutes?: number;
}>;

export type OpportunityQualificationReadinessResultV1 = Readonly<{
  version: typeof OPPORTUNITY_QUALIFICATION_READINESS_VERSION_V1;
  generatedAt: string;
  status: "READY" | "BLOCKED";
  issues: readonly string[];
  decisions: readonly OpportunityQualificationReadinessDecisionV1[];
  counts: Readonly<Record<OpportunityQualificationReadinessDispositionV1, number>>;
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    internalQualificationReviewAllowed: true;
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
const DEFAULT_MAX_PROJECTION_AGE_MINUTES = 180;
const MAX_PROJECTION_AGE_MINUTES = 1_440;

const OPPORTUNITY_SIGNAL_TYPES = new Set<OpportunitySignalTypeV1>([
  "SPONSORSHIP_OPPORTUNITY",
  "PARTNERSHIP_OPPORTUNITY",
  "COMMERCIAL_INTEREST",
  "OTHER_BUSINESS_OPPORTUNITY"
]);

const CONTEXT_SIGNAL_TYPES = new Set<OpportunitySignalTypeV1>([
  "PLANNING_WINDOW",
  "DECISION_MAKER_CHANGE",
  "WARM_INTRO"
]);

const LIMITATIONS = Object.freeze([
  "This layer decides whether an already-normalized evidence packet is ready for internal qualification review. It does not qualify an opportunity, create CRM truth, or infer facts from raw content.",
  "An exact canonical opportunity ref and a current canonical organization or person anchor are required before an opportunity signal can reach internal qualification review. Similar names, text, organizations, or source count never substitute for that evidence.",
  "Planning-window, decision-maker-change, and warm-intro signals are context only. They may attach only to an exact canonical opportunity and cannot become opportunities by themselves.",
  "Source count and contextual claims never establish sponsor interest, budget, certainty, confidence, deal likelihood, commercial value, willingness to introduce Keegan, or an actual qualification outcome.",
  "READY_FOR_INTERNAL_QUALIFICATION_REVIEW authorizes review only. CRM/graph mutation, contact discovery, outreach, spend, contracts, and external action remain separately governed."
] as const);

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  internalQualificationReviewAllowed: true as const,
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

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number, label: string): number {
  const candidate = value == null ? fallback : value;
  if (typeof candidate !== "number" || !Number.isInteger(candidate) || candidate < minimum || candidate > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return candidate;
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0))].sort((a, b) => a.localeCompare(b)));
}

function nonEmptyRefs(values: readonly string[], label: string): readonly string[] {
  if (!Array.isArray(values) || values.length === 0) throw new Error(`${label} must be a non-empty array`);
  const normalized = values.map((value, index) => {
    if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label}[${index}] must be a non-empty string`);
    return value.trim();
  });
  return uniqueSorted(normalized);
}

function projectionIssue(
  generatedAt: string,
  evaluatedAtMs: number,
  maximumProjectionAgeMinutes: number
): string | null {
  const generatedAtMs = Date.parse(generatedAt);
  if (!Number.isFinite(generatedAtMs)) return "INTAKE_GENERATED_AT_INVALID";
  if (generatedAtMs > evaluatedAtMs) return "INTAKE_GENERATED_IN_FUTURE";
  if (evaluatedAtMs - generatedAtMs > maximumProjectionAgeMinutes * MINUTE_MS) return "INTAKE_PROJECTION_STALE";
  return null;
}

function refsBelongToDecision(
  refs: readonly string[],
  decisionEvidence: ReadonlySet<string>,
  reasonCodes: Set<string>,
  claim: string
): void {
  for (const ref of refs) {
    if (!decisionEvidence.has(ref)) reasonCodes.add(`${claim}_EVIDENCE_OUTSIDE_INTAKE_LINEAGE`);
  }
}

function integrityReasons(decision: OpportunitySignalIntakeDecisionV1): readonly string[] {
  const reasons = new Set<string>();
  const evidenceRefs = nonEmptyRefs(decision.evidenceRefs, `${decision.candidateId}.evidenceRefs`);
  nonEmptyRefs(decision.sourceRefs, `${decision.candidateId}.sourceRefs`);
  const decisionEvidence = new Set(evidenceRefs);

  const observedAtMs = Date.parse(decision.observedAt);
  if (!Number.isFinite(observedAtMs)) reasons.add("OBSERVED_AT_INVALID");

  if (decision.planningWindow.state === "SUPPORTED") {
    refsBelongToDecision(decision.planningWindow.evidenceRefs, decisionEvidence, reasons, "PLANNING_WINDOW");
    const startAtMs = Date.parse(decision.planningWindow.startAt);
    const endAtMs = Date.parse(decision.planningWindow.endAt);
    if (!Number.isFinite(startAtMs) || !Number.isFinite(endAtMs) || endAtMs <= startAtMs) reasons.add("PLANNING_WINDOW_INVALID");
  }

  if (decision.decisionMakerAuthority.state === "SUPPORTED") {
    refsBelongToDecision(decision.decisionMakerAuthority.evidenceRefs, decisionEvidence, reasons, "DECISION_MAKER_AUTHORITY");
    if (!decision.canonicalPersonRef) reasons.add("DECISION_MAKER_AUTHORITY_WITHOUT_CANONICAL_PERSON");
  }

  if (decision.sponsorshipRelationship.state === "SUPPORTED") {
    refsBelongToDecision(decision.sponsorshipRelationship.evidenceRefs, decisionEvidence, reasons, "SPONSORSHIP_RELATIONSHIP");
    if (!decision.canonicalOrganizationRef) reasons.add("SPONSORSHIP_RELATIONSHIP_WITHOUT_CANONICAL_ORGANIZATION");
  }

  if (decision.warmAccess.state === "SUPPORTED") {
    refsBelongToDecision(decision.warmAccess.evidenceRefs, decisionEvidence, reasons, "WARM_ACCESS");
    if (!decision.canonicalPersonRef) reasons.add("WARM_ACCESS_WITHOUT_CANONICAL_PERSON");
  }

  return uniqueSorted([...reasons]);
}

function supportedContext(decision: OpportunitySignalIntakeDecisionV1): OpportunityQualificationReadinessDecisionV1["supportedContext"] {
  const values: string[] = [];
  if (decision.planningWindow.state === "SUPPORTED") values.push("PLANNING_WINDOW");
  if (decision.decisionMakerAuthority.state === "SUPPORTED") values.push("DECISION_MAKER_AUTHORITY");
  if (decision.sponsorshipRelationship.state === "SUPPORTED") values.push("SPONSORSHIP_RELATIONSHIP");
  if (decision.warmAccess.state === "SUPPORTED") values.push("WARM_ACCESS");
  return uniqueSorted(values) as OpportunityQualificationReadinessDecisionV1["supportedContext"];
}

function nextInternalAction(disposition: OpportunityQualificationReadinessDispositionV1): OpportunityQualificationNextInternalActionV1 {
  switch (disposition) {
    case "READY_FOR_INTERNAL_QUALIFICATION_REVIEW":
      return "REVIEW_EVIDENCE_PACKET";
    case "CONTEXT_ONLY":
      return "ATTACH_CONTEXT_TO_EXACT_EXISTING_OPPORTUNITY_ONLY";
    case "RESEARCH_REQUIRED":
      return "RESEARCH_CANONICAL_OPPORTUNITY_OR_ENTITY";
    case "VERIFY_REQUIRED":
      return "VERIFY_CONFLICTED_OR_TAMPERED_EVIDENCE";
    case "SUPPRESS":
      return "NONE";
  }
}

function classify(
  decision: OpportunitySignalIntakeDecisionV1,
  evaluatedAtMs: number,
  integrity: readonly string[],
  evidenceGaps: Set<string>,
  reasonCodes: Set<string>
): OpportunityQualificationReadinessDispositionV1 {
  for (const reason of decision.reasonCodes) reasonCodes.add(`INTAKE:${reason}`);
  for (const reason of integrity) reasonCodes.add(`INTEGRITY:${reason}`);

  const observedAtMs = Date.parse(decision.observedAt);
  if (!Number.isFinite(observedAtMs) || observedAtMs > evaluatedAtMs) {
    evidenceGaps.add("VALID_NON_FUTURE_OBSERVED_AT_REQUIRED");
    reasonCodes.add("OBSERVATION_TIME_REQUIRES_VERIFICATION");
    return "VERIFY_REQUIRED";
  }

  if (integrity.length > 0) {
    evidenceGaps.add("INTAKE_EVIDENCE_INTEGRITY_REQUIRED");
    reasonCodes.add("DOWNSTREAM_INTAKE_INTEGRITY_CHECK_FAILED");
    return "VERIFY_REQUIRED";
  }

  if (decision.disposition === "SUPPRESS" || decision.signalType === "NONE") return "SUPPRESS";
  if (decision.disposition === "VERIFY_REQUIRED") return "VERIFY_REQUIRED";
  if (decision.disposition === "RESEARCH_REQUIRED") return "RESEARCH_REQUIRED";

  if (CONTEXT_SIGNAL_TYPES.has(decision.signalType)) {
    if (!decision.canonicalOpportunityRef) {
      evidenceGaps.add("EXACT_CANONICAL_OPPORTUNITY_REQUIRED_FOR_CONTEXT_ATTACHMENT");
      reasonCodes.add("CONTEXT_SIGNAL_HAS_NO_EXACT_OPPORTUNITY_ANCHOR");
      return "RESEARCH_REQUIRED";
    }
    reasonCodes.add("SIGNAL_IS_CONTEXT_NOT_STANDALONE_OPPORTUNITY");
    return "CONTEXT_ONLY";
  }

  if (!OPPORTUNITY_SIGNAL_TYPES.has(decision.signalType)) {
    reasonCodes.add("SIGNAL_TYPE_NOT_ELIGIBLE_FOR_QUALIFICATION_REVIEW");
    return "SUPPRESS";
  }

  if (!decision.canonicalOpportunityRef) {
    evidenceGaps.add("EXACT_CANONICAL_OPPORTUNITY_REQUIRED");
    reasonCodes.add("CAPTURED_SIGNAL_LACKS_EXACT_CANONICAL_OPPORTUNITY");
    return "RESEARCH_REQUIRED";
  }

  if (!decision.canonicalOrganizationRef && !decision.canonicalPersonRef) {
    evidenceGaps.add("CANONICAL_ORGANIZATION_OR_PERSON_REQUIRED");
    reasonCodes.add("OPPORTUNITY_LACKS_CURRENT_CANONICAL_ENTITY_ANCHOR");
    return "RESEARCH_REQUIRED";
  }

  if (decision.signalType === "SPONSORSHIP_OPPORTUNITY" && !decision.canonicalOrganizationRef) {
    evidenceGaps.add("CANONICAL_SPONSOR_ORGANIZATION_REQUIRED");
    reasonCodes.add("SPONSORSHIP_OPPORTUNITY_LACKS_CANONICAL_ORGANIZATION");
    return "RESEARCH_REQUIRED";
  }

  if (decision.sourceKinds.length > 1) reasonCodes.add("MULTIPLE_SOURCES_PRESERVED_WITHOUT_CONFIDENCE_UPLIFT");
  reasonCodes.add("EXACT_OPPORTUNITY_AND_CANONICAL_ENTITY_EVIDENCE_READY_FOR_INTERNAL_REVIEW");
  return "READY_FOR_INTERNAL_QUALIFICATION_REVIEW";
}

function buildDecision(
  decision: OpportunitySignalIntakeDecisionV1,
  evaluatedAtMs: number
): OpportunityQualificationReadinessDecisionV1 {
  const evidenceGaps = new Set<string>();
  const reasonCodes = new Set<string>();
  const integrity = integrityReasons(decision);
  const disposition = classify(decision, evaluatedAtMs, integrity, evidenceGaps, reasonCodes);

  return freezeDeep({
    candidateId: decision.candidateId,
    disposition,
    signalType: decision.signalType,
    canonicalOrganizationRef: decision.canonicalOrganizationRef,
    canonicalPersonRef: decision.canonicalPersonRef,
    canonicalOpportunityRef: decision.canonicalOpportunityRef,
    observedAt: decision.observedAt,
    sourceKinds: [...decision.sourceKinds],
    sourceRefs: [...decision.sourceRefs],
    evidenceRefs: [...decision.evidenceRefs],
    supportedContext: [...supportedContext(decision)],
    sponsorInterest: "NOT_ESTABLISHED" as const,
    budgetAvailability: "NOT_ESTABLISHED" as const,
    opportunityCertainty: "NOT_ESTABLISHED" as const,
    dealLikelihood: "NOT_ESTABLISHED" as const,
    confidenceFromSourceCount: "NOT_ESTABLISHED" as const,
    qualificationOutcome: "NOT_ESTABLISHED" as const,
    nextInternalAction: nextInternalAction(disposition),
    evidenceGaps: uniqueSorted([...evidenceGaps]),
    reasonCodes: uniqueSorted([...reasonCodes])
  });
}

function emptyCounts(): Record<OpportunityQualificationReadinessDispositionV1, number> {
  return {
    READY_FOR_INTERNAL_QUALIFICATION_REVIEW: 0,
    CONTEXT_ONLY: 0,
    RESEARCH_REQUIRED: 0,
    VERIFY_REQUIRED: 0,
    SUPPRESS: 0
  };
}

export function assessOpportunityQualificationReadinessV1(
  input: OpportunityQualificationReadinessInputV1
): OpportunityQualificationReadinessResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!input.intake || typeof input.intake !== "object" || Array.isArray(input.intake)) throw new Error("intake must be an object");

  const generatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(generatedAt);
  const maximumProjectionAgeMinutes = boundedInteger(
    input.maximumProjectionAgeMinutes,
    DEFAULT_MAX_PROJECTION_AGE_MINUTES,
    1,
    MAX_PROJECTION_AGE_MINUTES,
    "maximumProjectionAgeMinutes"
  );

  const issues: string[] = [];
  if (input.intake.version !== OPPORTUNITY_SIGNAL_INTAKE_VERSION_V1) issues.push("INTAKE_VERSION_UNSUPPORTED");
  const freshnessIssue = projectionIssue(input.intake.generatedAt, evaluatedAtMs, maximumProjectionAgeMinutes);
  if (freshnessIssue) issues.push(freshnessIssue);
  if (!Array.isArray(input.intake.decisions)) issues.push("INTAKE_DECISIONS_INVALID");

  if (issues.length > 0) {
    return freezeDeep({
      version: OPPORTUNITY_QUALIFICATION_READINESS_VERSION_V1,
      generatedAt,
      status: "BLOCKED" as const,
      issues: uniqueSorted(issues),
      decisions: [],
      counts: emptyCounts(),
      limitations: [...LIMITATIONS],
      authority: AUTHORITY
    });
  }

  const seenCandidateIds = new Set<string>();
  for (const [index, decision] of input.intake.decisions.entries()) {
    if (!decision || typeof decision !== "object" || Array.isArray(decision)) throw new Error(`intake.decisions[${index}] must be an object`);
    if (typeof decision.candidateId !== "string" || decision.candidateId.trim().length === 0) throw new Error(`intake.decisions[${index}].candidateId must be a non-empty string`);
    if (seenCandidateIds.has(decision.candidateId)) throw new Error(`intake contains duplicate candidateId ${decision.candidateId}`);
    seenCandidateIds.add(decision.candidateId);
  }

  const decisions = input.intake.decisions.map((decision) => buildDecision(decision, evaluatedAtMs)).sort((a, b) => {
    const order: Record<OpportunityQualificationReadinessDispositionV1, number> = {
      VERIFY_REQUIRED: 0,
      READY_FOR_INTERNAL_QUALIFICATION_REVIEW: 1,
      CONTEXT_ONLY: 2,
      RESEARCH_REQUIRED: 3,
      SUPPRESS: 4
    };
    return order[a.disposition] - order[b.disposition] || Date.parse(b.observedAt) - Date.parse(a.observedAt) || a.candidateId.localeCompare(b.candidateId);
  });

  const counts = emptyCounts();
  for (const decision of decisions) counts[decision.disposition] += 1;

  return freezeDeep({
    version: OPPORTUNITY_QUALIFICATION_READINESS_VERSION_V1,
    generatedAt,
    status: "READY" as const,
    issues: [],
    decisions,
    counts,
    limitations: [...LIMITATIONS],
    authority: AUTHORITY
  });
}
