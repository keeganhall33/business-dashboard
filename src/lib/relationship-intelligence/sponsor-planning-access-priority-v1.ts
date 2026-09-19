import {
  SPONSOR_ACCESS_BRIEF_VERSION_V1,
  type SponsorAccessBriefResultV1,
  type SponsorAccessBriefStatusV1,
  type SponsorAccessBriefV1
} from "@/lib/relationship-intelligence/sponsor-access-brief-v1";
import {
  EARLY_PLANNING_WINDOW_V1_VERSION,
  type EarlyPlanningDecisionV1,
  type EarlyPlanningDispositionV1,
  type EarlyPlanningWindowResultV1
} from "@/lib/relationship-intelligence/early-planning-window-v1";

export const SPONSOR_PLANNING_ACCESS_PRIORITY_VERSION_V1 =
  "SPONSOR_PLANNING_ACCESS_PRIORITY_V1" as const;

export type SponsorPlanningAccessPriorityBandV1 =
  | "ACT_NOW"
  | "BUILD_ACCESS_NOW"
  | "VERIFY_NOW"
  | "RESEARCH_NOW"
  | "PREPARE_AHEAD"
  | "WATCH_AHEAD"
  | "NEXT_CYCLE_REVIEW"
  | "INCOMPLETE_EVIDENCE";

export type SponsorPlanningAccessNextInternalActionV1 =
  | "PREPARE_APPROVAL_READY_INTRO"
  | "RESOLVE_ACCESS_BLOCKER_NOW"
  | "RESEARCH_SUPPORTED_ACCESS_PATH_NOW"
  | "VERIFY_ACCESS_OR_TIMING_NOW"
  | "RESEARCH_TIMING_OR_ACCESS_NOW"
  | "PREPARE_INTRO_BRIEF_AHEAD"
  | "BUILD_ACCESS_PATH_BEFORE_WINDOW"
  | "MONITOR_EVIDENCED_WINDOW"
  | "REVIEW_NEXT_CYCLE"
  | "BUILD_MISSING_ACCESS_BRIEF"
  | "BUILD_MISSING_PLANNING_EVIDENCE";

export type SponsorPlanningAccessPriorityItemV1 = Readonly<{
  candidateId: string;
  canonicalOrganizationRef: string | null;
  canonicalOpportunityRef: string | null;
  canonicalPersonRef: string | null;
  targetEntityId: string | null;
  planningDisposition: EarlyPlanningDispositionV1 | "MISSING";
  accessStatus: SponsorAccessBriefStatusV1 | "MISSING";
  priorityBand: SponsorPlanningAccessPriorityBandV1;
  nextInternalAction: SponsorPlanningAccessNextInternalActionV1;
  idealOutreachDateRange: EarlyPlanningDecisionV1["idealOutreachDateRange"];
  daysUntilWindowStart: number | null;
  evidenceRefs: readonly string[];
  reasonCodes: readonly string[];
  researchOrVerificationGaps: readonly string[];
  outreachAuthorized: false;
  externalActionAuthorized: false;
}>;

export type SponsorPlanningAccessPriorityInputV1 = Readonly<{
  accessBriefs: SponsorAccessBriefResultV1;
  planningWindows: EarlyPlanningWindowResultV1;
  evaluatedAt: string | Date;
  maximumProjectionAgeMinutes: number;
  maximumItems?: number;
}>;

export type SponsorPlanningAccessPriorityResultV1 = Readonly<{
  version: typeof SPONSOR_PLANNING_ACCESS_PRIORITY_VERSION_V1;
  accessSourceVersion: typeof SPONSOR_ACCESS_BRIEF_VERSION_V1;
  planningSourceVersion: typeof EARLY_PLANNING_WINDOW_V1_VERSION;
  generatedAt: string;
  status: "READY" | "NO_WORK" | "BLOCKED";
  issues: readonly string[];
  items: readonly SponsorPlanningAccessPriorityItemV1[];
  omittedItemCount: number;
  counts: Readonly<Record<SponsorPlanningAccessPriorityBandV1, number>>;
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    internalPreparationAllowed: true;
    researchPlanningAllowed: true;
    crmMutationAuthorized: false;
    outreachAuthorized: false;
    externalActionAuthorized: false;
  }>;
}>;

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const MAX_SOURCE_ITEMS = 1_000;
const MAX_ITEMS = 500;
const MAX_PROJECTION_AGE_MINUTES = 10_080;

