import type {
  RelationshipSignalDeltaDecisionV1,
  RelationshipSignalDeltaResultV1,
  RelationshipSignalTypeV1
} from "@/lib/relationship-intelligence/relationship-signal-delta-v1";
import { RELATIONSHIP_SIGNAL_DELTA_VERSION } from "@/lib/relationship-intelligence/relationship-signal-delta-v1";

export const RELATIONSHIP_SIGNAL_REFRESH_PLAN_VERSION_V1 = "RELATIONSHIP_SIGNAL_REFRESH_PLAN_V1" as const;

export type RelationshipSignalRefreshTaskTypeV1 =
  | "SPONSOR_MAP_REFRESH"
  | "ROLE_EVIDENCE_REFRESH"
  | "ACCESS_PATH_REVALIDATION"
  | "RELATIONSHIP_GRAPH_REVIEW"
  | "VERIFY_SIGNAL_BEFORE_REFRESH";

export type RelationshipSignalRefreshTaskV1 = Readonly<{
  taskId: string;
  signalId: string;
  sourceEventKey: string;
  sourceRef: string;
  observedAt: string;
  taskType: RelationshipSignalRefreshTaskTypeV1;
  subjectEntityRef: string | null;
  objectEntityRef: string | null;
  relationshipKind: RelationshipSignalDeltaDecisionV1["relationshipKind"];
  relationshipStatus: RelationshipSignalDeltaDecisionV1["relationshipStatus"];
  evidenceRefs: readonly string[];
  reasonCodes: readonly string[];
  requiresVerification: boolean;
  factCreationAuthorized: false;
  relationshipMutationAuthorized: false;
  decisionAuthorityInferenceAuthorized: false;
  contactDiscoveryAuthorized: false;
  opportunityCreationAuthorized: false;
  outreachAuthorized: false;
  externalActionAuthorized: false;
}>;

export type RelationshipSignalRefreshPlanInputV1 = Readonly<{
  projection: RelationshipSignalDeltaResultV1;
  evaluatedAt: string | Date;
  maximumProjectionAgeMinutes: number;
}>;

export type RelationshipSignalRefreshPlanResultV1 = Readonly<{
  version: typeof RELATIONSHIP_SIGNAL_REFRESH_PLAN_VERSION_V1;
  sourceProjectionVersion: typeof RELATIONSHIP_SIGNAL_DELTA_VERSION;
  generatedAt: string;
  status: "READY" | "BLOCKED";
  issues: readonly string[];
  tasks: readonly RelationshipSignalRefreshTaskV1[];
  counts: Readonly<{
    decisionsReviewed: number;
    tasksQueued: number;
    sponsorMapRefreshes: number;
    roleEvidenceRefreshes: number;
    accessPathRevalidations: number;
    relationshipGraphReviews: number;
    verificationTasks: number;
    decisionsWithoutRefreshWork: number;
  }>;
  limitations: readonly string[];
  inferencePolicy: "EXACT_UPSTREAM_DELTA_ONLY_NO_ENTITY_ROLE_TIMING_OR_OPPORTUNITY_INFERENCE";
  authority: Readonly<{
    analysisOnly: true;
    internalResearchPlanningAllowed: true;
    relationshipMutationAuthorized: false;
    crmMutationAuthorized: false;
    decisionAuthorityInferenceAuthorized: false;
    contactDiscoveryAuthorized: false;
    opportunityCreationAuthorized: false;
    outreachAuthorized: false;
    externalActionAuthorized: false;
  }>;
}>;

const MINUTE_MS = 60_000;
const MAX_PROJECTION_AGE_MINUTES = 10_080;
const MAX_DECISIONS = 2_000;

const LIMITATIONS = Object.freeze([
  "Refresh tasks are internal evidence-acquisition or revalidation work only. They do not create or confirm relationships, sponsorships, roles, authority, access, timing, contacts, or opportunities.",
  "A sponsorship, executive-role, or representation signal can select which already-identified relationship evidence should be revisited, but it cannot establish sponsor interest, budget, willingness to introduce Keegan, or deal likelihood.",
  "No private contact data is discovered or inferred. Any later contact enrichment must use its separately governed public-professional or authorized first-party boundary."
] as const);

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  internalResearchPlanningAllowed: true as const,
  relationshipMutationAuthorized: false as const,
  crmMutationAuthorized: false as const,
  decisionAuthorityInferenceAuthorized: false as const,
  contactDiscoveryAuthorized: false as const,
  opportunityCreationAuthorized: false as const,
  outreachAuthorized: false as const,
  externalActionAuthorized: false as const
});

const SPONSORSHIP_SIGNALS = new Set<RelationshipSignalTypeV1>([
  "SPONSORSHIP_ANNOUNCEMENT",
  "SPONSORSHIP_RENEWAL",
  "SPONSORSHIP_END"
]);

