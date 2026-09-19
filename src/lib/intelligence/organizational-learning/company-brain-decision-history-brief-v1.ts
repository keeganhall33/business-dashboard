import { createHash } from "node:crypto";

import {
  DECISION_MEMORY_BRIEF_POLICY_VERSION_V1,
  type DecisionMemoryBriefV1,
  type DecisionMemoryFieldChangeV1,
  type DecisionMemoryRevisitSignalV1
} from "./decision-memory-brief-v1";

export const COMPANY_BRAIN_DECISION_HISTORY_BRIEF_VERSION_V1 =
  "CompanyBrainDecisionHistoryBriefV1" as const;
export const COMPANY_BRAIN_DECISION_HISTORY_BRIEF_POLICY_VERSION_V1 =
  "company_brain_decision_history_brief_v1.0.0" as const;

const MAX_BRIEFS = 500;
const MAX_REFS = 2_000;
const MAX_SIGNALS = 500;

export type CompanyBrainDecisionHistoryBriefStateV1 = "READY" | "VERIFY_SOURCE";

export type CompanyBrainDecisionHistoryNextStepV1 =
  | "VERIFY_DECISION_MEMORY"
  | "REVIEW_DECISION_REVISIT"
  | "REVIEW_OBSERVED_OUTCOME"
  | "WAIT_FOR_RECORDED_OUTCOME";

export type CompanyBrainDecisionHistoryItemV1 = Readonly<{
  sourceBriefId: string;
  decisionId: string;
  decisionClass: DecisionMemoryBriefV1["decisionClass"];
  decidedAt: string;
  sourceGeneratedAt: string;
  sourceAgeMs: number;
  sourceState: DecisionMemoryBriefV1["state"];
  lineageState: DecisionMemoryBriefV1["lineageState"];
  freshnessState: DecisionMemoryBriefV1["freshnessState"];
  selectedAlternativeId: string;
  selectedAlternativeLabel: string | null;
  rationale: DecisionMemoryBriefV1["rationale"];
  sourceConfidence: DecisionMemoryBriefV1["confidence"];
  approvalState: DecisionMemoryBriefV1["approval"]["approvalState"];
  actionState: DecisionMemoryBriefV1["actionState"];
  outcomeState: DecisionMemoryBriefV1["outcome"]["state"];
  outcomeObservedAt: string | null;
  outcomeAssessment: DecisionMemoryBriefV1["outcome"]["assessment"];
  recordedAttributionClass: DecisionMemoryBriefV1["outcome"]["attributionClass"];
  confounderCount: number;
  changesSincePrior: readonly DecisionMemoryFieldChangeV1[];
  revisitSignals: readonly DecisionMemoryRevisitSignalV1[];
  provenanceRefs: readonly string[];
  integrityFlags: readonly string[];
  safeNextStep: CompanyBrainDecisionHistoryNextStepV1;
  causalInterpretation: "NOT_ESTABLISHED";
  monetaryValue: null;
}>;

export type CompanyBrainDecisionHistoryBriefV1 = Readonly<{
  contractVersion: typeof COMPANY_BRAIN_DECISION_HISTORY_BRIEF_VERSION_V1;
  policyVersion: typeof COMPANY_BRAIN_DECISION_HISTORY_BRIEF_POLICY_VERSION_V1;
  briefId: string;
  state: CompanyBrainDecisionHistoryBriefStateV1;
  generatedAt: string;
  maximumSourceAgeMs: number;
  verificationReasons: readonly string[];
  rejectedDecisionIds: readonly string[];
  timeline: readonly CompanyBrainDecisionHistoryItemV1[];
  verificationRequired: readonly CompanyBrainDecisionHistoryItemV1[];
  revisitRequired: readonly CompanyBrainDecisionHistoryItemV1[];
  outcomeReviewReady: readonly CompanyBrainDecisionHistoryItemV1[];
  waitingOutcome: readonly CompanyBrainDecisionHistoryItemV1[];
  summary: Readonly<{
    supplied: number;
    accepted: number;
    rejected: number;
    verificationRequired: number;
    revisitRequired: number;
    outcomeReviewReady: number;
    waitingOutcome: number;
    observedOutcomes: number;
    lineageChangeEvents: number;
  }>;
  evidenceRefs: readonly string[];
  sourceDecisionIds: readonly string[];
  causalInterpretation: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    persistenceAuthorized: false;
    decisionMutationAuthorized: false;
    learningPromotionAuthorized: false;
    policyPromotionAuthorized: false;
    reallocationAuthorized: false;
    pricingChangeAuthorized: false;
    negotiationActionAuthorized: false;
    campaignExecutionAuthorized: false;
    experimentExecutionAuthorized: false;
    externalActionAuthorized: false;
    approvalBypassAuthorized: false;
  }>;
}>;