const LIMITATIONS = Object.freeze([
  "Priority is derived only from existing canonical sponsor-access and planning-window evidence. It does not invent sponsorship interest, buyer authority, budget, warm access, timing, or opportunity value.",
  "ACT_NOW means internal preparation is timely because an evidence-backed planning window is open and supported access is ready. It does not authorize outreach.",
  "BUILD_ACCESS_NOW and RESEARCH_NOW identify information or relationship-path work before an evidenced window closes. They do not establish a warm introduction path.",
  "Missing, stale, future, conflicted, mismatched, or authority-widened source evidence fails closed instead of being converted into confidence, value, or urgency.",
  "No item authorizes CRM mutation, private contact discovery, outreach, spend, contracting, publishing, or another external business action."
] as const);

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  internalPreparationAllowed: true as const,
  researchPlanningAllowed: true as const,
  crmMutationAuthorized: false as const,
  outreachAuthorized: false as const,
  externalActionAuthorized: false as const
});

const PRIORITY_ORDER: readonly SponsorPlanningAccessPriorityBandV1[] = [
  "ACT_NOW",
  "BUILD_ACCESS_NOW",
  "VERIFY_NOW",
  "RESEARCH_NOW",
  "PREPARE_AHEAD",
  "WATCH_AHEAD",
  "NEXT_CYCLE_REVIEW",
  "INCOMPLETE_EVIDENCE"
];

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

function optionalBoundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string
): number {
  return value == null ? fallback : boundedInteger(value, minimum, maximum, label);
}

function containsCredentialMaterial(value: string): boolean {
  return /op:\/\//i.test(value)
    || /bearer\s+[a-z0-9._~-]+/i.test(value)
    || /(?:password|secret|token|api[_-]?key)\s*[=:]/i.test(value)
    || /[?&](?:access_token|token|api_key|key)=/i.test(value);
}

function containsRawContactCoordinate(value: string): boolean {
  return /mailto:/i.test(value)
    || /tel:/i.test(value)
    || /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value);
}

function safeText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  const normalized = value.trim();
  if (containsCredentialMaterial(normalized)) throw new Error(`${label} must not contain credential material`);
  if (containsRawContactCoordinate(normalized)) throw new Error(`${label} must not contain raw contact coordinates`);
  return normalized;
}

function safeNullableText(value: unknown, label: string): string | null {
  if (value == null) return null;
  return safeText(value, label);
}

function safeRefs(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return Object.freeze([...new Set(value.map((item, index) => safeText(item, `${label}[${index}]`)))].sort());
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b)));
}

function expectedAccessAction(status: SponsorAccessBriefStatusV1): string {
  switch (status) {
    case "ACCESS_READY": return "PREPARE_INTRO_BRIEF";
    case "PATH_BLOCKED": return "RESOLVE_PATH_BLOCKER";
    case "NO_SUPPORTED_PATH": return "RESEARCH_ACCESS_PATH";
    case "RESEARCH_REQUIRED": return "RESEARCH_MISSING_SPONSOR_OR_ACCESS_EVIDENCE";
    case "VERIFY_REQUIRED": return "VERIFY_CONFLICTED_OR_UNPROVEN_EVIDENCE";
    case "SUPPRESS": return "NONE";
  }
}

function accessCountsMatch(source: SponsorAccessBriefResultV1): boolean {
  const statuses: readonly SponsorAccessBriefStatusV1[] = [
    "ACCESS_READY",
    "PATH_BLOCKED",
    "NO_SUPPORTED_PATH",
    "RESEARCH_REQUIRED",
    "VERIFY_REQUIRED",
    "SUPPRESS"
  ];
  return statuses.every((status) => source.counts?.[status] === source.briefs.filter((brief) => brief.status === status).length);
}

