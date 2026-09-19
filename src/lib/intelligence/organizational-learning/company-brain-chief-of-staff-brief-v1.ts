import { createHash } from "node:crypto";

import {
  COMPANY_BRAIN_DECISION_HISTORY_BRIEF_POLICY_VERSION_V1,
  COMPANY_BRAIN_DECISION_HISTORY_BRIEF_VERSION_V1,
  type CompanyBrainDecisionHistoryBriefV1,
  type CompanyBrainDecisionHistoryItemV1
} from "./company-brain-decision-history-brief-v1";
import {
  COMPANY_BRAIN_RECURRING_LESSONS_BRIEF_POLICY_VERSION_V1,
  COMPANY_BRAIN_RECURRING_LESSONS_BRIEF_VERSION_V1,
  type CompanyBrainRecurringLessonItemV1,
  type CompanyBrainRecurringLessonsBriefV1
} from "./company-brain-recurring-lessons-brief-v1";
import {
  DECISION_MEASUREMENT_ATTENTION_BRIEF_VERSION_V1,
  DECISION_MEASUREMENT_ATTENTION_POLICY_VERSION_V1,
  type DecisionMeasurementAttentionBriefV1,
  type DecisionMeasurementAttentionItemV1
} from "./decision-measurement-attention-brief-v1";

export const COMPANY_BRAIN_CHIEF_OF_STAFF_BRIEF_VERSION_V1 =
  "CompanyBrainChiefOfStaffBriefV1" as const;
export const COMPANY_BRAIN_CHIEF_OF_STAFF_BRIEF_POLICY_VERSION_V1 =
  "company_brain_chief_of_staff_brief_v1.0.0" as const;

const MAX_REFS = 4_000;
const MAX_ATTENTION_ITEMS = 1_500;

export type CompanyBrainChiefOfStaffSourceKindV1 =
  | "DECISION_HISTORY"
  | "RECURRING_LESSONS"
  | "MEASUREMENT_ATTENTION";

export type CompanyBrainChiefOfStaffLaneV1 =
  | "VERIFY_DECISION_MEMORY"
  | "REVIEW_DECISION_REVISIT"
  | "REVIEW_OBSERVED_OUTCOME"
  | "PREPARE_MEASUREMENT_EVIDENCE_REVIEW"
  | "VERIFY_DECISION_RECORD"
  | "REVIEW_MEASUREMENT_PLAN"
  | "REVIEW_RECURRING_LESSON"
  | "GATHER_MORE_INDEPENDENT_EVIDENCE"
  | "VERIFY_RECURRING_LESSON";

export type CompanyBrainChiefOfStaffAttentionItemV1 = Readonly<{
  attentionId: string;
  sourceKind: CompanyBrainChiefOfStaffSourceKindV1;
  sourceBriefId: string;
  sourceItemId: string;
  lane: CompanyBrainChiefOfStaffLaneV1;
  decisionId: string | null;
  domain: string | null;
  patternKey: string | null;
  safeNextStep: string;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  causalInterpretation: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
}>;

export type CompanyBrainChiefOfStaffSourceHealthV1 = Readonly<{
  sourceKind: CompanyBrainChiefOfStaffSourceKindV1;
  sourceBriefId: string | null;
  sourceState: string | null;
  sourceGeneratedAt: string | null;
  sourceAgeMs: number | null;
  accepted: boolean;
}>;

