import {
  RELATIONSHIP_UNIVERSE_COVERAGE_V1_VERSION,
  type RelationshipUniverseCoverageDimensionV1,
  type RelationshipUniverseCoverageResultV1,
  type RelationshipUniverseDomainV1,
  type RelationshipUniversePriorityTierV1,
  type RelationshipUniverseResearchPriorityV1,
  type RelationshipUniverseTargetCoverageV1
} from "@/lib/relationship-intelligence/relationship-universe-coverage-v1";

export const RELATIONSHIP_UNIVERSE_RESEARCH_PLAN_V1_VERSION = "RELATIONSHIP_UNIVERSE_RESEARCH_PLAN_V1" as const;

export type RelationshipUniverseResearchSourceClassV1 =
  | "OFFICIAL_ORGANIZATION_SOURCE"
  | "PUBLIC_PRIMARY_SOURCE"
  | "AUTHORIZED_FIRST_PARTY"
  | "CANONICAL_RELATIONSHIP_GRAPH"
  | "PUBLIC_OFFICIAL_CONTACT_ROUTE";

export type RelationshipUniverseResearchEvidenceNeedV1 =
  | "CURRENT_DECISION_FUNCTION"
  | "CURRENT_DECISION_AUTHORITY"
  | "SUPPORTED_SPONSOR_ECOSYSTEM_RELATIONSHIP"
  | "SUPPORTED_ACCESS_PATH"
  | "PUBLIC_OR_AUTHORIZED_PROFESSIONAL_CONTACT_ROUTE"
  | "SUPPORTED_PLANNING_WINDOW"
  | "SUPPORTED_RELATIONSHIP_HISTORY"
  | "CURRENT_ROLE"
  | "CURRENT_MATERIAL_SIGNAL";

export type RelationshipUniverseResearchPlanTaskV1 = Readonly<{
  taskId: string;
  upstreamOrdinal: number;
  targetId: string;
  canonicalEntityRef: string;
  domain: RelationshipUniverseDomainV1;
  priorityTier: RelationshipUniversePriorityTierV1;
  dimension: RelationshipUniverseCoverageDimensionV1;
  workType: RelationshipUniverseResearchPriorityV1["workType"];
  evidenceNeed: RelationshipUniverseResearchEvidenceNeedV1;
  allowedSourceClasses: readonly RelationshipUniverseResearchSourceClassV1[];
  evidenceRefs: readonly string[];
  reason: string;
  factCreationAuthorized: false;
  privateContactDiscoveryAuthorized: false;
  relationshipInferenceAuthorized: false;
  sponsorshipInferenceAuthorized: false;
  decisionAuthorityInferenceAuthorized: false;
  planningWindowInferenceAuthorized: false;
  opportunityImpact: "NOT_ESTABLISHED";
}>;

export type RelationshipUniverseResearchPlanInputV1 = Readonly<{
  coverage: RelationshipUniverseCoverageResultV1;
  evaluatedAt: string | Date;
  maximumProjectionAgeMinutes: number;
  maximumTasks?: number;
}>;

export type RelationshipUniverseResearchPlanResultV1 = Readonly<{
  version: typeof RELATIONSHIP_UNIVERSE_RESEARCH_PLAN_V1_VERSION;
  generatedAt: string;
  status: "READY" | "NO_GAPS" | "BLOCKED";
  issues: readonly string[];
  tasks: readonly RelationshipUniverseResearchPlanTaskV1[];
  omittedTaskCount: number;
  limitations: readonly string[];
  orderingPolicy: "PRESERVE_UPSTREAM_RESEARCH_PRIORITY_ORDER";
  authority: Readonly<{
    analysisOnly: true;
    externalResearchAuthorized: false;
    crmMutationAuthorized: false;
    contactDiscoveryAuthorized: false;
    outreachAuthorized: false;
    externalActionAuthorized: false;
  }>;
}>;

const MINUTE_MS = 60_000;
const MAX_PROJECTION_AGE_MINUTES = 10_080;
const MAX_TASKS = 500;