function planningCountsMatch(source: EarlyPlanningWindowResultV1): boolean {
  return source.counts?.reviewed === source.decisions.length
    && source.counts?.planAhead === source.decisions.filter((item) => item.disposition === "PLAN_AHEAD").length
    && source.counts?.windowOpen === source.decisions.filter((item) => item.disposition === "WINDOW_OPEN").length
    && source.counts?.missedPlanningWindow === source.decisions.filter((item) => item.disposition === "MISSED_PLANNING_WINDOW").length
    && source.counts?.needsResearch === source.decisions.filter((item) => item.disposition === "NEEDS_RESEARCH").length
    && source.counts?.needsVerification === source.decisions.filter((item) => item.disposition === "NEEDS_VERIFICATION").length
    && source.counts?.suppressed === source.decisions.filter((item) => item.disposition === "SUPPRESS").length;
}

function validateAccessSource(
  source: SponsorAccessBriefResultV1,
  evaluatedAtMs: number,
  maximumProjectionAgeMinutes: number
): readonly string[] {
  const issues = new Set<string>();
  if (!source || typeof source !== "object" || Array.isArray(source)) return Object.freeze(["ACCESS_SOURCE_REQUIRED"]);
  if (source.version !== SPONSOR_ACCESS_BRIEF_VERSION_V1) issues.add("ACCESS_SOURCE_VERSION_UNSUPPORTED");
  if (!Array.isArray(source.briefs)) issues.add("ACCESS_SOURCE_BRIEFS_REQUIRED");
  else if (source.briefs.length > MAX_SOURCE_ITEMS) issues.add("ACCESS_SOURCE_LIMIT_EXCEEDED");

  const generatedAtMs = Date.parse(source.generatedAt);
  if (!Number.isFinite(generatedAtMs)) issues.add("ACCESS_SOURCE_GENERATED_AT_INVALID");
  else if (generatedAtMs > evaluatedAtMs) issues.add("ACCESS_SOURCE_GENERATED_IN_FUTURE");
  else if (evaluatedAtMs - generatedAtMs > maximumProjectionAgeMinutes * MINUTE_MS) issues.add("ACCESS_SOURCE_STALE");

  if (source.actionAuthority?.analysisOnly !== true || source.actionAuthority?.internalPreparationAllowed !== true) {
    issues.add("ACCESS_SOURCE_ANALYSIS_AUTHORITY_INVALID");
  }
  if (source.actionAuthority?.crmMutationAuthorized !== false
    || source.actionAuthority?.contactDiscoveryAuthorized !== false
    || source.actionAuthority?.outreachAuthorized !== false
    || source.actionAuthority?.externalActionAuthorized !== false) {
    issues.add("ACCESS_SOURCE_AUTHORITY_WIDENED");
  }
  if (Array.isArray(source.briefs) && !accessCountsMatch(source)) issues.add("ACCESS_SOURCE_COUNT_MISMATCH");

  if (Array.isArray(source.briefs)) {
    const ids = new Set<string>();
    for (const [index, brief] of source.briefs.entries()) {
      try {
        const candidateId = safeText(brief?.candidateId, `accessBriefs.briefs[${index}].candidateId`);
        if (ids.has(candidateId)) issues.add("ACCESS_SOURCE_DUPLICATE_CANDIDATE_ID");
        ids.add(candidateId);
        safeNullableText(brief.canonicalOrganizationRef, `accessBriefs.briefs[${index}].canonicalOrganizationRef`);
        safeNullableText(brief.canonicalPersonRef, `accessBriefs.briefs[${index}].canonicalPersonRef`);
        safeNullableText(brief.targetEntityId, `accessBriefs.briefs[${index}].targetEntityId`);
        safeRefs(brief.evidenceRefs, `accessBriefs.briefs[${index}].evidenceRefs`);
        safeRefs(brief.reasonCodes, `accessBriefs.briefs[${index}].reasonCodes`);
        safeRefs(brief.researchOrVerificationGaps, `accessBriefs.briefs[${index}].researchOrVerificationGaps`);
        if (brief.nextInternalAction !== expectedAccessAction(brief.status)) issues.add("ACCESS_SOURCE_ACTION_STATUS_DRIFT");
      } catch {
        issues.add("ACCESS_SOURCE_UNSAFE_OR_INVALID_PROVENANCE");
      }
    }
  }

  return Object.freeze([...issues].sort());
}

