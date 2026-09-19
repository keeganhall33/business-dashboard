import type {
  DecisionLearningRecordInputV1,
  DecisionReviewStateV1,
} from "@/lib/learning-engine/decision-record-v1";
import {
  decisionReviewStateFor,
  validateDecisionGovernance,
} from "@/lib/learning-engine/decision-record-v1";

export const DECISION_RATIONALE_REVISIT_REVIEW_VERSION_V1 =
  "DecisionRationaleRevisitReviewV1" as const;
export const DECISION_RATIONALE_REVISIT_POLICY_VERSION_V1 =
  "decision_rationale_revisit_review_v1.0.0" as const;

const MAX_REFS = 200;
const MAX_SOURCE_AGE_MS = 365 * 24 * 60 * 60 * 1000;

export type DecisionRationaleEvidenceTruthStateV1 =
  | "KNOWN"
  | "INFERRED"
  | "UNKNOWN"
  | "STALE"
  | "CONFLICTED";

export type DecisionRationaleEvidenceChangeKindV1 =
  | "SUPPORTING_EVIDENCE_ADDED"
  | "SUPPORTING_EVIDENCE_INVALIDATED"
  | "CONTRADICTING_EVIDENCE_ADDED"
  | "CONTRADICTING_EVIDENCE_RESOLVED"
  | "MATERIAL_CONTEXT_CHANGED";

export type DecisionRationaleAssumptionStateV1 =
  | "SUPPORTED"
  | "CONTRADICTED"
  | "UNRESOLVED";

export type DecisionRationaleEvidenceChangeV1 = Readonly<{
  changeId: string;
  kind: DecisionRationaleEvidenceChangeKindV1;
  evidenceRef: string;
  sourceRef: string;
  observedAt: string;
  truthState: DecisionRationaleEvidenceTruthStateV1;
  note: string;
}>;

export type DecisionRationaleAssumptionAssessmentV1 = Readonly<{
  assumption: string;
  state: DecisionRationaleAssumptionStateV1;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  observedAt: string;
  truthState: DecisionRationaleEvidenceTruthStateV1;
}>;

export type DecisionRationaleRevisitReviewStateV1 =
  | "CURRENT"
  | "REVIEW_REQUIRED"
  | "SUPERSEDED"
  | "VERIFY_SOURCE";

export type DecisionRationaleRevisitReasonV1 =
  | "RATIONALE_CURRENT_ON_RECORDED_EVIDENCE"
  | "DECISION_VALIDITY_EXPIRED"
  | "DECISION_EVIDENCE_FINGERPRINT_CHANGED"
  | "DECISION_SUPERSEDED"
  | "DECISION_GOVERNANCE_MISSING"
  | "DECISION_GOVERNANCE_NOT_APPROVED"
  | "SUPPORTING_EVIDENCE_INVALIDATED"
  | "NEW_CONTRADICTING_EVIDENCE"
  | "MATERIAL_CONTEXT_CHANGED"
  | "ASSUMPTION_CONTRADICTED"
  | "ASSUMPTION_UNRESOLVED"
  | "ASSUMPTION_ASSESSMENT_MISSING"
  | "EVIDENCE_CHANGE_NOT_KNOWN"
  | "ASSUMPTION_ASSESSMENT_NOT_KNOWN"
  | "EVIDENCE_CHANGE_STALE"
  | "ASSUMPTION_ASSESSMENT_STALE"
  | "FUTURE_EVIDENCE"
  | "DUPLICATE_EVIDENCE_CHANGE"
  | "DUPLICATE_ASSUMPTION_ASSESSMENT"
  | "ASSUMPTION_NOT_IN_DECISION"
  | "SOURCE_PROVENANCE_MISSING"
  | "CURRENT_EVIDENCE_FINGERPRINT_MISSING"
  | "INVALID_EVALUATED_AT"
  | "INVALID_MAXIMUM_SOURCE_AGE"
  | "MALFORMED_INPUT";

