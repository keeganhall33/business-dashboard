import type {
  DecisionApprovalClassV1,
  DecisionCandidateV1,
  DecisionEvidenceStateV1,
  DecisionOwnerV1,
  SupportedMonetaryCaseV1,
} from "./decision-portfolio-v1";

export const DECISION_PORTFOLIO_CANDIDATE_READINESS_VERSION_V1 =
  "decision_portfolio_candidate_readiness_v1.0.0" as const;

export type DecisionCandidateValueFieldV1 =
  | "strategicFit"
  | "compoundingAdvantage"
  | "relationshipAccess"
  | "futureOptions"
  | "learningValue"
  | "urgency"
  | "reversibility";

export type DecisionCandidateRiskFieldV1 = "execution" | "reputation" | "rights";
export type DecisionCandidateResourceFieldV1 = "keeganHours" | "ioanaHours" | "jeevesHours" | "cashCents";

export type DecisionCandidateScoringFieldV1 =
  | DecisionCandidateValueFieldV1
  | DecisionCandidateRiskFieldV1
  | DecisionCandidateResourceFieldV1;

export type DecisionCandidateFieldEvidenceV1 = Readonly<{
  truthState: DecisionEvidenceStateV1;
  observedAt: string;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
}>;

export type DecisionCandidateDraftV1 = Readonly<{
  id: string;
  title: string;
  candidateType: DecisionCandidateV1["candidateType"];
  owner: DecisionOwnerV1;
  approvalClass: DecisionApprovalClassV1;
  evidenceState: DecisionEvidenceStateV1;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  monetaryCase: SupportedMonetaryCaseV1 | null;
  monetaryCaseState: "SUPPORTED" | "NOT_ESTABLISHED";
  monetaryCaseEvidence: DecisionCandidateFieldEvidenceV1 | null;
  value: Readonly<Partial<Record<DecisionCandidateValueFieldV1, number | null>>>;
  risk: Readonly<Partial<Record<DecisionCandidateRiskFieldV1, number | null>>>;
  resources: Readonly<Partial<Record<DecisionCandidateResourceFieldV1, number | null>>>;
  fieldEvidence: Readonly<Partial<Record<DecisionCandidateScoringFieldV1, DecisionCandidateFieldEvidenceV1>>>;
  dependencyIds: readonly string[];
  conflictKeys: readonly string[];
  blockers: readonly string[];
  informationGainAction: string | null;
  safeNextStep: string;
  successMetric: string;
  evaluationWindow: Readonly<{ start: string; end: string }>;
}>;

export type DecisionCandidateReadinessStateV1 = "READY" | "NEEDS_EVIDENCE" | "VERIFY_REQUIRED";

export type DecisionCandidateReadinessV1 = Readonly<{
  contractVersion: typeof DECISION_PORTFOLIO_CANDIDATE_READINESS_VERSION_V1;
  evaluatedAt: string;
  candidateId: string;
  state: DecisionCandidateReadinessStateV1;
  candidate: DecisionCandidateV1 | null;
  missingFields: readonly string[];
  verificationReasons: readonly string[];
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  monetaryCaseState: "SUPPORTED" | "NOT_ESTABLISHED";
  authority: Readonly<{
    persistPortfolio: false;
    selectWork: false;
    execute: false;
    externalAction: false;
    spend: false;
    changePrice: false;
    publish: false;
    outreach: false;
    approvalBypass: false;
  }>;
}>;

export class DecisionCandidateReadinessError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "DecisionCandidateReadinessError";
  }
}

const VALUE_FIELDS: readonly DecisionCandidateValueFieldV1[] = [
  "strategicFit",
  "compoundingAdvantage",
  "relationshipAccess",
  "futureOptions",
  "learningValue",
  "urgency",
  "reversibility",
];
const RISK_FIELDS: readonly DecisionCandidateRiskFieldV1[] = ["execution", "reputation", "rights"];
const RESOURCE_FIELDS: readonly DecisionCandidateResourceFieldV1[] = ["keeganHours", "ioanaHours", "jeevesHours", "cashCents"];
const ALL_FIELDS: readonly DecisionCandidateScoringFieldV1[] = [...VALUE_FIELDS, ...RISK_FIELDS, ...RESOURCE_FIELDS];
const MAX_REFS = 100;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000;