function validatePlanningSource(
  source: EarlyPlanningWindowResultV1,
  evaluatedAtMs: number,
  maximumProjectionAgeMinutes: number
): readonly string[] {
  const issues = new Set<string>();
  if (!source || typeof source !== "object" || Array.isArray(source)) return Object.freeze(["PLANNING_SOURCE_REQUIRED"]);
  if (source.version !== EARLY_PLANNING_WINDOW_V1_VERSION) issues.add("PLANNING_SOURCE_VERSION_UNSUPPORTED");
  if (!Array.isArray(source.decisions)) issues.add("PLANNING_SOURCE_DECISIONS_REQUIRED");
  else if (source.decisions.length > MAX_SOURCE_ITEMS) issues.add("PLANNING_SOURCE_LIMIT_EXCEEDED");

  const generatedAtMs = Date.parse(source.generatedAt);
  if (!Number.isFinite(generatedAtMs)) issues.add("PLANNING_SOURCE_GENERATED_AT_INVALID");
  else if (generatedAtMs > evaluatedAtMs) issues.add("PLANNING_SOURCE_GENERATED_IN_FUTURE");
  else if (evaluatedAtMs - generatedAtMs > maximumProjectionAgeMinutes * MINUTE_MS) issues.add("PLANNING_SOURCE_STALE");

  if (source.externalResearchPerformed !== false
    || source.crmMutationPerformed !== false
    || source.outreachPerformed !== false
    || source.externalActionAuthorized !== false) {
    issues.add("PLANNING_SOURCE_AUTHORITY_WIDENED");
  }
  if (Array.isArray(source.decisions) && !planningCountsMatch(source)) issues.add("PLANNING_SOURCE_COUNT_MISMATCH");

  if (Array.isArray(source.decisions)) {
    const ids = new Set<string>();
    for (const [index, decision] of source.decisions.entries()) {
      try {
        const candidateId = safeText(decision?.candidateId, `planningWindows.decisions[${index}].candidateId`);
        if (ids.has(candidateId)) issues.add("PLANNING_SOURCE_DUPLICATE_CANDIDATE_ID");
        ids.add(candidateId);
        safeNullableText(decision.canonicalOrganizationRef, `planningWindows.decisions[${index}].canonicalOrganizationRef`);
        safeNullableText(decision.canonicalOpportunityRef, `planningWindows.decisions[${index}].canonicalOpportunityRef`);
        safeRefs(decision.evidenceRefs, `planningWindows.decisions[${index}].evidenceRefs`);
        safeRefs(decision.reasonCodes, `planningWindows.decisions[${index}].reasonCodes`);
        safeRefs(decision.coverageGaps, `planningWindows.decisions[${index}].coverageGaps`);
      } catch {
        issues.add("PLANNING_SOURCE_UNSAFE_OR_INVALID_PROVENANCE");
      }
    }
  }

  return Object.freeze([...issues].sort());
}

function sourceIdentityIssues(
  accessById: ReadonlyMap<string, SponsorAccessBriefV1>,
  planningById: ReadonlyMap<string, EarlyPlanningDecisionV1>
): readonly string[] {
  const issues = new Set<string>();
  for (const [candidateId, access] of accessById) {
    const planning = planningById.get(candidateId);
    if (!planning) continue;
    if (access.canonicalOrganizationRef && planning.canonicalOrganizationRef
      && access.canonicalOrganizationRef !== planning.canonicalOrganizationRef) {
      issues.add(`CANDIDATE_CANONICAL_ORGANIZATION_MISMATCH:${candidateId}`);
    }
  }
  return Object.freeze([...issues].sort());
}

function emptyCounts(): Record<SponsorPlanningAccessPriorityBandV1, number> {
  return {
    ACT_NOW: 0,
    BUILD_ACCESS_NOW: 0,
    VERIFY_NOW: 0,
    RESEARCH_NOW: 0,
    PREPARE_AHEAD: 0,
    WATCH_AHEAD: 0,
    NEXT_CYCLE_REVIEW: 0,
    INCOMPLETE_EVIDENCE: 0
  };
}

