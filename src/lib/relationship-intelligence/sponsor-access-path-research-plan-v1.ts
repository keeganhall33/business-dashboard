import {
  SPONSOR_ACCESS_BRIEF_VERSION_V1,
  type SponsorAccessBriefResultV1,
  type SponsorAccessBriefV1
} from "@/lib/relationship-intelligence/sponsor-access-brief-v1";

export const SPONSOR_ACCESS_PATH_RESEARCH_PLAN_VERSION_V1 =
  "SPONSOR_ACCESS_PATH_RESEARCH_PLAN_V1" as const;

export type SponsorAccessPathResearchWorkTypeV1 =
  | "RESEARCH_SUPPORTED_ACCESS_PATH"
  | "RESOLVE_SUPPORTED_PATH_BLOCKER"
  | "VERIFY_ACCESS_PATH_CLAIM";

export type SponsorAccessPathResearchSourceClassV1 =
  | "CANONICAL_RELATIONSHIP_GRAPH"
  | "AUTHORIZED_FIRST_PARTY_RELATIONSHIP_HISTORY";

export type SponsorAccessPathResearchDispositionV1 =
  | "TASK_CREATED"
  | "NO_ACCESS_PATH_WORK"
  | "DEFER_IDENTITY_RESOLUTION"
  | "DEFER_NON_ACCESS_REVIEW";

export type SponsorAccessPathResearchTaskV1 = Readonly<{
  taskId: string;
  candidateId: string;
  sourceEntityId: string;
  targetEntityId: string;
  canonicalPersonRef: string;
  canonicalOrganizationRef: string;
  workType: SponsorAccessPathResearchWorkTypeV1;
  evidenceNeed: "SUPPORTED_CANONICAL_ACCESS_PATH";
  allowedSourceClasses: readonly SponsorAccessPathResearchSourceClassV1[];
  evidenceRefs: readonly string[];
  gapRefs: readonly string[];
  reasonCodes: readonly string[];
  warmAccess: "NOT_ESTABLISHED";
  introductionWillingness: "NOT_ESTABLISHED";
  sponsorInterest: "NOT_ESTABLISHED";
  decisionAuthority: "NOT_ESTABLISHED";
  opportunityImpact: "NOT_ESTABLISHED";
  relationshipInferenceAuthorized: false;
  publicSocialProximityInferenceAuthorized: false;
  privateContactDiscoveryAuthorized: false;
  graphMutationAuthorized: false;
  crmMutationAuthorized: false;
  outreachAuthorized: false;
  externalActionAuthorized: false;
}>;

export type SponsorAccessPathResearchDecisionV1 = Readonly<{
  candidateId: string;
  disposition: SponsorAccessPathResearchDispositionV1;
  taskId: string | null;
  reasonCodes: readonly string[];
}>;

export type SponsorAccessPathResearchPlanInputV1 = Readonly<{
  accessBriefs: SponsorAccessBriefResultV1;
  evaluatedAt: string | Date;
  maximumProjectionAgeMinutes: number;
  maximumTasks?: number;
}>;

export type SponsorAccessPathResearchPlanResultV1 = Readonly<{
  version: typeof SPONSOR_ACCESS_PATH_RESEARCH_PLAN_VERSION_V1;
  sourceVersion: typeof SPONSOR_ACCESS_BRIEF_VERSION_V1;
  generatedAt: string;
  status: "READY" | "NO_WORK" | "BLOCKED";
  issues: readonly string[];
  tasks: readonly SponsorAccessPathResearchTaskV1[];
  decisions: readonly SponsorAccessPathResearchDecisionV1[];
  omittedTaskCount: number;
  researchPolicy: "EXACT_CANONICAL_PATH_IDENTITY_AUTHORIZED_FIRST_PARTY_OR_GRAPH_ONLY";
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    researchPlanningAllowed: true;
    externalResearchAuthorized: false;
    relationshipInferenceAuthorized: false;
    publicSocialProximityInferenceAuthorized: false;
    privateContactDiscoveryAuthorized: false;
    graphMutationAuthorized: false;
    crmMutationAuthorized: false;
    outreachAuthorized: false;
    externalActionAuthorized: false;
  }>;
}>;