const LIMITATIONS = Object.freeze([
  "This plan converts already-governed Relationship Universe coverage gaps into bounded evidence-acquisition intents. It does not perform research or create facts.",
  "Task order is inherited from the upstream coverage research-priority order. This contract does not create a confidence score, opportunity score, monetary value, or expected outcome.",
  "Public evidence may support an observed role, sponsorship, date, or professional contact route only when the source explicitly supports that claim. Titles alone do not establish budget or decision authority.",
  "Warm access and relationship history must be supported by authorized first-party evidence or the canonical relationship graph. Public proximity, follows, shared employers, or social connections do not establish a warm introduction path.",
  "No task authorizes private contact discovery, CRM mutation, outreach, spend, contracts, publishing, or any external action."
] as const);

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  externalResearchAuthorized: false as const,
  crmMutationAuthorized: false as const,
  contactDiscoveryAuthorized: false as const,
  outreachAuthorized: false as const,
  externalActionAuthorized: false as const
});

const EVIDENCE_NEED: Readonly<Record<RelationshipUniverseCoverageDimensionV1, RelationshipUniverseResearchEvidenceNeedV1>> = Object.freeze({
  DECISION_FUNCTION: "CURRENT_DECISION_FUNCTION",
  DECISION_AUTHORITY: "CURRENT_DECISION_AUTHORITY",
  SPONSOR_ECOSYSTEM: "SUPPORTED_SPONSOR_ECOSYSTEM_RELATIONSHIP",
  ACCESS_PATH: "SUPPORTED_ACCESS_PATH",
  PROFESSIONAL_CONTACT_ROUTE: "PUBLIC_OR_AUTHORIZED_PROFESSIONAL_CONTACT_ROUTE",
  PLANNING_WINDOW: "SUPPORTED_PLANNING_WINDOW",
  RELATIONSHIP_HISTORY: "SUPPORTED_RELATIONSHIP_HISTORY",
  CURRENT_ROLE: "CURRENT_ROLE",
  CURRENT_SIGNAL: "CURRENT_MATERIAL_SIGNAL"
});

const SOURCE_CLASSES = Object.freeze({
  DECISION_FUNCTION: Object.freeze(["OFFICIAL_ORGANIZATION_SOURCE", "AUTHORIZED_FIRST_PARTY"]),
  DECISION_AUTHORITY: Object.freeze(["AUTHORIZED_FIRST_PARTY", "OFFICIAL_ORGANIZATION_SOURCE"]),
  SPONSOR_ECOSYSTEM: Object.freeze(["OFFICIAL_ORGANIZATION_SOURCE", "PUBLIC_PRIMARY_SOURCE", "AUTHORIZED_FIRST_PARTY"]),
  ACCESS_PATH: Object.freeze(["CANONICAL_RELATIONSHIP_GRAPH", "AUTHORIZED_FIRST_PARTY"]),
  PROFESSIONAL_CONTACT_ROUTE: Object.freeze(["PUBLIC_OFFICIAL_CONTACT_ROUTE", "AUTHORIZED_FIRST_PARTY"]),
  PLANNING_WINDOW: Object.freeze(["OFFICIAL_ORGANIZATION_SOURCE", "PUBLIC_PRIMARY_SOURCE", "AUTHORIZED_FIRST_PARTY"]),
  RELATIONSHIP_HISTORY: Object.freeze(["CANONICAL_RELATIONSHIP_GRAPH", "AUTHORIZED_FIRST_PARTY"]),
  CURRENT_ROLE: Object.freeze(["OFFICIAL_ORGANIZATION_SOURCE", "PUBLIC_PRIMARY_SOURCE", "AUTHORIZED_FIRST_PARTY"]),
  CURRENT_SIGNAL: Object.freeze(["PUBLIC_PRIMARY_SOURCE", "OFFICIAL_ORGANIZATION_SOURCE", "AUTHORIZED_FIRST_PARTY"])
}) as Readonly<Record<RelationshipUniverseCoverageDimensionV1, readonly RelationshipUniverseResearchSourceClassV1[]>>;

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function timestamp(value: string | Date, label: string): string {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return date.toISOString();
}

function boundedInteger(value: unknown, minimum: number, maximum: number, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function optionalBoundedInteger(value: unknown, fallback: number, minimum: number, maximum: number, label: string): number {
  return value == null ? fallback : boundedInteger(value, minimum, maximum, label);
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze(
    [...new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0).map((value) => value.trim()))]
      .sort((left, right) => left.localeCompare(right))
  );
}