const REPRESENTATION_KINDS = new Set<RelationshipSignalDeltaDecisionV1["relationshipKind"]>([
  "REPRESENTS",
  "MANAGES",
  "CLIENT_OF"
]);

const TASK_ORDER: Readonly<Record<RelationshipSignalRefreshTaskTypeV1, number>> = Object.freeze({
  VERIFY_SIGNAL_BEFORE_REFRESH: 0,
  SPONSOR_MAP_REFRESH: 1,
  ROLE_EVIDENCE_REFRESH: 2,
  ACCESS_PATH_REVALIDATION: 3,
  RELATIONSHIP_GRAPH_REVIEW: 4
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

function positiveBoundedInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > MAX_PROJECTION_AGE_MINUTES) {
    throw new Error(`${label} must be an integer between 1 and ${MAX_PROJECTION_AGE_MINUTES}`);
  }
  return value;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function hasCredentialMaterial(value: string): boolean {
  return /op:\/\//i.test(value)
    || /bearer\s+[a-z0-9._~-]+/i.test(value)
    || /(?:password|secret|token|api[_-]?key)\s*[=:]/i.test(value)
    || /[?&](?:access_token|token|api_key|key)=/i.test(value);
}

function safeText(value: unknown, label: string): string {
  const normalized = requiredText(value, label);
  if (hasCredentialMaterial(normalized)) throw new Error(`${label} must not contain credential material`);
  return normalized;
}

function safeNullableText(value: unknown, label: string): string | null {
  if (value == null) return null;
  return safeText(value, label);
}

function safeRefs(values: readonly string[], label: string): readonly string[] {
  if (!Array.isArray(values)) throw new Error(`${label} must be an array`);
  return Object.freeze(
    [...new Set(values.map((value, index) => safeText(value, `${label}[${index}]`)))].sort((a, b) => a.localeCompare(b))
  );
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b)));
}

function projectionIssues(
  projection: RelationshipSignalDeltaResultV1,
  evaluatedAtMs: number,
  maximumProjectionAgeMinutes: number
): readonly string[] {
  const issues = new Set<string>();

  if (!projection || typeof projection !== "object" || Array.isArray(projection)) {
    return Object.freeze(["SOURCE_PROJECTION_REQUIRED"]);
  }
  if (projection.version !== RELATIONSHIP_SIGNAL_DELTA_VERSION) issues.add("SOURCE_PROJECTION_VERSION_UNSUPPORTED");
  if (!Array.isArray(projection.decisions)) issues.add("SOURCE_PROJECTION_DECISIONS_REQUIRED");
  else if (projection.decisions.length > MAX_DECISIONS) issues.add("SOURCE_PROJECTION_DECISION_LIMIT_EXCEEDED");

  const generatedAtMs = Date.parse(projection.generatedAt);
  if (!Number.isFinite(generatedAtMs)) issues.add("SOURCE_PROJECTION_GENERATED_AT_INVALID");
  else if (generatedAtMs > evaluatedAtMs) issues.add("SOURCE_PROJECTION_GENERATED_IN_FUTURE");
  else if (evaluatedAtMs - generatedAtMs > maximumProjectionAgeMinutes * MINUTE_MS) issues.add("SOURCE_PROJECTION_STALE");

  if (projection.relationshipKindInferencePerformed !== false) issues.add("UPSTREAM_RELATIONSHIP_KIND_INFERENCE_NOT_ALLOWED");
  if (projection.opportunityInferencePerformed !== false) issues.add("UPSTREAM_OPPORTUNITY_INFERENCE_NOT_ALLOWED");
  if (projection.graphMutationPerformed !== false) issues.add("UPSTREAM_GRAPH_MUTATION_NOT_ALLOWED");
  if (projection.crmMutationPerformed !== false) issues.add("UPSTREAM_CRM_MUTATION_NOT_ALLOWED");
  if (projection.externalActionPerformed !== false) issues.add("UPSTREAM_EXTERNAL_ACTION_NOT_ALLOWED");

  return Object.freeze([...issues].sort((a, b) => a.localeCompare(b)));
}

