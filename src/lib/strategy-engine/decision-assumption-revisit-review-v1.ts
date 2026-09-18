import { createHash } from "node:crypto";

import type {
  AssumptionOutcomeV1,
  DecisionAttributionClassV1,
  DecisionMemoryRecordV1,
  DecisionMemoryTruthStateV1
} from "@/lib/intelligence/organizational-learning/decision-memory-v1";

export const DECISION_ASSUMPTION_REVISIT_REVIEW_VERSION_V1 =
  "DecisionAssumptionRevisitReviewV1" as const;
export const DECISION_ASSUMPTION_REVISIT_REVIEW_POLICY_VERSION_V1 =
  "decision_assumption_revisit_review_v1.0.0" as const;

export type DecisionAssumptionRevisitStateV1 =
  | "READY_FOR_REVIEW"
  | "WAIT_FOR_EVIDENCE"
  | "NO_REVIEW_NEEDED"
  | "VERIFY";

export type DecisionAssumptionRevisitReasonV1 =
  | "MATERIAL_ASSUMPTION_REFUTED"
  | "MATERIAL_ASSUMPTION_UNRESOLVED"
  | "ALL_MATERIAL_ASSUMPTIONS_SUPPORTED"
  | "NO_MATERIAL_ASSUMPTIONS"
  | "OUTCOME_NOT_OBSERVED"
  | "DECISION_INTEGRITY_FLAGS"
  | "INVALID_CHRONOLOGY"
  | "MATERIAL_ASSUMPTION_NOT_EVIDENCED"
  | "DUPLICATE_ASSUMPTION_ASSESSMENT"
  | "ASSESSMENT_TARGET_UNKNOWN"
  | "ASSESSMENT_EVIDENCE_MISSING"
  | "ATTRIBUTION_EVIDENCE_MISSING"
  | "EVIDENCE_LINEAGE_MISSING"
  | "EVIDENCE_LINEAGE_CONFLICT"
  | "FUTURE_EVIDENCE";

export type DecisionAssumptionEvidenceLineageV1 = Readonly<{
  evidenceId: string;
  sourceLineageId: string;
  observedAt: string;
}>;

export type DecisionAssumptionReviewSignalV1 = Readonly<{
  assumptionId: string;
  statement: string | null;
  statementTruthState: DecisionMemoryTruthStateV1;
  assessment: AssumptionOutcomeV1 | "NOT_ASSESSED";
  revisitTrigger: string | null;
  statementEvidenceRefs: readonly string[];
  assessmentEvidenceRefs: readonly string[];
  sourceLineageIds: readonly string[];
}>;

export type DecisionAssumptionRevisitReviewInputV1 = Readonly<{
  record: DecisionMemoryRecordV1;
  reviewedAt: string;
  evidenceLineage: readonly DecisionAssumptionEvidenceLineageV1[];
}>;

export type DecisionAssumptionRevisitReviewV1 = Readonly<{
  contractVersion: typeof DECISION_ASSUMPTION_REVISIT_REVIEW_VERSION_V1;
  policyVersion: typeof DECISION_ASSUMPTION_REVISIT_REVIEW_POLICY_VERSION_V1;
  reviewId: string;
  reviewedAt: string;
  state: DecisionAssumptionRevisitStateV1;
  reasonCodes: readonly DecisionAssumptionRevisitReasonV1[];
  decisionId: string;
  decisionClass: DecisionMemoryRecordV1["decisionClass"];
  outcomeObservationId: string | null;
  attributionClass: DecisionAttributionClassV1;
  causalInterpretation: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
  outcomePrediction: null;
  materialAssumptionCount: number;
  supportedCount: number;
  refutedCount: number;
  unresolvedCount: number;
  reviewSignals: readonly DecisionAssumptionReviewSignalV1[];
  evidenceRefs: readonly string[];
  sourceLineageIds: readonly string[];
  nextInternalStep:
    | "REASSESS_DECISION_AND_CURRENT_PORTFOLIO_CONTEXT"
    | "COLLECT_MISSING_MATERIAL_ASSUMPTION_EVIDENCE"
    | "VERIFY_DECISION_MEMORY_AND_EVIDENCE_LINEAGE"
    | null;
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    decisionMutationAuthorized: false;
    portfolioMutationAuthorized: false;
    allocationChangeAuthorized: false;
    scoreMutationAuthorized: false;
    confidenceMutationAuthorized: false;
    monetaryMutationAuthorized: false;
    policyPromotionAuthorized: false;
    pricingChangeAuthorized: false;
    negotiationActionAuthorized: false;
    campaignExecutionAuthorized: false;
    experimentExecutionAuthorized: false;
    externalActionAuthorized: false;
    persistenceAuthorized: false;
    approvalBypassAuthorized: false;
  }>;
}>;

