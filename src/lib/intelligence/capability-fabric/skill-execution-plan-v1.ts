import {
  CAPABILITY_FABRIC_LIMITS,
  validateGovernedCapabilityV1,
  validateProceduralSkillV1,
  type CapabilityApprovalClass,
  type GovernedCapabilityV1,
  type ProceduralSkillStepV1,
  type ProceduralSkillV1,
  type VersionedSchemaRefV1
} from "./contracts-v1";
import type { RegistryMatchV1 } from "./registry-v1";
import {
  validateWorkflowGraphV1,
  type WorkflowGraphV1
} from "../workflow-graph/workflow-graph-v1";

export const SKILL_EXECUTION_PLAN_VERSION = "SKILL_EXECUTION_PLAN_V1" as const;

export const SKILL_EXECUTION_PLAN_LIMITS = Object.freeze({
  maxEvidenceRecords: 64,
  maxPolicyRefs: 32,
  maxBlockers: 64,
  maxRetries: 3
});

export type SkillPlanReadinessV1 =
  | "READY"
  | "NEEDS_FRESH_EVIDENCE"
  | "NEEDS_APPROVAL"
  | "DEGRADED"
  | "BLOCKED"
  | "UNKNOWN";

export type SkillPlanEvidenceTruthV1 =
  | "CURRENT"
  | "STALE"
  | "CONFLICTED"
  | "UNKNOWN";

export type SkillPlanEvidenceAuthorityV1 =
  | "DIRECT"
  | "AUTHORITATIVE"
  | "DERIVED"
  | "UNKNOWN";

export type SkillPlanEvidenceV1 = Readonly<{
  evidence_type: string;
  source_type: string;
  source_ref: string;
  observed_at: string | null;
  truth_state: SkillPlanEvidenceTruthV1;
  authority: SkillPlanEvidenceAuthorityV1;
}>;

export type SkillPlanBudgetV1 = Readonly<{
  runtime_ms: number;
  cost_microunits: number;
  context_tokens: number;
  result_bytes: number;
  max_retries: number;
}>;

export type SkillPlanAuthorizationV1 = Readonly<{
  capability_id: string;
  version: string;
  discovery_visible: boolean;
  execution_eligible: boolean;
  approval_required: boolean;
  blockers: readonly string[];
}>;

export type SkillExecutionStepV1 = Readonly<{
  step_id: string;
  kind: ProceduralSkillStepV1["kind"];
  depends_on: readonly string[];
  capability_ref: Readonly<{ capability_id: string; version: string }> | null;
  allowed_evidence_refs: readonly string[];
  expected_output_schema: VersionedSchemaRefV1 | null;
  validation_refs: readonly string[];
  approval_class: CapabilityApprovalClass;
  max_attempts: number;
}>;

export type SkillExecutionPlanV1 = Readonly<{
  contract_version: typeof SKILL_EXECUTION_PLAN_VERSION;
  skill_ref: Readonly<{ skill_id: string; version: string }>;
  capability_refs: readonly Readonly<{ capability_id: string; version: string }>[];
  policy_refs: readonly string[];
  evidence_refs: readonly Readonly<{
    evidence_type: string;
    source_type: string;
    source_ref: string;
    observed_at: string | null;
    truth_state: SkillPlanEvidenceTruthV1;
    authority: SkillPlanEvidenceAuthorityV1;
  }>[];
  steps: readonly SkillExecutionStepV1[];
  validation_gates: readonly string[];
  approval_gates: readonly string[];
  lineage_anchors: readonly string[];
  budgets: SkillPlanBudgetV1;
  expected_output_schema: VersionedSchemaRefV1;
  producer_identity: string;
  verifier_identity: string | null;
  workflow_graph_ref: Readonly<{ graph_id: string; version: "WORKFLOW_GRAPH_V1" }> | null;
  readiness: SkillPlanReadinessV1;
  blockers: readonly string[];
  reason_codes: readonly string[];
  prior_run_outputs_excluded: true;
}>;

export type SkillExecutionPlanInputV1 = Readonly<{
  skill: unknown;
  capabilities: readonly unknown[];
  authorization: readonly unknown[];
  evidence: readonly unknown[];
  policy_refs: readonly string[];
  budget: unknown;
  expected_output_schema: unknown;
  evaluated_at: string;
  producer_identity: string;
  verifier_identity: string | null;
  workflow_graph: unknown | null;
}>;

