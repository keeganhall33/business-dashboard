import type { RelationshipUniverseTruthStateV1 } from "@/lib/relationship-intelligence/relationship-universe-coverage-v1";
import {
  RELATIONSHIP_UNIVERSE_RESEARCH_PLAN_V1_VERSION,
  type RelationshipUniverseResearchEvidenceNeedV1,
  type RelationshipUniverseResearchPlanResultV1,
  type RelationshipUniverseResearchPlanTaskV1,
  type RelationshipUniverseResearchSourceClassV1
} from "@/lib/relationship-intelligence/relationship-universe-research-plan-v1";

export const RELATIONSHIP_RESEARCH_EVIDENCE_HANDOFF_V1_VERSION =
  "RELATIONSHIP_RESEARCH_EVIDENCE_HANDOFF_V1" as const;

export type RelationshipResearchEvidenceObservationV1 = Readonly<{
  observationId: string;
  taskId: string;
  targetId: string;
  canonicalEntityRef: string;
  dimension: RelationshipUniverseResearchPlanTaskV1["dimension"];
  evidenceNeed: RelationshipUniverseResearchEvidenceNeedV1;
  sourceClass: RelationshipUniverseResearchSourceClassV1;
  observedAt: string | Date;
  truthState: RelationshipUniverseTruthStateV1;
  claimRef: string;
  evidenceRefs: readonly string[];
}>;

export type RelationshipResearchEvidenceDispositionV1 =
  | "READY_FOR_CANONICAL_REVIEW"
  | "VERIFY_REQUIRED"
  | "RESEARCH_REQUIRED";

export type RelationshipResearchEvidenceCandidateV1 = Readonly<{
  observationId: string;
  taskId: string;
  targetId: string;
  canonicalEntityRef: string;
  dimension: RelationshipUniverseResearchPlanTaskV1["dimension"];
  workType: RelationshipUniverseResearchPlanTaskV1["workType"];
  evidenceNeed: RelationshipUniverseResearchEvidenceNeedV1;
  sourceClass: RelationshipUniverseResearchSourceClassV1;
  observedAt: string;
  truthState: RelationshipUniverseTruthStateV1;
  claimRef: string;
  evidenceRefs: readonly string[];
  disposition: RelationshipResearchEvidenceDispositionV1;
  reasonCodes: readonly string[];
  canonicalFactPromotionAuthorized: false;
  relationshipInferenceAuthorized: false;
  sponsorshipInferenceAuthorized: false;
  decisionAuthorityInferenceAuthorized: false;
  warmAccessInferenceAuthorized: false;
  planningWindowInferenceAuthorized: false;
  contactCoordinateExposureAuthorized: false;
  opportunityCreationAuthorized: false;
}>;

export type RelationshipResearchEvidenceHandoffInputV1 = Readonly<{
  plan: RelationshipUniverseResearchPlanResultV1;
  observations: readonly RelationshipResearchEvidenceObservationV1[];
  evaluatedAt: string | Date;
  maximumPlanAgeMinutes: number;
  maximumObservationAgeMinutes: number;
}>;

export type RelationshipResearchEvidenceHandoffResultV1 = Readonly<{
  version: typeof RELATIONSHIP_RESEARCH_EVIDENCE_HANDOFF_V1_VERSION;
  sourcePlanVersion: typeof RELATIONSHIP_UNIVERSE_RESEARCH_PLAN_V1_VERSION;
  generatedAt: string;
  status: "READY" | "NO_OBSERVATIONS" | "BLOCKED";
  issues: readonly string[];
  candidates: readonly RelationshipResearchEvidenceCandidateV1[];
  counts: Readonly<{
    observationsReviewed: number;
    readyForCanonicalReview: number;
    verificationRequired: number;
    researchRequired: number;
  }>;
  matchingPolicy: "EXACT_PLAN_TASK_AND_CANONICAL_TARGET_ONLY";
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    canonicalReviewPreparationAllowed: true;
    externalResearchAuthorized: false;
    canonicalFactPromotionAuthorized: false;
    relationshipGraphMutationAuthorized: false;
    crmMutationAuthorized: false;
    contactDiscoveryAuthorized: false;
    opportunityMutationAuthorized: false;
    outreachAuthorized: false;
    externalActionAuthorized: false;
  }>;
}>;

const MINUTE_MS = 60_000;
const MAX_AGE_MINUTES = 43_200;
const MAX_OBSERVATIONS = 2_000;