export type CompanyBrainChiefOfStaffBriefV1 = Readonly<{
  contractVersion: typeof COMPANY_BRAIN_CHIEF_OF_STAFF_BRIEF_VERSION_V1;
  policyVersion: typeof COMPANY_BRAIN_CHIEF_OF_STAFF_BRIEF_POLICY_VERSION_V1;
  briefId: string;
  state: "READY" | "VERIFY_SOURCE";
  generatedAt: string;
  maximumSourceAgeMs: number;
  sourceHealth: readonly CompanyBrainChiefOfStaffSourceHealthV1[];
  verificationReasons: readonly string[];
  verification: readonly CompanyBrainChiefOfStaffAttentionItemV1[];
  decisionRevisit: readonly CompanyBrainChiefOfStaffAttentionItemV1[];
  outcomeReview: readonly CompanyBrainChiefOfStaffAttentionItemV1[];
  measurementNow: readonly CompanyBrainChiefOfStaffAttentionItemV1[];
  measurementPlanReview: readonly CompanyBrainChiefOfStaffAttentionItemV1[];
  recurringLessonReview: readonly CompanyBrainChiefOfStaffAttentionItemV1[];
  recurringEvidenceNeeded: readonly CompanyBrainChiefOfStaffAttentionItemV1[];
  summary: Readonly<{
    attentionItems: number;
    verification: number;
    decisionRevisit: number;
    outcomeReview: number;
    measurementNow: number;
    measurementOverdue: number;
    measurementDue: number;
    measurementPlanReview: number;
    recurringLessonReview: number;
    recurringEvidenceNeeded: number;
    pricingPatternsForReview: number;
    negotiationPatternsForReview: number;
    decisionsWaitingForOutcome: number;
    measurementsWaitingForWindow: number;
    measurementsWaitingForAction: number;
    measurementCoverageComplete: number;
  }>;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  causalInterpretation: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
  inferredOutcome: null;
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    persistenceAuthorized: false;
    decisionMutationAuthorized: false;
    measurementExecutionAuthorized: false;
    evidenceCollectionAuthorized: false;
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

export type CompanyBrainChiefOfStaffBriefInputV1 = Readonly<{
  decisionHistory: CompanyBrainDecisionHistoryBriefV1;
  recurringLessons: CompanyBrainRecurringLessonsBriefV1;
  measurementAttention: DecisionMeasurementAttentionBriefV1;
  generatedAt: string;
  maximumSourceAgeMs: number;
}>;

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  persistenceAuthorized: false as const,
  decisionMutationAuthorized: false as const,
  measurementExecutionAuthorized: false as const,
  evidenceCollectionAuthorized: false as const,
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

const DECISION_HISTORY_AUTHORITY = Object.freeze({
  analysisOnly: true,
  persistenceAuthorized: false,
  decisionMutationAuthorized: false,
  learningPromotionAuthorized: false,
  policyPromotionAuthorized: false,
  reallocationAuthorized: false,
  pricingChangeAuthorized: false,
  negotiationActionAuthorized: false,
  campaignExecutionAuthorized: false,
  experimentExecutionAuthorized: false,
  externalActionAuthorized: false,
  approvalBypassAuthorized: false
});

const RECURRING_LESSONS_AUTHORITY = Object.freeze({
  analysisOnly: true,
  persistenceAuthorized: false,
  lessonPromotionAuthorized: false,
  policyPromotionAuthorized: false,
  capabilityPromotionAuthorized: false,
  portfolioReallocationAuthorized: false,
  pricingChangeAuthorized: false,
  negotiationActionAuthorized: false,
  campaignExecutionAuthorized: false,
  experimentExecutionAuthorized: false,
  externalActionAuthorized: false,
  approvalBypassAuthorized: false
});

const MEASUREMENT_AUTHORITY = Object.freeze({
  analysisOnly: true,
  persistenceAuthorized: false,
  measurementExecutionAuthorized: false,
  evidenceCollectionAuthorized: false,
  decisionMutationAuthorized: false,
  portfolioMutationAuthorized: false,
  reallocationAuthorized: false,
  policyPromotionAuthorized: false,
  pricingChangeAuthorized: false,
  negotiationActionAuthorized: false,
  campaignExecutionAuthorized: false,
  experimentExecutionAuthorized: false,
  externalActionAuthorized: false,
  approvalBypassAuthorized: false
});

const LIMITATIONS = Object.freeze([
  "This brief composes canonical Company Brain and measurement review projections. It does not create another memory, learning, measurement, or strategy truth store.",
  "Attention lanes preserve upstream review posture. Their fixed presentation grouping is not an economic ranking, urgency score, confidence score, or resource-allocation decision.",
  "Recurring pricing and negotiation patterns remain review candidates only. Repetition does not establish causality, a recommended price, a negotiation posture, or future performance.",
  "Measurement due/overdue states reflect recorded windows only. They do not imply success, failure, business impact, causality, or attribution.",
  "No persistence, evidence collection, portfolio mutation, reallocation, price change, negotiation action, campaign or experiment execution, external action, or approval bypass is authorized."
] as const);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function canonicalTimestamp(value: unknown): string | null {
  const normalized = text(value);
  if (!normalized) return null;
  const milliseconds = Date.parse(normalized);
  if (!Number.isFinite(milliseconds)) return null;
  return new Date(milliseconds).toISOString() === normalized ? normalized : null;
}

function positiveFinite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function uniqueStrings(value: unknown, maximum = MAX_REFS): readonly string[] | null {
  if (!Array.isArray(value) || value.length > maximum) return null;
  const normalized: string[] = [];
  for (const entry of value) {
    const parsed = text(entry);
    if (!parsed) return null;
    normalized.push(parsed);
  }
  if (new Set(normalized).size !== normalized.length) return null;
  return Object.freeze([...normalized].sort((a, b) => a.localeCompare(b)));
}

function exactAuthority(
  value: unknown,
  expected: Readonly<Record<string, boolean>>
): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = value as Record<string, unknown>;
  const actualKeys = Object.keys(actual).sort((a, b) => a.localeCompare(b));
  const expectedKeys = Object.keys(expected).sort((a, b) => a.localeCompare(b));
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index] && actual[key] === expected[key]);
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value as Readonly<T>;
}