function blocked(generatedAt: string, issues: readonly string[]): SponsorPlanningAccessPriorityResultV1 {
  return freezeDeep({
    version: SPONSOR_PLANNING_ACCESS_PRIORITY_VERSION_V1,
    accessSourceVersion: SPONSOR_ACCESS_BRIEF_VERSION_V1,
    planningSourceVersion: EARLY_PLANNING_WINDOW_V1_VERSION,
    generatedAt,
    status: "BLOCKED" as const,
    issues: uniqueSorted(issues),
    items: [],
    omittedItemCount: 0,
    counts: emptyCounts(),
    limitations: [...LIMITATIONS],
    authority: { ...AUTHORITY }
  });
}

function priorityAndAction(
  planning: EarlyPlanningDecisionV1 | null,
  access: SponsorAccessBriefV1 | null
): readonly [SponsorPlanningAccessPriorityBandV1, SponsorPlanningAccessNextInternalActionV1] | null {
  if (!planning) return ["INCOMPLETE_EVIDENCE", "BUILD_MISSING_PLANNING_EVIDENCE"];
  if (!access) return ["INCOMPLETE_EVIDENCE", "BUILD_MISSING_ACCESS_BRIEF"];
  if (planning.disposition === "SUPPRESS" || access.status === "SUPPRESS") return null;

  if (planning.disposition === "MISSED_PLANNING_WINDOW") {
    return ["NEXT_CYCLE_REVIEW", "REVIEW_NEXT_CYCLE"];
  }
  if (planning.disposition === "NEEDS_VERIFICATION" || access.status === "VERIFY_REQUIRED") {
    return ["VERIFY_NOW", "VERIFY_ACCESS_OR_TIMING_NOW"];
  }
  if (planning.disposition === "NEEDS_RESEARCH") {
    return ["RESEARCH_NOW", "RESEARCH_TIMING_OR_ACCESS_NOW"];
  }

  if (planning.disposition === "WINDOW_OPEN") {
    if (access.status === "ACCESS_READY") return ["ACT_NOW", "PREPARE_APPROVAL_READY_INTRO"];
    if (access.status === "PATH_BLOCKED") return ["BUILD_ACCESS_NOW", "RESOLVE_ACCESS_BLOCKER_NOW"];
    if (access.status === "NO_SUPPORTED_PATH") return ["BUILD_ACCESS_NOW", "RESEARCH_SUPPORTED_ACCESS_PATH_NOW"];
    return ["RESEARCH_NOW", "RESEARCH_TIMING_OR_ACCESS_NOW"];
  }

  if (planning.disposition === "PLAN_AHEAD") {
    if (access.status === "ACCESS_READY") return ["PREPARE_AHEAD", "PREPARE_INTRO_BRIEF_AHEAD"];
    if (access.status === "PATH_BLOCKED" || access.status === "NO_SUPPORTED_PATH") {
      return ["BUILD_ACCESS_NOW", "BUILD_ACCESS_PATH_BEFORE_WINDOW"];
    }
    if (access.status === "RESEARCH_REQUIRED") return ["RESEARCH_NOW", "RESEARCH_TIMING_OR_ACCESS_NOW"];
    return ["WATCH_AHEAD", "MONITOR_EVIDENCED_WINDOW"];
  }

  return ["WATCH_AHEAD", "MONITOR_EVIDENCED_WINDOW"];
}

function daysUntilWindowStart(planning: EarlyPlanningDecisionV1 | null, evaluatedAtMs: number): number | null {
  const startDate = planning?.idealOutreachDateRange?.startDate;
  if (!startDate) return null;
  const startMs = Date.parse(startDate);
  if (!Number.isFinite(startMs)) return null;
  return Math.max(0, Math.ceil((startMs - evaluatedAtMs) / DAY_MS));
}

