import {
  OPPORTUNITY_IMPORT_HANDOFF_VERSION,
  compileOpportunityImportHandoffV1,
  type OpportunityHandoffTruthStateV1,
  type OpportunityImportHandoffResultV1
} from "./opportunity-import-handoff-v1";

export const OPPORTUNITY_EVIDENCE_QUALIFICATION_VERSION = "OPPORTUNITY_EVIDENCE_QUALIFICATION_V1" as const;

export type OpportunityQualificationSupportV1 = "SUPPORTED" | "NOT_SUPPORTED" | "UNKNOWN";

export type OpportunityQualificationEvidenceV1 = {
  state: OpportunityHandoffTruthStateV1;
  support: OpportunityQualificationSupportV1;
  observedAt: string | Date;
  evidenceRefs: readonly string[];
};

export type OpportunityQualificationEvidencePackV1 = {
  opportunityNeed: OpportunityQualificationEvidenceV1;
  keeganSpecificFit: OpportunityQualificationEvidenceV1;
  actionablePath: OpportunityQualificationEvidenceV1;
};

export type OpportunityEvidenceQualificationStatusV1 =
  | "ALREADY_QUALIFIED"
  | "WATCH_ONLY"
  | "NOT_SUPPORTED"
  | "NEEDS_RESEARCH"
  | "NEEDS_VERIFICATION"
  | "QUALIFIED";

export type OpportunityEvidenceQualificationInputV1 = {
  handoff: OpportunityImportHandoffResultV1;
  evidence: OpportunityQualificationEvidencePackV1;
  now: string | Date;
  maximumEvidenceAgeDays?: number;
};

export type OpportunityEvidenceQualificationResultV1 = Readonly<{
  version: typeof OPPORTUNITY_EVIDENCE_QUALIFICATION_VERSION;
  originalHandoffId: string;
  status: OpportunityEvidenceQualificationStatusV1;
  reasonCodes: readonly string[];
  evidenceRefs: readonly string[];
  evidenceStates: Readonly<{
    opportunityNeed: OpportunityHandoffTruthStateV1;
    keeganSpecificFit: OpportunityHandoffTruthStateV1;
    actionablePath: OpportunityHandoffTruthStateV1;
  }>;
  qualifiedHandoff: OpportunityImportHandoffResultV1;
  externalResearchPerformed: false;
  crmMutationPerformed: false;
  externalActionPerformed: false;
  writeAuthorityGranted: false;
}>;