function stableId(parts: readonly string[]): string {
  return `company-brain-chief-of-staff:${createHash("sha256")
    .update(parts.join("\u0000"))
    .digest("hex")
    .slice(0, 20)}`;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort((x, y) => x.localeCompare(y));
  const b = [...right].sort((x, y) => x.localeCompare(y));
  return a.every((value, index) => value === b[index]);
}

function sourceAge(
  sourceKind: CompanyBrainChiefOfStaffSourceKindV1,
  sourceGeneratedAt: unknown,
  generatedAtMs: number,
  maximumSourceAgeMs: number,
  reasons: Set<string>
): { generatedAt: string | null; ageMs: number | null; fresh: boolean } {
  const timestamp = canonicalTimestamp(sourceGeneratedAt);
  if (!timestamp) {
    reasons.add(`${sourceKind}_SOURCE_TIMESTAMP_INVALID`);
    return { generatedAt: null, ageMs: null, fresh: false };
  }
  const ageMs = generatedAtMs - Date.parse(timestamp);
  if (ageMs < 0) {
    reasons.add(`${sourceKind}_SOURCE_FROM_FUTURE`);
    return { generatedAt: timestamp, ageMs, fresh: false };
  }
  if (ageMs > maximumSourceAgeMs) {
    reasons.add(`${sourceKind}_SOURCE_STALE`);
    return { generatedAt: timestamp, ageMs, fresh: false };
  }
  return { generatedAt: timestamp, ageMs, fresh: true };
}

function validateDecisionHistory(
  brief: CompanyBrainDecisionHistoryBriefV1,
  reasons: Set<string>
): boolean {
  let valid = true;
  const reject = (reason: string) => {
    reasons.add(`DECISION_HISTORY_${reason}`);
    valid = false;
  };
  if (
    brief?.contractVersion !== COMPANY_BRAIN_DECISION_HISTORY_BRIEF_VERSION_V1
    || brief?.policyVersion !== COMPANY_BRAIN_DECISION_HISTORY_BRIEF_POLICY_VERSION_V1
  ) reject("CONTRACT_INVALID");
  if (brief?.state !== "READY") reject("SOURCE_REQUIRES_VERIFICATION");
  if (!exactAuthority(brief?.authority, DECISION_HISTORY_AUTHORITY)) reject("AUTHORITY_WIDENED");
  if (
    brief?.causalInterpretation !== "NOT_ESTABLISHED"
    || brief?.confidence !== "NOT_ESTABLISHED"
    || brief?.monetaryValue !== null
  ) reject("INTERPRETATION_WIDENED");
  if (
    !Array.isArray(brief?.timeline)
    || !Array.isArray(brief?.verificationRequired)
    || !Array.isArray(brief?.revisitRequired)
    || !Array.isArray(brief?.outcomeReviewReady)
    || !Array.isArray(brief?.waitingOutcome)
    || brief.timeline.length > MAX_ATTENTION_ITEMS
  ) {
    reject("ITEMS_INVALID");
    return false;
  }

  const timelineIds = brief.timeline.map((item) => `${item.sourceBriefId}\u0000${item.decisionId}`);
  if (new Set(timelineIds).size !== timelineIds.length) reject("DUPLICATE_ITEM_IDENTITY");
  for (const item of brief.timeline) {
    if (!text(item.sourceBriefId) || !text(item.decisionId) || !uniqueStrings(item.provenanceRefs)) {
      reject("ITEM_INVALID");
      break;
    }
    if (item.causalInterpretation !== "NOT_ESTABLISHED" || item.monetaryValue !== null) {
      reject("ITEM_INTERPRETATION_WIDENED");
      break;
    }
  }

  const lanes: Array<[readonly CompanyBrainDecisionHistoryItemV1[], CompanyBrainDecisionHistoryItemV1["safeNextStep"]]> = [
    [brief.verificationRequired, "VERIFY_DECISION_MEMORY"],
    [brief.revisitRequired, "REVIEW_DECISION_REVISIT"],
    [brief.outcomeReviewReady, "REVIEW_OBSERVED_OUTCOME"],
    [brief.waitingOutcome, "WAIT_FOR_RECORDED_OUTCOME"]
  ];
  const partitionIds: string[] = [];
  const timelineSet = new Set(timelineIds);
  for (const [items, expectedStep] of lanes) {
    for (const item of items) {
      const identity = `${item.sourceBriefId}\u0000${item.decisionId}`;
      partitionIds.push(identity);
      if (!timelineSet.has(identity) || item.safeNextStep !== expectedStep) reject("LANE_MISMATCH");
    }
  }
  if (partitionIds.length !== timelineIds.length || new Set(partitionIds).size !== partitionIds.length) {
    reject("LANE_PARTITION_MISMATCH");
  }

  const expectedEvidence = [...new Set(brief.timeline.flatMap((item) => item.provenanceRefs))].sort((a, b) => a.localeCompare(b));
  const expectedDecisionIds = [...new Set(brief.timeline.map((item) => item.decisionId))].sort((a, b) => a.localeCompare(b));
  if (!uniqueStrings(brief.evidenceRefs) || !sameStrings(brief.evidenceRefs, expectedEvidence)) reject("EVIDENCE_SUMMARY_MISMATCH");
  if (!uniqueStrings(brief.sourceDecisionIds) || !sameStrings(brief.sourceDecisionIds, expectedDecisionIds)) reject("DECISION_ID_SUMMARY_MISMATCH");

  const summary = brief.summary;
  if (
    !summary
    || summary.accepted !== brief.timeline.length
    || summary.rejected !== summary.supplied - summary.accepted
    || summary.verificationRequired !== brief.verificationRequired.length
    || summary.revisitRequired !== brief.revisitRequired.length
    || summary.outcomeReviewReady !== brief.outcomeReviewReady.length
    || summary.waitingOutcome !== brief.waitingOutcome.length
    || summary.observedOutcomes !== brief.timeline.filter((item) => item.outcomeState !== "NOT_OBSERVED").length
    || summary.lineageChangeEvents !== brief.timeline.filter((item) => item.changesSincePrior.length > 0).length
  ) reject("SUMMARY_MISMATCH");
  return valid;
}

