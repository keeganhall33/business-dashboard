export const AUTONOMOUS_GROWTH_CANARY_VERSION_V1 = "AUTONOMOUS_GROWTH_CANARY_V1" as const;

export const AUTONOMOUS_GROWTH_REQUIRED_STAGES_V1 = Object.freeze([
  "EVENT_INGESTION",
  "INVESTIGATION",
  "COUNTERFACTUAL_SCENARIO",
  "CONSTRAINED_ALLOCATION",
  "RELATIONSHIP_PATH",
  "DEAL_STRUCTURE_PREPARATION",
  "APPROVAL_GATE",
  "ACTION_OR_EXPERIMENT",
  "OUTCOME_MEASUREMENT",
  "ATTRIBUTION_CLASSIFICATION",
  "LEARNING_UPDATE",
  "REALLOCATION_REVIEW",
  "CHIEF_OF_STAFF_SYNTHESIS",
  "SCHEDULER_RUNTIME",
  "PRODUCTION_TELEMETRY"
] as const);

export type AutonomousGrowthStageV1 = (typeof AUTONOMOUS_GROWTH_REQUIRED_STAGES_V1)[number];
export type AutonomousGrowthEvidenceModeV1 = "PRODUCTION" | "FIXTURE" | "SHADOW";
export type AutonomousGrowthStageStateV1 = "PROVEN" | "NOT_PROVEN" | "BLOCKED";
export type AutonomousGrowthAttributionClassV1 = "NOT_ESTABLISHED" | "CORRELATIONAL" | "CAUSAL_SUPPORTED";
export type AutonomousGrowthCanaryStateV1 =
  | "CERTIFIED_PRODUCTION_LOOP"
  | "INCOMPLETE"
  | "STALE"
  | "BLOCKED"
  | "NON_PRODUCTION_EVIDENCE";

export type AutonomousGrowthStageProofV1 = Readonly<{
  stage: AutonomousGrowthStageV1;
  state: AutonomousGrowthStageStateV1;
  evidence_mode: AutonomousGrowthEvidenceModeV1;
  evidence_ref: string | null;
  observed_at: string | null;
  lineage_id: string | null;
}>;

export type AutonomousGrowthTelemetryV1 = Readonly<{
  owner_burden_minutes: number | null;
  safe_work_completed_count: number | null;
  missed_window_count: number | null;
  duplicate_or_noise_count: number | null;
  stale_campaign_count: number | null;
  recommendation_to_outcome_closed_count: number | null;
}>;

export type AutonomousGrowthExecutionBoundaryV1 = Readonly<{
  external_action_executed: boolean;
  approval_evidence_ref: string | null;
}>;

export type AutonomousGrowthPolicyChangeProofV1 = Readonly<{
  promotion_state: "NOT_PROPOSED" | "SHADOW_ONLY" | "APPROVED_PROMOTION";
  shadow_evidence_ref: string | null;
  rollback_evidence_ref: string | null;
  approval_evidence_ref: string | null;
}>;

export type AutonomousGrowthCanaryInputV1 = Readonly<{
  run_id: string;
  evaluated_at: string;
  mode: AutonomousGrowthEvidenceModeV1;
  canonical_subject_id: string;
  lineage_id: string;
  stages: readonly AutonomousGrowthStageProofV1[];
  attribution_class: AutonomousGrowthAttributionClassV1 | null;
  telemetry: AutonomousGrowthTelemetryV1;
  execution_boundary: AutonomousGrowthExecutionBoundaryV1;
  policy_change: AutonomousGrowthPolicyChangeProofV1;
  operational_freshness_ms?: number;
}>;

export type AutonomousGrowthCanaryReasonCodeV1 =
  | "NON_PRODUCTION_MODE"
  | "STAGE_MISSING"
  | "STAGE_NOT_PROVEN"
  | "STAGE_BLOCKED"
  | "STAGE_NON_PRODUCTION_EVIDENCE"
  | "STAGE_EVIDENCE_REF_MISSING"
  | "STAGE_OBSERVED_AT_MISSING"
  | "STAGE_OBSERVED_IN_FUTURE"
  | "LINEAGE_MISSING"
  | "LINEAGE_MISMATCH"
  | "OPERATIONAL_EVIDENCE_STALE"
  | "ATTRIBUTION_CLASS_MISSING"
  | "TELEMETRY_INCOMPLETE"
  | "EXTERNAL_ACTION_APPROVAL_MISSING"
  | "POLICY_SHADOW_PROOF_MISSING"
  | "POLICY_ROLLBACK_PROOF_MISSING"
  | "POLICY_PROMOTION_APPROVAL_MISSING"
  | "PRODUCTION_LOOP_CERTIFIED";

