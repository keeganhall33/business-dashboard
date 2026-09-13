import assert from "node:assert/strict";
import test from "node:test";

import {
  CAPABILITY_FABRIC_LIMITS,
  validateGovernedCapabilityV1,
  validateProceduralSkillV1,
  type GovernedCapabilityV1
} from "@/lib/intelligence/capability-fabric/contracts-v1";

function capability(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    contract_version: "GOVERNED_CAPABILITY_V1",
    capability_id: "crm.relationship.read",
    version: "1.2.0",
    owner: "relationship-intelligence",
    purpose: "Read supported canonical relationship context.",
    business_semantics: "Returns evidence-backed relationship state without mutation.",
    input_schema: { schema_id: "CanonicalPersonRefV1", version: "1.0.0" },
    output_schema: { schema_id: "RelationshipContextV1", version: "1.0.0" },
    reads: ["canonical.people", "canonical.relationships"],
    writes: [],
    side_effect_class: "READ_ONLY",
    required_identity_classes: ["MISSION_CONTROL_AGENT"],
    required_scopes: ["crm.relationship.read"],
    required_permissions: ["CAN_READ_RELATIONSHIPS"],
    policy_refs: ["relationship-read-policy-v1"],
    approval_class: "NONE",
    preconditions: ["CANONICAL_PERSON_ID_PRESENT"],
    validation_rule_refs: ["relationship-context-validator-v1"],
    idempotency: { required: false, key_scope: "NONE" },
    retry: { max_attempts: 1 },
    rollback: { supported: false, procedure_ref: null },
    source_classes: ["CANONICAL_CRM"],
    entity_classes: ["PERSON", "COMPANY"],
    decision_classes: ["RELATIONSHIP_NEXT_ACTION"],
    budgets: { runtime_ms: 5_000, cost_microunits: 0, context_tokens: 8_000, result_bytes: 50_000 },
    audit_event_class: "CAPABILITY_READ",
    lineage_required: true,
    discovery: {
      summary: "Read canonical relationship context.",
      intents: ["relationship context"],
      entity_classes: ["PERSON", "COMPANY"],
      decision_classes: ["RELATIONSHIP_NEXT_ACTION"],
      discoverable_by_scopes: ["crm.relationship.discover"]
    },
    health: "AVAILABLE",
    compatibility: { minimum: "1.0.0", maximum_exclusive: "2.0.0" },
    ...overrides
  };
}

function skill(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    contract_version: "PROCEDURAL_SKILL_V1",
    skill_id: "relationship-context-review",
    version: "1.0.0",
    owner: "relationship-intelligence",
    purpose: "Review a relationship using current authoritative evidence.",
    applicable_intents: ["relationship review"],
    entity_classes: ["PERSON", "COMPANY"],
    decision_classes: ["RELATIONSHIP_NEXT_ACTION"],
    required_evidence_types: ["CANONICAL_RELATIONSHIP_STATE"],
    required_source_types: ["CANONICAL_CRM"],
    steps: [
      { step_id: "01-acquire", kind: "ACQUIRE_EVIDENCE", capability_id: null, depends_on: [], required_evidence_types: ["CANONICAL_RELATIONSHIP_STATE"] },
      { step_id: "02-read", kind: "INVOKE_CAPABILITY", capability_id: "crm.relationship.read", depends_on: ["01-acquire"], required_evidence_types: ["CANONICAL_RELATIONSHIP_STATE"] },
      { step_id: "03-validate", kind: "VALIDATE", capability_id: null, depends_on: ["02-read"], required_evidence_types: ["CANONICAL_RELATIONSHIP_STATE"] }
    ],
    capability_requirements: [{ capability_id: "crm.relationship.read", versions: { minimum: "1.0.0", maximum_exclusive: "2.0.0" } }],
    freshness: { max_age_seconds: 86_400, unknown_policy: "BLOCK" },
    evaluation_refs: ["relationship-review-eval-v1"],
    failure_modes: ["MISSING_CANONICAL_ID", "STALE_RELATIONSHIP_STATE"],
    guardrail_refs: ["no-free-text-identity-inference-v1"],
    method_provenance: { originating_analysis_id: "analysis:relationship:1", review_id: "review:1", reviewed_at: "2026-09-13T03:00:00Z" },
    outcome_utility_refs: [],
    lifecycle: { state: "REVIEWED", superseded_by: null },
    ...overrides
  };
}