function validateRecurringLessons(
  brief: CompanyBrainRecurringLessonsBriefV1,
  reasons: Set<string>
): boolean {
  let valid = true;
  const reject = (reason: string) => {
    reasons.add(`RECURRING_LESSONS_${reason}`);
    valid = false;
  };
  if (
    brief?.contractVersion !== COMPANY_BRAIN_RECURRING_LESSONS_BRIEF_VERSION_V1
    || brief?.policyVersion !== COMPANY_BRAIN_RECURRING_LESSONS_BRIEF_POLICY_VERSION_V1
  ) reject("CONTRACT_INVALID");
  if (brief?.state !== "READY") reject("SOURCE_REQUIRES_VERIFICATION");
  if (!exactAuthority(brief?.authority, RECURRING_LESSONS_AUTHORITY)) reject("AUTHORITY_WIDENED");
  if (
    brief?.causalInterpretation !== "NOT_ESTABLISHED"
    || brief?.confidence !== "NOT_ESTABLISHED"
    || brief?.monetaryValue !== null
  ) reject("INTERPRETATION_WIDENED");
  if (
    !Array.isArray(brief?.reviewCandidates)
    || !Array.isArray(brief?.evidenceNeeded)
    || !Array.isArray(brief?.verificationRequired)
  ) {
    reject("ITEMS_INVALID");
    return false;
  }
  const items = [...brief.reviewCandidates, ...brief.evidenceNeeded, ...brief.verificationRequired];
  if (items.length > MAX_ATTENTION_ITEMS) reject("ITEMS_INVALID");
  const identities = items.map((item) => item.sourceId);
  if (new Set(identities).size !== identities.length) reject("DUPLICATE_ITEM_IDENTITY");

  for (const item of items) {
    if (!text(item.sourceId) || !uniqueStrings(item.evidenceRefs) || !uniqueStrings(item.sourceLineageIds)) {
      reject("ITEM_INVALID");
      break;
    }
    if (
      item.causalInterpretation !== "NOT_ESTABLISHED"
      || item.confidence !== "NOT_ESTABLISHED"
      || item.monetaryValue !== null
    ) {
      reject("ITEM_INTERPRETATION_WIDENED");
      break;
    }
  }
  if (brief.reviewCandidates.some((item) => item.lane !== "REVIEW_RECURRING_LESSON")) reject("LANE_MISMATCH");
  if (brief.evidenceNeeded.some((item) => item.lane !== "GATHER_MORE_INDEPENDENT_EVIDENCE")) reject("LANE_MISMATCH");
  if (brief.verificationRequired.some((item) => item.lane !== "VERIFY_RECURRING_LESSON")) reject("LANE_MISMATCH");

  const expectedEvidence = [...new Set(items.flatMap((item) => item.evidenceRefs))].sort((a, b) => a.localeCompare(b));
  const expectedLineage = [...new Set(items.flatMap((item) => item.sourceLineageIds))].sort((a, b) => a.localeCompare(b));
  if (!uniqueStrings(brief.evidenceRefs) || !sameStrings(brief.evidenceRefs, expectedEvidence)) reject("EVIDENCE_SUMMARY_MISMATCH");
  if (!uniqueStrings(brief.sourceLineageIds) || !sameStrings(brief.sourceLineageIds, expectedLineage)) reject("LINEAGE_SUMMARY_MISMATCH");

  const summary = brief.summary;
  if (
    !summary
    || summary.accepted !== items.length
    || summary.rejected !== summary.supplied - summary.accepted
    || summary.reviewCandidates !== brief.reviewCandidates.length
    || summary.evidenceNeeded !== brief.evidenceNeeded.length
    || summary.verificationRequired !== brief.verificationRequired.length
    || summary.pricingPatternsForReview !== brief.reviewCandidates.filter((item) => item.domain === "PRICING").length
    || summary.negotiationPatternsForReview !== brief.reviewCandidates.filter((item) => item.domain === "NEGOTIATION").length
  ) reject("SUMMARY_MISMATCH");
  return valid;
}

