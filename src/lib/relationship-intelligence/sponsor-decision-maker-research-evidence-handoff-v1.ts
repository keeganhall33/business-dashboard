import type { RelationshipUniverseTruthStateV1 } from "@/lib/relationship-intelligence/relationship-universe-coverage-v1";
import {
  SPONSOR_DECISION_MAKER_RESEARCH_PLAN_VERSION_V1,
  type SponsorDecisionMakerResearchEvidenceNeedV1,
  type SponsorDecisionMakerResearchPlanResultV1,
  type SponsorDecisionMakerResearchSourceClassV1,
  type SponsorDecisionMakerResearchTaskV1,
  type SponsorDecisionMakerResearchWorkTypeV1
} from "@/lib/relationship-intelligence/sponsor-decision-maker-research-plan-v1";

export const SPONSOR_DECISION_MAKER_RESEARCH_EVIDENCE_HANDOFF_VERSION_V1 =
  "SPONSOR_DECISION_MAKER_RESEARCH_EVIDENCE_HANDOFF_V1" as const;

export type SponsorDecisionMakerResearchObservationV1 = Readonly<{
  observationId: string;
  taskId: string;
  portfolioEntryId: string;
  sponsorCandidateId: string;
  qualificationCandidateId: string | null;
  canonicalOpportunityRef: string | null;
  canonicalOrganizationRef: string | null;
  canonicalPersonRef: string | null;
  workType: SponsorDecisionMakerResearchWorkTypeV1;
  evidenceNeed: SponsorDecisionMakerResearchEvidenceNeedV1;
  sourceClass: SponsorDecisionMakerResearchSourceClassV1;
  observedAt: string | Date;
  truthState: RelationshipUniverseTruthStateV1;
  claimRef: string;
  evidenceRefs: readonly string[];
}>;

export type SponsorDecisionMakerResearchEvidenceDispositionV1 =
  | "READY_FOR_CANONICAL_REVIEW"
  | "VERIFY_REQUIRED"
  | "RESEARCH_REQUIRED";

export type SponsorDecisionMakerResearchEvidenceCandidateV1 = Readonly<{
  observationId: string;
  taskId: string;
  upstreamOrdinal: number;
  portfolioEntryId: string;
  sponsorCandidateId: string;
  qualificationCandidateId: string | null;
  canonicalOpportunityRef: string | null;
  canonicalOrganizationRef: string | null;
  canonicalPersonRef: string | null;
  workType: SponsorDecisionMakerResearchWorkTypeV1;
  evidenceNeed: SponsorDecisionMakerResearchEvidenceNeedV1;
  sourceClass: SponsorDecisionMakerResearchSourceClassV1;
  observedAt: string;
  truthState: RelationshipUniverseTruthStateV1;
  claimRef: string;
  evidenceRefs: readonly string[];
  disposition: SponsorDecisionMakerResearchEvidenceDispositionV1;
  reasonCodes: readonly string[];
  decisionMakerFactPromotionAuthorized: false;
  relationshipInferenceAuthorized: false;
  sponsorshipInferenceAuthorized: false;
  decisionAuthorityInferenceAuthorized: false;
  opportunityQualificationAuthorized: false;
  contactCoordinateExposureAuthorized: false;
  crmMutationAuthorized: false;
  relationshipMutationAuthorized: false;
  outreachAuthorized: false;
}>;

export type SponsorDecisionMakerResearchEvidenceHandoffInputV1 = Readonly<{
  plan: SponsorDecisionMakerResearchPlanResultV1;
  observations: readonly SponsorDecisionMakerResearchObservationV1[];
  evaluatedAt: string | Date;
  maximumPlanAgeMinutes: number;
  maximumObservationAgeMinutes: number;
}>;

