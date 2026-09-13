import {
  validateGovernedCapabilityV1,
  validateProceduralSkillV1,
  type CapabilityHealth,
  type CapabilitySideEffectClass,
  type GovernedCapabilityV1,
  type ProceduralSkillLifecycle,
  type ProceduralSkillV1
} from "./contracts-v1";

export const PERMISSION_AWARE_REGISTRY_VERSION = "PERMISSION_AWARE_REGISTRY_V1" as const;

export const PERMISSION_AWARE_REGISTRY_LIMITS = Object.freeze({
  maxRecords: 64,
  maxResults: 20,
  maxQueryTerms: 16
});

export type RegistryCallerV1 = Readonly<{
  identity_class: string;
  scopes: readonly string[];
  permissions: readonly string[];
  policy_refs: readonly string[];
  approved_capability_ids: readonly string[];
}>;

export type RegistryBudgetCeilingV1 = Readonly<{
  runtime_ms: number;
  cost_microunits: number;
  context_tokens: number;
  result_bytes: number;
}>;

export type RegistryQueryV1 = Readonly<{
  intent: string;
  entity_classes: readonly string[];
  decision_classes: readonly string[];
  side_effect_ceiling: CapabilitySideEffectClass;
  budgets: RegistryBudgetCeilingV1 | null;
  evaluated_at: string;
  max_results: number;
}>;

export type RegistryHealthStateV1 =
  | CapabilityHealth
  | ProceduralSkillLifecycle
  | "STALE";

export type RegistryMatchV1 = Readonly<{
  record_type: "CAPABILITY" | "SKILL";
  record_id: string;
  version: string;
  discovery_visible: boolean;
  execution_eligible: boolean;
  health_state: RegistryHealthStateV1;
  side_effect_class: CapabilitySideEffectClass | null;
  approval_required: boolean;
  missing_scopes: readonly string[];
  missing_permissions: readonly string[];
  missing_policy_refs: readonly string[];
  blockers: readonly string[];
  reason_codes: readonly string[];
  budget_fit: "FIT" | "EXCEEDS" | "UNKNOWN";
  utility_evidence: "SUPPORTED" | "UNKNOWN";
}>;

export type PermissionAwareRegistryResultV1 = Readonly<{
  contract_version: typeof PERMISSION_AWARE_REGISTRY_VERSION;
  matches: readonly RegistryMatchV1[];
  truncated: boolean;
}>;

type Candidate = {
  match: RegistryMatchV1;
  intentMatch: boolean;
  entityMatches: number;
  decisionMatches: number;
  sideEffectRank: number;
  budgetCost: number;
  budgetRuntime: number;
};

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const FORBIDDEN_INPUT_KEY = /(^|_)(raw|body|payload|secret|credential|password|token|prompt|transcript|chain_of_thought)s?(_|$)/i;
const SIDE_EFFECT_RANK: Readonly<Record<CapabilitySideEffectClass, number>> = Object.freeze({
  READ_ONLY: 0,
  INTERNAL_WRITE: 1,
  EXTERNAL_CONSEQUENTIAL: 2
});

function fail(code: string): never {
  throw new Error("PERMISSION_AWARE_REGISTRY_V1_" + code);
}

function object(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], code: string): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_INPUT_KEY.test(key)) fail("SENSITIVE_INPUT_FORBIDDEN");
    if (!allowed.has(key)) fail(code + "_UNSUPPORTED_FIELD_" + key.toUpperCase());
  }
}

function nonEmptyText(value: unknown, code: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 160) fail(code);
  return value.trim();
}

function stringSet(value: unknown, code: string): ReadonlySet<string> {
  if (!Array.isArray(value) || value.length > PERMISSION_AWARE_REGISTRY_LIMITS.maxQueryTerms) fail(code);
  const values = value.map((entry) => nonEmptyText(entry, code));
  if (new Set(values).size !== values.length) fail(code + "_DUPLICATE");
  return new Set(values);
}

function positiveInteger(value: unknown, maximum: number, code: string, minimum = 0): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) fail(code);
  return value as number;
}

