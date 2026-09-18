import {
  evaluateEarlyPlanningWindowsV1,
  type EarlyPlanningDateRangeEvidenceV1,
  type EarlyPlanningDecisionV1,
  type EarlyPlanningLeadTimeEvidenceV1,
  type EarlyPlanningTruthStateV1
} from "./early-planning-window-v1";

export const EVIDENCE_BACKED_PLANNING_RADAR_V1_VERSION = "EVIDENCE_BACKED_PLANNING_RADAR_V1" as const;

export type PlanningEvidenceSourceClassV1 =
  | "AUTHORIZED_FIRST_PARTY"
  | "OFFICIAL_ORGANIZATION_SOURCE"
  | "PUBLIC_PRIMARY_SOURCE";

export type PlanningEvidenceKindV1 = "PLANNING_WINDOW" | "ACTIVATION_WINDOW" | "ENGAGEMENT_LEAD_TIME";

type PlanningEvidenceBaseV1 = {
  evidenceId: string;
  sourceClass: PlanningEvidenceSourceClassV1;
  canonicalOrganizationRef: string | null;
  canonicalOpportunityRef: string | null;
  observedAt: string | Date;
  state: EarlyPlanningTruthStateV1;
  evidenceRefs: readonly string[];
};

export type PlanningDateEvidenceRecordV1 = PlanningEvidenceBaseV1 & {
  kind: "PLANNING_WINDOW" | "ACTIVATION_WINDOW";
  startDate: string | null;
  endDate: string | null;
};

export type PlanningLeadTimeEvidenceRecordV1 = PlanningEvidenceBaseV1 & {
  kind: "ENGAGEMENT_LEAD_TIME";
  minDays: number | null;
  maxDays: number | null;
};

export type PlanningEvidenceRecordV1 = PlanningDateEvidenceRecordV1 | PlanningLeadTimeEvidenceRecordV1;

export type EvidenceBackedPlanningRadarInputV1 = {
  candidateId: string;
  canonicalOrganizationRef: string | null;
  canonicalOpportunityRef: string | null;
  evidence: readonly PlanningEvidenceRecordV1[];
  evaluatedAt: string | Date;
  maximumEvidenceAgeDays: number;
};

export type EvidenceBackedPlanningRadarIssueV1 =
  | "MISSING_CANONICAL_ANCHOR"
  | "NO_TIMING_EVIDENCE"
  | "EVIDENCE_ID_DUPLICATED"
  | "EVIDENCE_LINKAGE_MISMATCH"
  | "EVIDENCE_OBSERVED_IN_FUTURE"
  | "EVIDENCE_SOURCE_NOT_ALLOWED"
  | "EVIDENCE_PAYLOAD_INVALID"
  | "CONFLICTING_PLANNING_WINDOW_EVIDENCE"
  | "CONFLICTING_ACTIVATION_WINDOW_EVIDENCE"
  | "CONFLICTING_ENGAGEMENT_LEAD_TIME_EVIDENCE"
  | "DIRECT_AND_DERIVED_PLANNING_WINDOWS_CONFLICT";

export type EvidenceBackedPlanningRadarResultV1 = Readonly<{
  version: typeof EVIDENCE_BACKED_PLANNING_RADAR_V1_VERSION;
  generatedAt: string;
  status: "READY" | "BLOCKED";
  candidateId: string;
  canonicalOrganizationRef: string | null;
  canonicalOpportunityRef: string | null;
  issues: readonly EvidenceBackedPlanningRadarIssueV1[];
  decision: EarlyPlanningDecisionV1 | null;
  evidenceRefs: readonly string[];
  evidenceRecordIds: readonly string[];
  confidence: "NOT_ESTABLISHED";
  opportunityLikelihood: "NOT_ESTABLISHED";
  monetaryValue: null;
  relationshipInferenceAuthorized: false;
  sponsorshipInferenceAuthorized: false;
  decisionAuthorityInferenceAuthorized: false;
  warmAccessInferenceAuthorized: false;
  privateContactDiscoveryAuthorized: false;
  outreachAuthorized: false;
  crmMutationAuthorized: false;
  externalActionAuthorized: false;
}>;