export type SponsorDecisionMakerResearchEvidenceHandoffResultV1 = Readonly<{
  version: typeof SPONSOR_DECISION_MAKER_RESEARCH_EVIDENCE_HANDOFF_VERSION_V1;
  sourcePlanVersion: typeof SPONSOR_DECISION_MAKER_RESEARCH_PLAN_VERSION_V1;
  generatedAt: string;
  status: "READY" | "NO_OBSERVATIONS" | "BLOCKED";
  issues: readonly string[];
  candidates: readonly SponsorDecisionMakerResearchEvidenceCandidateV1[];
  counts: Readonly<{
    observationsReviewed: number;
    readyForCanonicalReview: number;
    verificationRequired: number;
    researchRequired: number;
  }>;
  matchingPolicy: "EXACT_SPONSOR_RESEARCH_TASK_AND_CANONICAL_IDENTITY_ONLY";
  returnPolicy: "CANONICAL_REVIEW_REQUIRED_BEFORE_FACT_OR_STATE_CHANGE";
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    canonicalReviewPreparationAllowed: true;
    externalResearchExecutionAuthorized: false;
    decisionMakerFactPromotionAuthorized: false;
    privateContactDiscoveryAuthorized: false;
    relationshipInferenceAuthorized: false;
    sponsorshipInferenceAuthorized: false;
    decisionAuthorityInferenceAuthorized: false;
    opportunityQualificationAuthorized: false;
    crmMutationAuthorized: false;
    relationshipMutationAuthorized: false;
    outreachAuthorized: false;
    spendAuthorized: false;
    contractAuthorized: false;
    externalActionAuthorized: false;
  }>;
}>;

const MINUTE_MS = 60_000;
const MAX_AGE_MINUTES = 43_200;
const MAX_OBSERVATIONS = 2_000;
const UNSAFE_REF = /(?:op:\/\/|mailto:|tel:|@|begin\s+(?:rsa\s+)?private\s+key|bearer\s+[a-z0-9._~-]+|(?:password|passwd|secret|token|api[_-]?key)\s*[=:]|[?&](?:access_token|token|api_key|key)=)/i;

const OBSERVATION_KEYS = new Set([
  "observationId",
  "taskId",
  "portfolioEntryId",
  "sponsorCandidateId",
  "qualificationCandidateId",
  "canonicalOpportunityRef",
  "canonicalOrganizationRef",
  "canonicalPersonRef",
  "workType",
  "evidenceNeed",
  "sourceClass",
  "observedAt",
  "truthState",
  "claimRef",
  "evidenceRefs"
]);

const TRUTH_STATES = new Set<RelationshipUniverseTruthStateV1>([
  "KNOWN",
  "INFERRED",
  "UNKNOWN",
  "STALE",
  "CONFLICTED",
  "PARTIAL"
]);

const LIMITATIONS = Object.freeze([
  "This boundary accepts only evidence for an already-governed sponsor decision-maker research task. It does not execute research or establish a buyer.",
  "READY_FOR_CANONICAL_REVIEW means only that an observation is current, evidence-backed, from an allowed source class, and exactly bound to its source task. A separate canonical verifier remains authoritative for any fact or state change.",
  "An official title, employer match, public page, source count, sponsor adjacency, or canonical graph edge does not establish budget authority, willingness to engage, sponsor interest, warm access, opportunity certainty, or commercial value by itself.",
  "Evidence is carried only through opaque claim and evidence references. Raw email addresses, phone numbers, credentials, message bodies, and private contact coordinates are outside this contract.",
  "No output authorizes CRM or relationship-graph mutation, opportunity qualification, outreach, spend, contracts, publishing, or another external action."
] as const);

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  canonicalReviewPreparationAllowed: true as const,
  externalResearchExecutionAuthorized: false as const,
  decisionMakerFactPromotionAuthorized: false as const,
  privateContactDiscoveryAuthorized: false as const,
  relationshipInferenceAuthorized: false as const,
  sponsorshipInferenceAuthorized: false as const,
  decisionAuthorityInferenceAuthorized: false as const,
  opportunityQualificationAuthorized: false as const,
  crmMutationAuthorized: false as const,
  relationshipMutationAuthorized: false as const,
  outreachAuthorized: false as const,
  spendAuthorized: false as const,
  contractAuthorized: false as const,
  externalActionAuthorized: false as const
});