const OBSERVATION_KEYS = new Set([
  "observationId",
  "taskId",
  "targetId",
  "canonicalEntityRef",
  "dimension",
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
  "This boundary accepts only results for an already-governed Relationship Universe research task. It does not execute research or create canonical facts.",
  "READY_FOR_CANONICAL_REVIEW means only that the observation is current, evidence-backed, and exactly bound to the requested task and allowed source class. A separate canonical verifier remains authoritative for fact promotion.",
  "A title, public page, sponsor announcement, shared affiliation, social proximity, or source count never establishes budget authority, warm access, willingness to introduce Keegan, sponsor interest, opportunity certainty, or commercial value by itself.",
  "Professional contact evidence is represented only by opaque claim/evidence references. This boundary does not accept or expose raw email addresses, phone numbers, credentials, message bodies, or private contact coordinates.",
  "No output authorizes CRM or graph mutation, opportunity creation, contact discovery, outreach, spend, contracts, publishing, or another external action."
] as const);

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  canonicalReviewPreparationAllowed: true as const,
  externalResearchAuthorized: false as const,
  canonicalFactPromotionAuthorized: false as const,
  relationshipGraphMutationAuthorized: false as const,
  crmMutationAuthorized: false as const,
  contactDiscoveryAuthorized: false as const,
  opportunityMutationAuthorized: false as const,
  outreachAuthorized: false as const,
  externalActionAuthorized: false as const
});

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
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

function containsCredentialMaterial(value: string): boolean {
  return /op:\/\//i.test(value)
    || /bearer\s+[a-z0-9._~-]+/i.test(value)
    || /(?:password|secret|token|api[_-]?key)\s*[=:]/i.test(value)
    || /[?&](?:access_token|token|api_key|key)=/i.test(value);
}

function containsContactCoordinate(value: string): boolean {
  return /mailto:/i.test(value)
    || /tel:/i.test(value)
    || /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value);
}

function safeOpaqueRef(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  const normalized = value.trim();
  if (containsCredentialMaterial(normalized)) throw new Error(`${label} must not contain credential material`);
  if (containsContactCoordinate(normalized)) throw new Error(`${label} must not contain raw contact coordinates`);
  return normalized;
}

function safeRefs(value: readonly string[], label: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return Object.freeze(
    [...new Set(value.map((item, index) => safeOpaqueRef(item, `${label}[${index}]`)))].sort((a, b) => a.localeCompare(b))
  );
}

function ensureObservationShape(value: unknown, index: number): asserts value is RelationshipResearchEvidenceObservationV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`observation ${index} must be an object`);
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (!OBSERVATION_KEYS.has(key)) throw new Error(`observation ${index} contains unsupported field ${key}`);
  }
}

function planIssues(
  plan: RelationshipUniverseResearchPlanResultV1,
  evaluatedAtMs: number,
  maximumPlanAgeMinutes: number
): readonly string[] {
  const issues = new Set<string>();
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return Object.freeze(["SOURCE_PLAN_REQUIRED"]);
  if (plan.version !== RELATIONSHIP_UNIVERSE_RESEARCH_PLAN_V1_VERSION) issues.add("SOURCE_PLAN_VERSION_UNSUPPORTED");
  if (plan.status === "BLOCKED") issues.add("SOURCE_PLAN_BLOCKED");
  if (!Array.isArray(plan.issues) || plan.issues.length > 0) issues.add("SOURCE_PLAN_HAS_ISSUES");
  if (!Array.isArray(plan.tasks)) issues.add("SOURCE_PLAN_TASKS_REQUIRED");

  const generatedAtMs = Date.parse(plan.generatedAt);
  if (!Number.isFinite(generatedAtMs)) issues.add("SOURCE_PLAN_GENERATED_AT_INVALID");
  else if (generatedAtMs > evaluatedAtMs) issues.add("SOURCE_PLAN_GENERATED_IN_FUTURE");
  else if (evaluatedAtMs - generatedAtMs > maximumPlanAgeMinutes * MINUTE_MS) issues.add("SOURCE_PLAN_STALE");

  if (!plan.authority || plan.authority.externalResearchAuthorized !== false) issues.add("SOURCE_PLAN_EXTERNAL_RESEARCH_AUTHORITY_WIDENED");
  if (plan.authority?.crmMutationAuthorized !== false) issues.add("SOURCE_PLAN_CRM_AUTHORITY_WIDENED");
  if (plan.authority?.contactDiscoveryAuthorized !== false) issues.add("SOURCE_PLAN_CONTACT_DISCOVERY_AUTHORITY_WIDENED");
  if (plan.authority?.outreachAuthorized !== false) issues.add("SOURCE_PLAN_OUTREACH_AUTHORITY_WIDENED");
  if (plan.authority?.externalActionAuthorized !== false) issues.add("SOURCE_PLAN_EXTERNAL_ACTION_AUTHORITY_WIDENED");

  if (Array.isArray(plan.tasks)) {
    const taskIds = new Set<string>();
    for (const [index, task] of plan.tasks.entries()) {
      try {
        const taskId = safeOpaqueRef(task.taskId, `plan.tasks[${index}].taskId`);
        safeOpaqueRef(task.targetId, `plan.tasks[${index}].targetId`);
        safeOpaqueRef(task.canonicalEntityRef, `plan.tasks[${index}].canonicalEntityRef`);
        safeRefs(task.evidenceRefs, `plan.tasks[${index}].evidenceRefs`);
        if (!Array.isArray(task.allowedSourceClasses) || task.allowedSourceClasses.length === 0) {
          issues.add("SOURCE_PLAN_TASK_WITHOUT_ALLOWED_SOURCE_CLASS");
        }
        if (task.factCreationAuthorized !== false
          || task.privateContactDiscoveryAuthorized !== false
          || task.relationshipInferenceAuthorized !== false
          || task.sponsorshipInferenceAuthorized !== false
          || task.decisionAuthorityInferenceAuthorized !== false
          || task.planningWindowInferenceAuthorized !== false
          || task.opportunityImpact !== "NOT_ESTABLISHED") {
          issues.add("SOURCE_PLAN_TASK_AUTHORITY_WIDENED");
        }
        if (taskIds.has(taskId)) issues.add("SOURCE_PLAN_DUPLICATE_TASK_ID");
        taskIds.add(taskId);
      } catch {
        issues.add("SOURCE_PLAN_UNSAFE_OR_INVALID_PROVENANCE");
      }
    }
  }
  return Object.freeze([...issues].sort((a, b) => a.localeCompare(b)));
}

