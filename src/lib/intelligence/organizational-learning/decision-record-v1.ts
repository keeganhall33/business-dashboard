export const DECISION_RECORD_CONTRACT_VERSION_V1 = "DecisionRecordV1" as const;

export const decisionRecordStatesV1 = ["ACTIVE", "DEFERRED", "REJECTED", "SUPERSEDED"] as const;
export const decisionAuthorityClassesV1 = [
  "LOW_RISK_INTERNAL",
  "GOVERNED_APPROVED",
  "HUMAN_APPROVED",
  "REVIEW_REQUIRED",
] as const;
export const decisionActionStatesV1 = ["NOT_TAKEN", "TAKEN", "DEFERRED", "REJECTED"] as const;
export const decisionOutcomeResultsV1 = ["POSITIVE", "NEUTRAL", "NEGATIVE", "INCONCLUSIVE"] as const;
export const decisionAttributionClassesV1 = ["CAUSAL_SUPPORTED", "CORRELATIONAL", "NOT_ESTABLISHED"] as const;

export type DecisionRecordStateV1 = (typeof decisionRecordStatesV1)[number];
export type DecisionAuthorityClassV1 = (typeof decisionAuthorityClassesV1)[number];
export type DecisionActionStateV1 = (typeof decisionActionStatesV1)[number];
export type DecisionOutcomeResultV1 = (typeof decisionOutcomeResultsV1)[number];
export type DecisionAttributionClassV1 = (typeof decisionAttributionClassesV1)[number];

export type DecisionAlternativeV1 = Readonly<{
  alternativeId: string;
  summary: string;
  disposition: "NOT_CHOSEN" | "DEFERRED" | "REJECTED" | "UNKNOWN";
}>;

export type DecisionAuthorityV1 = Readonly<{
  authorityClass: DecisionAuthorityClassV1;
  actorRef: string;
  approvalRef: string | null;
  approvedAt: string | null;
}>;

export type DecisionRevisitTriggerV1 = Readonly<{
  triggerId: string;
  condition: string;
  evidenceRef: string | null;
}>;

export type DecisionExpectedOutcomeV1 = Readonly<{
  statement: string;
  metricRefs: readonly string[];
}>;

export type DecisionActionV1 = Readonly<{
  state: DecisionActionStateV1;
  externalAction: boolean;
  actedAt: string | null;
  evidenceRefs: readonly string[];
}>;

export type DecisionObservedOutcomeV1 = Readonly<{
  observedAt: string;
  summary: string;
  result: DecisionOutcomeResultV1;
  evidenceRefs: readonly string[];
  confounders: readonly string[];
  attributionClass: DecisionAttributionClassV1;
  attributionConfidence: number | null;
  causalDesignRef: string | null;
}>;

export type DecisionSupersessionV1 = Readonly<{
  supersedesDecisionId: string;
  reason: string;
  predecessorEvidenceRef: string;
}>;

export type DecisionRecordV1 = Readonly<{
  contractVersion: typeof DECISION_RECORD_CONTRACT_VERSION_V1;
  decisionId: string;
  version: number;
  state: DecisionRecordStateV1;
  domain: string;
  decision: string;
  context: string;
  evidenceRefs: readonly string[];
  alternatives: readonly DecisionAlternativeV1[];
  rationale: string;
  confidence: number | null;
  authority: DecisionAuthorityV1;
  decidedAt: string;
  validUntil: string | null;
  revisitTriggers: readonly DecisionRevisitTriggerV1[];
  expectedOutcome: DecisionExpectedOutcomeV1 | null;
  successCriteria: readonly string[];
  failureCriteria: readonly string[];
  action: DecisionActionV1;
  observedOutcome: DecisionObservedOutcomeV1 | null;
  supersession: DecisionSupersessionV1 | null;
}>;

export type DecisionRecordIntegrityStatusV1 = "READY" | "REVIEW_REQUIRED" | "BLOCKED";