const DAY_MS = 86_400_000;
const MAX_EVIDENCE_RECORDS = 100;
const TRUTH_STATES = new Set<EarlyPlanningTruthStateV1>([
  "KNOWN",
  "INFERRED",
  "UNKNOWN",
  "STALE",
  "CONFLICTED",
  "PARTIAL"
]);
const SOURCE_CLASSES = new Set<PlanningEvidenceSourceClassV1>([
  "AUTHORIZED_FIRST_PARTY",
  "OFFICIAL_ORGANIZATION_SOURCE",
  "PUBLIC_PRIMARY_SOURCE"
]);
const ALLOWED_SOURCE_CLASSES: Readonly<Record<PlanningEvidenceKindV1, ReadonlySet<PlanningEvidenceSourceClassV1>>> = {
  PLANNING_WINDOW: new Set<PlanningEvidenceSourceClassV1>(["AUTHORIZED_FIRST_PARTY", "OFFICIAL_ORGANIZATION_SOURCE"]),
  ACTIVATION_WINDOW: new Set<PlanningEvidenceSourceClassV1>([
    "AUTHORIZED_FIRST_PARTY",
    "OFFICIAL_ORGANIZATION_SOURCE",
    "PUBLIC_PRIMARY_SOURCE"
  ]),
  ENGAGEMENT_LEAD_TIME: new Set<PlanningEvidenceSourceClassV1>([
    "AUTHORIZED_FIRST_PARTY",
    "OFFICIAL_ORGANIZATION_SOURCE"
  ])
};

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function optionalText(value: unknown, label: string): string | null {
  if (value == null) return null;
  return requiredText(value, label);
}

function timestamp(value: string | Date, label: string): string {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return date.toISOString();
}

function refs(value: readonly string[], label: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return Object.freeze([...new Set(value.map((item, index) => requiredText(item, `${label}[${index}]`)))].sort((a, b) => a.localeCompare(b)));
}

function truthState(value: unknown, label: string): EarlyPlanningTruthStateV1 {
  if (typeof value !== "string" || !TRUTH_STATES.has(value as EarlyPlanningTruthStateV1)) throw new Error(`${label} is unsupported`);
  return value as EarlyPlanningTruthStateV1;
}

function sourceClass(value: unknown, label: string): PlanningEvidenceSourceClassV1 {
  if (typeof value !== "string" || !SOURCE_CLASSES.has(value as PlanningEvidenceSourceClassV1)) throw new Error(`${label} is unsupported`);
  return value as PlanningEvidenceSourceClassV1;
}

function maximumAge(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 3650) {
    throw new Error("maximumEvidenceAgeDays must be an explicit integer between 1 and 3650");
  }
  return value;
}

function issueForConflict(kind: PlanningEvidenceKindV1): EvidenceBackedPlanningRadarIssueV1 {
  if (kind === "PLANNING_WINDOW") return "CONFLICTING_PLANNING_WINDOW_EVIDENCE";
  if (kind === "ACTIVATION_WINDOW") return "CONFLICTING_ACTIVATION_WINDOW_EVIDENCE";
  return "CONFLICTING_ENGAGEMENT_LEAD_TIME_EVIDENCE";
}

type NormalizedDateEvidence = {
  kind: "PLANNING_WINDOW" | "ACTIVATION_WINDOW";
  evidenceId: string;
  sourceClass: PlanningEvidenceSourceClassV1;
  canonicalOrganizationRef: string | null;
  canonicalOpportunityRef: string | null;
  observedAt: string;
  state: EarlyPlanningTruthStateV1;
  evidenceRefs: readonly string[];
  startDate: string | null;
  endDate: string | null;
};

type NormalizedLeadEvidence = {
  kind: "ENGAGEMENT_LEAD_TIME";
  evidenceId: string;
  sourceClass: PlanningEvidenceSourceClassV1;
  canonicalOrganizationRef: string | null;
  canonicalOpportunityRef: string | null;
  observedAt: string;
  state: EarlyPlanningTruthStateV1;
  evidenceRefs: readonly string[];
  minDays: number | null;
  maxDays: number | null;
};

type NormalizedEvidence = NormalizedDateEvidence | NormalizedLeadEvidence;