export type CompanyBrainDecisionHistoryBriefInputV1 = Readonly<{
  briefs: readonly DecisionMemoryBriefV1[];
  generatedAt: string;
  maximumSourceAgeMs: number;
}>;

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  persistenceAuthorized: false as const,
  decisionMutationAuthorized: false as const,
  learningPromotionAuthorized: false as const,
  policyPromotionAuthorized: false as const,
  reallocationAuthorized: false as const,
  pricingChangeAuthorized: false as const,
  negotiationActionAuthorized: false as const,
  campaignExecutionAuthorized: false as const,
  experimentExecutionAuthorized: false as const,
  externalActionAuthorized: false as const,
  approvalBypassAuthorized: false as const
});

const LIMITATIONS = Object.freeze([
  "This brief is a read-only projection of canonical DecisionMemoryBriefV1 records. It does not create or update durable memory.",
  "Revisit, verification, outcome-review, and waiting states are routing labels over recorded source facts. They are not economic priority, urgency, success, failure, or causal judgments.",
  "Source confidence and recorded attribution classes are preserved exactly. This brief never synthesizes confidence, monetary value, causality, or a future outcome.",
  "No decision, lesson, policy, portfolio allocation, price, negotiation, campaign, experiment, or external action is authorized by this brief."
] as const);

const SOURCE_AUTHORITY_KEYS = Object.freeze([
  "analysisOnly",
  "persistenceAuthorized",
  "externalActionAuthorized",
  "pricingChangeAuthorized",
  "negotiationAuthorized",
  "spendAuthorized",
  "publishAuthorized",
  "approvalBypassAuthorized"
] as const);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function canonicalTimestamp(value: unknown): string | null {
  const normalized = text(value);
  if (!normalized) return null;
  const millis = Date.parse(normalized);
  if (!Number.isFinite(millis)) return null;
  const canonical = new Date(millis).toISOString();
  return canonical === normalized ? normalized : null;
}

function positiveFinite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
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

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value as Readonly<T>;
}

function stableId(parts: readonly string[]): string {
  return `company-brain-decision-history:${createHash("sha256")
    .update(parts.join("\u0000"))
    .digest("hex")
    .slice(0, 20)}`;
}

function sourceAuthorityHolds(brief: DecisionMemoryBriefV1): boolean {
  const authority = brief.actionAuthority as unknown as Record<string, unknown>;
  const keys = Object.keys(authority).sort((a, b) => a.localeCompare(b));
  const expectedKeys = [...SOURCE_AUTHORITY_KEYS].sort((a, b) => a.localeCompare(b));
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index])
  ) {
    return false;
  }
  return authority.analysisOnly === true
    && authority.persistenceAuthorized === false
    && authority.externalActionAuthorized === false
    && authority.pricingChangeAuthorized === false
    && authority.negotiationAuthorized === false
    && authority.spendAuthorized === false
    && authority.publishAuthorized === false
    && authority.approvalBypassAuthorized === false;
}