export type DecisionRecordIntegrityReviewV1 = Readonly<{
  contractVersion: typeof DECISION_RECORD_CONTRACT_VERSION_V1;
  status: DecisionRecordIntegrityStatusV1;
  evaluatedAt: string;
  decisionId: string | null;
  reasonCodes: readonly string[];
  record: DecisionRecordV1 | null;
  limitations: readonly string[];
  causalClaimEstablished: boolean;
  monetaryValue: null;
  authority: Readonly<{
    analysisOnly: true;
    persistenceAllowed: false;
    externalActionAllowed: false;
    approvalBypassAllowed: false;
  }>;
}>;

const MAX_TEXT_BYTES = 20_000;
const MAX_ARRAY_ITEMS = 50;
const MAX_EVIDENCE_REFS = 100;
const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  persistenceAllowed: false as const,
  externalActionAllowed: false as const,
  approvalBypassAllowed: false as const,
});
const LIMITATIONS = Object.freeze([
  "This contract validates a supplied decision record. It does not persist, execute, approve, or promote the decision.",
  "Confidence, outcomes, attribution, causality, and authority are preserved only as explicitly supplied evidence-bounded fields; none are inferred here.",
  "A recorded outcome does not establish causality. CAUSAL_SUPPORTED is accepted only with an explicit causal-design reference and outcome evidence.",
  "No monetary value, budget, revenue impact, or external-action authority is created by this review.",
] as const);

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && Buffer.byteLength(value, "utf8") <= MAX_TEXT_BYTES;
}

function optionalText(value: unknown): value is string | null {
  return value === null || text(value);
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function confidence(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1);
}

function uniqueBoundedStrings(values: unknown, maximum = MAX_ARRAY_ITEMS): string[] | null {
  if (!Array.isArray(values) || values.length > maximum || values.some((value) => !text(value))) return null;
  const normalized = values.map((value) => String(value).trim());
  if (new Set(normalized).size !== normalized.length) return null;
  return normalized.sort((a, b) => a.localeCompare(b));
}

function freezeRecord(record: DecisionRecordV1): DecisionRecordV1 {
  return Object.freeze({
    ...record,
    evidenceRefs: Object.freeze([...record.evidenceRefs]),
    alternatives: Object.freeze(record.alternatives.map((item) => Object.freeze({ ...item }))),
    authority: Object.freeze({ ...record.authority }),
    revisitTriggers: Object.freeze(record.revisitTriggers.map((item) => Object.freeze({ ...item }))),
    expectedOutcome: record.expectedOutcome
      ? Object.freeze({ ...record.expectedOutcome, metricRefs: Object.freeze([...record.expectedOutcome.metricRefs]) })
      : null,
    successCriteria: Object.freeze([...record.successCriteria]),
    failureCriteria: Object.freeze([...record.failureCriteria]),
    action: Object.freeze({ ...record.action, evidenceRefs: Object.freeze([...record.action.evidenceRefs]) }),
    observedOutcome: record.observedOutcome
      ? Object.freeze({
          ...record.observedOutcome,
          evidenceRefs: Object.freeze([...record.observedOutcome.evidenceRefs]),
          confounders: Object.freeze([...record.observedOutcome.confounders]),
        })
      : null,
    supersession: record.supersession ? Object.freeze({ ...record.supersession }) : null,
  });
}