const AUTHORITY = Object.freeze({
  persistPortfolio: false,
  selectWork: false,
  execute: false,
  externalAction: false,
  spend: false,
  changePrice: false,
  publish: false,
  outreach: false,
  approvalBypass: false,
} as const);

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new DecisionCandidateReadinessError("REQUIRED_TEXT", `${label} is required`);
  }
  return value.trim();
}

function timestamp(value: unknown, label: string): string {
  const normalized = text(value, label);
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) {
    throw new DecisionCandidateReadinessError("INVALID_TIMESTAMP", `${label} must be a valid timestamp`);
  }
  return new Date(parsed).toISOString();
}

function freshness(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > MAX_AGE_MS) {
    throw new DecisionCandidateReadinessError(
      "INVALID_FRESHNESS_POLICY",
      "maxAgeMs must be finite, non-negative, and no greater than 30 days",
    );
  }
  return value;
}

function refs(values: readonly string[], label: string, allowEmpty = false): string[] {
  if (!Array.isArray(values) || values.length > MAX_REFS || (!allowEmpty && values.length === 0)) {
    throw new DecisionCandidateReadinessError("INVALID_REFS", `${label} must be a bounded reference list`);
  }
  const normalized = values.map((value) => text(value, label));
  return [...new Set(normalized)].sort((a, b) => a.localeCompare(b));
}

function finite(value: unknown, label: string, minimum: number, maximum: number, integer = false): number | null {
  if (value == null) return null;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum ||
    (integer && !Number.isInteger(value))
  ) {
    throw new DecisionCandidateReadinessError(
      "INVALID_NUMBER",
      `${label} must be ${integer ? "an integer " : ""}between ${minimum} and ${maximum}`,
    );
  }
  return value;
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  }
  return value;
}

function evidenceStateReason(prefix: string, state: DecisionEvidenceStateV1): string | null {
  if (state === "KNOWN") return null;
  if (state === "INFERRED") return `${prefix}_INFERRED`;
  if (state === "UNKNOWN") return `${prefix}_UNKNOWN`;
  if (state === "STALE") return `${prefix}_STALE`;
  return `${prefix}_CONFLICTED`;
}

function validateFieldEvidence(
  field: string,
  evidence: DecisionCandidateFieldEvidenceV1 | undefined | null,
  evaluatedAtMs: number,
  maxAgeMs: number,
  missingFields: string[],
  verificationReasons: string[],
  acceptedEvidenceRefs: string[],
  acceptedSourceRefs: string[],
): void {
  if (!evidence) {
    missingFields.push(`${field}.evidence`);
    return;
  }
  const observedAt = timestamp(evidence.observedAt, `${field}.observedAt`);
  const observedAtMs = Date.parse(observedAt);
  const evidenceRefs = refs(evidence.evidenceRefs, `${field}.evidenceRefs`);
  const sourceRefs = refs(evidence.sourceRefs, `${field}.sourceRefs`);
  const stateReason = evidenceStateReason(field, evidence.truthState);
  if (stateReason) verificationReasons.push(stateReason);
  if (observedAtMs > evaluatedAtMs) verificationReasons.push(`${field}_FROM_FUTURE`);
  if (evaluatedAtMs - observedAtMs > maxAgeMs) verificationReasons.push(`${field}_OUTSIDE_FRESHNESS_BOUND`);
  acceptedEvidenceRefs.push(...evidenceRefs);
  acceptedSourceRefs.push(...sourceRefs);
}