function canonicalCaller(input: unknown): RegistryCallerV1 {
  const caller = object(input, "CALLER_INVALID");
  exactKeys(caller, ["identity_class", "scopes", "permissions", "policy_refs", "approved_capability_ids"], "CALLER");
  return Object.freeze({
    identity_class: nonEmptyText(caller.identity_class, "CALLER_IDENTITY_REQUIRED"),
    scopes: Object.freeze([...stringSet(caller.scopes, "CALLER_SCOPES_INVALID")].sort()),
    permissions: Object.freeze([...stringSet(caller.permissions, "CALLER_PERMISSIONS_INVALID")].sort()),
    policy_refs: Object.freeze([...stringSet(caller.policy_refs, "CALLER_POLICY_REFS_INVALID")].sort()),
    approved_capability_ids: Object.freeze([...stringSet(caller.approved_capability_ids, "CALLER_APPROVALS_INVALID")].sort())
  });
}

function canonicalBudgets(input: unknown): RegistryBudgetCeilingV1 | null {
  if (input === null) return null;
  const budgets = object(input, "QUERY_BUDGETS_INVALID");
  exactKeys(budgets, ["runtime_ms", "cost_microunits", "context_tokens", "result_bytes"], "QUERY_BUDGETS");
  return Object.freeze({
    runtime_ms: positiveInteger(budgets.runtime_ms, Number.MAX_SAFE_INTEGER, "QUERY_RUNTIME_BUDGET_INVALID", 1),
    cost_microunits: positiveInteger(budgets.cost_microunits, Number.MAX_SAFE_INTEGER, "QUERY_COST_BUDGET_INVALID"),
    context_tokens: positiveInteger(budgets.context_tokens, Number.MAX_SAFE_INTEGER, "QUERY_CONTEXT_BUDGET_INVALID", 1),
    result_bytes: positiveInteger(budgets.result_bytes, Number.MAX_SAFE_INTEGER, "QUERY_RESULT_BUDGET_INVALID", 1)
  });
}

function canonicalQuery(input: unknown): RegistryQueryV1 {
  const query = object(input, "QUERY_INVALID");
  exactKeys(
    query,
    ["intent", "entity_classes", "decision_classes", "side_effect_ceiling", "budgets", "evaluated_at", "max_results"],
    "QUERY"
  );
  if (typeof query.side_effect_ceiling !== "string" || !(query.side_effect_ceiling in SIDE_EFFECT_RANK)) {\n    fail("QUERY_SIDE_EFFECT_CEILING_INVALID");\n  }
  const evaluatedAt = nonEmptyText(query.evaluated_at, "QUERY_EVALUATED_AT_REQUIRED");
  if (!ISO_TIMESTAMP.test(evaluatedAt) || Number.isNaN(Date.parse(evaluatedAt))) fail("QUERY_EVALUATED_AT_INVALID");
  return Object.freeze({
    intent: nonEmptyText(query.intent, "QUERY_INTENT_REQUIRED"),
    entity_classes: Object.freeze([...stringSet(query.entity_classes, "QUERY_ENTITY_CLASSES_INVALID")].sort()),
    decision_classes: Object.freeze([...stringSet(query.decision_classes, "QUERY_DECISION_CLASSES_INVALID")].sort()),
    side_effect_ceiling: query.side_effect_ceiling as CapabilitySideEffectClass,
    budgets: canonicalBudgets(query.budgets),
    evaluated_at: evaluatedAt,
    max_results: positiveInteger(
      query.max_results,
      PERMISSION_AWARE_REGISTRY_LIMITS.maxResults,
      "QUERY_MAX_RESULTS_INVALID",
      1
    )
  });
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function includesNormalized(values: readonly string[], sought: string): boolean {
  const target = normalized(sought);
  return values.some((value) => normalized(value) === target);
}

function intersectionCount(left: readonly string[], right: readonly string[]): number {
  const values = new Set(left.map(normalized));
  return new Set(right.map(normalized)).size === 0
    ? 0
    : right.reduce((count, entry) => count + (values.has(normalized(entry)) ? 1 : 0), 0);
}

function missing(required: readonly string[], actual: readonly string[]): readonly string[] {
  const available = new Set(actual);
  return Object.freeze(required.filter((item) => !available.has(item)).sort());
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort());
}