function validatedCapability(overrides: Record<string, unknown> = {}): GovernedCapabilityV1 {
  return validateGovernedCapabilityV1(capability(overrides));
}

test("valid read-only capability and reviewed procedural skill pass", () => {
  const current = validatedCapability();
  assert.equal(current.side_effect_class, "READ_ONLY");
  assert.equal(validateProceduralSkillV1(skill(), [current]).lifecycle.state, "REVIEWED");
});

test("consequential capability without approval semantics fails closed", () => {
  assert.throws(
    () => validatedCapability({ side_effect_class: "EXTERNAL_CONSEQUENTIAL", approval_class: "NONE" }),
    /CONSEQUENTIAL_APPROVAL_REQUIRED/
  );
});

test("discovery metadata cannot grant execution authority", () => {
  const input = capability();
  (input.discovery as Record<string, unknown>).execution_permission = "ALLOW";
  assert.throws(() => validateGovernedCapabilityV1(input), /DISCOVERY_UNSUPPORTED_FIELD/);
});

test("procedural skills reject prior results and current business facts", () => {
  const current = validatedCapability();
  assert.throws(() => validateProceduralSkillV1({ ...skill(), prior_live_results: ["old conclusion"] }, [current]), /RAW_SECRET_OR_RESULT/);
  assert.throws(() => validateProceduralSkillV1({ ...skill(), current_business_facts: ["unsupported fact"] }, [current]), /RAW_SECRET_OR_RESULT/);
});

test("incompatible capability version fails validation", () => {
  const incompatible = validatedCapability({ version: "2.1.0" });
  assert.throws(() => validateProceduralSkillV1(skill(), [incompatible]), /CAPABILITY_VERSION_INCOMPATIBLE/);
});

test("unbounded steps and budgets fail closed", () => {
  const current = validatedCapability();
  const steps = Array.from({ length: CAPABILITY_FABRIC_LIMITS.maxProcedureSteps + 1 }, (_, index) => ({
    step_id: `step-${index}`, kind: "VALIDATE", capability_id: null, depends_on: [], required_evidence_types: []
  }));
  assert.throws(() => validateProceduralSkillV1(skill({ steps }), [current]), /STEPS_UNBOUNDED/);
  assert.throws(() => validatedCapability({ budgets: { runtime_ms: CAPABILITY_FABRIC_LIMITS.maxRuntimeMs + 1, cost_microunits: 0, context_tokens: 1, result_bytes: 1 } }), /BUDGET_RUNTIME_MS_INVALID/);
});

test("secret-like fields and raw source bodies cannot survive validation", () => {
  assert.throws(() => validateGovernedCapabilityV1({ ...capability(), api_token: "not-allowed" }), /RAW_SECRET_OR_RESULT/);
  const unsafe = skill();
  (unsafe.method_provenance as Record<string, unknown>).source_body = "not-allowed";
  assert.throws(() => validateProceduralSkillV1(unsafe, [validatedCapability()]), /RAW_SECRET_OR_RESULT/);
});

test("UNKNOWN remains explicit", () => {
  assert.equal(validatedCapability({ health: "UNKNOWN" }).health, "UNKNOWN");
  assert.equal(validateProceduralSkillV1(skill({ lifecycle: { state: "UNKNOWN", superseded_by: null } }), [validatedCapability()]).lifecycle.state, "UNKNOWN");
});

test("output is deterministic independent of input ordering", () => {
  const current = validatedCapability();
  const a = validateProceduralSkillV1(skill(), [current]);
  const reversed = skill({
    applicable_intents: ["relationship review"],
    entity_classes: ["COMPANY", "PERSON"],
    steps: [...(skill().steps as unknown[])].reverse()
  });
  const b = validateProceduralSkillV1(reversed, [current]);
  assert.deepEqual(a, b);
});

test("validated outputs are deeply immutable", () => {
  const current = validatedCapability();
  const reviewed = validateProceduralSkillV1(skill(), [current]);
  assert.ok(Object.isFrozen(current));
  assert.ok(Object.isFrozen(current.discovery.intents));
  assert.ok(Object.isFrozen(reviewed));
  assert.ok(Object.isFrozen(reviewed.steps[0]));
  assert.throws(() => (reviewed.steps as ProceduralSkillV1Mutable).push(reviewed.steps[0]), TypeError);
});

type ProceduralSkillV1Mutable = Array<(ReturnType<typeof validateProceduralSkillV1>)["steps"][number]>;