function normalizeMoney(value: SupportedMonetaryCaseV1): SupportedMonetaryCaseV1 {
  const downsideCents = finite(value.downsideCents, "monetaryCase.downsideCents", -100_000_000_000, 100_000_000_000, true)!;
  const baseCents = finite(value.baseCents, "monetaryCase.baseCents", -100_000_000_000, 100_000_000_000, true)!;
  const upsideCents = finite(value.upsideCents, "monetaryCase.upsideCents", -100_000_000_000, 100_000_000_000, true)!;
  if (!(downsideCents <= baseCents && baseCents <= upsideCents)) {
    throw new DecisionCandidateReadinessError("INVALID_RANGE", "monetaryCase revenue range is unordered");
  }
  const probabilityLow = finite(value.probabilityLow, "monetaryCase.probabilityLow", 0, 1)!;
  const probabilityBase = finite(value.probabilityBase, "monetaryCase.probabilityBase", 0, 1)!;
  const probabilityHigh = finite(value.probabilityHigh, "monetaryCase.probabilityHigh", 0, 1)!;
  if (!(probabilityLow <= probabilityBase && probabilityBase <= probabilityHigh)) {
    throw new DecisionCandidateReadinessError("INVALID_RANGE", "monetaryCase probability range is unordered");
  }
  if (!new Set(["OBSERVED", "REFERENCE_CLASS", "EXPERT_ESTIMATE"]).has(value.calibrationClass)) {
    throw new DecisionCandidateReadinessError("INVALID_MONETARY_CASE", "monetaryCase requires a supported calibration class");
  }
  return {
    currency: "USD",
    downsideCents,
    baseCents,
    upsideCents,
    probabilityLow,
    probabilityBase,
    probabilityHigh,
    calibrationClass: value.calibrationClass,
  };
}

/**
 * Fail-closed bridge into DecisionCandidateV1.
 *
 * The canonical portfolio scorer requires numeric value/risk/resource dimensions. This gate
 * refuses to manufacture those numbers. A candidate is emitted only when every required
 * dimension has an explicit value plus fresh KNOWN evidence. Missing or non-decision-grade
 * evidence stays visible as readiness work instead of entering allocation as fake precision.
 */