export type DecisionRationaleRevisitReviewV1 = Readonly<{
  contractVersion: typeof DECISION_RATIONALE_REVISIT_REVIEW_VERSION_V1;
  policyVersion: typeof DECISION_RATIONALE_REVISIT_POLICY_VERSION_V1;
  decisionId: string | null;
  recommendationId: string | null;
  evaluatedAt: string | null;
  state: DecisionRationaleRevisitReviewStateV1;
  sourceDecisionReviewState: DecisionReviewStateV1 | null;
  reasonCodes: readonly DecisionRationaleRevisitReasonV1[];
  recordedRationale: string | null;
  recordedAlternatives: readonly string[];
  recordedAssumptions: readonly string[];
  explicitChangesSinceDecision: readonly Readonly<{
    changeId: string;
    kind: DecisionRationaleEvidenceChangeKindV1;
    evidenceRef: string;
    sourceRef: string;
    observedAt: string;
    note: string;
  }>[];
  assumptionAssessments: readonly Readonly<{
    assumption: string;
    state: DecisionRationaleAssumptionStateV1;
    evidenceRefs: readonly string[];
    sourceRefs: readonly string[];
    observedAt: string;
  }>[];
  unresolvedAssumptions: readonly string[];
  contradictedAssumptions: readonly string[];
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  nextInternalStep: "REVIEW_RECORDED_RATIONALE" | null;
  causalInterpretation: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
  inferredOutcome: null;
  recommendedDecision: null;
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    decisionMutationAuthorized: false;
    rationaleMutationAuthorized: false;
    recommendationAuthorized: false;
    confidenceMutationAuthorized: false;
    monetaryMutationAuthorized: false;
    policyPromotionAuthorized: false;
    persistenceAuthorized: false;
    externalActionAuthorized: false;
    approvalBypassAuthorized: false;
  }>;
}>;

export type ReviewDecisionRationaleRevisitInputV1 = Readonly<{
  decision: DecisionLearningRecordInputV1;
  evaluatedAt: string;
  currentEvidenceFingerprint: string | null;
  maximumSourceAgeMs: number;
  evidenceChanges: readonly DecisionRationaleEvidenceChangeV1[];
  assumptionAssessments: readonly DecisionRationaleAssumptionAssessmentV1[];
}>;

const CHANGE_KINDS = new Set<DecisionRationaleEvidenceChangeKindV1>([
  "SUPPORTING_EVIDENCE_ADDED",
  "SUPPORTING_EVIDENCE_INVALIDATED",
  "CONTRADICTING_EVIDENCE_ADDED",
  "CONTRADICTING_EVIDENCE_RESOLVED",
  "MATERIAL_CONTEXT_CHANGED",
]);

const ASSUMPTION_STATES = new Set<DecisionRationaleAssumptionStateV1>([
  "SUPPORTED",
  "CONTRADICTED",
  "UNRESOLVED",
]);

const TRUTH_STATES = new Set<DecisionRationaleEvidenceTruthStateV1>([
  "KNOWN",
  "INFERRED",
  "UNKNOWN",
  "STALE",
  "CONFLICTED",
]);

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  decisionMutationAuthorized: false as const,
  rationaleMutationAuthorized: false as const,
  recommendationAuthorized: false as const,
  confidenceMutationAuthorized: false as const,
  monetaryMutationAuthorized: false as const,
  policyPromotionAuthorized: false as const,
  persistenceAuthorized: false as const,
  externalActionAuthorized: false as const,
  approvalBypassAuthorized: false as const,
});