function blocked(generatedAt: string, issues: readonly string[]): RelationshipUniverseResearchPlanResultV1 {
  return freezeDeep({
    version: RELATIONSHIP_UNIVERSE_RESEARCH_PLAN_V1_VERSION,
    generatedAt,
    status: "BLOCKED" as const,
    issues: uniqueSorted(issues),
    tasks: [],
    omittedTaskCount: 0,
    limitations: [...LIMITATIONS],
    orderingPolicy: "PRESERVE_UPSTREAM_RESEARCH_PRIORITY_ORDER" as const,
    authority: { ...AUTHORITY }
  });
}

function projectionIssues(
  coverage: RelationshipUniverseCoverageResultV1,
  evaluatedAtMs: number,
  maximumProjectionAgeMinutes: number
): string[] {
  const issues: string[] = [];
  if (coverage.version !== RELATIONSHIP_UNIVERSE_COVERAGE_V1_VERSION) issues.push("UNSUPPORTED_COVERAGE_VERSION");
  const generatedAtMs = Date.parse(coverage.generatedAt);
  if (!Number.isFinite(generatedAtMs)) {
    issues.push("COVERAGE_GENERATED_AT_INVALID");
    return issues;
  }
  if (generatedAtMs > evaluatedAtMs) issues.push("COVERAGE_GENERATED_IN_FUTURE");
  if (evaluatedAtMs - generatedAtMs > maximumProjectionAgeMinutes * MINUTE_MS) issues.push("COVERAGE_PROJECTION_STALE");
  return issues;
}

function indexTargets(targets: readonly RelationshipUniverseTargetCoverageV1[], issues: string[]): ReadonlyMap<string, RelationshipUniverseTargetCoverageV1> {
  const indexed = new Map<string, RelationshipUniverseTargetCoverageV1>();
  for (const [index, target] of targets.entries()) {
    const targetId = requiredText(target?.targetId, `coverage.targets[${index}].targetId`);
    if (indexed.has(targetId)) {
      issues.push(`DUPLICATE_TARGET:${targetId}`);
      continue;
    }
    indexed.set(targetId, target);
  }
  return indexed;
}

function validatePriority(
  priority: RelationshipUniverseResearchPriorityV1,
  target: RelationshipUniverseTargetCoverageV1 | undefined,
  index: number,
  issues: string[]
): target is RelationshipUniverseTargetCoverageV1 {
  const targetId = requiredText(priority?.targetId, `coverage.researchPriorities[${index}].targetId`);
  if (!target) {
    issues.push(`PRIORITY_TARGET_NOT_FOUND:${targetId}`);
    return false;
  }
  if (!target.canonicalEntityRef) {
    issues.push(`PRIORITY_TARGET_HAS_NO_CANONICAL_ENTITY:${targetId}`);
    return false;
  }
  if (target.disposition === "SUPPRESS") {
    issues.push(`SUPPRESSED_TARGET_HAS_RESEARCH_PRIORITY:${targetId}`);
    return false;
  }

  const expectedWorkType = target.missingDimensions.includes(priority.dimension)
    ? "RESEARCH_MISSING_FACT"
    : target.verificationDimensions.includes(priority.dimension)
      ? "VERIFY_EXISTING_FACT"
      : null;

  if (!expectedWorkType) {
    issues.push(`PRIORITY_DIMENSION_NOT_A_CURRENT_GAP:${targetId}:${priority.dimension}`);
    return false;
  }
  if (priority.workType !== expectedWorkType) {
    issues.push(`PRIORITY_WORK_TYPE_MISMATCH:${targetId}:${priority.dimension}`);
    return false;
  }
  if (priority.domain !== target.domain || priority.priorityTier !== target.priorityTier) {
    issues.push(`PRIORITY_TARGET_METADATA_MISMATCH:${targetId}:${priority.dimension}`);
    return false;
  }
  return true;
}

