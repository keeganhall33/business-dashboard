export const GOVERNED_CAPABILITY_CONTRACT_VERSION = "GOVERNED_CAPABILITY_V1" as const;
export const PROCEDURAL_SKILL_CONTRACT_VERSION = "PROCEDURAL_SKILL_V1" as const;

export const CAPABILITY_FABRIC_LIMITS = Object.freeze({
  maxIdentifierLength: 160,
  maxTextLength: 800,
  maxArrayItems: 32,
  maxProcedureSteps: 24,
  maxRuntimeMs: 3_600_000,
  maxCostMicrounits: 10_000_000,
  maxContextTokens: 1_000_000,
  maxResultBytes: 10_000_000,
  maxFreshnessSeconds: 31_536_000
});

export type CapabilitySideEffectClass = "READ_ONLY" | "INTERNAL_WRITE" | "EXTERNAL_CONSEQUENTIAL";
export type CapabilityHealth = "AVAILABLE" | "DEGRADED" | "BLOCKED" | "DEPRECATED" | "UNKNOWN";
export type CapabilityApprovalClass = "NONE" | "POLICY_GATED" | "HUMAN_REQUIRED";
export type ProceduralSkillLifecycle = "DRAFT" | "REVIEWED" | "DEPRECATED" | "SUPERSEDED" | "UNKNOWN";

export type VersionedSchemaRefV1 = Readonly<{ schema_id: string; version: string }>;
export type VersionRangeV1 = Readonly<{ minimum: string; maximum_exclusive: string | null }>;

export type GovernedCapabilityV1 = Readonly<{
  contract_version: typeof GOVERNED_CAPABILITY_CONTRACT_VERSION;
  capability_id: string;
  version: string;
  owner: string;
  purpose: string;
  business_semantics: string;
  input_schema: VersionedSchemaRefV1;
  output_schema: VersionedSchemaRefV1;
  reads: readonly string[];
  writes: readonly string[];
  side_effect_class: CapabilitySideEffectClass;
  required_identity_classes: readonly string[];
  required_scopes: readonly string[];
  required_permissions: readonly string[];
  policy_refs: readonly string[];
  approval_class: CapabilityApprovalClass;
  preconditions: readonly string[];
  validation_rule_refs: readonly string[];
  idempotency: Readonly<{ required: boolean; key_scope: "NONE" | "INVOCATION" | "RESOURCE" }>;
  retry: Readonly<{ max_attempts: number }>;
  rollback: Readonly<{ supported: boolean; procedure_ref: string | null }>;
  source_classes: readonly string[];
  entity_classes: readonly string[];
  decision_classes: readonly string[];
  budgets: Readonly<{
    runtime_ms: number;
    cost_microunits: number;
    context_tokens: number;
    result_bytes: number;
  }>;
  audit_event_class: string;
  lineage_required: boolean;
  discovery: Readonly<{
    summary: string;
    intents: readonly string[];
    entity_classes: readonly string[];
    decision_classes: readonly string[];
    discoverable_by_scopes: readonly string[];
  }>;
  health: CapabilityHealth;
  compatibility: VersionRangeV1;
}>;

export type ProceduralSkillStepV1 = Readonly<{
  step_id: string;
  kind: "ACQUIRE_EVIDENCE" | "INVOKE_CAPABILITY" | "TRANSFORM" | "VALIDATE" | "REVIEW";
  capability_id: string | null;
  depends_on: readonly string[];
  required_evidence_types: readonly string[];
}>;

export type ProceduralSkillV1 = Readonly<{
  contract_version: typeof PROCEDURAL_SKILL_CONTRACT_VERSION;
  skill_id: string;
  version: string;
  owner: string;
  purpose: string;
  applicable_intents: readonly string[];
  entity_classes: readonly string[];
  decision_classes: readonly string[];
  required_evidence_types: readonly string[];
  required_source_types: readonly string[];
  steps: readonly ProceduralSkillStepV1[];
  capability_requirements: readonly Readonly<{
    capability_id: string;
    versions: VersionRangeV1;
  }>[];
  freshness: Readonly<{
    max_age_seconds: number;
    unknown_policy: "BLOCK" | "REVIEW";
  }>;
  evaluation_refs: readonly string[];
  failure_modes: readonly string[];
  guardrail_refs: readonly string[];
  method_provenance: Readonly<{
    originating_analysis_id: string;
    review_id: string;
    reviewed_at: string;
  }>;
  outcome_utility_refs: readonly string[];
  lifecycle: Readonly<{
    state: ProceduralSkillLifecycle;
    superseded_by: string | null;
  }>;
}>;

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const FORBIDDEN_UNKNOWN_KEY = /(^|_)(raw|body|payload|secret|credential|password|token|prompt|transcript|chain_of_thought|current_business_fact|prior_live_result)s?(_|$)/i;