function blocked(generatedAt: string, issues: readonly string[]): RelationshipResearchEvidenceHandoffResultV1 {
  return freezeDeep({
    version: RELATIONSHIP_RESEARCH_EVIDENCE_HANDOFF_V1_VERSION,
    sourcePlanVersion: RELATIONSHIP_UNIVERSE_RESEARCH_PLAN_V1_VERSION,
    generatedAt,
    status: "BLOCKED" as const,
    issues: [...new Set(issues)].sort((a, b) => a.localeCompare(b)),
    candidates: [],
    counts: {
      observationsReviewed: 0,
      readyForCanonicalReview: 0,
      verificationRequired: 0,
      researchRequired: 0
    },
    matchingPolicy: "EXACT_PLAN_TASK_AND_CANONICAL_TARGET_ONLY" as const,
    limitations: [...LIMITATIONS],
    authority: { ...AUTHORITY }
  });
}

function disposition(
  truthState: RelationshipUniverseTruthStateV1,
  staleByAge: boolean
): Readonly<{ disposition: RelationshipResearchEvidenceDispositionV1; reasonCodes: readonly string[] }> {
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
  return freezeDeep({ disposition: "READY_FOR_CANONICAL_REVIEW" as const, reasonCodes: ["EXACT_CURRENT_EVIDENCE_READY_FOR_CANONICAL_REVIEW"] });
}

function candidateFromObservation(
  observation: RelationshipResearchEvidenceObservationV1,
  task: RelationshipUniverseResearchPlanTaskV1,
  evaluatedAtMs: number,
  maximumObservationAgeMinutes: number,
  index: number
): RelationshipResearchEvidenceCandidateV1 {
  const observationId = safeOpaqueRef(observation.observationId, `observations[${index}].observationId`);
  const claimRef = safeOpaqueRef(observation.claimRef, `observations[${index}].claimRef`);
  const evidenceRefs = safeRefs(observation.evidenceRefs, `observations[${index}].evidenceRefs`);
  if (evidenceRefs.length === 0) throw new Error(`observations[${index}].evidenceRefs must contain at least one reference`);
  if (!TRUTH_STATES.has(observation.truthState)) throw new Error(`observations[${index}].truthState is unsupported`);

  const observedAt = timestamp(observation.observedAt, `observations[${index}].observedAt`);
  const observedAtMs = Date.parse(observedAt);
  if (observedAtMs > evaluatedAtMs) throw new Error(`observations[${index}].observedAt must not be future-dated`);

  if (safeOpaqueRef(observation.taskId, `observations[${index}].taskId`) !== task.taskId
    || safeOpaqueRef(observation.targetId, `observations[${index}].targetId`) !== task.targetId
    || safeOpaqueRef(observation.canonicalEntityRef, `observations[${index}].canonicalEntityRef`) !== task.canonicalEntityRef
    || observation.dimension !== task.dimension
    || observation.evidenceNeed !== task.evidenceNeed) {
    throw new Error(`observations[${index}] does not exactly match its source research task`);
  }
  if (!task.allowedSourceClasses.includes(observation.sourceClass)) {
    throw new Error(`observations[${index}].sourceClass is not allowed for ${task.dimension}`);
  }

  const state = disposition(
    observation.truthState,
    evaluatedAtMs - observedAtMs > maximumObservationAgeMinutes * MINUTE_MS
  );

  return freezeDeep({
    observationId,
    taskId: task.taskId,
    targetId: task.targetId,
    canonicalEntityRef: task.canonicalEntityRef,
    dimension: task.dimension,
    workType: task.workType,
    evidenceNeed: task.evidenceNeed,
    sourceClass: observation.sourceClass,
    observedAt,
    truthState: observation.truthState,
    claimRef,
    evidenceRefs: [...evidenceRefs],
    disposition: state.disposition,
    reasonCodes: [...state.reasonCodes],
    canonicalFactPromotionAuthorized: false as const,
    relationshipInferenceAuthorized: false as const,
    sponsorshipInferenceAuthorized: false as const,
    decisionAuthorityInferenceAuthorized: false as const,
    warmAccessInferenceAuthorized: false as const,
    planningWindowInferenceAuthorized: false as const,
    contactCoordinateExposureAuthorized: false as const,
    opportunityCreationAuthorized: false as const
  });
}

