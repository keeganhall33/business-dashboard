import { createHash } from "node:crypto";

import {
  DECISION_MEASUREMENT_QUEUE_POLICY_VERSION_V1,
  DECISION_MEASUREMENT_QUEUE_VERSION_V1,
  type DecisionMeasurementQueueItemV1,
  type DecisionMeasurementQueueStateV1,
  type DecisionMeasurementQueueV1
} from "./decision-measurement-queue-v1";

export const DECISION_MEASUREMENT_ATTENTION_BRIEF_VERSION_V1 =
  "DecisionMeasurementAttentionBriefV1" as const;
export const DECISION_MEASUREMENT_ATTENTION_POLICY_VERSION_V1 =
  "decision_measurement_attention_brief_v1.0.0" as const;

const MAX_ITEMS = 500;
const MAX_REFS = 500;

export type DecisionMeasurementAttentionBriefStateV1 = "READY" | "VERIFY_SOURCE";

export type DecisionMeasurementAttentionNextStepV1 =
  | "PREPARE_MEASUREMENT_EVIDENCE_REVIEW"
  | "VERIFY_DECISION_RECORD"
  | "REVIEW_MEASUREMENT_PLAN"
  | "WAIT_FOR_RECORDED_MEASUREMENT_WINDOW"
  | "WAIT_FOR_ACTION_EVIDENCE"
  | "NO_MEASUREMENT_COVERAGE_ACTION";

export type DecisionMeasurementAttentionItemV1 = Readonly<{
  decisionId: string;
  decisionClass: DecisionMeasurementQueueItemV1["decisionClass"];
  measurementState: DecisionMeasurementQueueStateV1;
  reasonCodes: readonly string[];
  pendingOutcomeIds: readonly string[];
  overdueOutcomeIds: readonly string[];
  nextMeasurementAt: string | null;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  safeNextStep: DecisionMeasurementAttentionNextStepV1;
  causalInterpretation: "NOT_ESTABLISHED";
  outcomeInterpretation: "MEASUREMENT_COVERAGE_ONLY";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
}>;

export type DecisionMeasurementAttentionBriefV1 = Readonly<{
  contractVersion: typeof DECISION_MEASUREMENT_ATTENTION_BRIEF_VERSION_V1;
  policyVersion: typeof DECISION_MEASUREMENT_ATTENTION_POLICY_VERSION_V1;
  briefId: string;
  state: DecisionMeasurementAttentionBriefStateV1;
  compiledAt: string;
  sourceGeneratedAt: string;
  sourceAgeMs: number;
  verificationReasons: readonly string[];
  measurementNow: readonly DecisionMeasurementAttentionItemV1[];
  verificationRequired: readonly DecisionMeasurementAttentionItemV1[];
  measurementPlanMissing: readonly DecisionMeasurementAttentionItemV1[];
  waitingWindow: readonly DecisionMeasurementAttentionItemV1[];
  waitingAction: readonly DecisionMeasurementAttentionItemV1[];
  coverageComplete: readonly DecisionMeasurementAttentionItemV1[];
  summary: Readonly<{
    total: number;
    measurementNow: number;
    overdue: number;
    due: number;
    verificationRequired: number;
    measurementPlanMissing: number;
    waitingWindow: number;
    waitingAction: number;
    coverageComplete: number;
  }>;
  causalInterpretation: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
  inferredOutcome: null;
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    persistenceAuthorized: false;
    measurementExecutionAuthorized: false;
    evidenceCollectionAuthorized: false;
    decisionMutationAuthorized: false;
    portfolioMutationAuthorized: false;
    reallocationAuthorized: false;
    policyPromotionAuthorized: false;
    pricingChangeAuthorized: false;
    negotiationActionAuthorized: false;
    campaignExecutionAuthorized: false;
    experimentExecutionAuthorized: false;
    externalActionAuthorized: false;
    approvalBypassAuthorized: false;
  }>;
}>;