function normalizeRecord(record: PlanningEvidenceRecordV1, index: number): NormalizedEvidence {
  if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error(`evidence ${index} must be an object`);
  const evidenceId = requiredText(record.evidenceId, `evidence ${index}.evidenceId`);
  const organizationRef = optionalText(record.canonicalOrganizationRef, `evidence ${index}.canonicalOrganizationRef`);
  const opportunityRef = optionalText(record.canonicalOpportunityRef, `evidence ${index}.canonicalOpportunityRef`);
  const observedAt = timestamp(record.observedAt, `evidence ${index}.observedAt`);
  const state = truthState(record.state, `evidence ${index}.state`);
  const normalizedSourceClass = sourceClass(record.sourceClass, `evidence ${index}.sourceClass`);
  const evidenceRefs = refs(record.evidenceRefs, `evidence ${index}.evidenceRefs`);

  if (record.kind === "PLANNING_WINDOW" || record.kind === "ACTIVATION_WINDOW") {
    const hasStart = record.startDate != null;
    const hasEnd = record.endDate != null;
    if (hasStart !== hasEnd) throw new Error(`evidence ${index} must provide both startDate and endDate or neither`);
    if (state === "KNOWN" && !hasStart) throw new Error(`evidence ${index} KNOWN state requires a complete date range`);
    const startDate = hasStart ? timestamp(record.startDate as string, `evidence ${index}.startDate`) : null;
    const endDate = hasEnd ? timestamp(record.endDate as string, `evidence ${index}.endDate`) : null;
    if (startDate && endDate && Date.parse(startDate) > Date.parse(endDate)) {
      throw new Error(`evidence ${index}.startDate must be on or before endDate`);
    }
    return {
      kind: record.kind,
      evidenceId,
      sourceClass: normalizedSourceClass,
      canonicalOrganizationRef: organizationRef,
      canonicalOpportunityRef: opportunityRef,
      observedAt,
      state,
      evidenceRefs,
      startDate,
      endDate
    };
  }

  if (record.kind !== "ENGAGEMENT_LEAD_TIME") throw new Error(`evidence ${index}.kind is unsupported`);
  const hasMin = record.minDays != null;
  const hasMax = record.maxDays != null;
  if (hasMin !== hasMax) throw new Error(`evidence ${index} must provide both minDays and maxDays or neither`);
  if (state === "KNOWN" && !hasMin) throw new Error(`evidence ${index} KNOWN state requires a complete lead-time range`);
  const minDays = hasMin ? record.minDays : null;
  const maxDays = hasMax ? record.maxDays : null;
  if (
    minDays != null &&
    maxDays != null &&
    (!Number.isInteger(minDays) || !Number.isInteger(maxDays) || minDays < 0 || maxDays < minDays)
  ) {
    throw new Error(`evidence ${index} must use non-negative integer days with minDays <= maxDays`);
  }
  return {
    kind: "ENGAGEMENT_LEAD_TIME",
    evidenceId,
    sourceClass: normalizedSourceClass,
    canonicalOrganizationRef: organizationRef,
    canonicalOpportunityRef: opportunityRef,
    observedAt,
    state,
    evidenceRefs,
    minDays,
    maxDays
  };
}

function contentKey(record: NormalizedEvidence): string {
  if (record.kind === "ENGAGEMENT_LEAD_TIME") return `${record.state}|${record.minDays ?? "null"}|${record.maxDays ?? "null"}`;
  return `${record.state}|${record.startDate ?? "null"}|${record.endDate ?? "null"}`;
}

function mergeEvidence(group: readonly NormalizedEvidence[]): NormalizedEvidence | null {
  if (group.length === 0) return null;
  const first = group[0];
  if (group.some((item) => item.kind !== first.kind || contentKey(item) !== contentKey(first))) return null;
  const observedAt = group.map((item) => item.observedAt).sort((a, b) => a.localeCompare(b))[0];
  const evidenceRefs = refs(
    group.flatMap((item) => [item.evidenceId, ...item.evidenceRefs]),
    `${first.kind}.mergedEvidenceRefs`
  );
  return { ...first, observedAt, evidenceRefs } as NormalizedEvidence;
}

function overlaps(left: EarlyPlanningDateRangeEvidenceV1, right: EarlyPlanningDateRangeEvidenceV1): boolean {
  if (!left.startDate || !left.endDate || !right.startDate || !right.endDate) return true;
  return Date.parse(left.startDate) <= Date.parse(right.endDate) && Date.parse(right.startDate) <= Date.parse(left.endDate);
}