function validateMeasurementAttention(
  brief: DecisionMeasurementAttentionBriefV1,
  reasons: Set<string>
): boolean {
  let valid = true;
  const reject = (reason: string) => {
    reasons.add(`MEASUREMENT_ATTENTION_${reason}`);
    valid = false;
  };
  if (
    brief?.contractVersion !== DECISION_MEASUREMENT_ATTENTION_BRIEF_VERSION_V1
    || brief?.policyVersion !== DECISION_MEASUREMENT_ATTENTION_POLICY_VERSION_V1
  ) reject("CONTRACT_INVALID");
  if (brief?.state !== "READY") reject("SOURCE_REQUIRES_VERIFICATION");
  if (!exactAuthority(brief?.authority, MEASUREMENT_AUTHORITY)) reject("AUTHORITY_WIDENED");
  if (
    brief?.causalInterpretation !== "NOT_ESTABLISHED"
    || brief?.confidence !== "NOT_ESTABLISHED"
    || brief?.monetaryValue !== null
    || brief?.inferredOutcome !== null
  ) reject("INTERPRETATION_WIDENED");
  if (
    !Array.isArray(brief?.measurementNow)
    || !Array.isArray(brief?.verificationRequired)
    || !Array.isArray(brief?.measurementPlanMissing)
    || !Array.isArray(brief?.waitingWindow)
    || !Array.isArray(brief?.waitingAction)
    || !Array.isArray(brief?.coverageComplete)
  ) {
    reject("ITEMS_INVALID");
    return false;
  }
  const items = [
    ...brief.measurementNow,
    ...brief.verificationRequired,
    ...brief.measurementPlanMissing,
    ...brief.waitingWindow,
    ...brief.waitingAction,
    ...brief.coverageComplete
  ];
  if (items.length > MAX_ATTENTION_ITEMS) reject("ITEMS_INVALID");
  const identities = items.map((item) => item.decisionId);
  if (new Set(identities).size !== identities.length) reject("DUPLICATE_DECISION_ID");
  for (const item of items) {
    if (!text(item.decisionId) || !uniqueStrings(item.evidenceRefs) || !uniqueStrings(item.sourceRefs)) {
      reject("ITEM_INVALID");
      break;
    }
    if (
      item.causalInterpretation !== "NOT_ESTABLISHED"
      || item.outcomeInterpretation !== "MEASUREMENT_COVERAGE_ONLY"
      || item.confidence !== "NOT_ESTABLISHED"
      || item.monetaryValue !== null
    ) {
      reject("ITEM_INTERPRETATION_WIDENED");
      break;
    }
  }
  if (brief.measurementNow.some((item) => item.measurementState !== "DUE" && item.measurementState !== "OVERDUE")) reject("LANE_MISMATCH");
  if (brief.verificationRequired.some((item) => item.measurementState !== "VERIFY_RECORD")) reject("LANE_MISMATCH");
  if (brief.measurementPlanMissing.some((item) => item.measurementState !== "NO_MEASUREMENT_PLAN")) reject("LANE_MISMATCH");
  if (brief.waitingWindow.some((item) => item.measurementState !== "WAITING_WINDOW")) reject("LANE_MISMATCH");
  if (brief.waitingAction.some((item) => item.measurementState !== "WAITING_ACTION")) reject("LANE_MISMATCH");
  if (brief.coverageComplete.some((item) => item.measurementState !== "COMPLETE")) reject("LANE_MISMATCH");

  const summary = brief.summary;
  if (
    !summary
    || summary.total !== items.length
    || summary.measurementNow !== brief.measurementNow.length
    || summary.overdue !== brief.measurementNow.filter((item) => item.measurementState === "OVERDUE").length
    || summary.due !== brief.measurementNow.filter((item) => item.measurementState === "DUE").length
    || summary.verificationRequired !== brief.verificationRequired.length
    || summary.measurementPlanMissing !== brief.measurementPlanMissing.length
    || summary.waitingWindow !== brief.waitingWindow.length
    || summary.waitingAction !== brief.waitingAction.length
    || summary.coverageComplete !== brief.coverageComplete.length
  ) reject("SUMMARY_MISMATCH");
  return valid;
}

