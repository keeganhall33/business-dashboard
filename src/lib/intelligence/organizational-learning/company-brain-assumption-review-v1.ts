import { createHash } from "node:crypto";

import {
  DECISION_MEMORY_POLICY_VERSION_V1,
  type AssumptionOutcomeV1,
  type DecisionMemoryClassV1,
  type DecisionMemoryRecordV1,
  type DecisionMemoryTruthStateV1
} from "./decision-memory-v1";
import {
  compileDecisionMemoryBriefV1,
  type DecisionMemoryBriefV1
} from "./decision-memory-brief-v1";

export const COMPANY_BRAIN_ASSUMPTION_REVIEW_VERSION_V1 =
  "CompanyBrainAssumptionReviewV1" as const;
export const COMPANY_BRAIN_ASSUMPTION_REVIEW_POLICY_VERSION_V1 =
  "company_brain_assumption_review_v1.0.0" as const;

const MAX_RECORDS = 1_000;
const MAX_REFS = 5_000;

export type CompanyBrainAssumptionLaneV1 =
  | "VERIFY_DECISION_MEMORY"
  | "REVISIT_DECISION"
  | "GATHER_ASSUMPTION_EVIDENCE"
  | "REVIEW_SUPPORTED_ASSUMPTION"
  | "WAIT_FOR_RECORDED_OUTCOME";

export type CompanyBrainAssumptionAssessmentV1 =
  | AssumptionOutcomeV1
  | "NOT_OBSERVED";

export type CompanyBrainAssumptionReasonV1 =
  | "DECISION_VALIDITY_EXPIRED"
  | "ASSUMPTION_REFUTED"
  | "ASSUMPTION_UNRESOLVED"
  | "ASSUMPTION_NOT_ASSESSED"
  | "OUTCOME_NOT_OBSERVED"
  | "ASSUMPTION_SUPPORTED_REVIEW_ONLY";

export type CompanyBrainAssumptionReviewItemV1 = Readonly<{
  itemId: string;
  sourceRecordId: string;
  decisionId: string;
  decisionClass: DecisionMemoryClassV1;
  decidedAt: string;
  assumptionId: string;
  statement: string;
  statementTruthState: DecisionMemoryTruthStateV1;
  revisitTrigger: string | null;
  assessment: CompanyBrainAssumptionAssessmentV1;
  assessedAt: string | null;
  lane: CompanyBrainAssumptionLaneV1;
  reasonCodes: readonly CompanyBrainAssumptionReasonV1[];
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  causalInterpretation: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
}>;

export type CompanyBrainAssumptionSourceHealthV1 = Readonly<{
  sourceRecordId: string | null;
  decisionId: string | null;
  accepted: boolean;
  briefState: DecisionMemoryBriefV1["state"] | null;
  freshnessState: DecisionMemoryBriefV1["freshnessState"] | null;
  verificationReasons: readonly string[];
}>;