function safeNextStepFor(brief: DecisionMemoryBriefV1): CompanyBrainDecisionHistoryNextStepV1 {
  if (
    brief.state === "VERIFY_INTEGRITY"
    || brief.state === "VERIFY_LINEAGE"
    || brief.integrityFlags.length > 0
    || brief.freshnessState === "FUTURE_RECORD"
    || brief.outcome.state === "OBSERVED_NEEDS_VERIFICATION"
  ) {
    return "VERIFY_DECISION_MEMORY";
  }
  if (
    brief.state === "REVIEW_REQUIRED"
    || brief.freshnessState === "EXPIRED"
    || brief.revisitSignals.length > 0
  ) {
    return "REVIEW_DECISION_REVISIT";
  }
  if (brief.outcome.state === "OBSERVED") return "REVIEW_OBSERVED_OUTCOME";
  return "WAIT_FOR_RECORDED_OUTCOME";
}

function itemSort(a: CompanyBrainDecisionHistoryItemV1, b: CompanyBrainDecisionHistoryItemV1): number {
  const timeDelta = Date.parse(b.decidedAt) - Date.parse(a.decidedAt);
  if (timeDelta !== 0) return timeDelta;
  return a.decisionId.localeCompare(b.decisionId);
}

function projectBrief(
  brief: DecisionMemoryBriefV1,
  generatedAtMs: number,
  maximumSourceAgeMs: number,
  verificationReasons: Set<string>
): CompanyBrainDecisionHistoryItemV1 | null {
  const sourceBriefId = text(brief?.briefId);
  const decisionId = text(brief?.decisionId);
  if (!sourceBriefId || !decisionId) {
    verificationReasons.add("SOURCE_ID_MISSING");
    return null;
  }
  if (
    brief.contractVersion !== "DecisionMemoryBriefV1"
    || brief.policyVersion !== DECISION_MEMORY_BRIEF_POLICY_VERSION_V1
  ) {
    verificationReasons.add(`SOURCE_CONTRACT_INVALID:${decisionId}`);
    return null;
  }
  if (!sourceAuthorityHolds(brief)) {
    verificationReasons.add(`SOURCE_AUTHORITY_WIDENED:${decisionId}`);
    return null;
  }
  if (brief.outcome?.causalityClaimedByBrief !== false) {
    verificationReasons.add(`SOURCE_CAUSALITY_INVARIANT_FAILED:${decisionId}`);
    return null;
  }

  const sourceGeneratedAt = canonicalTimestamp(brief.generatedAt);
  const decidedAt = canonicalTimestamp(brief.decidedAt);
  if (!sourceGeneratedAt || !decidedAt) {
    verificationReasons.add(`SOURCE_TIMESTAMP_INVALID:${decisionId}`);
    return null;
  }
  const sourceGeneratedAtMs = Date.parse(sourceGeneratedAt);
  const decidedAtMs = Date.parse(decidedAt);
  if (sourceGeneratedAtMs > generatedAtMs || decidedAtMs > sourceGeneratedAtMs) {
    verificationReasons.add(`SOURCE_CHRONOLOGY_INVALID:${decisionId}`);
    return null;
  }
  const sourceAgeMs = generatedAtMs - sourceGeneratedAtMs;
  if (sourceAgeMs > maximumSourceAgeMs) {
    verificationReasons.add(`SOURCE_BRIEF_STALE:${decisionId}`);
    return null;
  }

  const provenanceRefs = boundedUniqueStrings(brief.provenanceRefs);
  const integrityFlags = boundedUniqueStrings(brief.integrityFlags, MAX_SIGNALS);
  if (!provenanceRefs || !integrityFlags) {
    verificationReasons.add(`SOURCE_REFERENCES_INVALID:${decisionId}`);
    return null;
  }
  if (!Array.isArray(brief.changesSincePrior) || brief.changesSincePrior.length > MAX_SIGNALS) {
    verificationReasons.add(`SOURCE_CHANGES_INVALID:${decisionId}`);
    return null;
  }
  if (!Array.isArray(brief.revisitSignals) || brief.revisitSignals.length > MAX_SIGNALS) {
    verificationReasons.add(`SOURCE_REVISIT_SIGNALS_INVALID:${decisionId}`);
    return null;
  }

  const outcomeObservedAt = brief.outcome.observedAt == null
    ? null
    : canonicalTimestamp(brief.outcome.observedAt);
  if (
    brief.outcome.observedAt != null
    && (
      !outcomeObservedAt
      || Date.parse(outcomeObservedAt) < decidedAtMs
      || Date.parse(outcomeObservedAt) > sourceGeneratedAtMs
    )
  ) {
    verificationReasons.add(`SOURCE_OUTCOME_CHRONOLOGY_INVALID:${decisionId}`);
    return null;
  }

  const item: CompanyBrainDecisionHistoryItemV1 = {
    sourceBriefId,
    decisionId,
    decisionClass: brief.decisionClass,
    decidedAt,
    sourceGeneratedAt,
    sourceAgeMs,
    sourceState: brief.state,
    lineageState: brief.lineageState,
    freshnessState: brief.freshnessState,
    selectedAlternativeId: brief.selectedAlternativeId,
    selectedAlternativeLabel: brief.selectedAlternativeLabel,
    rationale: structuredClone(brief.rationale),
    sourceConfidence: structuredClone(brief.confidence),
    approvalState: brief.approval.approvalState,
    actionState: brief.actionState,
    outcomeState: brief.outcome.state,
    outcomeObservedAt,
    outcomeAssessment: brief.outcome.assessment == null ? null : structuredClone(brief.outcome.assessment),
    recordedAttributionClass: brief.outcome.attributionClass,
    confounderCount: brief.outcome.confounderCount,
    changesSincePrior: structuredClone(brief.changesSincePrior),
    revisitSignals: structuredClone(brief.revisitSignals),
    provenanceRefs,
    integrityFlags,
    safeNextStep: safeNextStepFor(brief),
    causalInterpretation: "NOT_ESTABLISHED",
    monetaryValue: null
  };

  return deepFreeze(item) as CompanyBrainDecisionHistoryItemV1;
}