/**
 * Validates provider-independent research observations against the exact governed
 * Relationship Universe research tasks that requested them. The output is a
 * canonical-review handoff only; it never promotes the observation to truth.
 */
export function buildRelationshipResearchEvidenceHandoffV1(
  input: RelationshipResearchEvidenceHandoffInputV1
): RelationshipResearchEvidenceHandoffResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  const generatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(generatedAt);
  const maximumPlanAgeMinutes = boundedAge(input.maximumPlanAgeMinutes, "maximumPlanAgeMinutes");
  const maximumObservationAgeMinutes = boundedAge(input.maximumObservationAgeMinutes, "maximumObservationAgeMinutes");
  if (!Array.isArray(input.observations)) throw new Error("observations must be an array");
  if (input.observations.length > MAX_OBSERVATIONS) throw new Error(`observations must contain at most ${MAX_OBSERVATIONS} items`);

  const issues = [...planIssues(input.plan, evaluatedAtMs, maximumPlanAgeMinutes)];
  if (issues.length > 0) return blocked(generatedAt, issues);

  const tasks = new Map(input.plan.tasks.map((task) => [task.taskId, task] as const));
  const observationIds = new Set<string>();
  const candidates: RelationshipResearchEvidenceCandidateV1[] = [];

  for (const [index, rawObservation] of input.observations.entries()) {
    try {
      ensureObservationShape(rawObservation, index);
      const observationId = safeOpaqueRef(rawObservation.observationId, `observations[${index}].observationId`);
      if (observationIds.has(observationId)) {
        issues.push(`DUPLICATE_OBSERVATION_ID:${observationId}`);
        continue;
      }
      observationIds.add(observationId);
      const taskId = safeOpaqueRef(rawObservation.taskId, `observations[${index}].taskId`);
      const task = tasks.get(taskId);
      if (!task) {
        issues.push(`OBSERVATION_TASK_NOT_FOUND:${taskId}`);
        continue;
      }
      candidates.push(candidateFromObservation(rawObservation, task, evaluatedAtMs, maximumObservationAgeMinutes, index));
    } catch (error) {
      const message = error instanceof Error ? error.message : `observation ${index} is invalid`;
      issues.push(`INVALID_OBSERVATION:${index}:${message}`);
    }
  }

  if (issues.length > 0) return blocked(generatedAt, issues);

  const counts = {
    observationsReviewed: candidates.length,
    readyForCanonicalReview: candidates.filter((item) => item.disposition === "READY_FOR_CANONICAL_REVIEW").length,
    verificationRequired: candidates.filter((item) => item.disposition === "VERIFY_REQUIRED").length,
    researchRequired: candidates.filter((item) => item.disposition === "RESEARCH_REQUIRED").length
  };

  return freezeDeep({
    version: RELATIONSHIP_RESEARCH_EVIDENCE_HANDOFF_V1_VERSION,
    sourcePlanVersion: RELATIONSHIP_UNIVERSE_RESEARCH_PLAN_V1_VERSION,
    generatedAt,
    status: candidates.length === 0 ? "NO_OBSERVATIONS" as const : "READY" as const,
    issues: [],
    candidates,
    counts,
    matchingPolicy: "EXACT_PLAN_TASK_AND_CANONICAL_TARGET_ONLY" as const,
    limitations: [...LIMITATIONS],
    authority: { ...AUTHORITY }
  });
}