const MINUTE_MS = 60_000;
const MAX_PROJECTION_AGE_MINUTES = 10_080;
const MAX_TASKS = 500;
const MAX_BRIEFS = 1_000;

const ALLOWED_SOURCE_CLASSES = Object.freeze([
  "CANONICAL_RELATIONSHIP_GRAPH",
  "AUTHORIZED_FIRST_PARTY_RELATIONSHIP_HISTORY"
] as const);

const ACCESS_GAPS = new Set([
  "NO_EVIDENCE_SUPPORTED_RELATIONSHIP_PATH",
  "SPONSOR_ACCESS_PATH_NOT_GRAPH_PROVEN",
  "NON_COLD_ACCESS_NOT_EVIDENCED",
  "RELATIONSHIP_PATH_REQUIRES_RESEARCH",
  "ACCESS_PATH_CONFLICT_WITH_GRAPH"
]);

const EXPECTED_ACTION: Readonly<Record<SponsorAccessBriefV1["status"], SponsorAccessBriefV1["nextInternalAction"]>> = Object.freeze({
  ACCESS_READY: "PREPARE_INTRO_BRIEF",
  PATH_BLOCKED: "RESOLVE_PATH_BLOCKER",
  NO_SUPPORTED_PATH: "RESEARCH_ACCESS_PATH",
  RESEARCH_REQUIRED: "RESEARCH_MISSING_SPONSOR_OR_ACCESS_EVIDENCE",
  VERIFY_REQUIRED: "VERIFY_CONFLICTED_OR_UNPROVEN_EVIDENCE",
  SUPPRESS: "NONE"
});

const LIMITATIONS = Object.freeze([
  "This planner converts only exact sponsor-access gaps already produced by SponsorAccessBriefV1 into bounded internal research tasks. It does not discover or infer a relationship path.",
  "Warm access must be supported by the canonical relationship graph or authorized first-party relationship history. Public follows, shared employers, co-mentions, social proximity, event attendance, and source count do not establish a warm introduction path.",
  "A task never establishes willingness to introduce Keegan, sponsor interest, decision authority, opportunity quality, timing, confidence, monetary value, or expected outcome.",
  "Missing canonical person, organization, or graph target identity is deferred to identity resolution instead of fuzzy matching names, titles, employers, or labels.",
  "No task authorizes private contact discovery, graph or CRM mutation, outreach, spend, contracting, publishing, or another external action. Research evidence must return through canonical review before it can affect relationship truth."
] as const);

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  researchPlanningAllowed: true as const,
  externalResearchAuthorized: false as const,
  relationshipInferenceAuthorized: false as const,
  publicSocialProximityInferenceAuthorized: false as const,
  privateContactDiscoveryAuthorized: false as const,
  graphMutationAuthorized: false as const,
  crmMutationAuthorized: false as const,
  outreachAuthorized: false as const,
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