export type AutonomousGrowthStageResultV1 = Readonly<{
  stage: AutonomousGrowthStageV1;
  state: AutonomousGrowthStageStateV1 | "MISSING";
  reason_codes: readonly AutonomousGrowthCanaryReasonCodeV1[];
  evidence_ref: string | null;
}>;

export type AutonomousGrowthCanaryResultV1 = Readonly<{
  contract_version: typeof AUTONOMOUS_GROWTH_CANARY_VERSION_V1;
  run_id: string;
  evaluated_at: string;
  state: AutonomousGrowthCanaryStateV1;
  canonical_subject_id: string;
  lineage_id: string;
  stages: readonly AutonomousGrowthStageResultV1[];
  attribution_class: AutonomousGrowthAttributionClassV1 | null;
  telemetry: AutonomousGrowthTelemetryV1;
  reason_codes: readonly AutonomousGrowthCanaryReasonCodeV1[];
  limitations: readonly string[];
  authority: Readonly<{
    analysis_only: true;
    preparation_allowed: false;
    allocation_mutation_allowed: false;
    policy_promotion_allowed: false;
    spend_allowed: false;
    outreach_allowed: false;
    contract_allowed: false;
    external_action_allowed: false;
    approval_bypass_allowed: false;
  }>;
}>;

const DEFAULT_OPERATIONAL_FRESHNESS_MS = 36 * 60 * 60 * 1000;
const MAX_OPERATIONAL_FRESHNESS_MS = 7 * 24 * 60 * 60 * 1000;
const operationalStages = new Set<AutonomousGrowthStageV1>(["SCHEDULER_RUNTIME", "PRODUCTION_TELEMETRY"]);
const evidenceModes = new Set<AutonomousGrowthEvidenceModeV1>(["PRODUCTION", "FIXTURE", "SHADOW"]);
const stageStates = new Set<AutonomousGrowthStageStateV1>(["PROVEN", "NOT_PROVEN", "BLOCKED"]);
const attributionClasses = new Set<AutonomousGrowthAttributionClassV1>(["NOT_ESTABLISHED", "CORRELATIONAL", "CAUSAL_SUPPORTED"]);
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;

const LIMITATIONS = Object.freeze([
  "Certification proves only that explicit production evidence covers the governed loop; it does not prove that any recommendation caused an outcome.",
  "Attribution class is preserved exactly as observed and is never upgraded by this evaluator.",
  "Recorded monetary value, confidence, outcome direction, or deal likelihood are outside this contract and are never inferred.",
  "This evaluator is read-only and grants no allocation, policy, spend, outreach, contract, external-action, or approval-bypass authority."
] as const);

const AUTHORITY = Object.freeze({
  analysis_only: true as const,
  preparation_allowed: false as const,
  allocation_mutation_allowed: false as const,
  policy_promotion_allowed: false as const,
  spend_allowed: false as const,
  outreach_allowed: false as const,
  contract_allowed: false as const,
  external_action_allowed: false as const,
  approval_bypass_allowed: false as const
});

function fail(code: string): never {
  throw new Error(`AUTONOMOUS_GROWTH_CANARY_${code}`);
}

function identifier(value: unknown, name: string): string {
  if (typeof value !== "string" || !identifierPattern.test(value)) fail(`${name.toUpperCase()}_INVALID`);
  return value;
}

function timestamp(value: unknown, name: string): number {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) fail(`${name.toUpperCase()}_INVALID`);
  return Date.parse(value);
}

function optionalEvidenceRef(value: unknown, name: string): string | null {
  if (value === null) return null;
  return identifier(value, name);
}

function optionalTimestamp(value: unknown, name: string): number | null {
  if (value === null) return null;
  return timestamp(value, name);
}