function semanticRefreshTypes(decision: RelationshipSignalDeltaDecisionV1): readonly RelationshipSignalRefreshTaskTypeV1[] {
  if (decision.disposition === "SUPPRESS" || decision.disposition === "NO_MATERIAL_CHANGE") return Object.freeze([]);
  if (decision.disposition === "NEEDS_VERIFICATION") return Object.freeze(["VERIFY_SIGNAL_BEFORE_REFRESH"]);

  if (
    decision.truthState !== "KNOWN"
    || !decision.subjectEntityRef
    || !decision.objectEntityRef
    || decision.evidenceRefs.length === 0
  ) {
    return Object.freeze(["VERIFY_SIGNAL_BEFORE_REFRESH"]);
  }

  if (SPONSORSHIP_SIGNALS.has(decision.signalType)) {
    return decision.relationshipKind === "SPONSOR_OF"
      ? Object.freeze(["SPONSOR_MAP_REFRESH", "RELATIONSHIP_GRAPH_REVIEW"])
      : Object.freeze(["VERIFY_SIGNAL_BEFORE_REFRESH"]);
  }

  if (decision.signalType === "EXECUTIVE_ROLE_CHANGE") {
    return decision.relationshipKind === "EMPLOYED_BY"
      ? Object.freeze(["ROLE_EVIDENCE_REFRESH", "ACCESS_PATH_REVALIDATION", "RELATIONSHIP_GRAPH_REVIEW"])
      : Object.freeze(["VERIFY_SIGNAL_BEFORE_REFRESH"]);
  }

  if (decision.signalType === "REPRESENTATION_CHANGE") {
    return REPRESENTATION_KINDS.has(decision.relationshipKind)
      ? Object.freeze(["ACCESS_PATH_REVALIDATION", "RELATIONSHIP_GRAPH_REVIEW"])
      : Object.freeze(["VERIFY_SIGNAL_BEFORE_REFRESH"]);
  }

  return Object.freeze(["RELATIONSHIP_GRAPH_REVIEW"]);
}

function taskReasons(
  decision: RelationshipSignalDeltaDecisionV1,
  taskType: RelationshipSignalRefreshTaskTypeV1
): readonly string[] {
  if (taskType === "VERIFY_SIGNAL_BEFORE_REFRESH") {
    const semanticReason = decision.disposition === "NEEDS_VERIFICATION"
      ? []
      : ["SIGNAL_SEMANTICS_OR_EVIDENCE_REQUIRE_VERIFICATION"];
    return uniqueSorted([...decision.reasonCodes, ...semanticReason]);
  }

  const mapped: Readonly<Record<Exclude<RelationshipSignalRefreshTaskTypeV1, "VERIFY_SIGNAL_BEFORE_REFRESH">, string>> = {
    SPONSOR_MAP_REFRESH: "EXACT_SPONSORSHIP_DELTA_REQUIRES_SPONSOR_MAP_REFRESH",
    ROLE_EVIDENCE_REFRESH: "EXACT_ROLE_CHANGE_REQUIRES_CURRENT_ROLE_EVIDENCE_REFRESH",
    ACCESS_PATH_REVALIDATION: "RELATIONSHIP_CHANGE_CAN_INVALIDATE_EXISTING_ACCESS_PATH",
    RELATIONSHIP_GRAPH_REVIEW: "MATERIAL_RELATIONSHIP_DELTA_REQUIRES_CANONICAL_GRAPH_REVIEW"
  };
  return uniqueSorted([...decision.reasonCodes, mapped[taskType]]);
}

function taskId(decision: RelationshipSignalDeltaDecisionV1, taskType: RelationshipSignalRefreshTaskTypeV1): string {
  return `relationship-refresh:${decision.signalId}:${taskType.toLocaleLowerCase("en-US")}`;
}

function taskFromDecision(
  decision: RelationshipSignalDeltaDecisionV1,
  taskType: RelationshipSignalRefreshTaskTypeV1,
  evaluatedAtMs: number
): RelationshipSignalRefreshTaskV1 {
  const observedAt = timestamp(decision.observedAt, `decision ${decision.signalId}.observedAt`);
  if (Date.parse(observedAt) > evaluatedAtMs) throw new Error(`decision ${decision.signalId}.observedAt must not be future-dated`);

  return freezeDeep({
    taskId: taskId(decision, taskType),
    signalId: safeText(decision.signalId, "decision.signalId"),
    sourceEventKey: safeText(decision.sourceEventKey, "decision.sourceEventKey"),
    sourceRef: safeText(decision.sourceRef, "decision.sourceRef"),
    observedAt,
    taskType,
    subjectEntityRef: safeNullableText(decision.subjectEntityRef, "decision.subjectEntityRef"),
    objectEntityRef: safeNullableText(decision.objectEntityRef, "decision.objectEntityRef"),
    relationshipKind: decision.relationshipKind,
    relationshipStatus: decision.relationshipStatus,
    evidenceRefs: [...safeRefs(decision.evidenceRefs, "decision.evidenceRefs")],
    reasonCodes: [...taskReasons(decision, taskType)],
    requiresVerification: taskType === "VERIFY_SIGNAL_BEFORE_REFRESH",
    factCreationAuthorized: false as const,
    relationshipMutationAuthorized: false as const,
    decisionAuthorityInferenceAuthorized: false as const,
    contactDiscoveryAuthorized: false as const,
    opportunityCreationAuthorized: false as const,
    outreachAuthorized: false as const,
    externalActionAuthorized: false as const
  });
}