function taskFromPriority(
  priority: RelationshipUniverseResearchPriorityV1,
  target: RelationshipUniverseTargetCoverageV1,
  upstreamOrdinal: number
): RelationshipUniverseResearchPlanTaskV1 {
  return freezeDeep({
    taskId: `relationship-research:${target.targetId}:${priority.dimension}:${priority.workType}`,
    upstreamOrdinal,
    targetId: target.targetId,
    canonicalEntityRef: requiredText(target.canonicalEntityRef, `${target.targetId}.canonicalEntityRef`),
    domain: target.domain,
    priorityTier: target.priorityTier,
    dimension: priority.dimension,
    workType: priority.workType,
    evidenceNeed: EVIDENCE_NEED[priority.dimension],
    allowedSourceClasses: [...SOURCE_CLASSES[priority.dimension]],
    evidenceRefs: [...uniqueSorted(target.evidenceRefs)],
    reason: requiredText(priority.reason, `${target.targetId}.${priority.dimension}.reason`),
    factCreationAuthorized: false as const,
    privateContactDiscoveryAuthorized: false as const,
    relationshipInferenceAuthorized: false as const,
    sponsorshipInferenceAuthorized: false as const,
    decisionAuthorityInferenceAuthorized: false as const,
    planningWindowInferenceAuthorized: false as const,
    opportunityImpact: "NOT_ESTABLISHED" as const
  });
}

/**
 * Turns canonical Relationship Universe coverage gaps into a provider-independent
 * evidence-acquisition plan. This is deliberately a planning boundary only:
 * callers still need a separately governed research connector and must return
 * observed evidence through canonical evidence/entity-resolution paths before
 * any fact can become KNOWN.
 */
export function buildRelationshipUniverseResearchPlanV1(
  input: RelationshipUniverseResearchPlanInputV1
): RelationshipUniverseResearchPlanResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  const generatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(generatedAt);
  const maximumProjectionAgeMinutes = boundedInteger(
    input.maximumProjectionAgeMinutes,
    1,
    MAX_PROJECTION_AGE_MINUTES,
    "maximumProjectionAgeMinutes"
  );
  const maximumTasks = optionalBoundedInteger(input.maximumTasks, MAX_TASKS, 1, MAX_TASKS, "maximumTasks");

  if (!input.coverage || typeof input.coverage !== "object" || Array.isArray(input.coverage)) {
    throw new Error("coverage must be an object");
  }
  if (!Array.isArray(input.coverage.targets) || !Array.isArray(input.coverage.researchPriorities)) {
    throw new Error("coverage targets and researchPriorities must be arrays");
  }

  const issues = projectionIssues(input.coverage, evaluatedAtMs, maximumProjectionAgeMinutes);
  const targets = indexTargets(input.coverage.targets, issues);
  const seenPriorityKeys = new Set<string>();
  const candidateTasks: RelationshipUniverseResearchPlanTaskV1[] = [];

  for (const [index, priority] of input.coverage.researchPriorities.entries()) {
    if (!priority || typeof priority !== "object" || Array.isArray(priority)) {
      issues.push(`MALFORMED_RESEARCH_PRIORITY:${index}`);
      continue;
    }
    const key = `${priority.targetId}\u0000${priority.dimension}`;
    if (seenPriorityKeys.has(key)) {
      issues.push(`DUPLICATE_RESEARCH_PRIORITY:${priority.targetId}:${priority.dimension}`);
      continue;
    }
    seenPriorityKeys.add(key);

    const target = targets.get(priority.targetId);
    if (!validatePriority(priority, target, index, issues)) continue;
    candidateTasks.push(taskFromPriority(priority, target, index));
  }

  if (issues.length > 0) return blocked(generatedAt, issues);

  const tasks = candidateTasks.slice(0, maximumTasks);
  const omittedTaskCount = candidateTasks.length - tasks.length;
  return freezeDeep({
    version: RELATIONSHIP_UNIVERSE_RESEARCH_PLAN_V1_VERSION,
    generatedAt,
    status: candidateTasks.length === 0 ? "NO_GAPS" as const : "READY" as const,
    issues: [],
    tasks,
    omittedTaskCount,
    limitations: [...LIMITATIONS],
    orderingPolicy: "PRESERVE_UPSTREAM_RESEARCH_PRIORITY_ORDER" as const,
    authority: { ...AUTHORITY }
  });
}