type UnknownRecord = Record<string, unknown>;

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const SENSITIVE_KEY = /(^|_)(raw|body|payload|secret|credential|password|token|prompt|transcript|chain_of_thought|prior_live_result|current_business_fact)s?(_|$)/i;

function fail(code: string): never {
  throw new Error(`SKILL_EXECUTION_PLAN_V1_${code}`);
}

function record(value: unknown, code: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value as UnknownRecord;
}

function exactKeys(value: UnknownRecord, allowed: readonly string[], code: string): void {
  const accepted = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (accepted.has(key)) continue;
    if (SENSITIVE_KEY.test(key)) fail("SENSITIVE_INPUT_FORBIDDEN");
    fail(`${code}_UNSUPPORTED_FIELD_${key.toUpperCase()}`);
  }
}

function identifier(value: unknown, code: string): string {
  if (
    typeof value !== "string" ||
    !IDENTIFIER.test(value) ||
    value.length > CAPABILITY_FABRIC_LIMITS.maxIdentifierLength
  ) fail(code);
  return value;
}

function timestamp(value: unknown, code: string): string {
  if (typeof value !== "string" || !ISO_TIMESTAMP.test(value) || Number.isNaN(Date.parse(value))) {
    fail(code);
  }
  return value;
}

function integer(value: unknown, maximum: number, code: string, minimum = 0): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) fail(code);
  return value as number;
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((left, right) => left.localeCompare(right)));
}

function identifiers(value: unknown, maximum: number, code: string): readonly string[] {
  if (!Array.isArray(value) || value.length > maximum) fail(code);
  const result = value.map((item) => identifier(item, code));
  if (new Set(result).size !== result.length) fail(`${code}_DUPLICATE`);
  return sortedUnique(result);
}

function schemaRef(value: unknown): VersionedSchemaRefV1 {
  const item = record(value, "OUTPUT_SCHEMA_INVALID");
  exactKeys(item, ["schema_id", "version"], "OUTPUT_SCHEMA");
  const schemaId = identifier(item.schema_id, "OUTPUT_SCHEMA_ID_INVALID");
  if (typeof item.version !== "string" || !SEMVER.test(item.version)) fail("OUTPUT_SCHEMA_VERSION_INVALID");
  return Object.freeze({ schema_id: schemaId, version: item.version });
}

function budget(value: unknown): SkillPlanBudgetV1 {
  const item = record(value, "BUDGET_INVALID");
  exactKeys(item, ["runtime_ms", "cost_microunits", "context_tokens", "result_bytes", "max_retries"], "BUDGET");
  return Object.freeze({
    runtime_ms: integer(item.runtime_ms, CAPABILITY_FABRIC_LIMITS.maxRuntimeMs, "BUDGET_RUNTIME_INVALID", 1),
    cost_microunits: integer(item.cost_microunits, CAPABILITY_FABRIC_LIMITS.maxCostMicrounits, "BUDGET_COST_INVALID"),
    context_tokens: integer(item.context_tokens, CAPABILITY_FABRIC_LIMITS.maxContextTokens, "BUDGET_CONTEXT_INVALID", 1),
    result_bytes: integer(item.result_bytes, CAPABILITY_FABRIC_LIMITS.maxResultBytes, "BUDGET_RESULT_INVALID", 1),
    max_retries: integer(item.max_retries, SKILL_EXECUTION_PLAN_LIMITS.maxRetries, "BUDGET_RETRIES_INVALID")
  });
}