export function compileRelationshipSignalRefreshPlanV1(
  input: RelationshipSignalRefreshPlanInputV1
): RelationshipSignalRefreshPlanResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");

  const generatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(generatedAt);
  const maximumProjectionAgeMinutes = positiveBoundedInteger(input.maximumProjectionAgeMinutes, "maximumProjectionAgeMinutes");
  const projection = input.projection;
  const issues = projectionIssues(projection, evaluatedAtMs, maximumProjectionAgeMinutes);

  if (issues.length > 0) {
    return freezeDeep({
      version: RELATIONSHIP_SIGNAL_REFRESH_PLAN_VERSION_V1,
      sourceProjectionVersion: RELATIONSHIP_SIGNAL_DELTA_VERSION,
      generatedAt,
      status: "BLOCKED" as const,
      issues: [...issues],
      tasks: [],
      counts: {
        decisionsReviewed: Array.isArray(projection?.decisions) ? projection.decisions.length : 0,
        tasksQueued: 0,
        sponsorMapRefreshes: 0,
        roleEvidenceRefreshes: 0,
        accessPathRevalidations: 0,
        relationshipGraphReviews: 0,
        verificationTasks: 0,
        decisionsWithoutRefreshWork: 0
      },
      limitations: [...LIMITATIONS],
      inferencePolicy: "EXACT_UPSTREAM_DELTA_ONLY_NO_ENTITY_ROLE_TIMING_OR_OPPORTUNITY_INFERENCE" as const,
      authority: { ...AUTHORITY }
    });
  }

  const decisions = [...projection.decisions].sort((a, b) => a.signalId.localeCompare(b.signalId));
  const seenSignalIds = new Set<string>();
  const tasks: RelationshipSignalRefreshTaskV1[] = [];
  let decisionsWithoutRefreshWork = 0;

  for (const decision of decisions) {
    const signalId = safeText(decision.signalId, "decision.signalId");
    if (seenSignalIds.has(signalId)) throw new Error(`projection contains duplicate signalId ${signalId}`);
    seenSignalIds.add(signalId);

    safeText(decision.sourceEventKey, `decision ${signalId}.sourceEventKey`);
    safeText(decision.sourceRef, `decision ${signalId}.sourceRef`);
    safeNullableText(decision.subjectEntityRef, `decision ${signalId}.subjectEntityRef`);
    safeNullableText(decision.objectEntityRef, `decision ${signalId}.objectEntityRef`);
    safeRefs(decision.evidenceRefs, `decision ${signalId}.evidenceRefs`);
    const observedAt = timestamp(decision.observedAt, `decision ${signalId}.observedAt`);
    if (Date.parse(observedAt) > evaluatedAtMs) throw new Error(`decision ${signalId}.observedAt must not be future-dated`);

    const taskTypes = semanticRefreshTypes(decision);
    if (taskTypes.length === 0) {
      decisionsWithoutRefreshWork += 1;
      continue;
    }
    for (const taskType of taskTypes) tasks.push(taskFromDecision(decision, taskType, evaluatedAtMs));
  }

  tasks.sort((a, b) => {
    const signalOrder = a.signalId.localeCompare(b.signalId);
    if (signalOrder !== 0) return signalOrder;
    return TASK_ORDER[a.taskType] - TASK_ORDER[b.taskType];
  });

  const count = (taskType: RelationshipSignalRefreshTaskTypeV1): number => tasks.filter((task) => task.taskType === taskType).length;

  return freezeDeep({
    version: RELATIONSHIP_SIGNAL_REFRESH_PLAN_VERSION_V1,
    sourceProjectionVersion: RELATIONSHIP_SIGNAL_DELTA_VERSION,
    generatedAt,
    status: "READY" as const,
    issues: [],
    tasks,
    counts: {
      decisionsReviewed: decisions.length,
      tasksQueued: tasks.length,
      sponsorMapRefreshes: count("SPONSOR_MAP_REFRESH"),
      roleEvidenceRefreshes: count("ROLE_EVIDENCE_REFRESH"),
      accessPathRevalidations: count("ACCESS_PATH_REVALIDATION"),
      relationshipGraphReviews: count("RELATIONSHIP_GRAPH_REVIEW"),
      verificationTasks: count("VERIFY_SIGNAL_BEFORE_REFRESH"),
      decisionsWithoutRefreshWork
    },
    limitations: [...LIMITATIONS],
    inferencePolicy: "EXACT_UPSTREAM_DELTA_ONLY_NO_ENTITY_ROLE_TIMING_OR_OPPORTUNITY_INFERENCE" as const,
    authority: { ...AUTHORITY }
  });
}