function attentionFromDecision(
  sourceBriefId: string,
  item: CompanyBrainDecisionHistoryItemV1,
  lane: CompanyBrainChiefOfStaffLaneV1
): CompanyBrainChiefOfStaffAttentionItemV1 {
  return deepFreeze({
    attentionId: stableId(["DECISION_HISTORY", sourceBriefId, item.sourceBriefId, item.decisionId, lane]),
    sourceKind: "DECISION_HISTORY",
    sourceBriefId,
    sourceItemId: item.sourceBriefId,
    lane,
    decisionId: item.decisionId,
    domain: item.decisionClass,
    patternKey: null,
    safeNextStep: item.safeNextStep,
    evidenceRefs: [...item.provenanceRefs],
    sourceRefs: [item.sourceBriefId],
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null
  });
}

function attentionFromRecurring(
  sourceBriefId: string,
  item: CompanyBrainRecurringLessonItemV1,
  lane: CompanyBrainChiefOfStaffLaneV1
): CompanyBrainChiefOfStaffAttentionItemV1 {
  return deepFreeze({
    attentionId: stableId(["RECURRING_LESSONS", sourceBriefId, item.sourceId, item.patternKey ?? "unknown", lane]),
    sourceKind: "RECURRING_LESSONS",
    sourceBriefId,
    sourceItemId: item.sourceId,
    lane,
    decisionId: null,
    domain: item.domain,
    patternKey: item.patternKey,
    safeNextStep: item.lane,
    evidenceRefs: [...item.evidenceRefs],
    sourceRefs: [...item.sourceLineageIds],
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null
  });
}

function attentionFromMeasurement(
  sourceBriefId: string,
  item: DecisionMeasurementAttentionItemV1,
  lane: CompanyBrainChiefOfStaffLaneV1
): CompanyBrainChiefOfStaffAttentionItemV1 {
  return deepFreeze({
    attentionId: stableId(["MEASUREMENT_ATTENTION", sourceBriefId, item.decisionId, lane]),
    sourceKind: "MEASUREMENT_ATTENTION",
    sourceBriefId,
    sourceItemId: item.decisionId,
    lane,
    decisionId: item.decisionId,
    domain: item.decisionClass,
    patternKey: null,
    safeNextStep: item.safeNextStep,
    evidenceRefs: [...item.evidenceRefs],
    sourceRefs: [...item.sourceRefs],
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null
  });
}

function sortItems(items: readonly CompanyBrainChiefOfStaffAttentionItemV1[]): readonly CompanyBrainChiefOfStaffAttentionItemV1[] {
  return Object.freeze([...items].sort((a, b) => {
    const source = a.sourceKind.localeCompare(b.sourceKind);
    if (source !== 0) return source;
    const subject = (a.decisionId ?? a.patternKey ?? a.sourceItemId).localeCompare(
      b.decisionId ?? b.patternKey ?? b.sourceItemId
    );
    if (subject !== 0) return subject;
    return a.attentionId.localeCompare(b.attentionId);
  }));
}

/**
 * Composes existing canonical Company Brain and decision-measurement briefs into
 * one exception-first internal chief-of-staff packet. The compiler deliberately
 * does not rank unlike review categories or widen any source authority.
 */