function buildItem(
  candidateId: string,
  planning: EarlyPlanningDecisionV1 | null,
  access: SponsorAccessBriefV1 | null,
  evaluatedAtMs: number
): SponsorPlanningAccessPriorityItemV1 | null {
  const choice = priorityAndAction(planning, access);
  if (!choice) return null;
  const [priorityBand, nextInternalAction] = choice;

  return freezeDeep({
    candidateId,
    canonicalOrganizationRef: access?.canonicalOrganizationRef ?? planning?.canonicalOrganizationRef ?? null,
    canonicalOpportunityRef: planning?.canonicalOpportunityRef ?? null,
    canonicalPersonRef: access?.canonicalPersonRef ?? null,
    targetEntityId: access?.targetEntityId ?? null,
    planningDisposition: planning?.disposition ?? "MISSING",
    accessStatus: access?.status ?? "MISSING",
    priorityBand,
    nextInternalAction,
    idealOutreachDateRange: planning?.idealOutreachDateRange ?? null,
    daysUntilWindowStart: daysUntilWindowStart(planning, evaluatedAtMs),
    evidenceRefs: uniqueSorted([...(planning?.evidenceRefs ?? []), ...(access?.evidenceRefs ?? [])]),
    reasonCodes: uniqueSorted([...(planning?.reasonCodes ?? []), ...(access?.reasonCodes ?? [])]),
    researchOrVerificationGaps: uniqueSorted([
      ...(planning?.coverageGaps ?? []),
      ...(access?.researchOrVerificationGaps ?? []),
      ...(!planning ? ["MISSING_PLANNING_DECISION"] : []),
      ...(!access ? ["MISSING_SPONSOR_ACCESS_BRIEF"] : [])
    ]),
    outreachAuthorized: false as const,
    externalActionAuthorized: false as const
  });
}

function itemSort(a: SponsorPlanningAccessPriorityItemV1, b: SponsorPlanningAccessPriorityItemV1): number {
  const priorityDelta = PRIORITY_ORDER.indexOf(a.priorityBand) - PRIORITY_ORDER.indexOf(b.priorityBand);
  if (priorityDelta !== 0) return priorityDelta;
  const aDays = a.daysUntilWindowStart ?? Number.POSITIVE_INFINITY;
  const bDays = b.daysUntilWindowStart ?? Number.POSITIVE_INFINITY;
  if (aDays !== bDays) return aDays - bDays;
  return a.candidateId.localeCompare(b.candidateId);
}

export function prioritizeSponsorPlanningAccessV1(
  input: SponsorPlanningAccessPriorityInputV1
): SponsorPlanningAccessPriorityResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  const generatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(generatedAt);
  const maximumProjectionAgeMinutes = boundedInteger(
    input.maximumProjectionAgeMinutes,
    1,
    MAX_PROJECTION_AGE_MINUTES,
    "maximumProjectionAgeMinutes"
  );
  const maximumItems = optionalBoundedInteger(input.maximumItems, MAX_ITEMS, 1, MAX_ITEMS, "maximumItems");

  const issues = uniqueSorted([
    ...validateAccessSource(input.accessBriefs, evaluatedAtMs, maximumProjectionAgeMinutes),
    ...validatePlanningSource(input.planningWindows, evaluatedAtMs, maximumProjectionAgeMinutes)
  ]);
  if (issues.length > 0) return blocked(generatedAt, issues);

  const accessById = new Map(input.accessBriefs.briefs.map((brief) => [brief.candidateId, brief] as const));
  const planningById = new Map(input.planningWindows.decisions.map((decision) => [decision.candidateId, decision] as const));
  const identityIssues = sourceIdentityIssues(accessById, planningById);
  if (identityIssues.length > 0) return blocked(generatedAt, identityIssues);

  const candidateIds = uniqueSorted([...accessById.keys(), ...planningById.keys()]);
  const allItems = candidateIds
    .map((candidateId) => buildItem(candidateId, planningById.get(candidateId) ?? null, accessById.get(candidateId) ?? null, evaluatedAtMs))
    .filter((item): item is SponsorPlanningAccessPriorityItemV1 => item !== null)
    .sort(itemSort);

  const items = Object.freeze(allItems.slice(0, maximumItems));
  const counts = emptyCounts();
  for (const item of items) counts[item.priorityBand] += 1;

  return freezeDeep({
    version: SPONSOR_PLANNING_ACCESS_PRIORITY_VERSION_V1,
    accessSourceVersion: SPONSOR_ACCESS_BRIEF_VERSION_V1,
    planningSourceVersion: EARLY_PLANNING_WINDOW_V1_VERSION,
    generatedAt,
    status: items.length > 0 ? "READY" as const : "NO_WORK" as const,
    issues: [],
    items,
    omittedItemCount: allItems.length - items.length,
    counts,
    limitations: [...LIMITATIONS],
    authority: { ...AUTHORITY }
  });
}