function boundedInteger(value: unknown, minimum: number, maximum: number, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function optionalBoundedInteger(value: unknown, fallback: number, minimum: number, maximum: number, label: string): number {
  return value == null ? fallback : boundedInteger(value, minimum, maximum, label);
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

function safeText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  const normalized = value.trim();
  if (containsCredentialMaterial(normalized)) throw new Error(`${label} must not contain credential material`);
  if (containsContactCoordinate(normalized)) throw new Error(`${label} must not contain raw contact coordinates`);
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

function countsMatch(source: SponsorAccessBriefResultV1): boolean {
  if (!source.counts || typeof source.counts !== "object") return false;
  const statuses: SponsorAccessBriefV1["status"][] = [
    "ACCESS_READY",
    "PATH_BLOCKED",
    "NO_SUPPORTED_PATH",
    "RESEARCH_REQUIRED",
    "VERIFY_REQUIRED",
    "SUPPRESS"
  ];
  return statuses.every((status) => source.counts[status] === source.briefs.filter((brief) => brief.status === status).length);
}

function isAccessGap(value: string): boolean {
  return ACCESS_GAPS.has(value) || value.startsWith("PATH_BLOCKER:");
}

function accessGapRefs(brief: SponsorAccessBriefV1): readonly string[] {
  return uniqueSorted(brief.researchOrVerificationGaps.filter(isAccessGap));
}

function pathLineageIssue(brief: SponsorAccessBriefV1, sourceEntityId: string): string | null {
  const path = brief.relationshipPath;
  if (!path) return null;
  if (path.contractVersion !== "RelationshipPathfinderV1") return "RELATIONSHIP_PATH_CONTRACT_UNSUPPORTED";
  if (path.sourceEntityId !== sourceEntityId) return "RELATIONSHIP_PATH_SOURCE_IDENTITY_MISMATCH";
  if (!brief.targetEntityId || path.targetEntityId !== brief.targetEntityId) return "RELATIONSHIP_PATH_TARGET_IDENTITY_MISMATCH";
  if (path.actionAuthority?.analysisOnly !== true
    || path.actionAuthority?.externalActionAuthorized !== false
    || path.actionAuthority?.outreachAuthorized !== false) {
    return "RELATIONSHIP_PATH_AUTHORITY_WIDENED";
  }
  return null;
}

function sourceIssues(
  source: SponsorAccessBriefResultV1,
  evaluatedAtMs: number,
  maximumProjectionAgeMinutes: number
): readonly string[] {
  const issues = new Set<string>();
  if (!source || typeof source !== "object" || Array.isArray(source)) return Object.freeze(["SOURCE_ACCESS_BRIEF_REQUIRED"]);
  if (source.version !== SPONSOR_ACCESS_BRIEF_VERSION_V1) issues.add("SOURCE_ACCESS_BRIEF_VERSION_UNSUPPORTED");
  if (!Array.isArray(source.briefs)) issues.add("SOURCE_ACCESS_BRIEFS_REQUIRED");
  else if (source.briefs.length > MAX_BRIEFS) issues.add("SOURCE_ACCESS_BRIEF_LIMIT_EXCEEDED");

  const generatedAtMs = Date.parse(source.generatedAt);
  if (!Number.isFinite(generatedAtMs)) issues.add("SOURCE_ACCESS_BRIEF_GENERATED_AT_INVALID");
  else if (generatedAtMs > evaluatedAtMs) issues.add("SOURCE_ACCESS_BRIEF_GENERATED_IN_FUTURE");
  else if (evaluatedAtMs - generatedAtMs > maximumProjectionAgeMinutes * MINUTE_MS) issues.add("SOURCE_ACCESS_BRIEF_STALE");

  if (source.actionAuthority?.analysisOnly !== true || source.actionAuthority?.internalPreparationAllowed !== true) {
    issues.add("SOURCE_ACCESS_BRIEF_ANALYSIS_AUTHORITY_INVALID");
  }
  if (source.actionAuthority?.crmMutationAuthorized !== false
    || source.actionAuthority?.contactDiscoveryAuthorized !== false
    || source.actionAuthority?.outreachAuthorized !== false
    || source.actionAuthority?.externalActionAuthorized !== false) {
    issues.add("SOURCE_ACCESS_BRIEF_AUTHORITY_WIDENED");
  }

  if (Array.isArray(source.briefs) && !countsMatch(source)) issues.add("SOURCE_ACCESS_BRIEF_COUNT_MISMATCH");

  let sourceEntityId: string | null = null;
  try {
    sourceEntityId = safeText(source.sourceEntityId, "sourceEntityId");
  } catch {
    issues.add("SOURCE_ACCESS_BRIEF_UNSAFE_SOURCE_IDENTITY");
  }

  if (Array.isArray(source.briefs)) {
    const candidateIds = new Set<string>();
    for (const [index, brief] of source.briefs.entries()) {
      try {
        const candidateId = safeText(brief.candidateId, `briefs[${index}].candidateId`);
        if (candidateIds.has(candidateId)) issues.add("SOURCE_ACCESS_BRIEF_DUPLICATE_CANDIDATE_ID");
        candidateIds.add(candidateId);
        safeNullableText(brief.canonicalOrganizationRef, `briefs[${index}].canonicalOrganizationRef`);
        safeNullableText(brief.canonicalPersonRef, `briefs[${index}].canonicalPersonRef`);
        safeNullableText(brief.targetEntityId, `briefs[${index}].targetEntityId`);
        safeRefs(brief.evidenceRefs, `briefs[${index}].evidenceRefs`);
        safeRefs(brief.researchOrVerificationGaps, `briefs[${index}].researchOrVerificationGaps`);
        safeRefs(brief.reasonCodes, `briefs[${index}].reasonCodes`);
        if (brief.nextInternalAction !== EXPECTED_ACTION[brief.status]) issues.add("SOURCE_ACCESS_BRIEF_ACTION_STATUS_DRIFT");
        if (sourceEntityId) {
          const lineageIssue = pathLineageIssue(brief, sourceEntityId);
          if (lineageIssue) issues.add(lineageIssue);
        }
      } catch {
        issues.add("SOURCE_ACCESS_BRIEF_UNSAFE_OR_INVALID_PROVENANCE");
      }
    }
  }

  return Object.freeze([...issues].sort((a, b) => a.localeCompare(b)));
}

function blocked(generatedAt: string, issues: readonly string[]): SponsorAccessPathResearchPlanResultV1 {
  return freezeDeep({
    version: SPONSOR_ACCESS_PATH_RESEARCH_PLAN_VERSION_V1,
    sourceVersion: SPONSOR_ACCESS_BRIEF_VERSION_V1,
    generatedAt,
    status: "BLOCKED" as const,
    issues: uniqueSorted(issues),
    tasks: [],
    decisions: [],
    omittedTaskCount: 0,
    researchPolicy: "EXACT_CANONICAL_PATH_IDENTITY_AUTHORIZED_FIRST_PARTY_OR_GRAPH_ONLY" as const,
    limitations: [...LIMITATIONS],
    authority: { ...AUTHORITY }
  });
}

function eligibleWorkType(brief: SponsorAccessBriefV1): SponsorAccessPathResearchWorkTypeV1 | null {
  if (brief.status === "NO_SUPPORTED_PATH") return "RESEARCH_SUPPORTED_ACCESS_PATH";
  if (brief.status === "PATH_BLOCKED") return "RESOLVE_SUPPORTED_PATH_BLOCKER";
  if (brief.status === "VERIFY_REQUIRED" && accessGapRefs(brief).length > 0) return "VERIFY_ACCESS_PATH_CLAIM";
  if (brief.status === "RESEARCH_REQUIRED" && accessGapRefs(brief).length > 0) return "RESEARCH_SUPPORTED_ACCESS_PATH";
  return null;
}

function decision(
  candidateId: string,
  disposition: SponsorAccessPathResearchDispositionV1,
  taskId: string | null,
  reasonCodes: readonly string[]
): SponsorAccessPathResearchDecisionV1 {
  return freezeDeep({ candidateId, disposition, taskId, reasonCodes: uniqueSorted(reasonCodes) });
}

function taskFromBrief(
  brief: SponsorAccessBriefV1,
  sourceEntityId: string,
  workType: SponsorAccessPathResearchWorkTypeV1
): SponsorAccessPathResearchTaskV1 {
  const candidateId = safeText(brief.candidateId, "brief.candidateId");
  const targetEntityId = safeText(brief.targetEntityId, `${candidateId}.targetEntityId`);
  const canonicalPersonRef = safeText(brief.canonicalPersonRef, `${candidateId}.canonicalPersonRef`);
  const canonicalOrganizationRef = safeText(brief.canonicalOrganizationRef, `${candidateId}.canonicalOrganizationRef`);
  const gapRefs = accessGapRefs(brief);
  const evidenceRefs = safeRefs(brief.evidenceRefs, `${candidateId}.evidenceRefs`);
  const taskId = `sponsor-access-research:${candidateId}:${workType}`;

  return freezeDeep({
    taskId,
    candidateId,
    sourceEntityId,
    targetEntityId,
    canonicalPersonRef,
    canonicalOrganizationRef,
    workType,
    evidenceNeed: "SUPPORTED_CANONICAL_ACCESS_PATH" as const,
    allowedSourceClasses: [...ALLOWED_SOURCE_CLASSES],
    evidenceRefs: [...evidenceRefs],
    gapRefs: [...gapRefs],
    reasonCodes: [...uniqueSorted(brief.reasonCodes)],
    warmAccess: "NOT_ESTABLISHED" as const,
    introductionWillingness: "NOT_ESTABLISHED" as const,
    sponsorInterest: "NOT_ESTABLISHED" as const,
    decisionAuthority: "NOT_ESTABLISHED" as const,
    opportunityImpact: "NOT_ESTABLISHED" as const,
    relationshipInferenceAuthorized: false as const,
    publicSocialProximityInferenceAuthorized: false as const,
    privateContactDiscoveryAuthorized: false as const,
    graphMutationAuthorized: false as const,
    crmMutationAuthorized: false as const,
    outreachAuthorized: false as const,
    externalActionAuthorized: false as const
  });
}

export function buildSponsorAccessPathResearchPlanV1(
  input: SponsorAccessPathResearchPlanInputV1
): SponsorAccessPathResearchPlanResultV1 {
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
  const issues = sourceIssues(input.accessBriefs, evaluatedAtMs, maximumProjectionAgeMinutes);
  if (issues.length > 0) return blocked(generatedAt, issues);

  const sourceEntityId = safeText(input.accessBriefs.sourceEntityId, "sourceEntityId");
  const candidateTasks: SponsorAccessPathResearchTaskV1[] = [];
  const decisions: SponsorAccessPathResearchDecisionV1[] = [];

  for (const brief of [...input.accessBriefs.briefs].sort((a, b) => a.candidateId.localeCompare(b.candidateId))) {
    const candidateId = safeText(brief.candidateId, "brief.candidateId");
    const workType = eligibleWorkType(brief);
    if (!workType) {
      const disposition = brief.status === "ACCESS_READY" || brief.status === "SUPPRESS"
        ? "NO_ACCESS_PATH_WORK" as const
        : "DEFER_NON_ACCESS_REVIEW" as const;
      decisions.push(decision(candidateId, disposition, null, brief.reasonCodes));
      continue;
    }

    if (!brief.canonicalOrganizationRef || !brief.canonicalPersonRef || !brief.targetEntityId) {
      decisions.push(decision(candidateId, "DEFER_IDENTITY_RESOLUTION", null, [
        ...brief.reasonCodes,
        "EXACT_CANONICAL_ORGANIZATION_PERSON_AND_TARGET_REQUIRED"
      ]));
      continue;
    }

    const task = taskFromBrief(brief, sourceEntityId, workType);
    candidateTasks.push(task);
    decisions.push(decision(candidateId, "TASK_CREATED", task.taskId, [
      ...brief.reasonCodes,
      "EXACT_CANONICAL_ACCESS_RESEARCH_TASK_CREATED"
    ]));
  }

  const tasks = candidateTasks.slice(0, maximumTasks);
  const includedTaskIds = new Set(tasks.map((task) => task.taskId));
  const boundedDecisions = decisions.map((item) =>
    item.taskId && !includedTaskIds.has(item.taskId)
      ? decision(item.candidateId, "DEFER_NON_ACCESS_REVIEW", null, [...item.reasonCodes, "TASK_OMITTED_BY_CALLER_LIMIT"])
      : item
  );

  return freezeDeep({
    version: SPONSOR_ACCESS_PATH_RESEARCH_PLAN_VERSION_V1,
    sourceVersion: SPONSOR_ACCESS_BRIEF_VERSION_V1,
    generatedAt,
    status: tasks.length > 0 ? "READY" as const : "NO_WORK" as const,
    issues: [],
    tasks,
    decisions: boundedDecisions,
    omittedTaskCount: candidateTasks.length - tasks.length,
    researchPolicy: "EXACT_CANONICAL_PATH_IDENTITY_AUTHORIZED_FIRST_PARTY_OR_GRAPH_ONLY" as const,
    limitations: [...LIMITATIONS],
    authority: { ...AUTHORITY }
  });
}