function nonNegativeTelemetry(value: unknown, name: string): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) fail(`${name.toUpperCase()}_INVALID`);
  return value;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function policyReasonCodes(policy: AutonomousGrowthPolicyChangeProofV1): AutonomousGrowthCanaryReasonCodeV1[] {
  if (!["NOT_PROPOSED", "SHADOW_ONLY", "APPROVED_PROMOTION"].includes(policy.promotion_state)) fail("POLICY_PROMOTION_STATE_INVALID");
  const shadow = optionalEvidenceRef(policy.shadow_evidence_ref, "policy_shadow_evidence_ref");
  const rollback = optionalEvidenceRef(policy.rollback_evidence_ref, "policy_rollback_evidence_ref");
  const approval = optionalEvidenceRef(policy.approval_evidence_ref, "policy_approval_evidence_ref");
  const reasons: AutonomousGrowthCanaryReasonCodeV1[] = [];
  if (policy.promotion_state === "SHADOW_ONLY" && !shadow) reasons.push("POLICY_SHADOW_PROOF_MISSING");
  if (policy.promotion_state === "APPROVED_PROMOTION") {
    if (!shadow) reasons.push("POLICY_SHADOW_PROOF_MISSING");
    if (!rollback) reasons.push("POLICY_ROLLBACK_PROOF_MISSING");
    if (!approval) reasons.push("POLICY_PROMOTION_APPROVAL_MISSING");
  }
  return reasons;
}

function telemetryComplete(telemetry: AutonomousGrowthTelemetryV1): boolean {
  return Object.values(telemetry).every((value) => value !== null);
}

