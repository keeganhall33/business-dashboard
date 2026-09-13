import assert from "node:assert/strict";
import test from "node:test";

import {
  planProceduralSkillExecutionV1,
  type SkillExecutionPlanInputV1
} from "@/lib/intelligence/capability-fabric/skill-execution-plan-v1";

function capability(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    contract_version: "GOVERNED_CAPABILITY_V1",
    capability_id: "relationship.read",
    version: "1.0.0",
    owner: "capability-fabric",
    purpose: "Read current relationship evidence.",
    business_semantics: "Returns current evidence without mutation.",
    input_schema: { schema_id: "RelationshipEvidenceV1", version: "1.0.0" },
    output_schema: { schema_id: "RelationshipStateV1", version: "1.0.0" },
    reads: ["canonical.relationships"],
    writes: [],
    side_effect_class: "READ_ONLY",
    required_identity_classes: ["AGENT"],
    required_scopes: ["relationship.read"],
    required_permissions: ["CAN_READ_RELATIONSHIPS"],
    policy_refs: ["relationship-policy-v1"],
    approval_class: "NONE",
    preconditions: ["CURRENT_EVIDENCE_REQUIRED"],
    validation_rule_refs: ["relationship-validator-v1"],
    idempotency: { required: false, key_scope: "NONE" },
    retry: { max_attempts: 2 },
    rollback: { supported: false, procedure_ref: null },
    source_classes: ["CANONICAL_CRM"],
    entity_classes: ["PERSON"],
    decision_classes: ["RELATIONSHIP_NEXT_ACTION"],
    budgets: { runtime_ms: 100, cost_microunits: 0, context_tokens: 100, result_bytes: 1_000 },
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
    purpose: "Review a relationship using fresh governed evidence.",
    applicable_intents: ["relationship context"],
    entity_classes: ["PERSON"],
    decision_classes: ["RELATIONSHIP_NEXT_ACTION"],
    required_evidence_types: ["CANONICAL_RELATIONSHIP"],
    required_source_types: ["CANONICAL_CRM"],
    steps: [
      {
        step_id: "acquire",
        kind: "ACQUIRE_EVIDENCE",
        capability_id: null,
        depends_on: [],
        required_evidence_types: ["CANONICAL_RELATIONSHIP"]
      },
      {
        step_id: "read",
        kind: "INVOKE_CAPABILITY",
        capability_id: "relationship.read",
        depends_on: ["acquire"],
        required_evidence_types: ["CANONICAL_RELATIONSHIP"]
      },
      {
        step_id: "review",
        kind: "REVIEW",
        capability_id: null,
        depends_on: ["read"],
        required_evidence_types: ["CANONICAL_RELATIONSHIP"]
      }
    ],
    capability_requirements: [{
      capability_id: "relationship.read",
      versions: { minimum: "1.0.0", maximum_exclusive: "2.0.0" }
    }],
    freshness: { max_age_seconds: 86_400, unknown_policy: "BLOCK" },
    evaluation_refs: ["relationship-evaluation-v1"],
    failure_modes: ["EVIDENCE_MISSING", "EVIDENCE_STALE"],
    guardrail_refs: ["relationship-guardrail-v1"],
    method_provenance: {
      originating_analysis_id: "analysis:relationship:method-1",
      review_id: "review:relationship:method-1",
      reviewed_at: "2026-09-12T00:00:00Z"
    },
    outcome_utility_refs: ["outcome:relationship:1"],
    lifecycle: { state: "REVIEWED", superseded_by: null },
    ...overrides
  };
}

function authorization(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    capability_id: "relationship.read",
    version: "1.0.0",
    discovery_visible: true,
    execution_eligible: true,
    approval_required: false,
    blockers: [],
    ...overrides
  };
}

function evidence(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    evidence_type: "CANONICAL_RELATIONSHIP",
    source_type: "CANONICAL_CRM",
    source_ref: "canonical:relationship:42",
    observed_at: "2026-09-13T11:00:00Z",
    truth_state: "CURRENT",
    authority: "DIRECT",
    ...overrides
  };
}

function input(overrides: Partial<SkillExecutionPlanInputV1> = {}): SkillExecutionPlanInputV1 {
  return {
    skill: skill(),
    capabilities: [capability()],
    authorization: [authorization()],
    evidence: [evidence()],
    policy_refs: ["relationship-policy-v1", "relationship-guardrail-v1"],
    budget: {
      runtime_ms: 1_000,
      cost_microunits: 100,
      context_tokens: 1_000,
      result_bytes: 10_000,
      max_retries: 1
    },
    expected_output_schema: { schema_id: "RelationshipRecommendationV1", version: "1.0.0" },
    evaluated_at: "2026-09-13T12:00:00Z",
    producer_identity: "producer:avery",
    verifier_identity: "verifier:sloan",
    workflow_graph: null,
    ...overrides
  };
}

test("reviewed method reuse produces a ready plan without prior live results", () => {
  const plan = planProceduralSkillExecutionV1(input());

  assert.equal(plan.readiness, "READY");
  assert.equal(plan.prior_run_outputs_excluded, true);
  assert.ok(plan.reason_codes.includes("METHOD_ONLY_REUSE"));
  assert.deepEqual(plan.steps.map((step) => step.step_id), ["acquire", "read", "review"]);
  assert.deepEqual(plan.steps[1].capability_ref, { capability_id: "relationship.read", version: "1.0.0" });
  assert.equal("purpose" in plan, false);
  assert.equal(JSON.stringify(plan).includes("prior_live_result"), false);
});