export type CompanyBrainAssumptionReviewV1 = Readonly<{
  contractVersion: typeof COMPANY_BRAIN_ASSUMPTION_REVIEW_VERSION_V1;
  policyVersion: typeof COMPANY_BRAIN_ASSUMPTION_REVIEW_POLICY_VERSION_V1;
  reviewId: string;
  state: "READY" | "VERIFY_SOURCE";
  generatedAt: string;
  sourceHealth: readonly CompanyBrainAssumptionSourceHealthV1[];
  verificationReasons: readonly string[];
  verificationRequired: readonly CompanyBrainAssumptionReviewItemV1[];
  decisionRevisit: readonly CompanyBrainAssumptionReviewItemV1[];
  evidenceNeeded: readonly CompanyBrainAssumptionReviewItemV1[];
  supportedReview: readonly CompanyBrainAssumptionReviewItemV1[];
  waitingOutcome: readonly CompanyBrainAssumptionReviewItemV1[];
  summary: Readonly<{
    suppliedRecords: number;
    acceptedRecords: number;
    rejectedRecords: number;
    materialAssumptions: number;
    supported: number;
    refuted: number;
    unresolved: number;
    notObserved: number;
    verificationRequired: number;
    decisionRevisit: number;
    evidenceNeeded: number;
    supportedReview: number;
    waitingOutcome: number;
    pricingAssumptionsRequiringRevisit: number;
    negotiationAssumptionsRequiringRevisit: number;
  }>;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  sourceDecisionIds: readonly string[];
  causalInterpretation: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
  inferredOutcome: null;
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    persistenceAuthorized: false;
    decisionMutationAuthorized: false;
    assumptionMutationAuthorized: false;
    learningPromotionAuthorized: false;
    policyPromotionAuthorized: false;
    capabilityPromotionAuthorized: false;
    portfolioMutationAuthorized: false;
    reallocationAuthorized: false;
    pricingChangeAuthorized: false;
    negotiationActionAuthorized: false;
    campaignExecutionAuthorized: false;
    experimentExecutionAuthorized: false;
    externalActionAuthorized: false;
    approvalBypassAuthorized: false;
  }>;
}>;

export type CompanyBrainAssumptionReviewInputV1 = Readonly<{
  records: readonly DecisionMemoryRecordV1[];
  generatedAt: string;
}>;

const EXPECTED_RECORD_AUTHORITY = Object.freeze({
  analysisOnly: true,
  persistenceAuthorized: false,
  externalActionAuthorized: false,
  pricingChangeAuthorized: false,
  negotiationAuthorized: false,
  spendAuthorized: false,
  publishAuthorized: false
});

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  persistenceAuthorized: false as const,
  decisionMutationAuthorized: false as const,
  assumptionMutationAuthorized: false as const,
  learningPromotionAuthorized: false as const,
  policyPromotionAuthorized: false as const,
  capabilityPromotionAuthorized: false as const,
  portfolioMutationAuthorized: false as const,
  reallocationAuthorized: false as const,
  pricingChangeAuthorized: false as const,
  negotiationActionAuthorized: false as const,
  campaignExecutionAuthorized: false as const,
  experimentExecutionAuthorized: false as const,
  externalActionAuthorized: false as const,
  approvalBypassAuthorized: false as const
});

const LIMITATIONS = Object.freeze([
  "This review projects material assumptions already recorded in canonical Decision Memory; it does not create, edit, repair, or persist decision truth.",
  "SUPPORTED means only that the recorded outcome observation includes evidence for that assumption assessment. It does not establish causality, a durable rule, confidence, or future validity.",
  "REFUTED and expired assumptions route to decision review; they do not automatically reverse a decision, change a price, alter a negotiation posture, or reallocate resources.",
  "UNRESOLVED or unassessed assumptions remain evidence gaps. Missing evidence is never treated as support or refutation.",
  "No learning, policy, capability, pricing, negotiation, campaign, experiment, reallocation, or external action authority is granted by this review."
] as const);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function timestamp(value: unknown): string | null {
  const normalized = text(value);
  if (!normalized || !Number.isFinite(Date.parse(normalized))) return null;
  return normalized;
}

function uniqueStrings(values: unknown, maximum = MAX_REFS): readonly string[] | null {
  if (!Array.isArray(values) || values.length > maximum) return null;
  const normalized: string[] = [];
  for (const value of values) {
    const parsed = text(value);
    if (!parsed) return null;
    normalized.push(parsed);
  }
  if (new Set(normalized).size !== normalized.length) return null;
  return Object.freeze([...normalized].sort((a, b) => a.localeCompare(b)));
}

function exactAuthority(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = value as Record<string, unknown>;
  const actualKeys = Object.keys(actual).sort((a, b) => a.localeCompare(b));
  const expectedKeys = Object.keys(EXPECTED_RECORD_AUTHORITY).sort((a, b) => a.localeCompare(b));
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) =>
      key === expectedKeys[index]
      && actual[key] === EXPECTED_RECORD_AUTHORITY[key as keyof typeof EXPECTED_RECORD_AUTHORITY]
    );
}