export type DecisionMeasurementAttentionBriefInputV1 = Readonly<{
  queue: DecisionMeasurementQueueV1;
  compiledAt: string;
  maximumQueueAgeMs: number;
}>;

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  persistenceAuthorized: false as const,
  measurementExecutionAuthorized: false as const,
  evidenceCollectionAuthorized: false as const,
  decisionMutationAuthorized: false as const,
  portfolioMutationAuthorized: false as const,
  reallocationAuthorized: false as const,
  policyPromotionAuthorized: false as const,
  pricingChangeAuthorized: false as const,
  negotiationActionAuthorized: false as const,
  campaignExecutionAuthorized: false as const,
  experimentExecutionAuthorized: false as const,
  externalActionAuthorized: false as const,
  approvalBypassAuthorized: false as const
});

const LIMITATIONS = Object.freeze([
  "This brief summarizes canonical measurement-window coverage only; it does not measure an outcome, judge success or failure, or establish business impact.",
  "DUE and OVERDUE reflect the recorded evaluation window plus the caller-owned queue grace policy. They are not model-generated urgency, priority, or economic value.",
  "COMPLETE means only that expected outcome ids have post-window observations. It does not establish decision-grade assessment, attribution, learning, or a reallocation instruction.",
  "No confidence, monetary value, causal interpretation, missing outcome, owner, or execution authority is synthesized by this brief.",
  "Safe next steps describe bounded internal review posture only and do not authorize evidence collection, provider calls, persistence, or external action."
] as const);

const CANONICAL_REASON_BY_STATE: Readonly<Partial<Record<DecisionMeasurementQueueStateV1, string>>> =
  Object.freeze({
    WAITING_ACTION: "ACTION_NOT_OBSERVED",
    WAITING_WINDOW: "WINDOW_NOT_ENDED",
    DUE: "MEASUREMENT_DUE",
    OVERDUE: "MEASUREMENT_OVERDUE",
    COMPLETE: "ALL_EXPECTED_OUTCOMES_OBSERVED",
    NO_MEASUREMENT_PLAN: "NO_EXPECTED_OUTCOMES"
  });

function canonicalTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  const canonical = new Date(milliseconds).toISOString();
  return canonical === value ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function boundedUniqueStrings(value: unknown, maximum = MAX_REFS): readonly string[] | null {
  if (!Array.isArray(value) || value.length > maximum) return null;
  const normalized: string[] = [];
  for (const candidate of value) {
    const item = text(candidate);
    if (!item) return null;
    normalized.push(item);
  }
  if (new Set(normalized).size !== normalized.length) return null;
  return Object.freeze([...normalized].sort((a, b) => a.localeCompare(b)));
}

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value as Readonly<T>;
}

function stableId(parts: readonly string[]): string {
  return `decision-measurement-attention:${createHash("sha256")
    .update(parts.join("\u0000"))
    .digest("hex")
    .slice(0, 20)}`;
}

function sourceAuthorityHolds(queue: DecisionMeasurementQueueV1): boolean {
  return queue.authority?.persistenceAllowed === false
    && queue.authority.measurementExecutionAllowed === false
    && queue.authority.portfolioMutationAllowed === false
    && queue.authority.reallocationAllowed === false
    && queue.authority.policyPromotionAllowed === false
    && queue.authority.pricingChangeAllowed === false
    && queue.authority.negotiationActionAllowed === false
    && queue.authority.campaignExecutionAllowed === false
    && queue.authority.experimentExecutionAllowed === false
    && queue.authority.externalActionAllowed === false
    && queue.authority.approvalBypassAllowed === false;
}

function nextStepFor(state: DecisionMeasurementQueueStateV1): DecisionMeasurementAttentionNextStepV1 {
  if (state === "DUE" || state === "OVERDUE") return "PREPARE_MEASUREMENT_EVIDENCE_REVIEW";
  if (state === "VERIFY_RECORD") return "VERIFY_DECISION_RECORD";
  if (state === "NO_MEASUREMENT_PLAN") return "REVIEW_MEASUREMENT_PLAN";
  if (state === "WAITING_WINDOW") return "WAIT_FOR_RECORDED_MEASUREMENT_WINDOW";
  if (state === "WAITING_ACTION") return "WAIT_FOR_ACTION_EVIDENCE";
  return "NO_MEASUREMENT_COVERAGE_ACTION";
}