function freezeMatch(match: RegistryMatchV1): RegistryMatchV1 {
  return Object.freeze({
    ...match,
    missing_scopes: sortedUnique(match.missing_scopes),
    missing_permissions: sortedUnique(match.missing_permissions),
    missing_policy_refs: sortedUnique(match.missing_policy_refs),
    blockers: sortedUnique(match.blockers),
    reason_codes: sortedUnique(match.reason_codes)
  });
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => JSON.stringify(key) + ":" + canonicalJson(child))
      .join(",") + "}";
  }
  return JSON.stringify(value);
}

function dedupe<T extends { version: string }>(
  records: readonly T[],
  kind: string,
  id: (record: T) => string
): readonly T[] {
  const unique = new Map<string, T>();
  for (const record of records) {
    const key = id(record) + "@" + record.version;
    const existing = unique.get(key);
    if (existing && canonicalJson(existing) !== canonicalJson(record)) fail(kind + "_DUPLICATE_CONFLICT");
    unique.set(key, record);
  }
  return [...unique.values()].sort((a, b) => {
    const byId = id(a).localeCompare(id(b));
    return byId || a.version.localeCompare(b.version);
  });
}

function budgetFit(
  required: RegistryBudgetCeilingV1,
  ceiling: RegistryBudgetCeilingV1 | null
): "FIT" | "EXCEEDS" | "UNKNOWN" {
  if (!ceiling) return "UNKNOWN";
  return required.runtime_ms <= ceiling.runtime_ms &&
    required.cost_microunits <= ceiling.cost_microunits &&
    required.context_tokens <= ceiling.context_tokens &&
    required.result_bytes <= ceiling.result_bytes
    ? "FIT"
    : "EXCEEDS";
}

function capabilityCandidate(
  capability: GovernedCapabilityV1,
  caller: RegistryCallerV1,
  query: RegistryQueryV1
): Candidate | null {
  const intentMatch = includesNormalized(capability.discovery.intents, query.intent);
  const entityMatches = intersectionCount(capability.discovery.entity_classes, query.entity_classes);
  const decisionMatches = intersectionCount(capability.discovery.decision_classes, query.decision_classes);
  if (!intentMatch && entityMatches === 0 && decisionMatches === 0) return null;

  const discoveryMissing = missing(capability.discovery.discoverable_by_scopes, caller.scopes);
  const discoveryVisible = discoveryMissing.length === 0;
  const missingScopes = missing(capability.required_scopes, caller.scopes);
  const missingPermissions = missing(capability.required_permissions, caller.permissions);
  const missingPolicyRefs = missing(capability.policy_refs, caller.policy_refs);
  const blockers: string[] = [];
  const reasons: string[] = [];
  if (intentMatch) reasons.push("INTENT_EXACT");
  if (entityMatches > 0) reasons.push("ENTITY_MATCH");
  if (decisionMatches > 0) reasons.push("DECISION_MATCH");
  if (!discoveryVisible) blockers.push("DISCOVERY_SCOPE_MISSING");
  if (!capability.required_identity_classes.includes(caller.identity_class)) blockers.push("IDENTITY_CLASS_DENIED");
  if (missingScopes.length) blockers.push("EXECUTION_SCOPE_MISSING");
  if (missingPermissions.length) blockers.push("PERMISSION_MISSING");
  if (missingPolicyRefs.length) blockers.push("POLICY_REF_MISSING");
  if (capability.health !== "AVAILABLE") blockers.push("HEALTH_" + capability.health);
  if (SIDE_EFFECT_RANK[capability.side_effect_class] > SIDE_EFFECT_RANK[query.side_effect_ceiling]) {
    blockers.push("SIDE_EFFECT_CEILING_EXCEEDED");
  }

  const approvalRequired = capability.approval_class !== "NONE";
  if (approvalRequired && !caller.approved_capability_ids.includes(capability.capability_id)) {
    blockers.push(capability.approval_class === "HUMAN_REQUIRED" ? "HUMAN_APPROVAL_REQUIRED" : "POLICY_APPROVAL_REQUIRED");
  }
  const fit = budgetFit(capability.budgets, query.budgets);
  if (fit !== "FIT") blockers.push(fit === "UNKNOWN" ? "BUDGET_CEILING_UNKNOWN" : "BUDGET_EXCEEDED");

  return {
    match: freezeMatch({
      record_type: "CAPABILITY",
      record_id: capability.capability_id,
      version: capability.version,
      discovery_visible: discoveryVisible,
      execution_eligible: discoveryVisible && blockers.length === 0,
      health_state: capability.health,
      side_effect_class: capability.side_effect_class,
      approval_required: approvalRequired,
      missing_scopes: [...discoveryMissing, ...missingScopes],
      missing_permissions: missingPermissions,
      missing_policy_refs: missingPolicyRefs,
      blockers,
      reason_codes: reasons,
      budget_fit: fit,
      utility_evidence: "UNKNOWN"
    }),
    intentMatch,
    entityMatches,
    decisionMatches,
    sideEffectRank: SIDE_EFFECT_RANK[capability.side_effect_class],
    budgetCost: capability.budgets.cost_microunits,
    budgetRuntime: capability.budgets.runtime_ms
  };
}