function evidenceRecords(value: unknown, evaluatedAt: string): readonly SkillPlanEvidenceV1[] {
  if (!Array.isArray(value) || value.length > SKILL_EXECUTION_PLAN_LIMITS.maxEvidenceRecords) {
    fail("EVIDENCE_INVALID");
  }
  const truthStates = new Set<SkillPlanEvidenceTruthV1>(["CURRENT", "STALE", "CONFLICTED", "UNKNOWN"]);
  const authorities = new Set<SkillPlanEvidenceAuthorityV1>(["DIRECT", "AUTHORITATIVE", "DERIVED", "UNKNOWN"]);
  const seen = new Set<string>();
  const result = value.map((entry) => {
    const item = record(entry, "EVIDENCE_RECORD_INVALID");
    exactKeys(item, ["evidence_type", "source_type", "source_ref", "observed_at", "truth_state", "authority"], "EVIDENCE");
    if (!truthStates.has(item.truth_state as SkillPlanEvidenceTruthV1)) fail("EVIDENCE_TRUTH_STATE_INVALID");
    if (!authorities.has(item.authority as SkillPlanEvidenceAuthorityV1)) fail("EVIDENCE_AUTHORITY_INVALID");
    const observedAt = item.observed_at === null ? null : timestamp(item.observed_at, "EVIDENCE_OBSERVED_AT_INVALID");
    if (observedAt !== null && Date.parse(observedAt) > Date.parse(evaluatedAt)) fail("EVIDENCE_FROM_FUTURE");
    const accepted = Object.freeze({
      evidence_type: identifier(item.evidence_type, "EVIDENCE_TYPE_INVALID"),
      source_type: identifier(item.source_type, "EVIDENCE_SOURCE_TYPE_INVALID"),
      source_ref: identifier(item.source_ref, "EVIDENCE_SOURCE_REF_INVALID"),
      observed_at: observedAt,
      truth_state: item.truth_state as SkillPlanEvidenceTruthV1,
      authority: item.authority as SkillPlanEvidenceAuthorityV1
    });
    const key = `${accepted.evidence_type}|${accepted.source_type}|${accepted.source_ref}`;
    if (seen.has(key)) fail("EVIDENCE_DUPLICATE");
    seen.add(key);
    return accepted;
  });
  return Object.freeze(result.sort((a, b) =>
    a.evidence_type.localeCompare(b.evidence_type) ||
    a.source_type.localeCompare(b.source_type) ||
    a.source_ref.localeCompare(b.source_ref)
  ));
}

function authorizations(value: unknown): readonly SkillPlanAuthorizationV1[] {
  if (!Array.isArray(value) || value.length > CAPABILITY_FABRIC_LIMITS.maxArrayItems) {
    fail("AUTHORIZATION_INVALID");
  }
  const seen = new Set<string>();
  const result = value.map((entry) => {
    const item = record(entry, "AUTHORIZATION_RECORD_INVALID");
    exactKeys(
      item,
      ["capability_id", "version", "discovery_visible", "execution_eligible", "approval_required", "blockers"],
      "AUTHORIZATION"
    );
    if (
      typeof item.version !== "string" || !SEMVER.test(item.version) ||
      typeof item.discovery_visible !== "boolean" ||
      typeof item.execution_eligible !== "boolean" ||
      typeof item.approval_required !== "boolean"
    ) fail("AUTHORIZATION_RECORD_INVALID");
    const accepted = Object.freeze({
      capability_id: identifier(item.capability_id, "AUTHORIZATION_CAPABILITY_ID_INVALID"),
      version: item.version,
      discovery_visible: item.discovery_visible,
      execution_eligible: item.execution_eligible,
      approval_required: item.approval_required,
      blockers: identifiers(item.blockers, CAPABILITY_FABRIC_LIMITS.maxArrayItems, "AUTHORIZATION_BLOCKERS_INVALID")
    });
    if (accepted.execution_eligible && (!accepted.discovery_visible || accepted.blockers.length > 0)) {
      fail("AUTHORIZATION_SEMANTICS_INVALID");
    }
    if (!accepted.execution_eligible && accepted.discovery_visible && accepted.blockers.length === 0) {
      fail("AUTHORIZATION_BLOCKER_REQUIRED");
    }
    const key = `${accepted.capability_id}@${accepted.version}`;
    if (seen.has(key)) fail("AUTHORIZATION_DUPLICATE");
    seen.add(key);
    return accepted;
  });
  return Object.freeze(result.sort((a, b) =>
    a.capability_id.localeCompare(b.capability_id) || a.version.localeCompare(b.version)
  ));
}

function selectedCapabilities(value: readonly unknown[]): readonly GovernedCapabilityV1[] {
  if (value.length > CAPABILITY_FABRIC_LIMITS.maxArrayItems) fail("CAPABILITIES_UNBOUNDED");
  const capabilities = value.map(validateGovernedCapabilityV1).sort((a, b) =>
    a.capability_id.localeCompare(b.capability_id) || a.version.localeCompare(b.version)
  );
  const seen = new Set<string>();
  for (const capability of capabilities) {
    if (seen.has(capability.capability_id)) fail("CAPABILITY_SELECTION_AMBIGUOUS");
    seen.add(capability.capability_id);
  }
  return Object.freeze(capabilities);
}