function itemSort(a: DecisionMeasurementAttentionItemV1, b: DecisionMeasurementAttentionItemV1): number {
  const aNext = a.nextMeasurementAt ? Date.parse(a.nextMeasurementAt) : Number.POSITIVE_INFINITY;
  const bNext = b.nextMeasurementAt ? Date.parse(b.nextMeasurementAt) : Number.POSITIVE_INFINITY;
  if (aNext !== bNext) return aNext - bNext;
  return a.decisionId.localeCompare(b.decisionId);
}

function validateAndProjectItem(
  item: DecisionMeasurementQueueItemV1,
  sourceGeneratedAtMs: number,
  verificationReasons: Set<string>
): DecisionMeasurementAttentionItemV1 | null {
  const decisionId = text(item?.decisionId);
  const reasonCodes = boundedUniqueStrings(item?.reasonCodes);
  const expectedOutcomeIds = boundedUniqueStrings(item?.expectedOutcomeIds);
  const observedOutcomeIds = boundedUniqueStrings(item?.observedOutcomeIds);
  const pendingOutcomeIds = boundedUniqueStrings(item?.pendingOutcomeIds);
  const overdueOutcomeIds = boundedUniqueStrings(item?.overdueOutcomeIds);
  const evidenceRefs = boundedUniqueStrings(item?.evidenceRefs);
  const sourceRefs = boundedUniqueStrings(item?.sourceRefs);

  if (
    !decisionId
    || !reasonCodes
    || !expectedOutcomeIds
    || !observedOutcomeIds
    || !pendingOutcomeIds
    || !overdueOutcomeIds
    || !evidenceRefs
    || !sourceRefs
  ) {
    verificationReasons.add("MALFORMED_QUEUE_ITEM");
    return null;
  }

  if (item.causalInterpretation !== "NOT_ESTABLISHED") {
    verificationReasons.add(`CAUSALITY_INVARIANT_FAILED:${decisionId}`);
  }
  if (item.outcomeStatusInterpretation !== "MEASUREMENT_COVERAGE_ONLY") {
    verificationReasons.add(`OUTCOME_INTERPRETATION_INVARIANT_FAILED:${decisionId}`);
  }

  const canonicalReason = CANONICAL_REASON_BY_STATE[item.state];
  if (
    (canonicalReason && (reasonCodes.length !== 1 || reasonCodes[0] !== canonicalReason))
    || (item.state === "VERIFY_RECORD" && reasonCodes.length === 0)
  ) {
    verificationReasons.add(`STATE_REASON_MISMATCH:${decisionId}`);
  }

  const pendingSet = new Set(pendingOutcomeIds);
  const expectedSet = new Set(expectedOutcomeIds);
  if (pendingOutcomeIds.some((id) => !expectedSet.has(id))) {
    verificationReasons.add(`PENDING_OUTCOME_NOT_EXPECTED:${decisionId}`);
  }
  if (overdueOutcomeIds.some((id) => !pendingSet.has(id))) {
    verificationReasons.add(`OVERDUE_OUTCOME_NOT_PENDING:${decisionId}`);
  }

  const nextMeasurementAt = item.nextMeasurementAt === null
    ? null
    : canonicalTimestamp(item.nextMeasurementAt);
  if (item.nextMeasurementAt !== null && !nextMeasurementAt) {
    verificationReasons.add(`INVALID_NEXT_MEASUREMENT_TIME:${decisionId}`);
  }

  if (item.state === "WAITING_WINDOW") {
    if (!nextMeasurementAt || Date.parse(nextMeasurementAt) <= sourceGeneratedAtMs || overdueOutcomeIds.length > 0) {
      verificationReasons.add(`WAITING_WINDOW_INVARIANT_FAILED:${decisionId}`);
    }
  } else if (item.state === "DUE") {
    if (!nextMeasurementAt || Date.parse(nextMeasurementAt) > sourceGeneratedAtMs || overdueOutcomeIds.length > 0) {
      verificationReasons.add(`DUE_INVARIANT_FAILED:${decisionId}`);
    }
  } else if (item.state === "OVERDUE") {
    if (!nextMeasurementAt || Date.parse(nextMeasurementAt) > sourceGeneratedAtMs || overdueOutcomeIds.length === 0) {
      verificationReasons.add(`OVERDUE_INVARIANT_FAILED:${decisionId}`);
    }
  } else if (item.state === "COMPLETE") {
    if (pendingOutcomeIds.length > 0 || overdueOutcomeIds.length > 0 || nextMeasurementAt !== null) {
      verificationReasons.add(`COMPLETE_INVARIANT_FAILED:${decisionId}`);
    }
  } else if (item.state === "NO_MEASUREMENT_PLAN") {
    if (expectedOutcomeIds.length > 0 || pendingOutcomeIds.length > 0 || nextMeasurementAt !== null) {
      verificationReasons.add(`NO_PLAN_INVARIANT_FAILED:${decisionId}`);
    }
  } else if (item.state === "WAITING_ACTION" && nextMeasurementAt !== null) {
    verificationReasons.add(`WAITING_ACTION_INVARIANT_FAILED:${decisionId}`);
  }

  return freezeDeep({
    decisionId,
    decisionClass: item.decisionClass,
    measurementState: item.state,
    reasonCodes,
    pendingOutcomeIds,
    overdueOutcomeIds,
    nextMeasurementAt,
    evidenceRefs,
    sourceRefs,
    safeNextStep: nextStepFor(item.state),
    causalInterpretation: "NOT_ESTABLISHED",
    outcomeInterpretation: "MEASUREMENT_COVERAGE_ONLY",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null
  });
}