const DAY_MS = 86_400_000;
const DEFAULT_MAXIMUM_EVIDENCE_AGE_DAYS = 30;
const TRUTH_STATES = new Set<OpportunityHandoffTruthStateV1>([
  "KNOWN",
  "INFERRED",
  "UNKNOWN",
  "STALE",
  "CONFLICTED",
  "PARTIAL"
]);
const SUPPORT_STATES = new Set<OpportunityQualificationSupportV1>(["SUPPORTED", "NOT_SUPPORTED", "UNKNOWN"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function asDate(value: unknown, label: string): Date {
  if (!(typeof value === "string" || value instanceof Date)) throw new Error(`${label} must be a timestamp`);
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return parsed;
}

function evidenceRefs(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const refs = [...new Set(value.map((item, index) => requiredText(item, `${label}[${index}]`)))].sort((a, b) =>
    a.localeCompare(b)
  );
  if (refs.length === 0) throw new Error(`${label} must not be empty`);
  return Object.freeze(refs);
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number, label: string): number {
  const candidate = value == null ? fallback : value;
  if (typeof candidate !== "number" || !Number.isInteger(candidate) || candidate < min || candidate > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}`);
  }
  return candidate;
}

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b)));
}

type NormalizedEvidence = Readonly<{
  state: OpportunityHandoffTruthStateV1;
  support: OpportunityQualificationSupportV1;
  observedAt: string;
  observedAtMs: number;
  evidenceRefs: readonly string[];
}>;

function normalizeEvidence(
  value: OpportunityQualificationEvidenceV1,
  label: string,
  now: Date
): NormalizedEvidence {
  if (!isPlainObject(value)) throw new Error(`${label} must be a plain object`);
  if (!TRUTH_STATES.has(value.state)) throw new Error(`${label}.state is unsupported`);
  if (!SUPPORT_STATES.has(value.support)) throw new Error(`${label}.support is unsupported`);
  const observedAt = asDate(value.observedAt, `${label}.observedAt`);
  if (observedAt.getTime() > now.getTime()) throw new Error(`${label}.observedAt must not be future-dated`);
  return freezeDeep({
    state: value.state,
    support: value.support,
    observedAt: observedAt.toISOString(),
    observedAtMs: observedAt.getTime(),
    evidenceRefs: [...evidenceRefs(value.evidenceRefs, `${label}.evidenceRefs`)]
  });
}

function validateHandoff(handoff: OpportunityImportHandoffResultV1): void {
  if (!isPlainObject(handoff)) throw new Error("handoff must be a plain object");
  if (handoff.version !== OPPORTUNITY_IMPORT_HANDOFF_VERSION) throw new Error("handoff version is unsupported");
  requiredText(handoff.handoffId, "handoff.handoffId");
  requiredText(handoff.idempotencyKey, "handoff.idempotencyKey");
  if (!isPlainObject(handoff.payload)) throw new Error("handoff.payload must be a plain object");
  if (
    handoff.crmMutationPerformed !== false ||
    handoff.externalActionPerformed !== false ||
    handoff.writeAuthorityGranted !== false
  ) {
    throw new Error("handoff violates the non-mutating intake boundary");
  }
}

function evidenceIssueReasons(
  label: string,
  evidence: NormalizedEvidence,
  now: Date,
  maximumEvidenceAgeDays: number
): string[] {
  const reasons: string[] = [];
  const ageDays = (now.getTime() - evidence.observedAtMs) / DAY_MS;
  if (ageDays > maximumEvidenceAgeDays || evidence.state === "STALE") reasons.push(`${label}_EVIDENCE_STALE`);
  if (evidence.state === "CONFLICTED") reasons.push(`${label}_EVIDENCE_CONFLICTED`);
  if (evidence.state === "UNKNOWN") reasons.push(`${label}_EVIDENCE_UNKNOWN`);
  if (evidence.state === "INFERRED") reasons.push(`${label}_EVIDENCE_INFERRED`);
  if (evidence.state === "PARTIAL") reasons.push(`${label}_EVIDENCE_PARTIAL`);
  if (evidence.support === "UNKNOWN") reasons.push(`${label}_SUPPORT_UNKNOWN`);
  return reasons;
}

export function qualifyOpportunityHandoffEvidenceV1(
  input: OpportunityEvidenceQualificationInputV1
): OpportunityEvidenceQualificationResultV1 {
  if (!isPlainObject(input)) throw new Error("input must be a plain object");
  validateHandoff(input.handoff);
  if (!isPlainObject(input.evidence)) throw new Error("evidence must be a plain object");

  const now = asDate(input.now, "now");
  const maximumEvidenceAgeDays = boundedInteger(
    input.maximumEvidenceAgeDays,
    DEFAULT_MAXIMUM_EVIDENCE_AGE_DAYS,
    1,
    3650,
    "maximumEvidenceAgeDays"
  );
  const normalized = {
    opportunityNeed: normalizeEvidence(input.evidence.opportunityNeed, "opportunityNeed", now),
    keeganSpecificFit: normalizeEvidence(input.evidence.keeganSpecificFit, "keeganSpecificFit", now),
    actionablePath: normalizeEvidence(input.evidence.actionablePath, "actionablePath", now)
  } as const;

  const dimensions = [
    ["OPPORTUNITY_NEED", normalized.opportunityNeed],
    ["KEEGAN_SPECIFIC_FIT", normalized.keeganSpecificFit],
    ["ACTIONABLE_PATH", normalized.actionablePath]
  ] as const;
  const issueReasons = dimensions.flatMap(([label, evidence]) =>
    evidenceIssueReasons(label, evidence, now, maximumEvidenceAgeDays)
  );
  const researchEvidenceRefs = dimensions.flatMap(([, evidence]) => evidence.evidenceRefs);
  const allEvidenceRefs = uniqueSorted([...input.handoff.payload.evidenceRefs, ...researchEvidenceRefs]);
  const knownCurrent = (evidence: NormalizedEvidence) =>
    evidence.state === "KNOWN" && (now.getTime() - evidence.observedAtMs) / DAY_MS <= maximumEvidenceAgeDays;
  const knownCurrentNotSupported = dimensions.filter(([, evidence]) =>
    knownCurrent(evidence) && evidence.support === "NOT_SUPPORTED"
  );

  let status: OpportunityEvidenceQualificationStatusV1;
  let qualifiedHandoff = input.handoff;
  const reasonCodes: string[] = [...issueReasons];

  if (input.handoff.payload.qualification === "WATCH") {
    status = "WATCH_ONLY";
    reasonCodes.push("SOURCE_REMAINS_WATCH_ONLY");
  } else if (knownCurrentNotSupported.length > 0) {
    if (input.handoff.payload.qualification === "QUALIFIED") {
      status = "NEEDS_VERIFICATION";
      reasonCodes.push("RESEARCH_CONTRADICTS_EXISTING_QUALIFICATION");
    } else {
      status = "NOT_SUPPORTED";
      for (const [label] of knownCurrentNotSupported) reasonCodes.push(`${label}_NOT_SUPPORTED`);
    }
  } else if (issueReasons.length > 0) {
    const hasUnknown = issueReasons.some((reason) => reason.endsWith("_UNKNOWN"));
    status = hasUnknown ? "NEEDS_RESEARCH" : "NEEDS_VERIFICATION";
    reasonCodes.push(hasUnknown ? "QUALIFICATION_EVIDENCE_INCOMPLETE" : "QUALIFICATION_EVIDENCE_REQUIRES_VERIFICATION");
  } else if (dimensions.some(([, evidence]) => evidence.support !== "SUPPORTED")) {
    status = "NEEDS_RESEARCH";
    reasonCodes.push("ALL_REQUIRED_QUALIFICATION_DIMENSIONS_MUST_BE_SUPPORTED");
  } else if (input.handoff.payload.qualification === "QUALIFIED") {
    status = "ALREADY_QUALIFIED";
    reasonCodes.push("SOURCE_ALREADY_QUALIFIED");
  } else {
    qualifiedHandoff = compileOpportunityImportHandoffV1({
      source: input.handoff.source,
      sourceInteractionRef: input.handoff.sourceInteractionRef,
      candidate: {
        sourceCandidateKey: input.handoff.payload.sourceCandidateKey,
        title: input.handoff.payload.title,
        qualification: "QUALIFIED",
        truthState: input.handoff.payload.truthState,
        evidenceRefs: [...allEvidenceRefs],
        personRefs: [...input.handoff.payload.personRefs],
        organizationRefs: [...input.handoff.payload.organizationRefs],
        existingOpportunityRef: input.handoff.payload.existingOpportunityRef,
        summary: input.handoff.payload.summary,
        whyNow: input.handoff.payload.whyNow,
        recommendedNextAction: input.handoff.payload.recommendedNextAction,
        planningWindow: input.handoff.payload.planningWindow
      }
    });

    if (
      qualifiedHandoff.disposition === "READY_FOR_CANONICAL_UPSERT" ||
      qualifiedHandoff.disposition === "LINK_TO_EXISTING"
    ) {
      status = "QUALIFIED";
      reasonCodes.push("EVIDENCE_GATES_MET");
    } else {
      status = "NEEDS_VERIFICATION";
      reasonCodes.push("EVIDENCE_GATES_MET_BUT_CANONICAL_HANDOFF_REMAINS_BLOCKED");
      reasonCodes.push(...qualifiedHandoff.reasonCodes);
    }
  }

  return freezeDeep({
    version: OPPORTUNITY_EVIDENCE_QUALIFICATION_VERSION,
    originalHandoffId: input.handoff.handoffId,
    status,
    reasonCodes: [...uniqueSorted(reasonCodes)],
    evidenceRefs: [...allEvidenceRefs],
    evidenceStates: {
      opportunityNeed: normalized.opportunityNeed.state,
      keeganSpecificFit: normalized.keeganSpecificFit.state,
      actionablePath: normalized.actionablePath.state
    },
    qualifiedHandoff,
    externalResearchPerformed: false as const,
    crmMutationPerformed: false as const,
    externalActionPerformed: false as const,
    writeAuthorityGranted: false as const
  });
}