function orderedSteps(skill: ProceduralSkillV1): readonly ProceduralSkillStepV1[] {
  const pending = new Map(skill.steps.map((step) => [step.step_id, step]));
  const emitted = new Set<string>();
  const ordered: ProceduralSkillStepV1[] = [];
  while (pending.size) {
    const ready = [...pending.values()]
      .filter((step) => step.depends_on.every((dependency) => emitted.has(dependency)))
      .sort((a, b) => a.step_id.localeCompare(b.step_id));
    if (!ready.length) fail("STEP_DEPENDENCY_CYCLE");
    for (const step of ready) {
      pending.delete(step.step_id);
      emitted.add(step.step_id);
      ordered.push(step);
    }
  }
  return Object.freeze(ordered);
}

function aggregateBudgets(capabilities: readonly GovernedCapabilityV1[]): Omit<SkillPlanBudgetV1, "max_retries"> {
  return capabilities.reduce((total, capability) => ({
    runtime_ms: total.runtime_ms + capability.budgets.runtime_ms,
    cost_microunits: total.cost_microunits + capability.budgets.cost_microunits,
    context_tokens: total.context_tokens + capability.budgets.context_tokens,
    result_bytes: total.result_bytes + capability.budgets.result_bytes
  }), { runtime_ms: 0, cost_microunits: 0, context_tokens: 0, result_bytes: 0 });
}

function compatibleWorkflowGraph(value: unknown, skill: ProceduralSkillV1): WorkflowGraphV1 | null {
  if (value === null) return null;
  const validation = validateWorkflowGraphV1(value);
  if (!validation.valid) fail("WORKFLOW_GRAPH_INVALID");
  const graph = value as WorkflowGraphV1;
  const graphNodes = [...graph.nodes.map((node) => node.id)].sort();
  const skillSteps = [...skill.steps.map((step) => step.step_id)].sort();
  if (graphNodes.length !== skillSteps.length || graphNodes.some((node, index) => node !== skillSteps[index])) {
    fail("WORKFLOW_GRAPH_INCOMPATIBLE");
  }
  return graph;
}

function readinessFor(blockers: readonly string[], reasons: readonly string[]): SkillPlanReadinessV1 {
  const hardBlockers = blockers.filter((code) =>
    code !== "EVIDENCE_STALE" &&
    code !== "APPROVAL_REQUIRED" &&
    code !== "EVIDENCE_UNKNOWN" &&
    code !== "CAPABILITY_HEALTH_UNKNOWN" &&
    code !== "SKILL_LIFECYCLE_UNKNOWN"
  );
  if (hardBlockers.length) return "BLOCKED";
  if (blockers.some((code) => code === "EVIDENCE_STALE")) return "NEEDS_FRESH_EVIDENCE";
  if (blockers.some((code) => code === "APPROVAL_REQUIRED")) return "NEEDS_APPROVAL";
  if (blockers.some((code) => code.includes("UNKNOWN"))) return "UNKNOWN";
  if (reasons.some((code) => code.includes("DEGRADED"))) return "DEGRADED";
  return "READY";
}