const LIMITATIONS = Object.freeze([
  "This review tests whether a recorded decision rationale deserves another governed review. It does not rewrite the rationale, choose a new decision, or create company truth.",
  "Evidence changes and assumption assessments must be supplied as explicit source-backed observations. The review never infers that an assumption is supported, contradicted, or resolved.",
  "A changed evidence fingerprint, contradicted assumption, or new contradicting evidence is a review trigger only. It does not establish causality, confidence, expected value, monetary value, or the correct replacement decision.",
  "No decision, recommendation, price, policy, persistence, external action, or approval bypass is authorized.",
] as const);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function timestamp(value: unknown): string | null {
  const normalized = text(value);
  if (!normalized) return null;
  const millis = Date.parse(normalized);
  if (!Number.isFinite(millis)) return null;
  const canonical = new Date(millis).toISOString();
  return canonical === normalized ? canonical : null;
}

function refs(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length > MAX_REFS) return null;
  const normalized: string[] = [];
  for (const item of value) {
    const ref = text(item);
    if (!ref) return null;
    normalized.push(ref);
  }
  if (new Set(normalized).size !== normalized.length) return null;
  return Object.freeze([...normalized].sort((a, b) => a.localeCompare(b)));
}

function unique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b)));
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function ageReason(
  observedAt: string,
  evaluatedAt: string,
  maximumSourceAgeMs: number,
): "FUTURE_EVIDENCE" | "STALE" | null {
  const age = Date.parse(evaluatedAt) - Date.parse(observedAt);
  if (age < 0) return "FUTURE_EVIDENCE";
  if (age > maximumSourceAgeMs) return "STALE";
  return null;
}

function fallbackReview(
  decision: DecisionLearningRecordInputV1 | undefined,
  evaluatedAt: string | null,
  reasons: Set<DecisionRationaleRevisitReasonV1>,
): DecisionRationaleRevisitReviewV1 {
  const governance = decision?.DECISION_GOVERNANCE;
  return deepFreeze({
    contractVersion: DECISION_RATIONALE_REVISIT_REVIEW_VERSION_V1,
    policyVersion: DECISION_RATIONALE_REVISIT_POLICY_VERSION_V1,
    decisionId: text(decision?.id),
    recommendationId: text(decision?.recommendation_id),
    evaluatedAt,
    state: "VERIFY_SOURCE",
    sourceDecisionReviewState: null,
    reasonCodes: Object.freeze([...reasons].sort((a, b) => a.localeCompare(b))),
    recordedRationale: text(governance?.rationale),
    recordedAlternatives: Object.freeze(Array.isArray(governance?.alternatives) ? [...governance.alternatives] : []),
    recordedAssumptions: Object.freeze(Array.isArray(decision?.KEY_ASSUMPTIONS) ? [...decision.KEY_ASSUMPTIONS] : []),
    explicitChangesSinceDecision: Object.freeze([]),
    assumptionAssessments: Object.freeze([]),
    unresolvedAssumptions: Object.freeze([]),
    contradictedAssumptions: Object.freeze([]),
    evidenceRefs: Object.freeze([]),
    sourceRefs: Object.freeze([]),
    nextInternalStep: null,
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    inferredOutcome: null,
    recommendedDecision: null,
    limitations: LIMITATIONS,
    authority: AUTHORITY,
  });
}