export function evaluateAutonomousGrowthCanaryV1(input: AutonomousGrowthCanaryInputV1): AutonomousGrowthCanaryResultV1 {
  const runId = identifier(input?.run_id, "run_id");
  const subjectId = identifier(input?.canonical_subject_id, "canonical_subject_id");
  const lineageId = identifier(input?.lineage_id, "lineage_id");
  if (!evidenceModes.has(input?.mode)) fail("MODE_INVALID");
  const evaluatedAtMs = timestamp(input?.evaluated_at, "evaluated_at");
  const freshnessMs = input.operational_freshness_ms ?? DEFAULT_OPERATIONAL_FRESHNESS_MS;
  if (!Number.isFinite(freshnessMs) || freshnessMs <= 0 || freshnessMs > MAX_OPERATIONAL_FRESHNESS_MS) fail("OPERATIONAL_FRESHNESS_INVALID");
  if (!Array.isArray(input.stages)) fail("STAGES_INVALID");
  if (new Set(input.stages.map((stage) => stage.stage)).size !== input.stages.length) fail("STAGE_DUPLICATE");

  if (input.attribution_class !== null && !attributionClasses.has(input.attribution_class)) fail("ATTRIBUTION_CLASS_INVALID");

  const telemetry: AutonomousGrowthTelemetryV1 = Object.freeze({
    owner_burden_minutes: nonNegativeTelemetry(input.telemetry?.owner_burden_minutes, "owner_burden_minutes"),
    safe_work_completed_count: nonNegativeTelemetry(input.telemetry?.safe_work_completed_count, "safe_work_completed_count"),
    missed_window_count: nonNegativeTelemetry(input.telemetry?.missed_window_count, "missed_window_count"),
    duplicate_or_noise_count: nonNegativeTelemetry(input.telemetry?.duplicate_or_noise_count, "duplicate_or_noise_count"),
    stale_campaign_count: nonNegativeTelemetry(input.telemetry?.stale_campaign_count, "stale_campaign_count"),
    recommendation_to_outcome_closed_count: nonNegativeTelemetry(input.telemetry?.recommendation_to_outcome_closed_count, "recommendation_to_outcome_closed_count")
  });

  const approvalEvidenceRef = optionalEvidenceRef(input.execution_boundary?.approval_evidence_ref, "execution_approval_evidence_ref");
  if (typeof input.execution_boundary?.external_action_executed !== "boolean") fail("EXTERNAL_ACTION_EXECUTED_INVALID");

  const provided = new Map<AutonomousGrowthStageV1, AutonomousGrowthStageProofV1>();
  for (const raw of input.stages) {
    if (!AUTONOMOUS_GROWTH_REQUIRED_STAGES_V1.includes(raw.stage)) fail("STAGE_INVALID");
    if (!stageStates.has(raw.state)) fail("STAGE_STATE_INVALID");
    if (!evidenceModes.has(raw.evidence_mode)) fail("STAGE_EVIDENCE_MODE_INVALID");
    optionalEvidenceRef(raw.evidence_ref, "stage_evidence_ref");
    optionalTimestamp(raw.observed_at, "stage_observed_at");
    if (raw.lineage_id !== null) identifier(raw.lineage_id, "stage_lineage_id");
    provided.set(raw.stage, raw);
  }

  const globalReasons: AutonomousGrowthCanaryReasonCodeV1[] = [];
  if (input.mode !== "PRODUCTION") globalReasons.push("NON_PRODUCTION_MODE");
  if (input.attribution_class === null) globalReasons.push("ATTRIBUTION_CLASS_MISSING");
  if (!telemetryComplete(telemetry)) globalReasons.push("TELEMETRY_INCOMPLETE");
  if (input.execution_boundary.external_action_executed && !approvalEvidenceRef) globalReasons.push("EXTERNAL_ACTION_APPROVAL_MISSING");
  globalReasons.push(...policyReasonCodes(input.policy_change));

  const stageResults = AUTONOMOUS_GROWTH_REQUIRED_STAGES_V1.map((stage): AutonomousGrowthStageResultV1 => {
    const proof = provided.get(stage);
    if (!proof) {
      globalReasons.push("STAGE_MISSING");
      return Object.freeze({
        stage,
        state: "MISSING",
        reason_codes: Object.freeze(["STAGE_MISSING"] as AutonomousGrowthCanaryReasonCodeV1[]),
        evidence_ref: null
      });
    }

    const reasons: AutonomousGrowthCanaryReasonCodeV1[] = [];
    if (proof.state === "NOT_PROVEN") reasons.push("STAGE_NOT_PROVEN");
    if (proof.state === "BLOCKED") reasons.push("STAGE_BLOCKED");
    if (proof.evidence_mode !== "PRODUCTION") reasons.push("STAGE_NON_PRODUCTION_EVIDENCE");
    if (!proof.evidence_ref) reasons.push("STAGE_EVIDENCE_REF_MISSING");
    if (!proof.observed_at) reasons.push("STAGE_OBSERVED_AT_MISSING");
    if (!proof.lineage_id) reasons.push("LINEAGE_MISSING");
    else if (proof.lineage_id !== lineageId) reasons.push("LINEAGE_MISMATCH");

    const observedAtMs = proof.observed_at ? Date.parse(proof.observed_at) : null;
    if (observedAtMs !== null && observedAtMs > evaluatedAtMs) reasons.push("STAGE_OBSERVED_IN_FUTURE");
    if (observedAtMs !== null && operationalStages.has(stage) && evaluatedAtMs - observedAtMs > freshnessMs) reasons.push("OPERATIONAL_EVIDENCE_STALE");

    globalReasons.push(...reasons);
    return Object.freeze({ stage, state: proof.state, reason_codes: Object.freeze(unique(reasons)), evidence_ref: proof.evidence_ref });
  });

  const reasons = unique(globalReasons);
  const hasBlocked = stageResults.some((stage) => stage.state === "BLOCKED")
    || reasons.some((reason) => [
      "STAGE_OBSERVED_IN_FUTURE",
      "LINEAGE_MISMATCH",
      "EXTERNAL_ACTION_APPROVAL_MISSING",
      "POLICY_SHADOW_PROOF_MISSING",
      "POLICY_ROLLBACK_PROOF_MISSING",
      "POLICY_PROMOTION_APPROVAL_MISSING"
    ].includes(reason));
  const hasStale = reasons.includes("OPERATIONAL_EVIDENCE_STALE");
  const hasIncomplete = reasons.some((reason) => [
    "STAGE_MISSING",
    "STAGE_NOT_PROVEN",
    "STAGE_NON_PRODUCTION_EVIDENCE",
    "STAGE_EVIDENCE_REF_MISSING",
    "STAGE_OBSERVED_AT_MISSING",
    "LINEAGE_MISSING",
    "ATTRIBUTION_CLASS_MISSING",
    "TELEMETRY_INCOMPLETE"
  ].includes(reason));

  let state: AutonomousGrowthCanaryStateV1;
  if (hasBlocked) state = "BLOCKED";
  else if (hasStale) state = "STALE";
  else if (input.mode !== "PRODUCTION") state = "NON_PRODUCTION_EVIDENCE";
  else if (hasIncomplete) state = "INCOMPLETE";
  else state = "CERTIFIED_PRODUCTION_LOOP";

  const finalReasons = state === "CERTIFIED_PRODUCTION_LOOP"
    ? (["PRODUCTION_LOOP_CERTIFIED"] as AutonomousGrowthCanaryReasonCodeV1[])
    : reasons;

  return Object.freeze({
    contract_version: AUTONOMOUS_GROWTH_CANARY_VERSION_V1,
    run_id: runId,
    evaluated_at: new Date(evaluatedAtMs).toISOString(),
    state,
    canonical_subject_id: subjectId,
    lineage_id: lineageId,
    stages: Object.freeze(stageResults),
    attribution_class: input.attribution_class,
    telemetry,
    reason_codes: Object.freeze(finalReasons),
    limitations: LIMITATIONS,
    authority: AUTHORITY
  });
}