function stableId(parts: readonly string[]): string {
  return `company-brain-assumption:${createHash("sha256")
    .update(parts.join("\u0000"))
    .digest("hex")
    .slice(0, 20)}`;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value as Readonly<T>;
}

function sortItems(
  items: readonly CompanyBrainAssumptionReviewItemV1[]
): readonly CompanyBrainAssumptionReviewItemV1[] {
  return Object.freeze([...items].sort((a, b) => {
    const decision = a.decisionId.localeCompare(b.decisionId);
    if (decision !== 0) return decision;
    return a.assumptionId.localeCompare(b.assumptionId);
  }));
}

function validateRecordShape(
  record: DecisionMemoryRecordV1,
  index: number,
  generatedAt: string
): {
  accepted: boolean;
  sourceRecordId: string | null;
  decisionId: string | null;
  brief: DecisionMemoryBriefV1 | null;
  reasons: readonly string[];
} {
  const reasons = new Set<string>();
  const sourceRecordId = text(record?.recordId);
  const decisionId = text(record?.decisionId);

  if (record?.contractVersion !== "DecisionMemoryV1") reasons.add("CONTRACT_INVALID");
  if (record?.policyVersion !== DECISION_MEMORY_POLICY_VERSION_V1) reasons.add("POLICY_INVALID");
  if (!sourceRecordId) reasons.add("RECORD_ID_INVALID");
  if (!decisionId) reasons.add("DECISION_ID_INVALID");
  if (!timestamp(record?.decidedAt)) reasons.add("DECIDED_AT_INVALID");
  if (!exactAuthority(record?.actionAuthority)) reasons.add("AUTHORITY_WIDENED");
  if (!Array.isArray(record?.assumptions) || record.assumptions.length > MAX_RECORDS) {
    reasons.add("ASSUMPTIONS_INVALID");
  }
  if (!uniqueStrings(record?.sourceRefs)) reasons.add("SOURCE_REFS_INVALID");

  let brief: DecisionMemoryBriefV1 | null = null;
  if (reasons.size === 0) {
    try {
      brief = compileDecisionMemoryBriefV1({ record, generatedAt });
    } catch {
      reasons.add("DECISION_BRIEF_COMPILATION_FAILED");
    }
  }

  if (brief?.state === "VERIFY_INTEGRITY" || brief?.state === "VERIFY_LINEAGE") {
    reasons.add(`DECISION_BRIEF_${brief.state}`);
  }

  if (record?.outcomeObservation) {
    const assessments = record.outcomeObservation.assumptionAssessments;
    if (!Array.isArray(assessments) || assessments.length > MAX_RECORDS) {
      reasons.add("ASSUMPTION_ASSESSMENTS_INVALID");
    } else {
      const assessmentIds = assessments.map((item) => text(item.assumptionId));
      if (assessmentIds.some((value) => value == null)) reasons.add("ASSUMPTION_ASSESSMENT_ID_INVALID");
      if (new Set(assessmentIds).size !== assessmentIds.length) reasons.add("DUPLICATE_ASSUMPTION_ASSESSMENT");
      const knownAssumptions = new Set(
        Array.isArray(record.assumptions)
          ? record.assumptions.map((item) => text(item.assumptionId)).filter((value): value is string => value != null)
          : []
      );
      if (assessmentIds.some((value) => value != null && !knownAssumptions.has(value))) {
        reasons.add("UNKNOWN_ASSUMPTION_ASSESSMENT");
      }
      for (const assessment of assessments) {
        if (!uniqueStrings(assessment.evidenceRefs)) {
          reasons.add("ASSUMPTION_ASSESSMENT_EVIDENCE_INVALID");
          break;
        }
      }
    }
  }

  if (Array.isArray(record?.assumptions)) {
    const assumptionIds = record.assumptions.map((item) => text(item.assumptionId));
    if (assumptionIds.some((value) => value == null)) reasons.add("ASSUMPTION_ID_INVALID");
    if (new Set(assumptionIds).size !== assumptionIds.length) reasons.add("DUPLICATE_ASSUMPTION_ID");
    for (const assumption of record.assumptions) {
      if (!uniqueStrings(assumption.statement?.evidenceRefs)) {
        reasons.add("ASSUMPTION_EVIDENCE_INVALID");
        break;
      }
    }
  }

  if (!brief && reasons.size === 0) reasons.add(`SOURCE_${index + 1}_UNAVAILABLE`);
  return {
    accepted: reasons.size === 0 && brief != null,
    sourceRecordId,
    decisionId,
    brief,
    reasons: Object.freeze([...reasons].sort((a, b) => a.localeCompare(b)))
  };
}