function review(input: Readonly<{
  status: DecisionRecordIntegrityStatusV1;
  evaluatedAt: string;
  decisionId: string | null;
  reasonCodes: readonly string[];
  record?: DecisionRecordV1 | null;
}>): DecisionRecordIntegrityReviewV1 {
  const reasonCodes = [...new Set(input.reasonCodes.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const record = input.record ? freezeRecord(input.record) : null;
  return Object.freeze({
    contractVersion: DECISION_RECORD_CONTRACT_VERSION_V1,
    status: input.status,
    evaluatedAt: input.evaluatedAt,
    decisionId: input.decisionId,
    reasonCodes: Object.freeze(reasonCodes),
    record,
    limitations: LIMITATIONS,
    causalClaimEstablished: record?.observedOutcome?.attributionClass === "CAUSAL_SUPPORTED",
    monetaryValue: null,
    authority: AUTHORITY,
  });
}

function parseAlternatives(value: unknown): DecisionAlternativeV1[] | null {
  if (!Array.isArray(value) || value.length > MAX_ARRAY_ITEMS) return null;
  const parsed: DecisionAlternativeV1[] = [];
  const ids = new Set<string>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") return null;
    const item = candidate as Record<string, unknown>;
    if (!text(item.alternativeId) || ids.has(item.alternativeId.trim()) || !text(item.summary)) return null;
    if (!["NOT_CHOSEN", "DEFERRED", "REJECTED", "UNKNOWN"].includes(String(item.disposition))) return null;
    ids.add(item.alternativeId.trim());
    parsed.push({
      alternativeId: item.alternativeId.trim(),
      summary: item.summary.trim(),
      disposition: item.disposition as DecisionAlternativeV1["disposition"],
    });
  }
  return parsed.sort((a, b) => a.alternativeId.localeCompare(b.alternativeId));
}

function parseRevisitTriggers(value: unknown): DecisionRevisitTriggerV1[] | null {
  if (!Array.isArray(value) || value.length > MAX_ARRAY_ITEMS) return null;
  const parsed: DecisionRevisitTriggerV1[] = [];
  const ids = new Set<string>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") return null;
    const item = candidate as Record<string, unknown>;
    if (!text(item.triggerId) || ids.has(item.triggerId.trim()) || !text(item.condition) || !optionalText(item.evidenceRef)) return null;
    ids.add(item.triggerId.trim());
    parsed.push({
      triggerId: item.triggerId.trim(),
      condition: item.condition.trim(),
      evidenceRef: item.evidenceRef === null ? null : item.evidenceRef.trim(),
    });
  }
  return parsed.sort((a, b) => a.triggerId.localeCompare(b.triggerId));
}

function blocked(evaluatedAt: string, decisionId: string | null, ...reasonCodes: string[]): DecisionRecordIntegrityReviewV1 {
  return review({ status: "BLOCKED", evaluatedAt, decisionId, reasonCodes });
}

/**
 * Validates one immutable, supplied decision-memory record without persisting it
 * or widening action authority. Completeness gaps that do not make the record
 * false are surfaced as REVIEW_REQUIRED rather than filled with invented data.
 */
