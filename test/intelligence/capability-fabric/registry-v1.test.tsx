import assert from "node:assert/strict";
import test from "node:test";

import {
  PERMISSION_AWARE_REGISTRY_LIMITS,
  queryPermissionAwareRegistryV1
} from "@/lib/intelligence/capability-fabric/registry-v1";

function capability(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    contract_version: "GOVERNED_CAPABILITY_V1",
    capability_id: id,
    version: "1.0.0",
    owner: "capability-fabric",
    purpose: "Provide governed relationship intelligence.",
    business_semantics: "Returns evidence-backed state without mutation.",
    input_schema: { schema_id: "RegistryInputV1", version: "1.0.0" },
    output_schema: { schema_id: "RegistryOutputV1", version: "1.0.0" },
    reads: ["canonical.relationships"],
    writes: [],
    side_effect_class: "READ_ONLY",
    required_identity_classes: ["AGENT", "ANALYST"],
    required_scopes: ["relationship.read"],
    required_permissions: ["CAN_READ_RELATIONSHIPS"],
    policy_refs: ["relationship-policy-v1"],
    approval_class: "NONE",
    preconditions: [],
    validation_rule_refs: ["relationship-validator-v1"],
    idempotency: { required: false, key_scope: "NONE" },
    retry: { max_attempts: 1 },
    rollback: { supported: false, procedure_ref: null },
    source_classes: ["CANONICAL_CRM"],
    entity_classes: ["PERSON"],
    decision_classes: ["RELATIONSHIP_NEXT_ACTION"],
    budgets: { runtime_ms: 100, cost_microunits: 0, context_tokens: 100, result_bytes: 100 },
    audit_event_class: "CAPABILITY_READ",
    lineage_required: true,
    discovery: {
      summary: "Read relationship context.",
      intents: ["relationship context"],
      entity_classes: ["PERSON"],
      decision_classes: ["RELATIONSHIP_NEXT_ACTION"],
      discoverable_by_scopes: ["relationship.discover"]
    },
    health: "AVAILABLE",
    compatibility: { minimum: "1.0.0", maximum_exclusive: "2.0.0" },
    ...overrides
  };
}

function skill(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    contract_version: "PROCEDURAL_SKILL_V1",
    skill_id: "relationship-review",
    version: "1.0.0",
    owner: "capability-fabric",
    purpose: "Review a relationship with governed evidence.",
    applicable_intents: ["relationship context"],
    entity_classes: ["PERSON"],
    decision_classes: ["RELATIONSHIP_NEXT_ACTION"],
    required_evidence_types: ["CANONICAL_RELATIONSHIP"],
    required_source_types: ["CANONICAL_CRM"],
    steps: [{
      step_id: "read",
      kind: "INVOKE_CAPABILITY",
      capability_id: "relationship.read",
      depends_on: [],
      required_evidence_types: ["CANONICAL_RELATIONSHIP"]
    }],
    capability_requirements: [{
      capability_id: "relationship.read",
      versions: { minimum: "1.0.0", maximum_exclusive: "2.0.0" }
    }],
    freshness: { max_age_seconds: 86_400, unknown_policy: "BLOCK" },
    evaluation_refs: ["relationship-eval-v1"],
    failure_modes: ["EVIDENCE_MISSING"],
    guardrail_refs: ["relationship-guardrail-v1"],
    method_provenance: {
      originating_analysis_id: "analysis:relationship:1",
      review_id: "review:relationship:1",
      reviewed_at: "2026-09-13T00:00:00Z"
    },
    outcome_utility_refs: [],
    lifecycle: { state: "REVIEWED", superseded_by: null },
    ...overrides
  };
}

function caller(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    identity_class: "AGENT",
    scopes: ["relationship.discover", "relationship.read"],
    permissions: ["CAN_READ_RELATIONSHIPS"],
    policy_refs: ["relationship-policy-v1"],
    approved_capability_ids: [],
    ...overrides
  };
}

function query(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    intent: "relationship context",
    entity_classes: ["PERSON"],
    decision_classes: ["RELATIONSHIP_NEXT_ACTION"],
    side_effect_ceiling: "READ_ONLY",
    budgets: { runtime_ms: 10_000, cost_microunits: 100, context_tokens: 10_000, result_bytes: 10_000 },
    evaluated_at: "2026-09-13T12:00:00Z",
    max_results: 20,
    ...overrides
  };
}

function run(
  capabilities: readonly unknown[],
  skills: readonly unknown[] = [],
  callerValue: unknown = caller(),
  queryValue: unknown = query()
) {
  return queryPermissionAwareRegistryV1({
    capabilities,
    skills,
    caller: callerValue,
    query: queryValue
  });
}

test("two authorized callers discover the same read-only capability", () => {
  const first = run([capability("relationship.read")], [], caller({ identity_class: "AGENT" }));
  const second = run([capability("relationship.read")], [], caller({ identity_class: "ANALYST" }));

  assert.equal(first.matches.length, 1);
  assert.equal(first.matches[0].record_id, "relationship.read");
  assert.equal(first.matches[0].execution_eligible, true);
  assert.deepEqual(first, second);
});