const AUTHORITY = Object.freeze({
  analysisOnly: true,
  decisionMutationAuthorized: false,
  portfolioMutationAuthorized: false,
  allocationChangeAuthorized: false,
  scoreMutationAuthorized: false,
  confidenceMutationAuthorized: false,
  monetaryMutationAuthorized: false,
  policyPromotionAuthorized: false,
  pricingChangeAuthorized: false,
  negotiationActionAuthorized: false,
  campaignExecutionAuthorized: false,
  experimentExecutionAuthorized: false,
  externalActionAuthorized: false,
  persistenceAuthorized: false,
  approvalBypassAuthorized: false
} as const);

const LIMITATIONS = Object.freeze([
  "A refuted material assumption is a reason to review the recorded decision and current portfolio context, not an instruction to change allocation or execute an action.",
  "Assumption assessment evidence is preserved as observed evidence; this review does not infer causality, confidence, monetary value, or future outcomes.",
  "Missing, conflicting, future-dated, or unsupported evidence fails closed and cannot become strategy truth.",
  "This projection grants no decision, portfolio, pricing, negotiation, campaign, experiment, persistence, external-action, or approval-bypass authority."
] as const);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function parsedTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim();
  return Number.isFinite(Date.parse(normalized)) ? normalized : null;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => [key, canonical((value as Record<string, unknown>)[key])])
  );
}

function stableId(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex")
    .slice(0, 24);
}

function buildLineage(
  entries: readonly DecisionAssumptionEvidenceLineageV1[],
  reviewedAtMs: number
): {
  map: Map<string, DecisionAssumptionEvidenceLineageV1>;
  conflict: boolean;
  futureEvidence: boolean;
} {
  const map = new Map<string, DecisionAssumptionEvidenceLineageV1>();
  let conflict = false;
  let futureEvidence = false;

  for (const entry of entries ?? []) {
    if (!entry || !entry.evidenceId?.trim() || !entry.sourceLineageId?.trim()) continue;
    const observedAt = parsedTimestamp(entry.observedAt);
    if (!observedAt) continue;
    if (Date.parse(observedAt) > reviewedAtMs) {
      futureEvidence = true;
      continue;
    }

    const normalized: DecisionAssumptionEvidenceLineageV1 = {
      evidenceId: entry.evidenceId.trim(),
      sourceLineageId: entry.sourceLineageId.trim(),
      observedAt
    };
    const existing = map.get(normalized.evidenceId);
    if (
      existing &&
      (existing.sourceLineageId !== normalized.sourceLineageId ||
        existing.observedAt !== normalized.observedAt)
    ) {
      conflict = true;
      continue;
    }
    map.set(normalized.evidenceId, normalized);
  }

  return { map, conflict, futureEvidence };
}

const VERIFY_REASONS = new Set<DecisionAssumptionRevisitReasonV1>([
  "DECISION_INTEGRITY_FLAGS",
  "INVALID_CHRONOLOGY",
  "MATERIAL_ASSUMPTION_NOT_EVIDENCED",
  "DUPLICATE_ASSUMPTION_ASSESSMENT",
  "ASSESSMENT_TARGET_UNKNOWN",
  "ASSESSMENT_EVIDENCE_MISSING",
  "ATTRIBUTION_EVIDENCE_MISSING",
  "EVIDENCE_LINEAGE_MISSING",
  "EVIDENCE_LINEAGE_CONFLICT",
  "FUTURE_EVIDENCE"
]);

function stateFor(
  reasons: readonly DecisionAssumptionRevisitReasonV1[],
  hasRefuted: boolean,
  hasUnresolved: boolean,
  materialCount: number
): DecisionAssumptionRevisitStateV1 {
  if (reasons.some((reason) => VERIFY_REASONS.has(reason))) return "VERIFY";
  if (materialCount === 0) return "NO_REVIEW_NEEDED";
  if (reasons.includes("OUTCOME_NOT_OBSERVED")) return "WAIT_FOR_EVIDENCE";
  if (hasRefuted) return "READY_FOR_REVIEW";
  if (hasUnresolved) return "WAIT_FOR_EVIDENCE";
  return "NO_REVIEW_NEEDED";
}