function itemForAssumption(args: {
  record: DecisionMemoryRecordV1;
  brief: DecisionMemoryBriefV1;
  assumption: DecisionMemoryRecordV1["assumptions"][number];
}): CompanyBrainAssumptionReviewItemV1 {
  const { record, brief, assumption } = args;
  const observation = record.outcomeObservation;
  const assessment = observation?.assumptionAssessments.find(
    (candidate) => candidate.assumptionId === assumption.assumptionId
  );
  const expired = brief.freshnessState === "EXPIRED";

  let lane: CompanyBrainAssumptionLaneV1;
  let assessmentState: CompanyBrainAssumptionAssessmentV1;
  const reasonCodes: CompanyBrainAssumptionReasonV1[] = [];

  if (!observation) {
    assessmentState = "NOT_OBSERVED";
    lane = expired ? "REVISIT_DECISION" : "WAIT_FOR_RECORDED_OUTCOME";
    reasonCodes.push(expired ? "DECISION_VALIDITY_EXPIRED" : "OUTCOME_NOT_OBSERVED");
  } else if (!assessment) {
    assessmentState = "UNRESOLVED";
    lane = expired ? "REVISIT_DECISION" : "GATHER_ASSUMPTION_EVIDENCE";
    reasonCodes.push(expired ? "DECISION_VALIDITY_EXPIRED" : "ASSUMPTION_NOT_ASSESSED");
  } else if (assessment.assessment === "REFUTED") {
    assessmentState = "REFUTED";
    lane = "REVISIT_DECISION";
    reasonCodes.push("ASSUMPTION_REFUTED");
    if (expired) reasonCodes.push("DECISION_VALIDITY_EXPIRED");
  } else if (assessment.assessment === "UNRESOLVED") {
    assessmentState = "UNRESOLVED";
    lane = expired ? "REVISIT_DECISION" : "GATHER_ASSUMPTION_EVIDENCE";
    reasonCodes.push(expired ? "DECISION_VALIDITY_EXPIRED" : "ASSUMPTION_UNRESOLVED");
  } else {
    assessmentState = "SUPPORTED";
    lane = expired ? "REVISIT_DECISION" : "REVIEW_SUPPORTED_ASSUMPTION";
    reasonCodes.push(expired ? "DECISION_VALIDITY_EXPIRED" : "ASSUMPTION_SUPPORTED_REVIEW_ONLY");
  }

  const evidenceRefs = Object.freeze([
    ...new Set([
      ...assumption.statement.evidenceRefs,
      ...(assessment?.evidenceRefs ?? [])
    ])
  ].sort((a, b) => a.localeCompare(b)));
  const sourceRefs = Object.freeze([
    ...new Set([
      ...record.sourceRefs,
      ...(observation?.sourceRefs ?? [])
    ])
  ].sort((a, b) => a.localeCompare(b)));

  return deepFreeze({
    itemId: stableId([
      record.recordId,
      record.decisionId,
      assumption.assumptionId,
      assessmentState,
      lane
    ]),
    sourceRecordId: record.recordId,
    decisionId: record.decisionId,
    decisionClass: record.decisionClass,
    decidedAt: record.decidedAt,
    assumptionId: assumption.assumptionId,
    statement: assumption.statement.value ?? "",
    statementTruthState: assumption.statement.state,
    revisitTrigger: assumption.revisitTrigger,
    assessment: assessmentState,
    assessedAt: observation?.observedAt ?? null,
    lane,
    reasonCodes: Object.freeze([...new Set(reasonCodes)].sort((a, b) => a.localeCompare(b))),
    evidenceRefs,
    sourceRefs,
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null
  }) as CompanyBrainAssumptionReviewItemV1;
}