export function compileCompanyBrainChiefOfStaffBriefV1(
  input: CompanyBrainChiefOfStaffBriefInputV1
): CompanyBrainChiefOfStaffBriefV1 {
  const generatedAt = canonicalTimestamp(input?.generatedAt);
  if (!generatedAt) throw new Error("COMPANY_BRAIN_CHIEF_OF_STAFF_INVALID_GENERATED_AT");
  const maximumSourceAgeMs = positiveFinite(input?.maximumSourceAgeMs);
  if (maximumSourceAgeMs == null) {
    throw new Error("COMPANY_BRAIN_CHIEF_OF_STAFF_INVALID_FRESHNESS_POLICY");
  }
  const generatedAtMs = Date.parse(generatedAt);
  const reasons = new Set<string>();

  const decisionBriefId = text(input?.decisionHistory?.briefId);
  const recurringBriefId = text(input?.recurringLessons?.briefId);
  const measurementBriefId = text(input?.measurementAttention?.briefId);
  if (!decisionBriefId) reasons.add("DECISION_HISTORY_SOURCE_ID_INVALID");
  if (!recurringBriefId) reasons.add("RECURRING_LESSONS_SOURCE_ID_INVALID");
  if (!measurementBriefId) reasons.add("MEASUREMENT_ATTENTION_SOURCE_ID_INVALID");

  const decisionAge = sourceAge(
    "DECISION_HISTORY",
    input?.decisionHistory?.generatedAt,
    generatedAtMs,
    maximumSourceAgeMs,
    reasons
  );
  const recurringAge = sourceAge(
    "RECURRING_LESSONS",
    input?.recurringLessons?.generatedAt,
    generatedAtMs,
    maximumSourceAgeMs,
    reasons
  );
  const measurementAge = sourceAge(
    "MEASUREMENT_ATTENTION",
    input?.measurementAttention?.compiledAt,
    generatedAtMs,
    maximumSourceAgeMs,
    reasons
  );

  const decisionAccepted = Boolean(decisionBriefId)
    && decisionAge.fresh
    && validateDecisionHistory(input.decisionHistory, reasons);
  const recurringAccepted = Boolean(recurringBriefId)
    && recurringAge.fresh
    && validateRecurringLessons(input.recurringLessons, reasons);
  const measurementAccepted = Boolean(measurementBriefId)
    && measurementAge.fresh
    && validateMeasurementAttention(input.measurementAttention, reasons);

  const verification: CompanyBrainChiefOfStaffAttentionItemV1[] = [];
  const decisionRevisit: CompanyBrainChiefOfStaffAttentionItemV1[] = [];
  const outcomeReview: CompanyBrainChiefOfStaffAttentionItemV1[] = [];
  const measurementNow: CompanyBrainChiefOfStaffAttentionItemV1[] = [];
  const measurementPlanReview: CompanyBrainChiefOfStaffAttentionItemV1[] = [];
  const recurringLessonReview: CompanyBrainChiefOfStaffAttentionItemV1[] = [];
  const recurringEvidenceNeeded: CompanyBrainChiefOfStaffAttentionItemV1[] = [];

  if (decisionAccepted && decisionBriefId) {
    verification.push(...input.decisionHistory.verificationRequired.map((item) =>
      attentionFromDecision(decisionBriefId, item, "VERIFY_DECISION_MEMORY")
    ));
    decisionRevisit.push(...input.decisionHistory.revisitRequired.map((item) =>
      attentionFromDecision(decisionBriefId, item, "REVIEW_DECISION_REVISIT")
    ));
    outcomeReview.push(...input.decisionHistory.outcomeReviewReady.map((item) =>
      attentionFromDecision(decisionBriefId, item, "REVIEW_OBSERVED_OUTCOME")
    ));
  }

  if (recurringAccepted && recurringBriefId) {
    verification.push(...input.recurringLessons.verificationRequired.map((item) =>
      attentionFromRecurring(recurringBriefId, item, "VERIFY_RECURRING_LESSON")
    ));
    recurringLessonReview.push(...input.recurringLessons.reviewCandidates.map((item) =>
      attentionFromRecurring(recurringBriefId, item, "REVIEW_RECURRING_LESSON")
    ));
    recurringEvidenceNeeded.push(...input.recurringLessons.evidenceNeeded.map((item) =>
      attentionFromRecurring(recurringBriefId, item, "GATHER_MORE_INDEPENDENT_EVIDENCE")
    ));
  }

  if (measurementAccepted && measurementBriefId) {
    verification.push(...input.measurementAttention.verificationRequired.map((item) =>
      attentionFromMeasurement(measurementBriefId, item, "VERIFY_DECISION_RECORD")
    ));
    measurementNow.push(...input.measurementAttention.measurementNow.map((item) =>
      attentionFromMeasurement(measurementBriefId, item, "PREPARE_MEASUREMENT_EVIDENCE_REVIEW")
    ));
    measurementPlanReview.push(...input.measurementAttention.measurementPlanMissing.map((item) =>
      attentionFromMeasurement(measurementBriefId, item, "REVIEW_MEASUREMENT_PLAN")
    ));
  }

  const lanes = {
    verification: sortItems(verification),
    decisionRevisit: sortItems(decisionRevisit),
    outcomeReview: sortItems(outcomeReview),
    measurementNow: sortItems(measurementNow),
    measurementPlanReview: sortItems(measurementPlanReview),
    recurringLessonReview: sortItems(recurringLessonReview),
    recurringEvidenceNeeded: sortItems(recurringEvidenceNeeded)
  };
  const allAttention = [
    ...lanes.verification,
    ...lanes.decisionRevisit,
    ...lanes.outcomeReview,
    ...lanes.measurementNow,
    ...lanes.measurementPlanReview,
    ...lanes.recurringLessonReview,
    ...lanes.recurringEvidenceNeeded
  ];
  if (allAttention.length > MAX_ATTENTION_ITEMS) reasons.add("ATTENTION_ITEM_LIMIT_EXCEEDED");
  const attentionIds = allAttention.map((item) => item.attentionId);
  if (new Set(attentionIds).size !== attentionIds.length) reasons.add("DUPLICATE_ATTENTION_ID");

  const evidenceRefs = Object.freeze(
    [...new Set(allAttention.flatMap((item) => item.evidenceRefs))].sort((a, b) => a.localeCompare(b))
  );
  const sourceRefs = Object.freeze(
    [...new Set(allAttention.flatMap((item) => [item.sourceBriefId, ...item.sourceRefs]))].sort((a, b) => a.localeCompare(b))
  );
  const verificationReasons = Object.freeze([...reasons].sort((a, b) => a.localeCompare(b)));
  const sourceHealth = Object.freeze([
    {
      sourceKind: "DECISION_HISTORY" as const,
      sourceBriefId: decisionBriefId,
      sourceState: text(input?.decisionHistory?.state),
      sourceGeneratedAt: decisionAge.generatedAt,
      sourceAgeMs: decisionAge.ageMs,
      accepted: decisionAccepted
    },
    {
      sourceKind: "RECURRING_LESSONS" as const,
      sourceBriefId: recurringBriefId,
      sourceState: text(input?.recurringLessons?.state),
      sourceGeneratedAt: recurringAge.generatedAt,
      sourceAgeMs: recurringAge.ageMs,
      accepted: recurringAccepted
    },
    {
      sourceKind: "MEASUREMENT_ATTENTION" as const,
      sourceBriefId: measurementBriefId,
      sourceState: text(input?.measurementAttention?.state),
      sourceGeneratedAt: measurementAge.generatedAt,
      sourceAgeMs: measurementAge.ageMs,
      accepted: measurementAccepted
    }
  ]);

  const output: CompanyBrainChiefOfStaffBriefV1 = {
    contractVersion: COMPANY_BRAIN_CHIEF_OF_STAFF_BRIEF_VERSION_V1,
    policyVersion: COMPANY_BRAIN_CHIEF_OF_STAFF_BRIEF_POLICY_VERSION_V1,
    briefId: stableId([
      generatedAt,
      String(maximumSourceAgeMs),
      decisionBriefId ?? "missing-decision-history",
      recurringBriefId ?? "missing-recurring-lessons",
      measurementBriefId ?? "missing-measurement-attention",
      ...attentionIds.sort((a, b) => a.localeCompare(b)),
      ...verificationReasons
    ]),
    state: verificationReasons.length === 0 ? "READY" : "VERIFY_SOURCE",
    generatedAt,
    maximumSourceAgeMs,
    sourceHealth,
    verificationReasons,
    ...lanes,
    summary: Object.freeze({
      attentionItems: allAttention.length,
      verification: lanes.verification.length,
      decisionRevisit: lanes.decisionRevisit.length,
      outcomeReview: lanes.outcomeReview.length,
      measurementNow: lanes.measurementNow.length,
      measurementOverdue: measurementAccepted
        ? input.measurementAttention.summary.overdue
        : 0,
      measurementDue: measurementAccepted
        ? input.measurementAttention.summary.due
        : 0,
      measurementPlanReview: lanes.measurementPlanReview.length,
      recurringLessonReview: lanes.recurringLessonReview.length,
      recurringEvidenceNeeded: lanes.recurringEvidenceNeeded.length,
      pricingPatternsForReview: recurringAccepted
        ? input.recurringLessons.summary.pricingPatternsForReview
        : 0,
      negotiationPatternsForReview: recurringAccepted
        ? input.recurringLessons.summary.negotiationPatternsForReview
        : 0,
      decisionsWaitingForOutcome: decisionAccepted
        ? input.decisionHistory.waitingOutcome.length
        : 0,
      measurementsWaitingForWindow: measurementAccepted
        ? input.measurementAttention.waitingWindow.length
        : 0,
      measurementsWaitingForAction: measurementAccepted
        ? input.measurementAttention.waitingAction.length
        : 0,
      measurementCoverageComplete: measurementAccepted
        ? input.measurementAttention.coverageComplete.length
        : 0
    }),
    evidenceRefs,
    sourceRefs,
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    inferredOutcome: null,
    limitations: LIMITATIONS,
    authority: AUTHORITY
  };

  return deepFreeze(output) as CompanyBrainChiefOfStaffBriefV1;
}