function nextInternalStepFor(
  state: DecisionAssumptionRevisitStateV1
): DecisionAssumptionRevisitReviewV1["nextInternalStep"] {
  if (state === "READY_FOR_REVIEW") return "REASSESS_DECISION_AND_CURRENT_PORTFOLIO_CONTEXT";
  if (state === "WAIT_FOR_EVIDENCE") return "COLLECT_MISSING_MATERIAL_ASSUMPTION_EVIDENCE";
  if (state === "VERIFY") return "VERIFY_DECISION_MEMORY_AND_EVIDENCE_LINEAGE";
  return null;
}

/**
 * Turns evidence-backed changes to material DecisionMemory assumptions into a
 * bounded internal revisit signal. It never mutates the source decision or the
 * current portfolio and never upgrades correlation into causality.
 */
export function reviewDecisionAssumptionsForRevisitV1(
  input: DecisionAssumptionRevisitReviewInputV1
): DecisionAssumptionRevisitReviewV1 {
  if (!input?.record || input.record.contractVersion !== "DecisionMemoryV1") {
    throw new Error("DECISION_ASSUMPTION_REVISIT_INVALID_RECORD");
  }

  const reviewedAt = parsedTimestamp(input.reviewedAt);
  if (!reviewedAt) throw new Error("DECISION_ASSUMPTION_REVISIT_INVALID_REVIEWED_AT");
  const reviewedAtMs = Date.parse(reviewedAt);
  const reasons: DecisionAssumptionRevisitReasonV1[] = [];

  const decisionAt = parsedTimestamp(input.record.decidedAt);
  const decisionAtMs = decisionAt ? Date.parse(decisionAt) : Number.NaN;
  const observation = input.record.outcomeObservation;
  const observationAt = observation ? parsedTimestamp(observation.observedAt) : null;
  const observationAtMs = observationAt ? Date.parse(observationAt) : Number.NaN;

  if (
    !decisionAt ||
    decisionAtMs > reviewedAtMs ||
    (observation !== null &&
      (!observationAt || observationAtMs < decisionAtMs || observationAtMs > reviewedAtMs))
  ) {
    reasons.push("INVALID_CHRONOLOGY");
  }

  if (input.record.integrityFlags.length > 0) reasons.push("DECISION_INTEGRITY_FLAGS");
  if (
    observation !== null &&
    observation.attributionClass !== "UNKNOWN" &&
    observation.attributionEvidenceRefs.length === 0
  ) {
    reasons.push("ATTRIBUTION_EVIDENCE_MISSING");
  }

  const materialAssumptions = input.record.assumptions.filter((assumption) => assumption.material);
  if (materialAssumptions.length === 0) reasons.push("NO_MATERIAL_ASSUMPTIONS");
  if (observation === null) reasons.push("OUTCOME_NOT_OBSERVED");

  const allAssumptionIds = new Set(input.record.assumptions.map((assumption) => assumption.assumptionId));
  const assessmentCounts = new Map<string, number>();
  for (const assessment of observation?.assumptionAssessments ?? []) {
    assessmentCounts.set(
      assessment.assumptionId,
      (assessmentCounts.get(assessment.assumptionId) ?? 0) + 1
    );
    if (!allAssumptionIds.has(assessment.assumptionId)) reasons.push("ASSESSMENT_TARGET_UNKNOWN");
  }
  if ([...assessmentCounts.values()].some((count) => count > 1)) {
    reasons.push("DUPLICATE_ASSUMPTION_ASSESSMENT");
  }

  const lineage = buildLineage(input.evidenceLineage ?? [], reviewedAtMs);
  if (lineage.conflict) reasons.push("EVIDENCE_LINEAGE_CONFLICT");
  if (lineage.futureEvidence) reasons.push("FUTURE_EVIDENCE");

  const requiredEvidenceRefs: string[] = [];
  const signals: DecisionAssumptionReviewSignalV1[] = [];
  let supportedCount = 0;
  let refutedCount = 0;
  let unresolvedCount = 0;

  if (observation !== null && observation.attributionClass !== "UNKNOWN") {
    requiredEvidenceRefs.push(...observation.attributionEvidenceRefs);
  }

  for (const assumption of materialAssumptions) {
    const statementRefs = uniqueSorted(assumption.statement.evidenceRefs);
    const statementSupported =
      (assumption.statement.state === "KNOWN" || assumption.statement.state === "INFERRED") &&
      assumption.statement.value != null &&
      statementRefs.length > 0;
    if (!statementSupported) reasons.push("MATERIAL_ASSUMPTION_NOT_EVIDENCED");
    requiredEvidenceRefs.push(...statementRefs);

    const assessments = (observation?.assumptionAssessments ?? []).filter(
      (item) => item.assumptionId === assumption.assumptionId
    );
    const assessment = assessments.length === 1 ? assessments[0] : null;
    const assessmentValue: AssumptionOutcomeV1 | "NOT_ASSESSED" =
      assessment?.assessment ?? "NOT_ASSESSED";
    const assessmentRefs = uniqueSorted(assessment?.evidenceRefs ?? []);

    if (assessmentValue === "SUPPORTED") supportedCount += 1;
    else if (assessmentValue === "REFUTED") refutedCount += 1;
    else unresolvedCount += 1;

    if (
      (assessmentValue === "SUPPORTED" || assessmentValue === "REFUTED") &&
      assessmentRefs.length === 0
    ) {
      reasons.push("ASSESSMENT_EVIDENCE_MISSING");
    }
    if (assessmentValue === "REFUTED") reasons.push("MATERIAL_ASSUMPTION_REFUTED");
    if (assessmentValue === "UNRESOLVED" || assessmentValue === "NOT_ASSESSED") {
      reasons.push("MATERIAL_ASSUMPTION_UNRESOLVED");
    }
    requiredEvidenceRefs.push(...assessmentRefs);

    const signalRefs = uniqueSorted([...statementRefs, ...assessmentRefs]);
    signals.push({
      assumptionId: assumption.assumptionId,
      statement: statementSupported ? assumption.statement.value : null,
      statementTruthState: assumption.statement.state,
      assessment: assessmentValue,
      revisitTrigger: assumption.revisitTrigger,
      statementEvidenceRefs: statementRefs,
      assessmentEvidenceRefs: assessmentRefs,
      sourceLineageIds: uniqueSorted(
        signalRefs.flatMap((ref) => {
          const entry = lineage.map.get(ref);
          return entry ? [entry.sourceLineageId] : [];
        })
      )
    });
  }

  if (
    observation !== null &&
    materialAssumptions.length > 0 &&
    refutedCount === 0 &&
    unresolvedCount === 0 &&
    supportedCount === materialAssumptions.length
  ) {
    reasons.push("ALL_MATERIAL_ASSUMPTIONS_SUPPORTED");
  }

  const evidenceRefs = uniqueSorted(requiredEvidenceRefs);
  if (evidenceRefs.some((ref) => !lineage.map.has(ref))) reasons.push("EVIDENCE_LINEAGE_MISSING");

  const reasonCodes = uniqueSorted(reasons) as DecisionAssumptionRevisitReasonV1[];
  const state = stateFor(
    reasonCodes,
    refutedCount > 0,
    unresolvedCount > 0,
    materialAssumptions.length
  );
  const sourceLineageIds = uniqueSorted(
    evidenceRefs.flatMap((ref) => {
      const entry = lineage.map.get(ref);
      return entry ? [entry.sourceLineageId] : [];
    })
  );
  const reviewSignals = signals.sort((a, b) => a.assumptionId.localeCompare(b.assumptionId));
  const nextInternalStep = nextInternalStepFor(state);
  const attributionClass = observation?.attributionClass ?? "UNKNOWN";
  const outcomeObservationId = observation?.observationId ?? null;

  const reviewId = `decision-assumption-review:${stableId({
    policyVersion: DECISION_ASSUMPTION_REVISIT_REVIEW_POLICY_VERSION_V1,
    decisionId: input.record.decisionId,
    observationId: outcomeObservationId,
    reviewedAt,
    state,
    reasonCodes,
    reviewSignals,
    evidenceRefs,
    sourceLineageIds
  })}`;

  return deepFreeze({
    contractVersion: DECISION_ASSUMPTION_REVISIT_REVIEW_VERSION_V1,
    policyVersion: DECISION_ASSUMPTION_REVISIT_REVIEW_POLICY_VERSION_V1,
    reviewId,
    reviewedAt,
    state,
    reasonCodes,
    decisionId: input.record.decisionId,
    decisionClass: input.record.decisionClass,
    outcomeObservationId,
    attributionClass,
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    outcomePrediction: null,
    materialAssumptionCount: materialAssumptions.length,
    supportedCount,
    refutedCount,
    unresolvedCount,
    reviewSignals,
    evidenceRefs,
    sourceLineageIds,
    nextInternalStep,
    limitations: [...LIMITATIONS],
    authority: AUTHORITY
  });
}