/**
 * Produces a bounded review projection over material assumptions already present
 * in canonical Decision Memory. It never upgrades an observed assumption
 * assessment into causal truth or an automatic business rule/action.
 */
export function compileCompanyBrainAssumptionReviewV1(
  input: CompanyBrainAssumptionReviewInputV1
): CompanyBrainAssumptionReviewV1 {
  const generatedAt = timestamp(input?.generatedAt);
  if (!generatedAt) throw new Error("COMPANY_BRAIN_ASSUMPTION_REVIEW_INVALID_GENERATED_AT");
  if (!Array.isArray(input?.records) || input.records.length > MAX_RECORDS) {
    throw new Error("COMPANY_BRAIN_ASSUMPTION_REVIEW_RECORD_BOUNDS_EXCEEDED");
  }

  const sourceHealth: CompanyBrainAssumptionSourceHealthV1[] = [];
  const verificationReasons = new Set<string>();
  const acceptedRecords: DecisionMemoryRecordV1[] = [];
  const acceptedBriefs = new Map<string, DecisionMemoryBriefV1>();
  const seenRecordIds = new Set<string>();
  const seenDecisionIds = new Set<string>();

  input.records.forEach((record, index) => {
    const health = validateRecordShape(record, index, generatedAt);
    const reasons = new Set(health.reasons);

    if (health.sourceRecordId && seenRecordIds.has(health.sourceRecordId)) {
      reasons.add("DUPLICATE_SOURCE_RECORD_ID");
    }
    if (health.decisionId && seenDecisionIds.has(health.decisionId)) {
      reasons.add("DUPLICATE_DECISION_ID");
    }
    if (health.sourceRecordId) seenRecordIds.add(health.sourceRecordId);
    if (health.decisionId) seenDecisionIds.add(health.decisionId);

    const accepted = health.accepted && reasons.size === 0;
    if (accepted && health.brief) {
      acceptedRecords.push(record);
      acceptedBriefs.set(record.recordId, health.brief);
    }

    for (const reason of reasons) {
      verificationReasons.add(`${health.decisionId ?? health.sourceRecordId ?? `source:${index + 1}`}:${reason}`);
    }
    sourceHealth.push(Object.freeze({
      sourceRecordId: health.sourceRecordId,
      decisionId: health.decisionId,
      accepted,
      briefState: health.brief?.state ?? null,
      freshnessState: health.brief?.freshnessState ?? null,
      verificationReasons: Object.freeze([...reasons].sort((a, b) => a.localeCompare(b)))
    }));
  });

  const items: CompanyBrainAssumptionReviewItemV1[] = [];
  for (const record of acceptedRecords) {
    const brief = acceptedBriefs.get(record.recordId);
    if (!brief) continue;
    for (const assumption of record.assumptions) {
      if (!assumption.material) continue;
      if (
        assumption.statement.value == null
        || !["KNOWN", "INFERRED"].includes(assumption.statement.state)
        || assumption.statement.evidenceRefs.length === 0
      ) {
        verificationReasons.add(`${record.decisionId}:MATERIAL_ASSUMPTION_UNSUPPORTED`);
        continue;
      }
      items.push(itemForAssumption({ record, brief, assumption }));
    }
  }

  const verificationRequired = sortItems(
    items.filter((item) => item.lane === "VERIFY_DECISION_MEMORY")
  );
  const decisionRevisit = sortItems(items.filter((item) => item.lane === "REVISIT_DECISION"));
  const evidenceNeeded = sortItems(items.filter((item) => item.lane === "GATHER_ASSUMPTION_EVIDENCE"));
  const supportedReview = sortItems(items.filter((item) => item.lane === "REVIEW_SUPPORTED_ASSUMPTION"));
  const waitingOutcome = sortItems(items.filter((item) => item.lane === "WAIT_FOR_RECORDED_OUTCOME"));
  const allItems = [
    ...verificationRequired,
    ...decisionRevisit,
    ...evidenceNeeded,
    ...supportedReview,
    ...waitingOutcome
  ];
  const itemIds = allItems.map((item) => item.itemId);
  if (new Set(itemIds).size !== itemIds.length) verificationReasons.add("DUPLICATE_REVIEW_ITEM_ID");

  const evidenceRefs = Object.freeze(
    [...new Set(allItems.flatMap((item) => item.evidenceRefs))].sort((a, b) => a.localeCompare(b))
  );
  const sourceRefs = Object.freeze(
    [...new Set(allItems.flatMap((item) => item.sourceRefs))].sort((a, b) => a.localeCompare(b))
  );
  const sourceDecisionIds = Object.freeze(
    [...new Set(acceptedRecords.map((record) => record.decisionId))].sort((a, b) => a.localeCompare(b))
  );
  const orderedVerificationReasons = Object.freeze(
    [...verificationReasons].sort((a, b) => a.localeCompare(b))
  );

  const output: CompanyBrainAssumptionReviewV1 = {
    contractVersion: COMPANY_BRAIN_ASSUMPTION_REVIEW_VERSION_V1,
    policyVersion: COMPANY_BRAIN_ASSUMPTION_REVIEW_POLICY_VERSION_V1,
    reviewId: stableId([
      generatedAt,
      ...sourceHealth.map((health) => `${health.sourceRecordId ?? "missing"}:${health.accepted ? "accepted" : "rejected"}`),
      ...itemIds.sort((a, b) => a.localeCompare(b)),
      ...orderedVerificationReasons
    ]),
    state: orderedVerificationReasons.length === 0 ? "READY" : "VERIFY_SOURCE",
    generatedAt,
    sourceHealth: Object.freeze(sourceHealth),
    verificationReasons: orderedVerificationReasons,
    verificationRequired,
    decisionRevisit,
    evidenceNeeded,
    supportedReview,
    waitingOutcome,
    summary: Object.freeze({
      suppliedRecords: input.records.length,
      acceptedRecords: sourceHealth.filter((health) => health.accepted).length,
      rejectedRecords: sourceHealth.filter((health) => !health.accepted).length,
      materialAssumptions: allItems.length,
      supported: allItems.filter((item) => item.assessment === "SUPPORTED").length,
      refuted: allItems.filter((item) => item.assessment === "REFUTED").length,
      unresolved: allItems.filter((item) => item.assessment === "UNRESOLVED").length,
      notObserved: allItems.filter((item) => item.assessment === "NOT_OBSERVED").length,
      verificationRequired: verificationRequired.length,
      decisionRevisit: decisionRevisit.length,
      evidenceNeeded: evidenceNeeded.length,
      supportedReview: supportedReview.length,
      waitingOutcome: waitingOutcome.length,
      pricingAssumptionsRequiringRevisit: decisionRevisit.filter((item) => item.decisionClass === "PRICING").length,
      negotiationAssumptionsRequiringRevisit: decisionRevisit.filter((item) => item.decisionClass === "NEGOTIATION").length
    }),
    evidenceRefs,
    sourceRefs,
    sourceDecisionIds,
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    inferredOutcome: null,
    limitations: LIMITATIONS,
    authority: AUTHORITY
  };

  return deepFreeze(output) as CompanyBrainAssumptionReviewV1;
}