const CAPABILITY_KEYS = new Set([
  "contract_version", "capability_id", "version", "owner", "purpose", "business_semantics",
  "input_schema", "output_schema", "reads", "writes", "side_effect_class", "required_identity_classes",
  "required_scopes", "required_permissions", "policy_refs", "approval_class", "preconditions",
  "validation_rule_refs", "idempotency", "retry", "rollback", "source_classes", "entity_classes",
  "decision_classes", "budgets", "audit_event_class", "lineage_required", "discovery", "health", "compatibility"
]);
const SKILL_KEYS = new Set([
  "contract_version", "skill_id", "version", "owner", "purpose", "applicable_intents", "entity_classes",
  "decision_classes", "required_evidence_types", "required_source_types", "steps", "capability_requirements",
  "freshness", "evaluation_refs", "failure_modes", "guardrail_refs", "method_provenance", "outcome_utility_refs", "lifecycle"
]);

function fail(code: string): never {
  throw new Error(`CAPABILITY_FABRIC_V1_${code}`);
}

function record(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, code: string): void {
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_UNKNOWN_KEY.test(key)) fail("RAW_SECRET_OR_RESULT_FIELD_FORBIDDEN");
    if (!allowed.has(key)) fail(`${code}_UNSUPPORTED_FIELD_${key.toUpperCase()}`);
  }
}

function text(
  value: unknown,
  field: string,
  maximum: number = CAPABILITY_FABRIC_LIMITS.maxIdentifierLength
): string {
  if (typeof value !== "string") fail(`${field.toUpperCase()}_REQUIRED`);
  const normalized = value.trim();
  if (!normalized) fail(`${field.toUpperCase()}_REQUIRED`);
  if (normalized.length > maximum) fail(`${field.toUpperCase()}_TOO_LONG`);
  return normalized;
}

function version(value: unknown, field: string): string {
  const normalized = text(value, field, 32);
  if (!SEMVER.test(normalized)) fail(`${field.toUpperCase()}_INVALID`);
  return normalized;
}

function compareVersion(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function stringArray(value: unknown, field: string, required = false): readonly string[] {
  if (!Array.isArray(value)) fail(`${field.toUpperCase()}_INVALID`);
  if (value.length > CAPABILITY_FABRIC_LIMITS.maxArrayItems) fail(`${field.toUpperCase()}_UNBOUNDED`);
  const normalized = value.map((item) => text(item, field));
  if (required && normalized.length === 0) fail(`${field.toUpperCase()}_REQUIRED`);
  if (new Set(normalized).size !== normalized.length) fail(`${field.toUpperCase()}_DUPLICATE`);
  return Object.freeze([...normalized].sort((a, b) => a.localeCompare(b)));
}

function integer(value: unknown, field: string, maximum: number, minimum = 0): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail(`${field.toUpperCase()}_INVALID`);
  }
  return value as number;
}

function schemaRef(value: unknown, field: string): VersionedSchemaRefV1 {
  const item = record(value, `${field.toUpperCase()}_INVALID`);
  exactKeys(item, new Set(["schema_id", "version"]), field.toUpperCase());
  return deepFreeze({ schema_id: text(item.schema_id, `${field}_schema_id`), version: version(item.version, `${field}_version`) });
}

function versionRange(value: unknown, field: string): VersionRangeV1 {
  const item = record(value, `${field.toUpperCase()}_INVALID`);
  exactKeys(item, new Set(["minimum", "maximum_exclusive"]), field.toUpperCase());
  const minimum = version(item.minimum, `${field}_minimum`);
  const maximumExclusive = item.maximum_exclusive === null ? null : version(item.maximum_exclusive, `${field}_maximum_exclusive`);
  if (maximumExclusive !== null && compareVersion(minimum, maximumExclusive) >= 0) fail(`${field.toUpperCase()}_EMPTY`);
  return deepFreeze({ minimum, maximum_exclusive: maximumExclusive });
}