export function reviewDecisionRationaleRevisitV1(
  input: ReviewDecisionRationaleRevisitInputV1,
): DecisionRationaleRevisitReviewV1 {
  const reasons = new Set<DecisionRationaleRevisitReasonV1>();
  const decision = input?.decision;
  const evaluatedAt = timestamp(input?.evaluatedAt);
  const maximumSourceAgeMs = input?.maximumSourceAgeMs;

  if (!decision || typeof decision !== "object") reasons.add("MALFORMED_INPUT");
  if (!evaluatedAt) reasons.add("INVALID_EVALUATED_AT");
  if (
    !Number.isFinite(maximumSourceAgeMs)
    || maximumSourceAgeMs <= 0
    || maximumSourceAgeMs > MAX_SOURCE_AGE_MS
  ) {
    reasons.add("INVALID_MAXIMUM_SOURCE_AGE");
  }

  const decisionId = text(decision?.id);
  const recommendationId = text(decision?.recommendation_id);
  const fingerprint = input?.currentEvidenceFingerprint == null
    ? null
    : text(input.currentEvidenceFingerprint);
  if (!decisionId || !recommendationId) reasons.add("MALFORMED_INPUT");
  if (input?.currentEvidenceFingerprint != null && !fingerprint) reasons.add("CURRENT_EVIDENCE_FINGERPRINT_MISSING");

  let governance: ReturnType<typeof validateDecisionGovernance> = null;
  try {
    governance = decision ? validateDecisionGovernance(decision) : null;
  } catch {
    reasons.add("MALFORMED_INPUT");
  }
  if (!governance) reasons.add("DECISION_GOVERNANCE_MISSING");
  else if (governance.review_state !== "APPROVED") reasons.add("DECISION_GOVERNANCE_NOT_APPROVED");
  if (governance?.revisit_on_evidence_change && !fingerprint) {
    reasons.add("CURRENT_EVIDENCE_FINGERPRINT_MISSING");
  }

  if (!Array.isArray(input?.evidenceChanges) || !Array.isArray(input?.assumptionAssessments)) {
    reasons.add("MALFORMED_INPUT");
  }

  const changes: Array<DecisionRationaleRevisitReviewV1["explicitChangesSinceDecision"][number]> = [];
  const assessments: Array<DecisionRationaleRevisitReviewV1["assumptionAssessments"][number]> = [];
  const evidenceRefs: string[] = [];
  const sourceRefs: string[] = [];
  const changeIds = new Set<string>();
  const assessedAssumptions = new Set<string>();
  const decisionAssumptions = Array.isArray(decision?.KEY_ASSUMPTIONS) ? decision.KEY_ASSUMPTIONS : [];
  const decisionAssumptionSet = new Set(decisionAssumptions);

  if (evaluatedAt && Number.isFinite(maximumSourceAgeMs) && maximumSourceAgeMs > 0 && maximumSourceAgeMs <= MAX_SOURCE_AGE_MS) {
    for (const change of input?.evidenceChanges ?? []) {
      const changeId = text(change?.changeId);
      const evidenceRef = text(change?.evidenceRef);
      const sourceRef = text(change?.sourceRef);
      const observedAt = timestamp(change?.observedAt);
      const note = text(change?.note);
      if (!changeId || !evidenceRef || !sourceRef || !observedAt || !note || !CHANGE_KINDS.has(change?.kind) || !TRUTH_STATES.has(change?.truthState)) {
        reasons.add("MALFORMED_INPUT");
        continue;
      }
      if (changeIds.has(changeId)) {
        reasons.add("DUPLICATE_EVIDENCE_CHANGE");
        continue;
      }
      changeIds.add(changeId);
      if (change.truthState !== "KNOWN") reasons.add("EVIDENCE_CHANGE_NOT_KNOWN");
      const age = ageReason(observedAt, evaluatedAt, maximumSourceAgeMs);
      if (age === "FUTURE_EVIDENCE") reasons.add("FUTURE_EVIDENCE");
      if (age === "STALE") reasons.add("EVIDENCE_CHANGE_STALE");
      if (!sourceRef) reasons.add("SOURCE_PROVENANCE_MISSING");

      if (change.truthState === "KNOWN" && age === null) {
        changes.push(Object.freeze({
          changeId,
          kind: change.kind,
          evidenceRef,
          sourceRef,
          observedAt,
          note,
        }));
        evidenceRefs.push(evidenceRef);
        sourceRefs.push(sourceRef);
      }
    }

    for (const assessment of input?.assumptionAssessments ?? []) {
      const assumption = text(assessment?.assumption);
      const assessmentEvidence = refs(assessment?.evidenceRefs);
      const assessmentSources = refs(assessment?.sourceRefs);
      const observedAt = timestamp(assessment?.observedAt);
      if (
        !assumption
        || !assessmentEvidence
        || !assessmentSources
        || assessmentEvidence.length === 0
        || assessmentSources.length === 0
        || !observedAt
        || !ASSUMPTION_STATES.has(assessment?.state)
        || !TRUTH_STATES.has(assessment?.truthState)
      ) {
        reasons.add("MALFORMED_INPUT");
        continue;
      }
      if (assessedAssumptions.has(assumption)) {
        reasons.add("DUPLICATE_ASSUMPTION_ASSESSMENT");
        continue;
      }
      assessedAssumptions.add(assumption);
      if (!decisionAssumptionSet.has(assumption)) reasons.add("ASSUMPTION_NOT_IN_DECISION");
      if (assessment.truthState !== "KNOWN") reasons.add("ASSUMPTION_ASSESSMENT_NOT_KNOWN");
      const age = ageReason(observedAt, evaluatedAt, maximumSourceAgeMs);
      if (age === "FUTURE_EVIDENCE") reasons.add("FUTURE_EVIDENCE");
      if (age === "STALE") reasons.add("ASSUMPTION_ASSESSMENT_STALE");

      if (decisionAssumptionSet.has(assumption) && assessment.truthState === "KNOWN" && age === null) {
        assessments.push(Object.freeze({
          assumption,
          state: assessment.state,
          evidenceRefs: assessmentEvidence,
          sourceRefs: assessmentSources,
          observedAt,
        }));
        evidenceRefs.push(...assessmentEvidence);
        sourceRefs.push(...assessmentSources);
      }
    }
  }

  if (reasons.has("MALFORMED_INPUT") || reasons.has("INVALID_EVALUATED_AT") || reasons.has("INVALID_MAXIMUM_SOURCE_AGE") || reasons.has("DECISION_GOVERNANCE_MISSING")) {
    return fallbackReview(decision, evaluatedAt, reasons);
  }

  let sourceDecisionReviewState: DecisionReviewStateV1 | null = null;
  try {
    sourceDecisionReviewState = decisionReviewStateFor(decision, {
      as_of: evaluatedAt ?? undefined,
      current_evidence_fingerprint: fingerprint,
    })?.state ?? null;
  } catch {
    reasons.add("MALFORMED_INPUT");
    return fallbackReview(decision, evaluatedAt, reasons);
  }

  if (sourceDecisionReviewState === "SUPERSEDED") reasons.add("DECISION_SUPERSEDED");
  if (sourceDecisionReviewState === "REVIEW_REQUIRED") {
    const evaluation = decisionReviewStateFor(decision, {
      as_of: evaluatedAt ?? undefined,
      current_evidence_fingerprint: fingerprint,
    });
    if (evaluation?.reasons.includes("VALIDITY_EXPIRED")) reasons.add("DECISION_VALIDITY_EXPIRED");
    if (evaluation?.reasons.includes("EVIDENCE_CHANGED")) reasons.add("DECISION_EVIDENCE_FINGERPRINT_CHANGED");
  }

  for (const change of changes) {
    if (change.kind === "SUPPORTING_EVIDENCE_INVALIDATED") reasons.add("SUPPORTING_EVIDENCE_INVALIDATED");
    if (change.kind === "CONTRADICTING_EVIDENCE_ADDED") reasons.add("NEW_CONTRADICTING_EVIDENCE");
    if (change.kind === "MATERIAL_CONTEXT_CHANGED") reasons.add("MATERIAL_CONTEXT_CHANGED");
  }

  const unresolvedAssumptions = decisionAssumptions.filter((assumption) => {
    const assessment = assessments.find((item) => item.assumption === assumption);
    return !assessment || assessment.state === "UNRESOLVED";
  });
  const contradictedAssumptions = assessments
    .filter((item) => item.state === "CONTRADICTED")
    .map((item) => item.assumption);

  if (contradictedAssumptions.length > 0) reasons.add("ASSUMPTION_CONTRADICTED");
  if (assessments.some((item) => item.state === "UNRESOLVED")) reasons.add("ASSUMPTION_UNRESOLVED");
  if (decisionAssumptions.some((assumption) => !assessedAssumptions.has(assumption))) {
    reasons.add("ASSUMPTION_ASSESSMENT_MISSING");
  }

  const verificationReasons = new Set<DecisionRationaleRevisitReasonV1>([
    "DECISION_GOVERNANCE_NOT_APPROVED",
    "EVIDENCE_CHANGE_NOT_KNOWN",
    "ASSUMPTION_ASSESSMENT_NOT_KNOWN",
    "EVIDENCE_CHANGE_STALE",
    "ASSUMPTION_ASSESSMENT_STALE",
    "FUTURE_EVIDENCE",
    "DUPLICATE_EVIDENCE_CHANGE",
    "DUPLICATE_ASSUMPTION_ASSESSMENT",
    "ASSUMPTION_NOT_IN_DECISION",
    "SOURCE_PROVENANCE_MISSING",
    "CURRENT_EVIDENCE_FINGERPRINT_MISSING",
  ]);
  const hasVerificationFailure = [...reasons].some((reason) => verificationReasons.has(reason));

  let state: DecisionRationaleRevisitReviewStateV1;
  if (sourceDecisionReviewState === "SUPERSEDED") state = "SUPERSEDED";
  else if (hasVerificationFailure) state = "VERIFY_SOURCE";
  else if (
    sourceDecisionReviewState === "REVIEW_REQUIRED"
    || reasons.has("SUPPORTING_EVIDENCE_INVALIDATED")
    || reasons.has("NEW_CONTRADICTING_EVIDENCE")
    || reasons.has("MATERIAL_CONTEXT_CHANGED")
    || reasons.has("ASSUMPTION_CONTRADICTED")
    || reasons.has("ASSUMPTION_UNRESOLVED")
    || reasons.has("ASSUMPTION_ASSESSMENT_MISSING")
  ) {
    state = "REVIEW_REQUIRED";
  } else {
    state = "CURRENT";
    reasons.add("RATIONALE_CURRENT_ON_RECORDED_EVIDENCE");
  }

  return deepFreeze({
    contractVersion: DECISION_RATIONALE_REVISIT_REVIEW_VERSION_V1,
    policyVersion: DECISION_RATIONALE_REVISIT_POLICY_VERSION_V1,
    decisionId,
    recommendationId,
    evaluatedAt,
    state,
    sourceDecisionReviewState,
    reasonCodes: Object.freeze([...reasons].sort((a, b) => a.localeCompare(b))),
    recordedRationale: text(governance?.rationale),
    recordedAlternatives: Object.freeze([...(governance?.alternatives ?? [])]),
    recordedAssumptions: Object.freeze([...decisionAssumptions]),
    explicitChangesSinceDecision: Object.freeze([...changes].sort((a, b) => a.changeId.localeCompare(b.changeId))),
    assumptionAssessments: Object.freeze([...assessments].sort((a, b) => a.assumption.localeCompare(b.assumption))),
    unresolvedAssumptions: unique(unresolvedAssumptions),
    contradictedAssumptions: unique(contradictedAssumptions),
    evidenceRefs: unique(evidenceRefs),
    sourceRefs: unique(sourceRefs),
    nextInternalStep: state === "REVIEW_REQUIRED" ? "REVIEW_RECORDED_RATIONALE" : null,
    causalInterpretation: "NOT_ESTABLISHED",
    confidence: "NOT_ESTABLISHED",
    monetaryValue: null,
    inferredOutcome: null,
    recommendedDecision: null,
    limitations: LIMITATIONS,
    authority: AUTHORITY,
  });
}