test("stale required evidence requests a fresh acquisition", () => {
  const plan = planProceduralSkillExecutionV1(input({
    evidence: [evidence({ observed_at: "2026-09-10T12:00:00Z" })]
  }));
  assert.equal(plan.readiness, "NEEDS_FRESH_EVIDENCE");
  assert.deepEqual(plan.blockers, ["EVIDENCE_STALE"]);
});

test("missing or partial required evidence cannot become ready", () => {
  const plan = planProceduralSkillExecutionV1(input({ evidence: [] }));
  assert.equal(plan.readiness, "BLOCKED");
  assert.deepEqual(plan.blockers, ["EVIDENCE_MISSING", "SOURCE_MISSING"]);

  const mismatched = planProceduralSkillExecutionV1(input({
    evidence: [evidence({ source_type: "UNVERIFIED_NOTE" })]
  }));
  assert.equal(mismatched.readiness, "BLOCKED");
  assert.ok(mismatched.blockers.includes("EVIDENCE_SOURCE_MISMATCH"));
});

test("consequential capability requires approval before execution", () => {
  const consequential = capability({
    side_effect_class: "EXTERNAL_CONSEQUENTIAL",
    approval_class: "HUMAN_REQUIRED",
    writes: ["external.email"],
    rollback: { supported: true, procedure_ref: "cancel-email-v1" }
  });
  const plan = planProceduralSkillExecutionV1(input({
    capabilities: [consequential],
    authorization: [authorization({
      execution_eligible: false,
      approval_required: true,
      blockers: ["HUMAN_APPROVAL_REQUIRED"]
    })]
  }));
  assert.equal(plan.readiness, "NEEDS_APPROVAL");
  assert.ok(plan.approval_gates.includes("relationship.read:HUMAN_REQUIRED"));
});

test("unavailable and incompatible capability versions fail closed", () => {
  const unavailable = planProceduralSkillExecutionV1(input({
    capabilities: [capability({ health: "BLOCKED" })]
  }));
  assert.equal(unavailable.readiness, "BLOCKED");
  assert.ok(unavailable.blockers.includes("CAPABILITY_HEALTH_BLOCKED"));

  assert.throws(
    () => planProceduralSkillExecutionV1(input({
      capabilities: [capability({ version: "2.0.0" })]
    })),
    /CAPABILITY_VERSION_INCOMPATIBLE/
  );
});

test("producer and independent verifier identities cannot collapse", () => {
  const plan = planProceduralSkillExecutionV1(input({ verifier_identity: "producer:avery" }));
  assert.equal(plan.readiness, "BLOCKED");
  assert.ok(plan.blockers.includes("VERIFIER_IDENTITY_COLLAPSED"));
});

test("budgets and retries are explicitly bounded", () => {
  const plan = planProceduralSkillExecutionV1(input());
  assert.equal(plan.budgets.max_retries, 1);
  assert.equal(plan.steps.find((step) => step.step_id === "read")?.max_attempts, 2);

  const insufficient = planProceduralSkillExecutionV1(input({
    budget: {
      runtime_ms: 99,
      cost_microunits: 100,
      context_tokens: 1_000,
      result_bytes: 10_000,
      max_retries: 1
    }
  }));
  assert.equal(insufficient.readiness, "BLOCKED");
  assert.ok(insufficient.blockers.includes("BUDGET_EXCEEDED"));

  const staleAndInsufficient = planProceduralSkillExecutionV1(input({
    evidence: [evidence({ observed_at: "2026-09-10T12:00:00Z" })],
    budget: {
      runtime_ms: 99,
      cost_microunits: 100,
      context_tokens: 1_000,
      result_bytes: 10_000,
      max_retries: 1
    }
  }));
  assert.equal(staleAndInsufficient.readiness, "BLOCKED");
});

test("skill, capability, policy, evidence, and output refs remain traceable", () => {
  const plan = planProceduralSkillExecutionV1(input());
  assert.deepEqual(plan.skill_ref, { skill_id: "relationship-review", version: "1.0.0" });
  assert.deepEqual(plan.capability_refs, [{ capability_id: "relationship.read", version: "1.0.0" }]);
  assert.ok(plan.policy_refs.includes("relationship-policy-v1"));
  assert.ok(plan.lineage_anchors.includes("canonical:relationship:42"));
  assert.deepEqual(plan.expected_output_schema, {
    schema_id: "RelationshipRecommendationV1",
    version: "1.0.0"
  });
});

test("output is deterministic across input ordering", () => {
  const secondEvidence = evidence({
    evidence_type: "SUPPORTING_NOTE",
    source_type: "CANONICAL_CRM",
    source_ref: "canonical:note:7"
  });
  const first = planProceduralSkillExecutionV1(input({
    evidence: [secondEvidence, evidence()],
    policy_refs: ["relationship-policy-v1", "relationship-guardrail-v1"]
  }));
  const second = planProceduralSkillExecutionV1(input({
    evidence: [evidence(), secondEvidence],
    policy_refs: ["relationship-guardrail-v1", "relationship-policy-v1"]
  }));
  assert.deepEqual(first, second);
});

test("sensitive, raw, or historical result inputs are rejected", () => {
  assert.throws(
    () => planProceduralSkillExecutionV1({
      ...input(),
      prior_live_result: "reuse this recommendation"
    } as SkillExecutionPlanInputV1),
    /SENSITIVE_INPUT_FORBIDDEN/
  );
  assert.throws(
    () => planProceduralSkillExecutionV1(input({
      evidence: [{ ...evidence(), raw_body: "forbidden" }]
    })),
    /SENSITIVE_INPUT_FORBIDDEN/
  );
});