function inRange(candidate: string, range: VersionRangeV1): boolean {
  return compareVersion(candidate, range.minimum) >= 0 &&
    (range.maximum_exclusive === null || compareVersion(candidate, range.maximum_exclusive) < 0);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export function validateGovernedCapabilityV1(input: unknown): GovernedCapabilityV1 {
  const item = record(input, "CAPABILITY_INVALID");
  exactKeys(item, CAPABILITY_KEYS, "CAPABILITY");
  if (item.contract_version !== GOVERNED_CAPABILITY_CONTRACT_VERSION) fail("CAPABILITY_CONTRACT_VERSION_INVALID");

  const sideEffects = new Set<CapabilitySideEffectClass>(["READ_ONLY", "INTERNAL_WRITE", "EXTERNAL_CONSEQUENTIAL"]);
  const approvals = new Set<CapabilityApprovalClass>(["NONE", "POLICY_GATED", "HUMAN_REQUIRED"]);
  const healthStates = new Set<CapabilityHealth>(["AVAILABLE", "DEGRADED", "BLOCKED", "DEPRECATED", "UNKNOWN"]);
  if (!sideEffects.has(item.side_effect_class as CapabilitySideEffectClass)) fail("SIDE_EFFECT_CLASS_INVALID");
  if (!approvals.has(item.approval_class as CapabilityApprovalClass)) fail("APPROVAL_CLASS_INVALID");
  if (!healthStates.has(item.health as CapabilityHealth)) fail("HEALTH_INVALID");
  if (item.side_effect_class === "EXTERNAL_CONSEQUENTIAL" && item.approval_class === "NONE") {
    fail("CONSEQUENTIAL_APPROVAL_REQUIRED");
  }

  const idempotency = record(item.idempotency, "IDEMPOTENCY_INVALID");
  exactKeys(idempotency, new Set(["required", "key_scope"]), "IDEMPOTENCY");
  if (typeof idempotency.required !== "boolean") fail("IDEMPOTENCY_REQUIRED_INVALID");
  if (!new Set(["NONE", "INVOCATION", "RESOURCE"]).has(idempotency.key_scope as string)) fail("IDEMPOTENCY_KEY_SCOPE_INVALID");
  if (idempotency.required && idempotency.key_scope === "NONE") fail("IDEMPOTENCY_KEY_SCOPE_REQUIRED");

  const retry = record(item.retry, "RETRY_INVALID");
  exactKeys(retry, new Set(["max_attempts"]), "RETRY");
  const rollback = record(item.rollback, "ROLLBACK_INVALID");
  exactKeys(rollback, new Set(["supported", "procedure_ref"]), "ROLLBACK");
  if (typeof rollback.supported !== "boolean") fail("ROLLBACK_SUPPORTED_INVALID");
  const rollbackRef = rollback.procedure_ref === null ? null : text(rollback.procedure_ref, "rollback_procedure_ref");
  if (rollback.supported !== (rollbackRef !== null)) fail("ROLLBACK_SEMANTICS_INVALID");

  const budgets = record(item.budgets, "BUDGETS_INVALID");
  exactKeys(budgets, new Set(["runtime_ms", "cost_microunits", "context_tokens", "result_bytes"]), "BUDGETS");
  const discovery = record(item.discovery, "DISCOVERY_INVALID");
  exactKeys(discovery, new Set(["summary", "intents", "entity_classes", "decision_classes", "discoverable_by_scopes"]), "DISCOVERY");
  if (typeof item.lineage_required !== "boolean") fail("LINEAGE_REQUIRED_INVALID");

  return deepFreeze({
    contract_version: GOVERNED_CAPABILITY_CONTRACT_VERSION,
    capability_id: text(item.capability_id, "capability_id"),
    version: version(item.version, "capability_version"),
    owner: text(item.owner, "owner"),
    purpose: text(item.purpose, "purpose", CAPABILITY_FABRIC_LIMITS.maxTextLength),
    business_semantics: text(item.business_semantics, "business_semantics", CAPABILITY_FABRIC_LIMITS.maxTextLength),
    input_schema: schemaRef(item.input_schema, "input_schema"),
    output_schema: schemaRef(item.output_schema, "output_schema"),
    reads: stringArray(item.reads, "reads"),
    writes: stringArray(item.writes, "writes"),
    side_effect_class: item.side_effect_class as CapabilitySideEffectClass,
    required_identity_classes: stringArray(item.required_identity_classes, "required_identity_classes", true),
    required_scopes: stringArray(item.required_scopes, "required_scopes"),
    required_permissions: stringArray(item.required_permissions, "required_permissions"),
    policy_refs: stringArray(item.policy_refs, "policy_refs", true),
    approval_class: item.approval_class as CapabilityApprovalClass,
    preconditions: stringArray(item.preconditions, "preconditions"),
    validation_rule_refs: stringArray(item.validation_rule_refs, "validation_rule_refs", true),
    idempotency: { required: idempotency.required, key_scope: idempotency.key_scope as "NONE" | "INVOCATION" | "RESOURCE" },
    retry: { max_attempts: integer(retry.max_attempts, "retry_max_attempts", 3, 1) },
    rollback: { supported: rollback.supported, procedure_ref: rollbackRef },
    source_classes: stringArray(item.source_classes, "source_classes"),
    entity_classes: stringArray(item.entity_classes, "entity_classes"),
    decision_classes: stringArray(item.decision_classes, "decision_classes"),
    budgets: {
      runtime_ms: integer(budgets.runtime_ms, "budget_runtime_ms", CAPABILITY_FABRIC_LIMITS.maxRuntimeMs, 1),
      cost_microunits: integer(budgets.cost_microunits, "budget_cost_microunits", CAPABILITY_FABRIC_LIMITS.maxCostMicrounits),
      context_tokens: integer(budgets.context_tokens, "budget_context_tokens", CAPABILITY_FABRIC_LIMITS.maxContextTokens, 1),
      result_bytes: integer(budgets.result_bytes, "budget_result_bytes", CAPABILITY_FABRIC_LIMITS.maxResultBytes, 1)
    },
    audit_event_class: text(item.audit_event_class, "audit_event_class"),
    lineage_required: item.lineage_required,
    discovery: {
      summary: text(discovery.summary, "discovery_summary", CAPABILITY_FABRIC_LIMITS.maxTextLength),
      intents: stringArray(discovery.intents, "discovery_intents", true),
      entity_classes: stringArray(discovery.entity_classes, "discovery_entity_classes"),
      decision_classes: stringArray(discovery.decision_classes, "discovery_decision_classes"),
      discoverable_by_scopes: stringArray(discovery.discoverable_by_scopes, "discoverable_by_scopes", true)
    },
    health: item.health as CapabilityHealth,
    compatibility: versionRange(item.compatibility, "compatibility")
  });
}

function canonicalStep(value: unknown): ProceduralSkillStepV1 {
  const item = record(value, "STEP_INVALID");
  exactKeys(item, new Set(["step_id", "kind", "capability_id", "depends_on", "required_evidence_types"]), "STEP");
  const kinds = new Set(["ACQUIRE_EVIDENCE", "INVOKE_CAPABILITY", "TRANSFORM", "VALIDATE", "REVIEW"]);
  if (!kinds.has(item.kind as string)) fail("STEP_KIND_INVALID");
  const capabilityId = item.capability_id === null ? null : text(item.capability_id, "step_capability_id");
  if (item.kind === "INVOKE_CAPABILITY" && capabilityId === null) fail("STEP_CAPABILITY_REQUIRED");
  return deepFreeze({
    step_id: text(item.step_id, "step_id"),
    kind: item.kind as ProceduralSkillStepV1["kind"],
    capability_id: capabilityId,
    depends_on: stringArray(item.depends_on, "step_dependencies"),
    required_evidence_types: stringArray(item.required_evidence_types, "step_required_evidence_types")
  });
}

export function validateProceduralSkillV1(
  input: unknown,
  capabilities: readonly GovernedCapabilityV1[]
): ProceduralSkillV1 {
  const item = record(input, "SKILL_INVALID");
  exactKeys(item, SKILL_KEYS, "SKILL");
  if (item.contract_version !== PROCEDURAL_SKILL_CONTRACT_VERSION) fail("SKILL_CONTRACT_VERSION_INVALID");
  if (!Array.isArray(item.steps) || item.steps.length === 0) fail("STEPS_REQUIRED");
  if (item.steps.length > CAPABILITY_FABRIC_LIMITS.maxProcedureSteps) fail("STEPS_UNBOUNDED");

  const steps = item.steps.map(canonicalStep);
  const stepIds = new Set(steps.map((step) => step.step_id));
  if (stepIds.size !== steps.length) fail("STEP_ID_DUPLICATE");
  for (const step of steps) {
    if (step.depends_on.some((dependency) => !stepIds.has(dependency) || dependency === step.step_id)) fail("STEP_DEPENDENCY_INVALID");
  }

  if (!Array.isArray(item.capability_requirements)) fail("CAPABILITY_REQUIREMENTS_INVALID");
  if (item.capability_requirements.length > CAPABILITY_FABRIC_LIMITS.maxArrayItems) fail("CAPABILITY_REQUIREMENTS_UNBOUNDED");
  const requirements = item.capability_requirements.map((raw) => {
    const requirement = record(raw, "CAPABILITY_REQUIREMENT_INVALID");
    exactKeys(requirement, new Set(["capability_id", "versions"]), "CAPABILITY_REQUIREMENT");
    return deepFreeze({
      capability_id: text(requirement.capability_id, "required_capability_id"),
      versions: versionRange(requirement.versions, "required_capability_versions")
    });
  }).sort((a, b) => a.capability_id.localeCompare(b.capability_id));
  if (new Set(requirements.map((entry) => entry.capability_id)).size !== requirements.length) fail("CAPABILITY_REQUIREMENT_DUPLICATE");

  const capabilityMap = new Map(capabilities.map((capability) => [capability.capability_id, capability]));
  for (const requirement of requirements) {
    const capability = capabilityMap.get(requirement.capability_id);
    if (!capability || !inRange(capability.version, requirement.versions)) fail("CAPABILITY_VERSION_INCOMPATIBLE");
  }
  for (const step of steps) {
    if (step.capability_id && !requirements.some((requirement) => requirement.capability_id === step.capability_id)) {
      fail("STEP_CAPABILITY_UNDECLARED");
    }
  }

  const freshness = record(item.freshness, "FRESHNESS_INVALID");
  exactKeys(freshness, new Set(["max_age_seconds", "unknown_policy"]), "FRESHNESS");
  if (!new Set(["BLOCK", "REVIEW"]).has(freshness.unknown_policy as string)) fail("FRESHNESS_UNKNOWN_POLICY_INVALID");
  const provenance = record(item.method_provenance, "METHOD_PROVENANCE_INVALID");
  exactKeys(provenance, new Set(["originating_analysis_id", "review_id", "reviewed_at"]), "METHOD_PROVENANCE");
  const reviewedAt = text(provenance.reviewed_at, "reviewed_at", 64);
  if (!ISO_TIMESTAMP.test(reviewedAt) || Number.isNaN(Date.parse(reviewedAt))) fail("REVIEWED_AT_INVALID");
  const lifecycle = record(item.lifecycle, "LIFECYCLE_INVALID");
  exactKeys(lifecycle, new Set(["state", "superseded_by"]), "LIFECYCLE");
  const states = new Set<ProceduralSkillLifecycle>(["DRAFT", "REVIEWED", "DEPRECATED", "SUPERSEDED", "UNKNOWN"]);
  if (!states.has(lifecycle.state as ProceduralSkillLifecycle)) fail("SKILL_LIFECYCLE_INVALID");
  const supersededBy = lifecycle.superseded_by === null ? null : text(lifecycle.superseded_by, "superseded_by");
  if ((lifecycle.state === "SUPERSEDED") !== (supersededBy !== null)) fail("SUPERSESSION_SEMANTICS_INVALID");

  return deepFreeze({
    contract_version: PROCEDURAL_SKILL_CONTRACT_VERSION,
    skill_id: text(item.skill_id, "skill_id"),
    version: version(item.version, "skill_version"),
    owner: text(item.owner, "owner"),
    purpose: text(item.purpose, "purpose", CAPABILITY_FABRIC_LIMITS.maxTextLength),
    applicable_intents: stringArray(item.applicable_intents, "applicable_intents", true),
    entity_classes: stringArray(item.entity_classes, "entity_classes"),
    decision_classes: stringArray(item.decision_classes, "decision_classes"),
    required_evidence_types: stringArray(item.required_evidence_types, "required_evidence_types", true),
    required_source_types: stringArray(item.required_source_types, "required_source_types", true),
    steps: Object.freeze([...steps].sort((a, b) => a.step_id.localeCompare(b.step_id))),
    capability_requirements: Object.freeze(requirements),
    freshness: {
      max_age_seconds: integer(freshness.max_age_seconds, "freshness_max_age_seconds", CAPABILITY_FABRIC_LIMITS.maxFreshnessSeconds, 1),
      unknown_policy: freshness.unknown_policy as "BLOCK" | "REVIEW"
    },
    evaluation_refs: stringArray(item.evaluation_refs, "evaluation_refs", true),
    failure_modes: stringArray(item.failure_modes, "failure_modes", true),
    guardrail_refs: stringArray(item.guardrail_refs, "guardrail_refs", true),
    method_provenance: {
      originating_analysis_id: text(provenance.originating_analysis_id, "originating_analysis_id"),
      review_id: text(provenance.review_id, "review_id"),
      reviewed_at: reviewedAt
    },
    outcome_utility_refs: stringArray(item.outcome_utility_refs, "outcome_utility_refs"),
    lifecycle: { state: lifecycle.state as ProceduralSkillLifecycle, superseded_by: supersededBy }
  });
}