function compatible(version: string, minimum: string, maximumExclusive: string | null): boolean {
  const parse = (value: string) => value.split(".").map(Number);
  const compare = (left: string, right: string) => {
    const a = parse(left);
    const b = parse(right);
    for (let index = 0; index < 3; index += 1) {
      if (a[index] !== b[index]) return a[index] - b[index];
    }
    return 0;
  };
  return compare(version, minimum) >= 0 && (maximumExclusive === null || compare(version, maximumExclusive) < 0);
}

function addBudgets(capabilities: readonly GovernedCapabilityV1[]): RegistryBudgetCeilingV1 {
  return {
    runtime_ms: capabilities.reduce((sum, item) => sum + item.budgets.runtime_ms, 0),
    cost_microunits: capabilities.reduce((sum, item) => sum + item.budgets.cost_microunits, 0),
    context_tokens: capabilities.reduce((sum, item) => sum + item.budgets.context_tokens, 0),
    result_bytes: capabilities.reduce((sum, item) => sum + item.budgets.result_bytes, 0)
  };
}

function skillHealth(skill: ProceduralSkillV1, evaluatedAt: string): RegistryHealthStateV1 {
  if (skill.lifecycle.state !== "REVIEWED") return skill.lifecycle.state;
  const ageSeconds = (Date.parse(evaluatedAt) - Date.parse(skill.method_provenance.reviewed_at)) / 1000;
  if (ageSeconds < 0 || ageSeconds > skill.freshness.max_age_seconds) return "STALE";
  return "REVIEWED";
}

function skillCandidate(
  skill: ProceduralSkillV1,
  capabilities: readonly GovernedCapabilityV1[],
  caller: RegistryCallerV1,
  query: RegistryQueryV1
): Candidate | null {
  const intentMatch = includesNormalized(skill.applicable_intents, query.intent);
  const entityMatches = intersectionCount(skill.entity_classes, query.entity_classes);
  const decisionMatches = intersectionCount(skill.decision_classes, query.decision_classes);
  if (!intentMatch && entityMatches === 0 && decisionMatches === 0) return null;

  const required = skill.capability_requirements.map((requirement) => {
    const capability = capabilities.find((item) =>
      item.capability_id === requirement.capability_id &&
      compatible(item.version, requirement.versions.minimum, requirement.versions.maximum_exclusive)
    );
    if (!capability) fail("SKILL_CAPABILITY_VERSION_INCOMPATIBLE");
    return capability;
  });
  const parts = required.map((capability) => capabilityCandidate(capability, caller, {
    ...query,
    intent: capability.discovery.intents[0],
    entity_classes: capability.discovery.entity_classes,
    decision_classes: capability.discovery.decision_classes
  })).filter((candidate): candidate is Candidate => candidate !== null);
  const health = skillHealth(skill, query.evaluated_at);
  const blockers = parts.flatMap((part) => part.match.blockers.map((code) => "CAPABILITY_" + code));
  if (health !== "REVIEWED") blockers.push("SKILL_" + health);
  const aggregateBudgets = addBudgets(required);
  const fit = budgetFit(aggregateBudgets, query.budgets);
  if (fit !== "FIT") blockers.push(fit === "UNKNOWN" ? "BUDGET_CEILING_UNKNOWN" : "BUDGET_EXCEEDED");
  const sideEffectRank = required.length
    ? Math.max(...required.map((item) => SIDE_EFFECT_RANK[item.side_effect_class]))
    : 0;
  const sideEffectClass = (["READ_ONLY", "INTERNAL_WRITE", "EXTERNAL_CONSEQUENTIAL"] as const)[sideEffectRank];
  const discoveryVisible = parts.every((part) => part.match.discovery_visible);
  const approvalRequired = parts.some((part) => part.match.approval_required);
  const missingScopes = parts.flatMap((part) => part.match.missing_scopes);
  const missingPermissions = parts.flatMap((part) => part.match.missing_permissions);
  const missingPolicyRefs = parts.flatMap((part) => part.match.missing_policy_refs);
  const reasons = [
    ...(intentMatch ? ["INTENT_EXACT"] : []),
    ...(entityMatches ? ["ENTITY_MATCH"] : []),
    ...(decisionMatches ? ["DECISION_MATCH"] : [])
  ];

  return {
    match: freezeMatch({
      record_type: "SKILL",
      record_id: skill.skill_id,
      version: skill.version,
      discovery_visible: discoveryVisible,
      execution_eligible: discoveryVisible && blockers.length === 0,
      health_state: health,
      side_effect_class: required.length ? sideEffectClass : null,
      approval_required: approvalRequired,
      missing_scopes: missingScopes,
      missing_permissions: missingPermissions,
      missing_policy_refs: missingPolicyRefs,
      blockers,
      reason_codes: reasons,
      budget_fit: fit,
      utility_evidence: skill.outcome_utility_refs.length ? "SUPPORTED" : "UNKNOWN"
    }),
    intentMatch,
    entityMatches,
    decisionMatches,
    sideEffectRank,
    budgetCost: aggregateBudgets.cost_microunits,
    budgetRuntime: aggregateBudgets.runtime_ms
  };
}