export function evaluateDecisionRecordV1(raw: unknown, evaluatedAtInput: string): DecisionRecordIntegrityReviewV1 {
  if (!timestamp(evaluatedAtInput)) {
    return review({ status: "BLOCKED", evaluatedAt: String(evaluatedAtInput ?? ""), decisionId: null, reasonCodes: ["INVALID_EVALUATED_AT"] });
  }
  const evaluatedAt = new Date(Date.parse(evaluatedAtInput)).toISOString();
  if (!raw || typeof raw !== "object") return blocked(evaluatedAt, null, "INVALID_RECORD");
  const value = raw as Record<string, unknown>;
  const decisionId = text(value.decisionId) ? value.decisionId.trim() : null;

  if (value.contractVersion !== DECISION_RECORD_CONTRACT_VERSION_V1) return blocked(evaluatedAt, decisionId, "INVALID_CONTRACT_VERSION");
  if (!decisionId || !Number.isInteger(value.version) || Number(value.version) <= 0) return blocked(evaluatedAt, decisionId, "INVALID_ID_OR_VERSION");
  if (!decisionRecordStatesV1.includes(value.state as DecisionRecordStateV1)) return blocked(evaluatedAt, decisionId, "INVALID_STATE");
  if (!text(value.domain) || !text(value.decision) || !text(value.context) || !text(value.rationale)) return blocked(evaluatedAt, decisionId, "INVALID_CORE_TEXT");

  const evidenceRefs = uniqueBoundedStrings(value.evidenceRefs, MAX_EVIDENCE_REFS);
  const alternatives = parseAlternatives(value.alternatives);
  const revisitTriggers = parseRevisitTriggers(value.revisitTriggers);
  const successCriteria = uniqueBoundedStrings(value.successCriteria);
  const failureCriteria = uniqueBoundedStrings(value.failureCriteria);
  if (!evidenceRefs || evidenceRefs.length === 0) return blocked(evaluatedAt, decisionId, "DECISION_EVIDENCE_REQUIRED");
  if (!alternatives || !revisitTriggers || !successCriteria || !failureCriteria) return blocked(evaluatedAt, decisionId, "INVALID_BOUNDED_COLLECTION");
  if (!confidence(value.confidence)) return blocked(evaluatedAt, decisionId, "INVALID_CONFIDENCE");
  if (!timestamp(value.decidedAt)) return blocked(evaluatedAt, decisionId, "INVALID_DECIDED_AT");
  if (Date.parse(value.decidedAt) > Date.parse(evaluatedAt)) return blocked(evaluatedAt, decisionId, "DECISION_FUTURE_DATED");
  if (!(value.validUntil === null || timestamp(value.validUntil))) return blocked(evaluatedAt, decisionId, "INVALID_VALID_UNTIL");
  if (timestamp(value.validUntil) && Date.parse(value.validUntil) < Date.parse(value.decidedAt)) return blocked(evaluatedAt, decisionId, "VALID_UNTIL_BEFORE_DECISION");

  if (!value.authority || typeof value.authority !== "object") return blocked(evaluatedAt, decisionId, "AUTHORITY_REQUIRED");
  const authorityInput = value.authority as Record<string, unknown>;
  if (!decisionAuthorityClassesV1.includes(authorityInput.authorityClass as DecisionAuthorityClassV1) || !text(authorityInput.actorRef)) {
    return blocked(evaluatedAt, decisionId, "INVALID_AUTHORITY");
  }
  if (!optionalText(authorityInput.approvalRef) || !(authorityInput.approvedAt === null || timestamp(authorityInput.approvedAt))) {
    return blocked(evaluatedAt, decisionId, "INVALID_APPROVAL_EVIDENCE");
  }
  const approvedAuthority = authorityInput.authorityClass === "GOVERNED_APPROVED" || authorityInput.authorityClass === "HUMAN_APPROVED";
  if (approvedAuthority && (authorityInput.approvalRef === null || authorityInput.approvedAt === null)) {
    return blocked(evaluatedAt, decisionId, "APPROVED_AUTHORITY_REQUIRES_EVIDENCE");
  }
  if (timestamp(authorityInput.approvedAt) && Date.parse(authorityInput.approvedAt) > Date.parse(evaluatedAt)) {
    return blocked(evaluatedAt, decisionId, "APPROVAL_FUTURE_DATED");
  }

  let expectedOutcome: DecisionExpectedOutcomeV1 | null = null;
  if (value.expectedOutcome !== null) {
    if (!value.expectedOutcome || typeof value.expectedOutcome !== "object") return blocked(evaluatedAt, decisionId, "INVALID_EXPECTED_OUTCOME");
    const expected = value.expectedOutcome as Record<string, unknown>;
    const metricRefs = uniqueBoundedStrings(expected.metricRefs);
    if (!text(expected.statement) || !metricRefs) return blocked(evaluatedAt, decisionId, "INVALID_EXPECTED_OUTCOME");
    expectedOutcome = { statement: expected.statement.trim(), metricRefs };
  }

  if (!value.action || typeof value.action !== "object") return blocked(evaluatedAt, decisionId, "ACTION_REQUIRED");
  const actionInput = value.action as Record<string, unknown>;
  const actionEvidenceRefs = uniqueBoundedStrings(actionInput.evidenceRefs, MAX_EVIDENCE_REFS);
  if (!decisionActionStatesV1.includes(actionInput.state as DecisionActionStateV1) || typeof actionInput.externalAction !== "boolean" || !actionEvidenceRefs) {
    return blocked(evaluatedAt, decisionId, "INVALID_ACTION");
  }
  if (!(actionInput.actedAt === null || timestamp(actionInput.actedAt))) return blocked(evaluatedAt, decisionId, "INVALID_ACTION_TIMESTAMP");
  if (actionInput.state === "TAKEN") {
    if (actionInput.actedAt === null || actionEvidenceRefs.length === 0) return blocked(evaluatedAt, decisionId, "TAKEN_ACTION_REQUIRES_EVIDENCE");
    if (Date.parse(String(actionInput.actedAt)) < Date.parse(value.decidedAt)) return blocked(evaluatedAt, decisionId, "ACTION_BEFORE_DECISION");
    if (Date.parse(String(actionInput.actedAt)) > Date.parse(evaluatedAt)) return blocked(evaluatedAt, decisionId, "ACTION_FUTURE_DATED");
    if (actionInput.externalAction && !approvedAuthority) return blocked(evaluatedAt, decisionId, "EXTERNAL_ACTION_REQUIRES_APPROVAL_EVIDENCE");
  } else if (actionInput.actedAt !== null || actionEvidenceRefs.length > 0) {
    return blocked(evaluatedAt, decisionId, "UNEXECUTED_ACTION_CANNOT_CLAIM_EXECUTION_EVIDENCE");
  }

  let observedOutcome: DecisionObservedOutcomeV1 | null = null;
  if (value.observedOutcome !== null) {
    if (!value.observedOutcome || typeof value.observedOutcome !== "object") return blocked(evaluatedAt, decisionId, "INVALID_OBSERVED_OUTCOME");
    if (actionInput.state !== "TAKEN" || actionInput.actedAt === null) return blocked(evaluatedAt, decisionId, "OUTCOME_WITHOUT_TAKEN_ACTION");
    const outcome = value.observedOutcome as Record<string, unknown>;
    const outcomeEvidenceRefs = uniqueBoundedStrings(outcome.evidenceRefs, MAX_EVIDENCE_REFS);
    const confounders = uniqueBoundedStrings(outcome.confounders);
    if (!timestamp(outcome.observedAt) || !text(outcome.summary) || !outcomeEvidenceRefs || outcomeEvidenceRefs.length === 0 || !confounders) {
      return blocked(evaluatedAt, decisionId, "OUTCOME_EVIDENCE_REQUIRED");
    }
    if (!decisionOutcomeResultsV1.includes(outcome.result as DecisionOutcomeResultV1) || !decisionAttributionClassesV1.includes(outcome.attributionClass as DecisionAttributionClassV1)) {
      return blocked(evaluatedAt, decisionId, "INVALID_OUTCOME_CLASSIFICATION");
    }
    if (!confidence(outcome.attributionConfidence) || !optionalText(outcome.causalDesignRef)) return blocked(evaluatedAt, decisionId, "INVALID_ATTRIBUTION_EVIDENCE");
    if (Date.parse(outcome.observedAt) < Date.parse(String(actionInput.actedAt))) return blocked(evaluatedAt, decisionId, "OUTCOME_BEFORE_ACTION");
    if (Date.parse(outcome.observedAt) > Date.parse(evaluatedAt)) return blocked(evaluatedAt, decisionId, "OUTCOME_FUTURE_DATED");
    if (outcome.attributionClass === "CAUSAL_SUPPORTED" && outcome.causalDesignRef === null) {
      return blocked(evaluatedAt, decisionId, "CAUSAL_SUPPORT_REQUIRES_DESIGN_EVIDENCE");
    }
    observedOutcome = {
      observedAt: new Date(Date.parse(outcome.observedAt)).toISOString(),
      summary: outcome.summary.trim(),
      result: outcome.result as DecisionOutcomeResultV1,
      evidenceRefs: outcomeEvidenceRefs,
      confounders,
      attributionClass: outcome.attributionClass as DecisionAttributionClassV1,
      attributionConfidence: outcome.attributionConfidence as number | null,
      causalDesignRef: outcome.causalDesignRef === null ? null : outcome.causalDesignRef.trim(),
    };
  }

  let supersession: DecisionSupersessionV1 | null = null;
  if (value.state === "SUPERSEDED") {
    if (!value.supersession || typeof value.supersession !== "object") return blocked(evaluatedAt, decisionId, "SUPERSESSION_EVIDENCE_REQUIRED");
    const supplied = value.supersession as Record<string, unknown>;
    if (!text(supplied.supersedesDecisionId) || supplied.supersedesDecisionId.trim() === decisionId || !text(supplied.reason) || !text(supplied.predecessorEvidenceRef)) {
      return blocked(evaluatedAt, decisionId, "INVALID_SUPERSESSION");
    }
    supersession = {
      supersedesDecisionId: supplied.supersedesDecisionId.trim(),
      reason: supplied.reason.trim(),
      predecessorEvidenceRef: supplied.predecessorEvidenceRef.trim(),
    };
  } else if (value.supersession !== null) {
    return blocked(evaluatedAt, decisionId, "UNEXPECTED_SUPERSESSION");
  }

  const authority: DecisionAuthorityV1 = {
    authorityClass: authorityInput.authorityClass as DecisionAuthorityClassV1,
    actorRef: authorityInput.actorRef.trim(),
    approvalRef: authorityInput.approvalRef === null ? null : authorityInput.approvalRef.trim(),
    approvedAt: authorityInput.approvedAt === null ? null : new Date(Date.parse(authorityInput.approvedAt)).toISOString(),
  };
  const action: DecisionActionV1 = {
    state: actionInput.state as DecisionActionStateV1,
    externalAction: actionInput.externalAction,
    actedAt: actionInput.actedAt === null ? null : new Date(Date.parse(actionInput.actedAt)).toISOString(),
    evidenceRefs: actionEvidenceRefs,
  };
  const record: DecisionRecordV1 = {
    contractVersion: DECISION_RECORD_CONTRACT_VERSION_V1,
    decisionId,
    version: Number(value.version),
    state: value.state as DecisionRecordStateV1,
    domain: value.domain.trim(),
    decision: value.decision.trim(),
    context: value.context.trim(),
    evidenceRefs,
    alternatives,
    rationale: value.rationale.trim(),
    confidence: value.confidence as number | null,
    authority,
    decidedAt: new Date(Date.parse(value.decidedAt)).toISOString(),
    validUntil: value.validUntil === null ? null : new Date(Date.parse(value.validUntil)).toISOString(),
    revisitTriggers,
    expectedOutcome,
    successCriteria,
    failureCriteria,
    action,
    observedOutcome,
    supersession,
  };

  const reviewReasons: string[] = [];
  if (value.confidence === null) reviewReasons.push("CONFIDENCE_NOT_RECORDED");
  if (alternatives.length === 0) reviewReasons.push("ALTERNATIVES_NOT_RECORDED");
  if (expectedOutcome === null) reviewReasons.push("EXPECTED_OUTCOME_NOT_RECORDED");
  if (revisitTriggers.length === 0 && value.validUntil === null) reviewReasons.push("REVISIT_TRIGGER_NOT_RECORDED");
  if (authority.authorityClass === "REVIEW_REQUIRED") reviewReasons.push("AUTHORITY_REVIEW_REQUIRED");
  if (value.validUntil !== null && Date.parse(value.validUntil) < Date.parse(evaluatedAt)) reviewReasons.push("DECISION_VALIDITY_EXPIRED");

  return review({
    status: reviewReasons.length > 0 ? "REVIEW_REQUIRED" : "READY",
    evaluatedAt,
    decisionId,
    reasonCodes: reviewReasons.length > 0 ? reviewReasons : ["DECISION_RECORD_VALIDATED"],
    record,
  });
}