function summaryMatches(queue: DecisionMeasurementQueueV1): boolean {
  const counts = {
    waitingAction: 0,
    waitingWindow: 0,
    due: 0,
    overdue: 0,
    complete: 0,
    noMeasurementPlan: 0,
    verifyRecord: 0
  };
  for (const item of queue.items) {
    if (item.state === "WAITING_ACTION") counts.waitingAction += 1;
    else if (item.state === "WAITING_WINDOW") counts.waitingWindow += 1;
    else if (item.state === "DUE") counts.due += 1;
    else if (item.state === "OVERDUE") counts.overdue += 1;
    else if (item.state === "COMPLETE") counts.complete += 1;
    else if (item.state === "NO_MEASUREMENT_PLAN") counts.noMeasurementPlan += 1;
    else if (item.state === "VERIFY_RECORD") counts.verifyRecord += 1;
  }
  return queue.summary?.total === queue.items.length
    && queue.summary.waitingAction === counts.waitingAction
    && queue.summary.waitingWindow === counts.waitingWindow
    && queue.summary.due === counts.due
    && queue.summary.overdue === counts.overdue
    && queue.summary.complete === counts.complete
    && queue.summary.noMeasurementPlan === counts.noMeasurementPlan
    && queue.summary.verifyRecord === counts.verifyRecord;
}