export function planProceduralSkillExecutionV1(input: SkillExecutionPlanInputV1): SkillExecutionPlanV1 {
  const root = record(input, "INPUT_INVALID");
  exactKeys(root, [
    "skill", "capabilities", "authorization", "evidence", "policy_refs", "budget",
    "expected_output_schema", "evaluated_at", "producer_identity", "verifier_identity", "workflow_graph"
  ], "INPUT");
  if (!Array.isArray(root.capabilities)) fail("CAPABILITIES_INVALID");
  const evaluatedAt = timestamp(root.evaluated_at, "EVALUATED_AT_INVALID");
  const capabilities = selectedCapabilities(root.capabilities);
  const skill = validateProceduralSkillV1(root.skill, capabilities);
  const authorization = authorizations(root.authorization);
  const evidence = evidenceRecords(root.evidence, evaluatedAt);
  const policyRefs = identifiers(root.policy_refs, SKILL_EXECUTION_PLAN_LIMITS.maxPolicyRefs, "POLICY_REFS_INVALID");
  const taskBudget = budget(root.budget);
  const outputSchema = schemaRef(root.expected_output_schema);
  const producerIdentity = identifier(root.producer_identity, "PRODUCER_IDENTITY_INVALID");
  const verifierIdentity = root.verifier_identity === null
    ? null
    : identifier(root.verifier_identity, "VERIFIER_IDENTITY_INVALID");
  const graph = compatibleWorkflowGraph(root.workflow_graph, skill);

  const blockers: string[] = [];
  const reasons: string[] = ["METHOD_ONLY_REUSE", "PRIOR_RUN_OUTPUTS_EXCLUDED"];
  const requiredCapabilities = skill.capability_requirements.map((requirement) => {
    const capability = capabilities.find((candidate) => candidate.capability_id === requirement.capability_id);
    if (!capability) fail("CAPABILITY_VERSION_INCOMPATIBLE");
    return capability;
  });

  if (skill.lifecycle.state === "UNKNOWN") blockers.push("SKILL_LIFECYCLE_UNKNOWN");
  else if (skill.lifecycle.state !== "REVIEWED") blockers.push(`SKILL_LIFECYCLE_${skill.lifecycle.state}`);

  const requiredPolicyRefs = sortedUnique([
    ...skill.guardrail_refs,
    ...requiredCapabilities.flatMap((capability) => capability.policy_refs)
  ]);
  for (const policyRef of requiredPolicyRefs) {
    if (!policyRefs.includes(policyRef)) blockers.push("POLICY_REF_MISSING");
  }

  const requiredEvidence = new Set(skill.required_evidence_types);
  const requiredSources = new Set(skill.required_source_types);
  for (const evidenceType of requiredEvidence) {
    const typed = evidence.filter((item) => item.evidence_type === evidenceType);
    if (!typed.length) blockers.push("EVIDENCE_MISSING");
    else if (requiredSources.size && !typed.some((item) => requiredSources.has(item.source_type))) {
      blockers.push("EVIDENCE_SOURCE_MISMATCH");
    }
  }
  for (const sourceType of requiredSources) {
    if (!evidence.some((item) => item.source_type === sourceType)) blockers.push("SOURCE_MISSING");
  }
  for (const item of evidence.filter((candidate) =>
    requiredEvidence.has(candidate.evidence_type) &&
    (!requiredSources.size || requiredSources.has(candidate.source_type))
  )) {
    if (item.truth_state === "CONFLICTED") blockers.push("EVIDENCE_CONFLICTED");
    if (item.truth_state === "UNKNOWN" || item.observed_at === null || item.authority === "UNKNOWN") {
      blockers.push(skill.freshness.unknown_policy === "BLOCK" ? "EVIDENCE_UNKNOWN_BLOCKED" : "EVIDENCE_UNKNOWN");
      continue;
    }
    if (
      item.truth_state === "STALE" ||
      Date.parse(evaluatedAt) - Date.parse(item.observed_at) > skill.freshness.max_age_seconds * 1_000
    ) blockers.push("EVIDENCE_STALE");
    if (item.authority === "DERIVED") reasons.push("SOURCE_AUTHORITY_DEGRADED");
  }

  for (const capability of requiredCapabilities) {
    const decision = authorization.find((candidate) =>
      candidate.capability_id === capability.capability_id && candidate.version === capability.version
    );
    if (!decision) {
      blockers.push("AUTHORIZATION_DECISION_MISSING");
      continue;
    }
    if (!decision.execution_eligible) {
      if (decision.approval_required && decision.blockers.length > 0 && decision.blockers.every((code) => code.includes("APPROVAL"))) {
        blockers.push("APPROVAL_REQUIRED");
      } else {
        blockers.push("CAPABILITY_NOT_AUTHORIZED");
      }
    }
    if (capability.health === "UNKNOWN") blockers.push("CAPABILITY_HEALTH_UNKNOWN");
    else if (capability.health === "DEGRADED") reasons.push("CAPABILITY_HEALTH_DEGRADED");
    else if (capability.health !== "AVAILABLE") blockers.push(`CAPABILITY_HEALTH_${capability.health}`);
  }

  const aggregate = aggregateBudgets(requiredCapabilities);
  if (
    aggregate.runtime_ms > taskBudget.runtime_ms ||
    aggregate.cost_microunits > taskBudget.cost_microunits ||
    aggregate.context_tokens > taskBudget.context_tokens ||
    aggregate.result_bytes > taskBudget.result_bytes
  ) blockers.push("BUDGET_EXCEEDED");

  const independentReviewRequired = skill.steps.some((step) => step.kind === "REVIEW");
  if (independentReviewRequired && verifierIdentity === null) blockers.push("VERIFIER_IDENTITY_MISSING");
  if (independentReviewRequired && verifierIdentity === producerIdentity) blockers.push("VERIFIER_IDENTITY_COLLAPSED");

  const ordered = orderedSteps(skill);
  const capabilityMap = new Map(requiredCapabilities.map((capability) => [capability.capability_id, capability]));
  const steps = ordered.map((step, index): SkillExecutionStepV1 => {
    const capability = step.capability_id === null ? null : capabilityMap.get(step.capability_id) ?? null;
    const allowedEvidenceRefs = evidence
      .filter((item) => step.required_evidence_types.includes(item.evidence_type))
      .map((item) => item.source_ref);
    const isFinal = index === ordered.length - 1;
    return Object.freeze({
      step_id: step.step_id,
      kind: step.kind,
      depends_on: sortedUnique(step.depends_on),
      capability_ref: capability === null
        ? null
        : Object.freeze({ capability_id: capability.capability_id, version: capability.version }),
      allowed_evidence_refs: sortedUnique(allowedEvidenceRefs),
      expected_output_schema: capability?.output_schema ?? (isFinal ? outputSchema : null),
      validation_refs: sortedUnique([
        ...skill.evaluation_refs,
        ...(capability?.validation_rule_refs ?? [])
      ]),
      approval_class: capability?.approval_class ?? "NONE",
      max_attempts: capability === null
        ? 1
        : Math.min(capability.retry.max_attempts, taskBudget.max_retries + 1)
    });
  });

  const approvalGates = requiredCapabilities
    .filter((capability) => capability.approval_class !== "NONE")
    .map((capability) => `${capability.capability_id}:${capability.approval_class}`);
  if (independentReviewRequired) approvalGates.push("INDEPENDENT_VERIFIER_REQUIRED");
  const uniqueBlockers = sortedUnique(blockers).slice(0, SKILL_EXECUTION_PLAN_LIMITS.maxBlockers);
  const uniqueReasons = sortedUnique(reasons);

  return Object.freeze({
    contract_version: SKILL_EXECUTION_PLAN_VERSION,
    skill_ref: Object.freeze({ skill_id: skill.skill_id, version: skill.version }),
    capability_refs: Object.freeze(requiredCapabilities.map((capability) => Object.freeze({
      capability_id: capability.capability_id,
      version: capability.version
    }))),
    policy_refs: policyRefs,
    evidence_refs: evidence,
    steps: Object.freeze(steps),
    validation_gates: sortedUnique([...skill.evaluation_refs, ...skill.guardrail_refs]),
    approval_gates: sortedUnique(approvalGates),
    lineage_anchors: sortedUnique([
      skill.method_provenance.originating_analysis_id,
      skill.method_provenance.review_id,
      ...evidence.map((item) => item.source_ref),
      ...requiredCapabilities.map((capability) => `${capability.capability_id}@${capability.version}`),
      ...policyRefs
    ]),
    budgets: taskBudget,
    expected_output_schema: outputSchema,
    producer_identity: producerIdentity,
    verifier_identity: verifierIdentity,
    workflow_graph_ref: graph === null
      ? null
      : Object.freeze({ graph_id: graph.id, version: graph.version }),
    readiness: readinessFor(uniqueBlockers, uniqueReasons),
    blockers: uniqueBlockers,
    reason_codes: uniqueReasons,
    prior_run_outputs_excluded: true
  });
}

export function authorizationFromRegistryMatchV1(match: RegistryMatchV1): SkillPlanAuthorizationV1 {
  if (match.record_type !== "CAPABILITY") fail("REGISTRY_MATCH_NOT_CAPABILITY");
  return Object.freeze({
    capability_id: match.record_id,
    version: match.version,
    discovery_visible: match.discovery_visible,
    execution_eligible: match.execution_eligible,
    approval_required: match.approval_required,
    blockers: sortedUnique(match.blockers)
  });
}