const CANDIDATE_AUTHORITY = Object.freeze({
  decisionMakerFactPromotionAuthorized: false as const,
  relationshipInferenceAuthorized: false as const,
  sponsorshipInferenceAuthorized: false as const,
  decisionAuthorityInferenceAuthorized: false as const,
  opportunityQualificationAuthorized: false as const,
  contactCoordinateExposureAuthorized: false as const,
  crmMutationAuthorized: false as const,
  relationshipMutationAuthorized: false as const,
  outreachAuthorized: false as const
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

function safeRef(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  const normalized = value.trim();
  if (normalized.length > 512 || /\s/.test(normalized) || UNSAFE_REF.test(normalized)) {
    throw new Error(`${label} is unsafe`);
  }
  return normalized;
}

function safeNullableRef(value: unknown, label: string): string | null {
  return value == null ? null : safeRef(value, label);
}

function safeRefs(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must be a non-empty array`);
  return Object.freeze(
    [...new Set(value.map((item, index) => safeRef(item, `${label}[${index}]`)))].sort((a, b) => a.localeCompare(b))
  );
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b)));
}

function ensureObservationShape(value: unknown, index: number): asserts value is SponsorDecisionMakerResearchObservationV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`observations[${index}] must be an object`);
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (!OBSERVATION_KEYS.has(key)) throw new Error(`observations[${index}] contains unsupported field ${key}`);
  }
}

function sameNullableRef(left: unknown, right: unknown, label: string): boolean {
  return safeNullableRef(left, `${label}.left`) === safeNullableRef(right, `${label}.right`);
}

function taskAuthoritySafe(task: SponsorDecisionMakerResearchTaskV1): boolean {
  return task.factCreationAuthorized === false
    && task.privateContactDiscoveryAuthorized === false
    && task.relationshipInferenceAuthorized === false
    && task.sponsorshipInferenceAuthorized === false
    && task.decisionAuthorityInferenceAuthorized === false
    && task.opportunityQualificationAuthorized === false
    && task.crmMutationAuthorized === false
    && task.relationshipMutationAuthorized === false
    && task.outreachAuthorized === false;
}

function sourceAuthoritySafe(plan: SponsorDecisionMakerResearchPlanResultV1): boolean {
  const authority = plan.authority;
  return authority.analysisOnly === true
    && authority.internalResearchPreparationAllowed === true
    && authority.externalResearchExecutionAuthorized === false
    && authority.factCreationAuthorized === false
    && authority.privateContactDiscoveryAuthorized === false
    && authority.relationshipInferenceAuthorized === false
    && authority.sponsorshipInferenceAuthorized === false
    && authority.decisionAuthorityInferenceAuthorized === false
    && authority.opportunityQualificationAuthorized === false
    && authority.crmMutationAuthorized === false
    && authority.relationshipMutationAuthorized === false
    && authority.outreachAuthorized === false
    && authority.spendAuthorized === false
    && authority.contractAuthorized === false
    && authority.externalActionAuthorized === false;
}

function blocked(generatedAt: string, issues: readonly string[]): SponsorDecisionMakerResearchEvidenceHandoffResultV1 {
  return freezeDeep({
    version: SPONSOR_DECISION_MAKER_RESEARCH_EVIDENCE_HANDOFF_VERSION_V1,
    sourcePlanVersion: SPONSOR_DECISION_MAKER_RESEARCH_PLAN_VERSION_V1,
    generatedAt,
    status: "BLOCKED" as const,
    issues: uniqueSorted(issues),
    candidates: Object.freeze([]),
    counts: {
      observationsReviewed: 0,
      readyForCanonicalReview: 0,
      verificationRequired: 0,
      researchRequired: 0
    },
    matchingPolicy: "EXACT_SPONSOR_RESEARCH_TASK_AND_CANONICAL_IDENTITY_ONLY" as const,
    returnPolicy: "CANONICAL_REVIEW_REQUIRED_BEFORE_FACT_OR_STATE_CHANGE" as const,
    limitations: LIMITATIONS,
    authority: AUTHORITY
  });
}

function validatePlan(
  plan: SponsorDecisionMakerResearchPlanResultV1,
  evaluatedAtMs: number,
  maximumPlanAgeMinutes: number
): readonly string[] {
  const issues: string[] = [];
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return Object.freeze(["SOURCE_PLAN_REQUIRED"]);
  if (plan.version !== SPONSOR_DECISION_MAKER_RESEARCH_PLAN_VERSION_V1) issues.push("SOURCE_PLAN_VERSION_UNSUPPORTED");
  if (plan.status !== "READY") issues.push(`SOURCE_PLAN_NOT_READY:${plan.status}`);
  if (!Array.isArray(plan.issues) || plan.issues.length > 0) issues.push("SOURCE_PLAN_HAS_ISSUES");
  if (plan.returnPolicy !== "OBSERVED_EVIDENCE_MUST_REENTER_CANONICAL_REVIEW") issues.push("SOURCE_PLAN_RETURN_POLICY_INVALID");
  if (!sourceAuthoritySafe(plan)) issues.push("SOURCE_PLAN_AUTHORITY_WIDENED");
  if (!Array.isArray(plan.tasks) || plan.tasks.length === 0) issues.push("SOURCE_PLAN_TASKS_REQUIRED");

  const generatedAtMs = Date.parse(plan.generatedAt);
  if (!Number.isFinite(generatedAtMs)) issues.push("SOURCE_PLAN_GENERATED_AT_INVALID");
  else if (generatedAtMs > evaluatedAtMs) issues.push("SOURCE_PLAN_GENERATED_IN_FUTURE");
  else if (evaluatedAtMs - generatedAtMs > maximumPlanAgeMinutes * MINUTE_MS) issues.push("SOURCE_PLAN_STALE");

  const taskIds = new Set<string>();
  const portfolioEntryIds = new Set<string>();
  for (const [index, task] of (Array.isArray(plan.tasks) ? plan.tasks : []).entries()) {
    try {
      const taskId = safeRef(task.taskId, `plan.tasks[${index}].taskId`);
      const portfolioEntryId = safeRef(task.portfolioEntryId, `plan.tasks[${index}].portfolioEntryId`);
      safeRef(task.sponsorCandidateId, `plan.tasks[${index}].sponsorCandidateId`);
      safeNullableRef(task.qualificationCandidateId, `plan.tasks[${index}].qualificationCandidateId`);
      safeNullableRef(task.canonicalOpportunityRef, `plan.tasks[${index}].canonicalOpportunityRef`);
      safeNullableRef(task.canonicalOrganizationRef, `plan.tasks[${index}].canonicalOrganizationRef`);
      safeNullableRef(task.canonicalPersonRef, `plan.tasks[${index}].canonicalPersonRef`);
      safeRefs(task.evidenceRefs, `plan.tasks[${index}].evidenceRefs`);
      if (!Array.isArray(task.reasonCodes) || task.reasonCodes.length === 0) issues.push(`SOURCE_TASK_REASON_CODES_REQUIRED:${taskId}`);
      if (!Array.isArray(task.allowedSourceClasses) || task.allowedSourceClasses.length === 0) issues.push(`SOURCE_TASK_ALLOWED_SOURCE_CLASSES_REQUIRED:${taskId}`);
      if (!taskAuthoritySafe(task)) issues.push(`SOURCE_TASK_AUTHORITY_WIDENED:${taskId}`);
      if (taskIds.has(taskId)) issues.push(`SOURCE_PLAN_DUPLICATE_TASK_ID:${taskId}`);
      if (portfolioEntryIds.has(portfolioEntryId)) issues.push(`SOURCE_PLAN_DUPLICATE_PORTFOLIO_ENTRY:${portfolioEntryId}`);
      taskIds.add(taskId);
      portfolioEntryIds.add(portfolioEntryId);
    } catch {
      issues.push(`SOURCE_PLAN_UNSAFE_OR_INVALID_TASK:${index}`);
    }
  }
  return uniqueSorted(issues);
}

function disposition(
  truthState: RelationshipUniverseTruthStateV1,
  staleByAge: boolean
): Readonly<{ disposition: SponsorDecisionMakerResearchEvidenceDispositionV1; reasonCodes: readonly string[] }> {
  if (staleByAge || truthState === "STALE") {
    return freezeDeep({ disposition: "VERIFY_REQUIRED" as const, reasonCodes: ["OBSERVATION_STALE"] });
  }
  if (truthState === "CONFLICTED") {
    return freezeDeep({ disposition: "VERIFY_REQUIRED" as const, reasonCodes: ["OBSERVATION_CONFLICTED"] });
  }
  if (truthState === "INFERRED" || truthState === "PARTIAL") {
    return freezeDeep({ disposition: "VERIFY_REQUIRED" as const, reasonCodes: [`OBSERVATION_${truthState}`] });
  }
  if (truthState === "UNKNOWN") {
    return freezeDeep({ disposition: "RESEARCH_REQUIRED" as const, reasonCodes: ["OBSERVATION_UNKNOWN"] });
  }
  return freezeDeep({
    disposition: "READY_FOR_CANONICAL_REVIEW" as const,
    reasonCodes: ["EXACT_CURRENT_EVIDENCE_READY_FOR_CANONICAL_REVIEW"]
  });
}

function candidateFromObservation(
  observation: SponsorDecisionMakerResearchObservationV1,
  task: SponsorDecisionMakerResearchTaskV1,
  evaluatedAtMs: number,
  maximumObservationAgeMinutes: number,
  index: number
): SponsorDecisionMakerResearchEvidenceCandidateV1 {
  const observationId = safeRef(observation.observationId, `observations[${index}].observationId`);
  const taskId = safeRef(observation.taskId, `observations[${index}].taskId`);
  const claimRef = safeRef(observation.claimRef, `observations[${index}].claimRef`);
  const evidenceRefs = safeRefs(observation.evidenceRefs, `observations[${index}].evidenceRefs`);

  if (!TRUTH_STATES.has(observation.truthState)) throw new Error(`observations[${index}].truthState is unsupported`);
  if (taskId !== task.taskId
    || safeRef(observation.portfolioEntryId, `observations[${index}].portfolioEntryId`) !== task.portfolioEntryId
    || safeRef(observation.sponsorCandidateId, `observations[${index}].sponsorCandidateId`) !== task.sponsorCandidateId
    || !sameNullableRef(observation.qualificationCandidateId, task.qualificationCandidateId, `observations[${index}].qualificationCandidateId`)
    || !sameNullableRef(observation.canonicalOpportunityRef, task.canonicalOpportunityRef, `observations[${index}].canonicalOpportunityRef`)
    || !sameNullableRef(observation.canonicalOrganizationRef, task.canonicalOrganizationRef, `observations[${index}].canonicalOrganizationRef`)
    || !sameNullableRef(observation.canonicalPersonRef, task.canonicalPersonRef, `observations[${index}].canonicalPersonRef`)
    || observation.workType !== task.workType
    || observation.evidenceNeed !== task.evidenceNeed) {
    throw new Error(`observations[${index}] does not exactly match its source sponsor research task`);
  }
  if (!task.allowedSourceClasses.includes(observation.sourceClass)) {
    throw new Error(`observations[${index}].sourceClass is not allowed for ${task.workType}`);
  }

  const observedAt = timestamp(observation.observedAt, `observations[${index}].observedAt`);
  const observedAtMs = Date.parse(observedAt);
  if (observedAtMs > evaluatedAtMs) throw new Error(`observations[${index}].observedAt must not be future-dated`);

  const state = disposition(
    observation.truthState,
    evaluatedAtMs - observedAtMs > maximumObservationAgeMinutes * MINUTE_MS
  );

  return freezeDeep({
    observationId,
    taskId: task.taskId,
    upstreamOrdinal: task.upstreamOrdinal,
    portfolioEntryId: task.portfolioEntryId,
    sponsorCandidateId: task.sponsorCandidateId,
    qualificationCandidateId: task.qualificationCandidateId,
    canonicalOpportunityRef: task.canonicalOpportunityRef,
    canonicalOrganizationRef: task.canonicalOrganizationRef,
    canonicalPersonRef: task.canonicalPersonRef,
    workType: task.workType,
    evidenceNeed: task.evidenceNeed,
    sourceClass: observation.sourceClass,
    observedAt,
    truthState: observation.truthState,
    claimRef,
    evidenceRefs: [...evidenceRefs],
    disposition: state.disposition,
    reasonCodes: [...state.reasonCodes],
    ...CANDIDATE_AUTHORITY
  });
}

export function handoffSponsorDecisionMakerResearchEvidenceV1(
  input: SponsorDecisionMakerResearchEvidenceHandoffInputV1
): SponsorDecisionMakerResearchEvidenceHandoffResultV1 {
  const generatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(generatedAt);
  const maximumPlanAgeMinutes = boundedAge(input.maximumPlanAgeMinutes, "maximumPlanAgeMinutes");
  const maximumObservationAgeMinutes = boundedAge(input.maximumObservationAgeMinutes, "maximumObservationAgeMinutes");

  if (!Array.isArray(input.observations)) throw new Error("observations must be an array");
  if (input.observations.length > MAX_OBSERVATIONS) throw new Error(`observations must not exceed ${MAX_OBSERVATIONS}`);

  const planIssues = validatePlan(input.plan, evaluatedAtMs, maximumPlanAgeMinutes);
  if (planIssues.length > 0) return blocked(generatedAt, planIssues);
  if (input.observations.length === 0) {
    return freezeDeep({
      version: SPONSOR_DECISION_MAKER_RESEARCH_EVIDENCE_HANDOFF_VERSION_V1,
      sourcePlanVersion: SPONSOR_DECISION_MAKER_RESEARCH_PLAN_VERSION_V1,
      generatedAt,
      status: "NO_OBSERVATIONS" as const,
      issues: Object.freeze([]),
      candidates: Object.freeze([]),
      counts: {
        observationsReviewed: 0,
        readyForCanonicalReview: 0,
        verificationRequired: 0,
        researchRequired: 0
      },
      matchingPolicy: "EXACT_SPONSOR_RESEARCH_TASK_AND_CANONICAL_IDENTITY_ONLY" as const,
      returnPolicy: "CANONICAL_REVIEW_REQUIRED_BEFORE_FACT_OR_STATE_CHANGE" as const,
      limitations: LIMITATIONS,
      authority: AUTHORITY
    });
  }

  const tasksById = new Map(input.plan.tasks.map((task) => [task.taskId, task] as const));
  const observationIds = new Set<string>();
  const taskClaims = new Set<string>();
  const candidates: SponsorDecisionMakerResearchEvidenceCandidateV1[] = [];
  const issues: string[] = [];

  for (const [index, rawObservation] of input.observations.entries()) {
    ensureObservationShape(rawObservation, index);
    const observationId = safeRef(rawObservation.observationId, `observations[${index}].observationId`);
    const taskId = safeRef(rawObservation.taskId, `observations[${index}].taskId`);
    const claimRef = safeRef(rawObservation.claimRef, `observations[${index}].claimRef`);
    if (observationIds.has(observationId)) {
      issues.push(`DUPLICATE_OBSERVATION_ID:${observationId}`);
      continue;
    }
    observationIds.add(observationId);

    const taskClaim = `${taskId}|${claimRef}`;
    if (taskClaims.has(taskClaim)) {
      issues.push(`DUPLICATE_TASK_CLAIM:${taskId}:${claimRef}`);
      continue;
    }
    taskClaims.add(taskClaim);

    const task = tasksById.get(taskId);
    if (!task) {
      issues.push(`OBSERVATION_TASK_NOT_IN_SOURCE_PLAN:${observationId}`);
      continue;
    }

    try {
      candidates.push(candidateFromObservation(
        rawObservation,
        task,
        evaluatedAtMs,
        maximumObservationAgeMinutes,
        index
      ));
    } catch (error) {
      const message = error instanceof Error ? error.message : "invalid observation";
      issues.push(`OBSERVATION_INVALID:${observationId}:${message}`);
    }
  }

  if (issues.length > 0) return blocked(generatedAt, issues);

  const counts = {
    observationsReviewed: candidates.length,
    readyForCanonicalReview: candidates.filter((candidate) => candidate.disposition === "READY_FOR_CANONICAL_REVIEW").length,
    verificationRequired: candidates.filter((candidate) => candidate.disposition === "VERIFY_REQUIRED").length,
    researchRequired: candidates.filter((candidate) => candidate.disposition === "RESEARCH_REQUIRED").length
  };

  return freezeDeep({
    version: SPONSOR_DECISION_MAKER_RESEARCH_EVIDENCE_HANDOFF_VERSION_V1,
    sourcePlanVersion: SPONSOR_DECISION_MAKER_RESEARCH_PLAN_VERSION_V1,
    generatedAt,
    status: "READY" as const,
    issues: Object.freeze([]),
    candidates,
    counts,
    matchingPolicy: "EXACT_SPONSOR_RESEARCH_TASK_AND_CANONICAL_IDENTITY_ONLY" as const,
    returnPolicy: "CANONICAL_REVIEW_REQUIRED_BEFORE_FACT_OR_STATE_CHANGE" as const,
    limitations: LIMITATIONS,
    authority: AUTHORITY
  });
}