function derivedPlanningWindow(
  activation: EarlyPlanningDateRangeEvidenceV1 | null,
  lead: EarlyPlanningLeadTimeEvidenceV1 | null
): EarlyPlanningDateRangeEvidenceV1 | null {
  if (
    activation?.state !== "KNOWN" ||
    !activation.startDate ||
    lead?.state !== "KNOWN" ||
    lead.minDays == null ||
    lead.maxDays == null
  ) {
    return null;
  }
  const anchor = Date.parse(activation.startDate);
  return {
    state: "KNOWN",
    startDate: new Date(anchor - lead.maxDays * DAY_MS).toISOString(),
    endDate: new Date(anchor - lead.minDays * DAY_MS).toISOString(),
    evidenceRefs: [...activation.evidenceRefs, ...lead.evidenceRefs]
  };
}

function blocked(
  generatedAt: string,
  candidateId: string,
  canonicalOrganizationRef: string | null,
  canonicalOpportunityRef: string | null,
  issues: readonly EvidenceBackedPlanningRadarIssueV1[],
  evidence: readonly NormalizedEvidence[]
): EvidenceBackedPlanningRadarResultV1 {
  return freezeDeep({
    version: EVIDENCE_BACKED_PLANNING_RADAR_V1_VERSION,
    generatedAt,
    status: "BLOCKED" as const,
    candidateId,
    canonicalOrganizationRef,
    canonicalOpportunityRef,
    issues: [...new Set(issues)],
    decision: null,
    evidenceRefs: [...new Set(evidence.flatMap((item) => item.evidenceRefs))].sort((a, b) => a.localeCompare(b)),
    evidenceRecordIds: [...new Set(evidence.map((item) => item.evidenceId))].sort((a, b) => a.localeCompare(b)),
    confidence: "NOT_ESTABLISHED" as const,
    opportunityLikelihood: "NOT_ESTABLISHED" as const,
    monetaryValue: null,
    relationshipInferenceAuthorized: false as const,
    sponsorshipInferenceAuthorized: false as const,
    decisionAuthorityInferenceAuthorized: false as const,
    warmAccessInferenceAuthorized: false as const,
    privateContactDiscoveryAuthorized: false as const,
    outreachAuthorized: false as const,
    crmMutationAuthorized: false as const,
    externalActionAuthorized: false as const
  });
}