/**
 * Produces an exception-first Company Brain view over canonical decision-memory
 * briefs. The compiler preserves recorded rationale, source confidence,
 * attribution, lineage changes, outcomes, and revisit signals, while refusing
 * to infer causality, value, success/failure, priority, or execution authority.
 */
export function compileCompanyBrainDecisionHistoryBriefV1(
  input: CompanyBrainDecisionHistoryBriefInputV1
): CompanyBrainDecisionHistoryBriefV1 {
  const generatedAt = canonicalTimestamp(input?.generatedAt);
  if (!generatedAt) throw new Error("COMPANY_BRAIN_DECISION_HISTORY_INVALID_GENERATED_AT");
  const generatedAtMs = Date.parse(generatedAt);

  const maximumSourceAgeMs = positiveFinite(input?.maximumSourceAgeMs);
  if (maximumSourceAgeMs == null) {
    throw new Error("COMPANY_BRAIN_DECISION_HISTORY_INVALID_SOURCE_AGE_POLICY");
  }
  if (!Array.isArray(input?.briefs) || input.briefs.length > MAX_BRIEFS) {
    throw new Error("COMPANY_BRAIN_DECISION_HISTORY_INVALID_BRIEF_SET");
  }

  const verificationReasons = new Set<string>();
  const duplicateDecisionIds = new Set<string>();
  const duplicateBriefIds = new Set<string>();
  const decisionCounts = new Map<string, number>();
  const briefCounts = new Map<string, number>();

  for (const brief of input.briefs) {
    const decisionId = text(brief?.decisionId);
    const briefId = text(brief?.briefId);
    if (decisionId) decisionCounts.set(decisionId, (decisionCounts.get(decisionId) ?? 0) + 1);
    if (briefId) briefCounts.set(briefId, (briefCounts.get(briefId) ?? 0) + 1);
  }
  for (const [decisionId, count] of decisionCounts) if (count > 1) duplicateDecisionIds.add(decisionId);
  for (const [briefId, count] of briefCounts) if (count > 1) duplicateBriefIds.add(briefId);
  for (const decisionId of duplicateDecisionIds) verificationReasons.add(`DUPLICATE_DECISION_ID:${decisionId}`);
  for (const briefId of duplicateBriefIds) verificationReasons.add(`DUPLICATE_SOURCE_BRIEF_ID:${briefId}`);

  const accepted: CompanyBrainDecisionHistoryItemV1[] = [];
  const rejectedDecisionIds = new Set<string>();
  for (const brief of input.briefs) {
    const decisionId = text(brief?.decisionId);
    const briefId = text(brief?.briefId);
    if (
      (decisionId && duplicateDecisionIds.has(decisionId))
      || (briefId && duplicateBriefIds.has(briefId))
    ) {
      if (decisionId) rejectedDecisionIds.add(decisionId);
      continue;
    }
    const before = verificationReasons.size;
    const projected = projectBrief(brief, generatedAtMs, maximumSourceAgeMs, verificationReasons);
    if (projected) accepted.push(projected);
    else if (decisionId) rejectedDecisionIds.add(decisionId);
    else if (verificationReasons.size === before) verificationReasons.add("SOURCE_REJECTED");
  }

  const timeline = Object.freeze([...accepted].sort(itemSort));
  const verificationRequired = Object.freeze(
    timeline.filter((item) => item.safeNextStep === "VERIFY_DECISION_MEMORY")
  );
  const revisitRequired = Object.freeze(
    timeline.filter((item) => item.safeNextStep === "REVIEW_DECISION_REVISIT")
  );
  const outcomeReviewReady = Object.freeze(
    timeline.filter((item) => item.safeNextStep === "REVIEW_OBSERVED_OUTCOME")
  );
  const waitingOutcome = Object.freeze(
    timeline.filter((item) => item.safeNextStep === "WAIT_FOR_RECORDED_OUTCOME")
  );

  const evidenceRefs = Object.freeze(
    [...new Set(timeline.flatMap((item) => item.provenanceRefs))].sort((a, b) => a.localeCompare(b))
  );
  const sourceDecisionIds = Object.freeze(
    [...new Set(timeline.map((item) => item.decisionId))].sort((a, b) => a.localeCompare(b))
  );
  const reasons = Object.freeze([...verificationReasons].sort((a, b) => a.localeCompare(b)));
  const rejected = Object.freeze([...rejectedDecisionIds].sort((a, b) => a.localeCompare(b)));

  const output: CompanyBrainDecisionHistoryBriefV1 = {
    contractVersion: COMPANY_BRAIN_DECISION_HISTORY_BRIEF_VERSION_V1,
    policyVersion: COMPANY_BRAIN_DECISION_HISTORY_BRIEF_POLICY_VERSION_V1,
    briefId: stableId([
      generatedAt,
      String(maximumSourceAgeMs),
      ...sourceDecisionIds,
      ...timeline.map((item) => item.sourceBriefId),
      ...reasons
    ]),
    state: reasons.length === 0 ? "READY" : "VERIFY_SOURCE",
    generatedAt,
    maximumSourceAgeMs,
    verificationReasons: reasons,
    rejectedDecisionIds: rejected,
    timeline,
    verificationRequired,
    revisitRequired,
    outcomeReviewReady,
    waitingOutcome,
    summary: Object.freeze({
      supplied: input.briefs.length,
      accepted: timeline.length,
      rejected: input.briefs.length - timeline.length,
      verificationRequired: verificationRequired.length,
      revisitRequired: revisitRequired.length,
      outcomeReviewReady: outcomeReviewReady.length,
      waitingOutcome: waitingOutcome.length,
      observedOutcomes: timeline.filter((item) => item.outcomeState !== "NOT_OBSERVED").length,
      lineageChangeEvents: timeline.filter((item) => item.changesSincePrior.length > 0).length
    }),
    evidenceRefs,
    sourceDecisionIds,
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    limitations: LIMITATIONS,
    authority: AUTHORITY
  };

  return deepFreeze(output) as CompanyBrainDecisionHistoryBriefV1;
}