test("discovery remains separate from execution approval for consequential work", () => {
  const result = run([capability("relationship.send", {
    side_effect_class: "EXTERNAL_CONSEQUENTIAL",
    approval_class: "HUMAN_REQUIRED",
    writes: ["external.email"],
    rollback: { supported: true, procedure_ref: "cancel-email-v1" }
  })], [], caller(), query({ side_effect_ceiling: "EXTERNAL_CONSEQUENTIAL" }));

  assert.equal(result.matches[0].discovery_visible, true);
  assert.equal(result.matches[0].execution_eligible, false);
  assert.equal(result.matches[0].approval_required, true);
  assert.deepEqual(result.matches[0].blockers, ["HUMAN_APPROVAL_REQUIRED"]);
});

test("scope and permission denial occurs before invocation eligibility", () => {
  const result = run(
    [capability("relationship.read")],
    [],
    caller({ scopes: ["relationship.discover"], permissions: [] })
  );
  assert.equal(result.matches[0].execution_eligible, false);
  assert.deepEqual(result.matches[0].missing_scopes, ["relationship.read"]);
  assert.deepEqual(result.matches[0].missing_permissions, ["CAN_READ_RELATIONSHIPS"]);
  assert.ok(result.matches[0].blockers.includes("EXECUTION_SCOPE_MISSING"));
  assert.ok(result.matches[0].blockers.includes("PERMISSION_MISSING"));
});

test("least-privilege exact-fit capability ranks before broad consequential work", () => {
  const broad = capability("relationship.broad-write", {
    side_effect_class: "EXTERNAL_CONSEQUENTIAL",
    approval_class: "HUMAN_REQUIRED",
    writes: ["external.crm"],
    rollback: { supported: true, procedure_ref: "restore-crm-v1" },
    budgets: { runtime_ms: 5_000, cost_microunits: 50, context_tokens: 5_000, result_bytes: 5_000 }
  });
  const result = run(
    [broad, capability("relationship.read")],
    [],
    caller({ approved_capability_ids: ["relationship.broad-write"] }),
    query({ side_effect_ceiling: "EXTERNAL_CONSEQUENTIAL" })
  );
  assert.deepEqual(result.matches.map((match) => match.record_id), [
    "relationship.read",
    "relationship.broad-write"
  ]);
});

test("incompatible skill capability versions fail closed", () => {
  const incompatibleSkill = skill({
    capability_requirements: [{
      capability_id: "relationship.read",
      versions: { minimum: "2.0.0", maximum_exclusive: "3.0.0" }
    }]
  });
  assert.throws(
    () => run([capability("relationship.read")], [incompatibleSkill]),
    /CAPABILITY_VERSION_INCOMPATIBLE/
  );
});

test("stale, degraded, deprecated, and UNKNOWN states remain distinct", () => {
  const staleSkill = skill({
    method_provenance: {
      originating_analysis_id: "analysis:relationship:1",
      review_id: "review:relationship:1",
      reviewed_at: "2026-09-01T00:00:00Z"
    }
  });
  const result = run([
    capability("relationship.read"),
    capability("relationship.degraded", { health: "DEGRADED" }),
    capability("relationship.deprecated", { health: "DEPRECATED" }),
    capability("relationship.unknown", { health: "UNKNOWN" })
  ], [staleSkill]);
  const states = new Map(result.matches.map((match) => [match.record_id, match.health_state]));

  assert.equal(states.get("relationship-review"), "STALE");
  assert.equal(states.get("relationship.degraded"), "DEGRADED");
  assert.equal(states.get("relationship.deprecated"), "DEPRECATED");
  assert.equal(states.get("relationship.unknown"), "UNKNOWN");
});

test("unsupported budget and utility evidence are reported as UNKNOWN, never invented", () => {
  const result = run(
    [capability("relationship.read")],
    [skill()],
    caller(),
    query({ budgets: null })
  );
  assert.ok(result.matches.every((match) => match.budget_fit === "UNKNOWN"));
  assert.ok(result.matches.every((match) => match.execution_eligible === false));
  assert.ok(result.matches.every((match) => match.utility_evidence === "UNKNOWN"));
});

test("ranking and output are stable across input ordering", () => {
  const records = [
    capability("relationship.beta"),
    capability("relationship.alpha"),
    capability("relationship.gamma", { health: "DEGRADED" })
  ];
  assert.deepEqual(run(records), run([...records].reverse()));
});

test("duplicate validated records do not inflate results", () => {
  const record = capability("relationship.read");
  const result = run([record, structuredClone(record)]);
  assert.equal(result.matches.length, 1);

  assert.throws(
    () => run([record, capability("relationship.read", { owner: "different-owner" })]),
    /CAPABILITY_DUPLICATE_CONFLICT/
  );
});

test("results are bounded and sensitive or unrestricted inputs fail closed", () => {
  const records = Array.from(
    { length: PERMISSION_AWARE_REGISTRY_LIMITS.maxResults + 1 },
    (_, index) => capability("relationship." + String(index).padStart(2, "0"))
  );
  const bounded = run(records, [], caller(), query({ max_results: 3 }));
  assert.equal(bounded.matches.length, 3);
  assert.equal(bounded.truncated, true);
  assert.ok(bounded.matches.every((match) => !("purpose" in match)));
  assert.ok(bounded.matches.every((match) => !("policy_body" in match)));

  assert.throws(
    () => queryPermissionAwareRegistryV1({
      capabilities: records,
      skills: [],
      caller: { ...caller(), api_token: "forbidden" },
      query: query()
    }),
    /SENSITIVE_INPUT_FORBIDDEN/
  );
  assert.throws(
    () => run(records, [], caller(), query({ max_results: PERMISSION_AWARE_REGISTRY_LIMITS.maxResults + 1 })),
    /QUERY_MAX_RESULTS_INVALID/
  );
});