export function compileDecisionMeasurementAttentionBriefV1(
  input: DecisionMeasurementAttentionBriefInputV1
): DecisionMeasurementAttentionBriefV1 {
  const queue = input?.queue;
  const compiledAt = canonicalTimestamp(input?.compiledAt);
  const sourceGeneratedAt = canonicalTimestamp(queue?.generatedAt);
  const maximumQueueAgeMs = typeof input?.maximumQueueAgeMs === "number"
    ? input.maximumQueueAgeMs
    : Number.NaN;
  const verificationReasons = new Set<string>();

  if (!compiledAt) verificationReasons.add("INVALID_COMPILED_AT");
  if (!sourceGeneratedAt) verificationReasons.add("INVALID_SOURCE_GENERATED_AT");
  if (!Number.isFinite(maximumQueueAgeMs) || maximumQueueAgeMs <= 0) {
    verificationReasons.add("INVALID_MAXIMUM_QUEUE_AGE");
  }
  if (
    queue?.contractVersion !== DECISION_MEASUREMENT_QUEUE_VERSION_V1
    || queue?.policyVersion !== DECISION_MEASUREMENT_QUEUE_POLICY_VERSION_V1
  ) {
    verificationReasons.add("SOURCE_CONTRACT_INVALID");
  }
  if (!queue || !Array.isArray(queue.items) || queue.items.length > MAX_ITEMS) {
    verificationReasons.add("SOURCE_ITEMS_INVALID");
  }
  if (queue && !sourceAuthorityHolds(queue)) verificationReasons.add("SOURCE_AUTHORITY_INVARIANT_FAILED");
  if (queue && !summaryMatches(queue)) verificationReasons.add("SOURCE_SUMMARY_MISMATCH");

  let sourceAgeMs = 0;
  if (compiledAt && sourceGeneratedAt) {
    sourceAgeMs = Date.parse(compiledAt) - Date.parse(sourceGeneratedAt);
    if (sourceAgeMs < 0) verificationReasons.add("SOURCE_IN_FUTURE");
    else if (Number.isFinite(maximumQueueAgeMs) && maximumQueueAgeMs > 0 && sourceAgeMs > maximumQueueAgeMs) {
      verificationReasons.add("SOURCE_STALE");
    }
  }

  const projected: DecisionMeasurementAttentionItemV1[] = [];
  const seenDecisionIds = new Set<string>();
  if (queue && Array.isArray(queue.items) && queue.items.length <= MAX_ITEMS && sourceGeneratedAt) {
    const sourceGeneratedAtMs = Date.parse(sourceGeneratedAt);
    for (const item of queue.items) {
      const projection = validateAndProjectItem(item, sourceGeneratedAtMs, verificationReasons);
      if (!projection) continue;
      if (seenDecisionIds.has(projection.decisionId)) {
        verificationReasons.add(`DUPLICATE_DECISION_ID:${projection.decisionId}`);
      }
      seenDecisionIds.add(projection.decisionId);
      projected.push(projection);
    }
  }

  const sorted = [...projected].sort(itemSort);
  const measurementNow = Object.freeze(sorted.filter((item) => item.measurementState === "OVERDUE" || item.measurementState === "DUE"));
  const verificationRequired = Object.freeze(sorted.filter((item) => item.measurementState === "VERIFY_RECORD"));
  const measurementPlanMissing = Object.freeze(sorted.filter((item) => item.measurementState === "NO_MEASUREMENT_PLAN"));
  const waitingWindow = Object.freeze(sorted.filter((item) => item.measurementState === "WAITING_WINDOW"));
  const waitingAction = Object.freeze(sorted.filter((item) => item.measurementState === "WAITING_ACTION"));
  const coverageComplete = Object.freeze(sorted.filter((item) => item.measurementState === "COMPLETE"));
  const reasons = Object.freeze([...verificationReasons].sort((a, b) => a.localeCompare(b)));
  const state: DecisionMeasurementAttentionBriefStateV1 = reasons.length === 0 ? "READY" : "VERIFY_SOURCE";

  return freezeDeep({
    contractVersion: DECISION_MEASUREMENT_ATTENTION_BRIEF_VERSION_V1,
    policyVersion: DECISION_MEASUREMENT_ATTENTION_POLICY_VERSION_V1,
    briefId: stableId([
      sourceGeneratedAt ?? "invalid-source-time",
      compiledAt ?? "invalid-compiled-time",
      ...sorted.map((item) => `${item.decisionId}:${item.measurementState}`)
    ]),
    state,
    compiledAt: compiledAt ?? input?.compiledAt ?? "",
    sourceGeneratedAt: sourceGeneratedAt ?? queue?.generatedAt ?? "",
    sourceAgeMs,
    verificationReasons: reasons,
    measurementNow,
    verificationRequired,
    measurementPlanMissing,
    waitingWindow,
    waitingAction,
    coverageComplete,
    summary: {
      total: sorted.length,
      measurementNow: measurementNow.length,
      overdue: measurementNow.filter((item) => item.measurementState === "OVERDUE").length,
      due: measurementNow.filter((item) => item.measurementState === "DUE").length,
      verificationRequired: verificationRequired.length,
      measurementPlanMissing: measurementPlanMissing.length,
      waitingWindow: waitingWindow.length,
      waitingAction: waitingAction.length,
      coverageComplete: coverageComplete.length
    },
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    inferredOutcome: null,
    limitations: LIMITATIONS,
    authority: AUTHORITY
  });
}