export function compileEvidenceBackedPlanningRadarV1(input: EvidenceBackedPlanningRadarInputV1): EvidenceBackedPlanningRadarResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!Array.isArray(input.evidence)) throw new Error("evidence must be an array");
  if (input.evidence.length > MAX_EVIDENCE_RECORDS) throw new Error(`evidence exceeds ${MAX_EVIDENCE_RECORDS}`);

  const candidateId = requiredText(input.candidateId, "candidateId");
  const canonicalOrganizationRef = optionalText(input.canonicalOrganizationRef, "canonicalOrganizationRef");
  const canonicalOpportunityRef = optionalText(input.canonicalOpportunityRef, "canonicalOpportunityRef");
  const generatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const generatedAtMs = Date.parse(generatedAt);
  const maximumEvidenceAgeDays = maximumAge(input.maximumEvidenceAgeDays);
  const evidence = input.evidence.map(normalizeRecord);
  const issues: EvidenceBackedPlanningRadarIssueV1[] = [];

  if (!canonicalOrganizationRef && !canonicalOpportunityRef) issues.push("MISSING_CANONICAL_ANCHOR");
  if (evidence.length === 0) issues.push("NO_TIMING_EVIDENCE");
  if (new Set(evidence.map((item) => item.evidenceId)).size !== evidence.length) issues.push("EVIDENCE_ID_DUPLICATED");

  for (const record of evidence) {
    if (
      record.canonicalOrganizationRef !== canonicalOrganizationRef ||
      record.canonicalOpportunityRef !== canonicalOpportunityRef
    ) {
      issues.push("EVIDENCE_LINKAGE_MISMATCH");
    }
    if (Date.parse(record.observedAt) > generatedAtMs) issues.push("EVIDENCE_OBSERVED_IN_FUTURE");
    if (!ALLOWED_SOURCE_CLASSES[record.kind].has(record.sourceClass)) issues.push("EVIDENCE_SOURCE_NOT_ALLOWED");
  }

  const groups: Readonly<Record<PlanningEvidenceKindV1, readonly NormalizedEvidence[]>> = {
    PLANNING_WINDOW: evidence.filter((item) => item.kind === "PLANNING_WINDOW"),
    ACTIVATION_WINDOW: evidence.filter((item) => item.kind === "ACTIVATION_WINDOW"),
    ENGAGEMENT_LEAD_TIME: evidence.filter((item) => item.kind === "ENGAGEMENT_LEAD_TIME")
  };

  const mergedPlanning = mergeEvidence(groups.PLANNING_WINDOW);
  const mergedActivation = mergeEvidence(groups.ACTIVATION_WINDOW);
  const mergedLead = mergeEvidence(groups.ENGAGEMENT_LEAD_TIME);
  if (groups.PLANNING_WINDOW.length > 0 && !mergedPlanning) issues.push(issueForConflict("PLANNING_WINDOW"));
  if (groups.ACTIVATION_WINDOW.length > 0 && !mergedActivation) issues.push(issueForConflict("ACTIVATION_WINDOW"));
  if (groups.ENGAGEMENT_LEAD_TIME.length > 0 && !mergedLead) issues.push(issueForConflict("ENGAGEMENT_LEAD_TIME"));

  if (issues.length > 0) {
    return blocked(generatedAt, candidateId, canonicalOrganizationRef, canonicalOpportunityRef, issues, evidence);
  }

  const planningWindow: EarlyPlanningDateRangeEvidenceV1 | null =
    mergedPlanning?.kind === "PLANNING_WINDOW"
      ? {
          state: mergedPlanning.state,
          startDate: mergedPlanning.startDate,
          endDate: mergedPlanning.endDate,
          evidenceRefs: mergedPlanning.evidenceRefs
        }
      : null;
  const activationWindow: EarlyPlanningDateRangeEvidenceV1 | null =
    mergedActivation?.kind === "ACTIVATION_WINDOW"
      ? {
          state: mergedActivation.state,
          startDate: mergedActivation.startDate,
          endDate: mergedActivation.endDate,
          evidenceRefs: mergedActivation.evidenceRefs
        }
      : null;
  const engagementLeadTimeDays: EarlyPlanningLeadTimeEvidenceV1 | null =
    mergedLead?.kind === "ENGAGEMENT_LEAD_TIME"
      ? {
          state: mergedLead.state,
          minDays: mergedLead.minDays,
          maxDays: mergedLead.maxDays,
          evidenceRefs: mergedLead.evidenceRefs
        }
      : null;

  const derivedWindow = derivedPlanningWindow(activationWindow, engagementLeadTimeDays);
  if (planningWindow?.state === "KNOWN" && derivedWindow && !overlaps(planningWindow, derivedWindow)) {
    return blocked(
      generatedAt,
      candidateId,
      canonicalOrganizationRef,
      canonicalOpportunityRef,
      ["DIRECT_AND_DERIVED_PLANNING_WINDOWS_CONFLICT"],
      evidence
    );
  }

  const observedAt = evidence.map((item) => item.observedAt).sort((a, b) => a.localeCompare(b))[0];
  const evidenceRefs = [...new Set(evidence.flatMap((item) => [item.evidenceId, ...item.evidenceRefs]))].sort((a, b) => a.localeCompare(b));
  const evaluated = evaluateEarlyPlanningWindowsV1({
    candidates: [
      {
        candidateId,
        canonicalOrganizationRef,
        canonicalOpportunityRef,
        observedAt,
        evidenceRefs,
        planningWindow,
        activationWindow,
        engagementLeadTimeDays
      }
    ],
    now: generatedAt,
    maximumEvidenceAgeDays
  });
  const decision = evaluated.decisions[0] ?? null;

  return freezeDeep({
    version: EVIDENCE_BACKED_PLANNING_RADAR_V1_VERSION,
    generatedAt,
    status: "READY" as const,
    candidateId,
    canonicalOrganizationRef,
    canonicalOpportunityRef,
    issues: [] as EvidenceBackedPlanningRadarIssueV1[],
    decision,
    evidenceRefs,
    evidenceRecordIds: evidence.map((item) => item.evidenceId).sort((a, b) => a.localeCompare(b)),
    confidence: "NOT_ESTABLISHED" as const,
    opportunityLikelihood: "NOT_ESTABLISHED" as const,
    monetaryValue: null,
    relationshipInferenceAuthorized: false as const,
    sponsorshipInferenceAuthorized: false as const,
    decisionAuthorityInferenceAuthorized: false as const,
    warmAccessInferenceAuthorized: false as const,
    privateContactDiscoveryAuthorized: false as const,
    outreachAuthorized: false as const,
    crmMutationAuthorized: false as const,
    externalActionAuthorized: false as const
  });
}