export function assessDecisionPortfolioCandidateReadinessV1(input: Readonly<{
  draft: DecisionCandidateDraftV1;
  evaluatedAt: string;
  maxAgeMs: number;
}>): DecisionCandidateReadinessV1 {
  const evaluatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(evaluatedAt);
  const maxAgeMs = freshness(input.maxAgeMs);
  const draft = input.draft;
  const candidateId = text(draft.id, "draft.id");
  text(draft.title, "draft.title");
  text(draft.safeNextStep, "draft.safeNextStep");
  text(draft.successMetric, "draft.successMetric");
  const start = timestamp(draft.evaluationWindow.start, "draft.evaluationWindow.start");
  const end = timestamp(draft.evaluationWindow.end, "draft.evaluationWindow.end");
  if (Date.parse(end) < Date.parse(start)) {
    throw new DecisionCandidateReadinessError("INVALID_RANGE", "evaluationWindow is unordered");
  }

  const candidateEvidenceRefs = refs(draft.evidenceRefs, "draft.evidenceRefs");
  const candidateSourceRefs = refs(draft.sourceRefs, "draft.sourceRefs");
  const acceptedEvidenceRefs = [...candidateEvidenceRefs];
  const acceptedSourceRefs = [...candidateSourceRefs];
  const missingFields: string[] = [];
  const verificationReasons: string[] = [];

  const candidateStateReason = evidenceStateReason("CANDIDATE", draft.evidenceState);
  if (candidateStateReason) verificationReasons.push(candidateStateReason);

  const values: Record<DecisionCandidateValueFieldV1, number> = {} as Record<DecisionCandidateValueFieldV1, number>;
  const risks: Record<DecisionCandidateRiskFieldV1, number> = {} as Record<DecisionCandidateRiskFieldV1, number>;
  const resources: Record<DecisionCandidateResourceFieldV1, number> = {} as Record<DecisionCandidateResourceFieldV1, number>;

  for (const field of ALL_FIELDS) {
    const isValue = VALUE_FIELDS.includes(field as DecisionCandidateValueFieldV1);
    const isRisk = RISK_FIELDS.includes(field as DecisionCandidateRiskFieldV1);
    const raw = isValue
      ? draft.value[field as DecisionCandidateValueFieldV1]
      : isRisk
        ? draft.risk[field as DecisionCandidateRiskFieldV1]
        : draft.resources[field as DecisionCandidateResourceFieldV1];
    const maximum = field === "cashCents" ? 100_000_000_000 : field.endsWith("Hours") ? 100_000 : 100;
    const normalized = finite(raw, `draft.${field}`, 0, maximum, field === "cashCents");
    if (normalized == null) missingFields.push(field);
    validateFieldEvidence(
      field,
      draft.fieldEvidence[field],
      evaluatedAtMs,
      maxAgeMs,
      missingFields,
      verificationReasons,
      acceptedEvidenceRefs,
      acceptedSourceRefs,
    );
    if (normalized != null) {
      if (isValue) values[field as DecisionCandidateValueFieldV1] = normalized;
      else if (isRisk) risks[field as DecisionCandidateRiskFieldV1] = normalized;
      else resources[field as DecisionCandidateResourceFieldV1] = normalized;
    }
  }

  let monetaryCase: SupportedMonetaryCaseV1 | null = null;
  if (draft.monetaryCaseState === "SUPPORTED") {
    if (!draft.monetaryCase) missingFields.push("monetaryCase");
    else monetaryCase = normalizeMoney(draft.monetaryCase);
    validateFieldEvidence(
      "monetaryCase",
      draft.monetaryCaseEvidence,
      evaluatedAtMs,
      maxAgeMs,
      missingFields,
      verificationReasons,
      acceptedEvidenceRefs,
      acceptedSourceRefs,
    );
  } else if (draft.monetaryCaseState === "NOT_ESTABLISHED") {
    if (draft.monetaryCase !== null || draft.monetaryCaseEvidence !== null) {
      verificationReasons.push("MONETARY_CASE_PRESENT_WHILE_NOT_ESTABLISHED");
    }
  } else {
    throw new DecisionCandidateReadinessError("INVALID_MONETARY_CASE", "monetaryCaseState is invalid");
  }

  const uniqueMissing = [...new Set(missingFields)].sort((a, b) => a.localeCompare(b));
  const uniqueVerification = [...new Set(verificationReasons)].sort((a, b) => a.localeCompare(b));
  const evidenceRefs = [...new Set(acceptedEvidenceRefs)].sort((a, b) => a.localeCompare(b));
  const sourceRefs = [...new Set(acceptedSourceRefs)].sort((a, b) => a.localeCompare(b));
  const state: DecisionCandidateReadinessStateV1 =
    uniqueVerification.length > 0 ? "VERIFY_REQUIRED" : uniqueMissing.length > 0 ? "NEEDS_EVIDENCE" : "READY";

  let candidate: DecisionCandidateV1 | null = null;
  if (state === "READY") {
    candidate = {
      id: candidateId,
      title: text(draft.title, "draft.title"),
      candidateType: draft.candidateType,
      owner: draft.owner,
      approvalClass: draft.approvalClass,
      evidenceState: "KNOWN",
      evidenceRefs,
      sourceRefs,
      monetaryCase,
      value: {
        strategicFit: values.strategicFit,
        compoundingAdvantage: values.compoundingAdvantage,
        relationshipAccess: values.relationshipAccess,
        futureOptions: values.futureOptions,
        learningValue: values.learningValue,
        urgency: values.urgency,
        reversibility: values.reversibility,
      },
      risk: {
        execution: risks.execution,
        reputation: risks.reputation,
        rights: risks.rights,
      },
      resources: {
        keeganHours: resources.keeganHours,
        ioanaHours: resources.ioanaHours,
        jeevesHours: resources.jeevesHours,
        cashCents: resources.cashCents,
      },
      dependencyIds: [...draft.dependencyIds],
      conflictKeys: [...draft.conflictKeys],
      blockers: [...draft.blockers],
      informationGainAction: draft.informationGainAction,
      safeNextStep: draft.safeNextStep,
      successMetric: draft.successMetric,
      evaluationWindow: { start, end },
    };
  }

  return freeze({
    contractVersion: DECISION_PORTFOLIO_CANDIDATE_READINESS_VERSION_V1,
    evaluatedAt,
    candidateId,
    state,
    candidate,
    missingFields: uniqueMissing,
    verificationReasons: uniqueVerification,
    evidenceRefs,
    sourceRefs,
    monetaryCaseState: draft.monetaryCaseState,
    authority: AUTHORITY,
  });
}