function rank(left: Candidate, right: Candidate): number {
  return Number(right.match.execution_eligible) - Number(left.match.execution_eligible) ||
    Number(right.match.discovery_visible) - Number(left.match.discovery_visible) ||
    Number(right.intentMatch) - Number(left.intentMatch) ||
    right.entityMatches - left.entityMatches ||
    right.decisionMatches - left.decisionMatches ||
    left.sideEffectRank - right.sideEffectRank ||
    left.budgetCost - right.budgetCost ||
    left.budgetRuntime - right.budgetRuntime ||
    left.match.record_type.localeCompare(right.match.record_type) ||
    left.match.record_id.localeCompare(right.match.record_id) ||
    left.match.version.localeCompare(right.match.version);
}

export function queryPermissionAwareRegistryV1(input: Readonly<{
  capabilities: readonly unknown[];
  skills: readonly unknown[];
  caller: unknown;
  query: unknown;
}>): PermissionAwareRegistryResultV1 {
  const root = object(input, "INPUT_INVALID");
  exactKeys(root, ["capabilities", "skills", "caller", "query"], "INPUT");
  if (!Array.isArray(root.capabilities) || !Array.isArray(root.skills)) fail("RECORDS_INVALID");
  if (root.capabilities.length + root.skills.length > PERMISSION_AWARE_REGISTRY_LIMITS.maxRecords) {
    fail("RECORDS_UNBOUNDED");
  }

  const capabilities = dedupe(
    root.capabilities.map(validateGovernedCapabilityV1),
    "CAPABILITY",
    (record) => record.capability_id
  );
  const skills = dedupe(
    root.skills.map((skill) => validateProceduralSkillV1(skill, capabilities)),
    "SKILL",
    (record) => record.skill_id
  );
  const caller = canonicalCaller(root.caller);
  const query = canonicalQuery(root.query);
  const candidates = [
    ...capabilities.map((capability) => capabilityCandidate(capability, caller, query)),
    ...skills.map((skill) => skillCandidate(skill, capabilities, caller, query))
  ].filter((candidate): candidate is Candidate => candidate !== null).sort(rank);
  const visible = candidates.filter((candidate) => candidate.match.discovery_visible);
  const selected = visible.slice(0, query.max_results).map((candidate) => candidate.match);

  return Object.freeze({
    contract_version: PERMISSION_AWARE_REGISTRY_VERSION,
    matches: Object.freeze(selected),
    truncated: visible.length > selected.length
  });
}
