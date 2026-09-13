import assert from "node:assert/strict";
import test from "node:test";

import { planReasoningPolicyV1 } from "@/lib/intelligence/runtime/reasoning-policy-v1";
import type { WorkflowNodeKindV1, WorkflowNodeV1 } from "@/lib/intelligence/workflow-graph/workflow-graph-v1";

function node(kind: WorkflowNodeKindV1): WorkflowNodeV1 {
  return {
    id: `node:${kind.toLowerCase()}`,
    kind,
    contextId: `context:${kind.toLowerCase()}`,
    inputSchemaIds: ["input:v1"],
    outputSchemaIds: ["output:v1"],
    readResources: [],
    mutableWriteResources: [],
    evidenceAnchors: [],
    budget: {
      maxRuntimeMs: 60_000,
      maxRetries: 1,
      maxContextTokens: 80_000,
      maxOutputTokens: 8_000,
      maxCostUsd: 12
    },
    approvalClass: "AUTO_CONTINUE"
  };
}

test("deterministic nodes stay model-free even when no model route is authorized", () => {
  const decision = planReasoningPolicyV1({
    node: node("DETERMINISTIC"),
    business_impact: "HIGH",
    ambiguity: "HIGH",
    evidence_state: "CONFLICTED",
    authorized_model_tiers: []
  });

  assert.equal(decision.state, "READY");
  assert.equal(decision.execution_mode, "DETERMINISTIC");
  assert.equal(decision.model_tier, "NONE");
  assert.equal(decision.reasoning_effort, null);
  assert.equal(decision.context_strategy, "NONE");
});

test("routine bounded work selects the cheapest authorized capable tier", () => {
  const decision = planReasoningPolicyV1({
    node: node("WORKER"),
    business_impact: "LOW",
    ambiguity: "LOW",
    evidence_state: "CURRENT",
    authorized_model_tiers: ["FRONTIER", "LOCAL_EFFICIENT", "BALANCED"]
  });

  assert.equal(decision.model_tier, "LOCAL_EFFICIENT");
  assert.equal(decision.reasoning_effort, "medium");
  assert.equal(decision.context_strategy, "TARGETED_RETRIEVAL");
  assert.deepEqual(decision.budgets, {
    max_context_tokens: 80_000,
    max_output_tokens: 8_000,
    max_cost_usd: 12,
    max_runtime_ms: 60_000,
    max_retries: 1
  });
});

test("high-impact conflicted synthesis selects frontier xhigh with expanded retrieval", () => {
  const decision = planReasoningPolicyV1({
    node: node("SYNTHESIZE"),
    business_impact: "HIGH",
    ambiguity: "HIGH",
    evidence_state: "CONFLICTED",
    authorized_model_tiers: ["FRONTIER"]
  });

  assert.equal(decision.state, "READY");
  assert.equal(decision.model_tier, "FRONTIER");
  assert.equal(decision.reasoning_effort, "xhigh");
  assert.equal(decision.context_strategy, "EXPANDED_RETRIEVAL");
  assert.ok(decision.reason_codes.includes("EVIDENCE_CONFLICTED"));
  assert.ok(decision.reason_codes.includes("HIGH_BUSINESS_IMPACT"));
});

test("an evidenced lower-tier quality failure escalates without weakening an existing requirement", () => {
  const decision = planReasoningPolicyV1({
    node: node("SYNTHESIZE"),
    business_impact: "HIGH",
    ambiguity: "MEDIUM",
    evidence_state: "CURRENT",
    authorized_model_tiers: ["FRONTIER"],
    prior_attempt: {
      attempted_tier: "LOCAL_EFFICIENT",
      effort: "medium",
      quality_passed: false,
      failure_code: "RETRIEVAL_QUALITY_FAILED"
    }
  });

  assert.equal(decision.model_tier, "FRONTIER");
  assert.equal(decision.reasoning_effort, "xhigh");
  assert.ok(decision.reason_codes.includes("PRIOR_QUALITY_FAILURE"));
});

test("missing authorization produces a truthful handoff instead of an invented model route", () => {
  const decision = planReasoningPolicyV1({
    node: node("VERIFY"),
    business_impact: "MEDIUM",
    ambiguity: "MEDIUM",
    evidence_state: "CURRENT",
    authorized_model_tiers: ["LOCAL_EFFICIENT"]
  });

  assert.equal(decision.state, "HANDOFF_REQUIRED");
  assert.equal(decision.execution_mode, "EXTERNAL_EXPERT_HANDOFF");
  assert.equal(decision.model_tier, "NONE");
  assert.ok(decision.reason_codes.includes("REQUIRED_TIER_NOT_AUTHORIZED"));
});

test("effort switches use a cache-preserving configuration update only when supported", () => {
  const supported = planReasoningPolicyV1({
    node: node("VERIFY"),
    business_impact: "MEDIUM",
    ambiguity: "MEDIUM",
    evidence_state: "CURRENT",
    authorized_model_tiers: ["BALANCED"],
    previous_effort: "medium",
    supports_effort_configuration_update: true
  });
  const unsupported = planReasoningPolicyV1({
    node: node("VERIFY"),
    business_impact: "MEDIUM",
    ambiguity: "MEDIUM",
    evidence_state: "CURRENT",
    authorized_model_tiers: ["BALANCED"],
    previous_effort: "medium",
    supports_effort_configuration_update: false
  });

  assert.equal(supported.effort_transition, "CACHE_PRESERVING_CONFIGURATION_UPDATE");
  assert.equal(unsupported.effort_transition, "REQUEST_LEVEL");
});

test("max effort requires explicit authorization and malformed failure evidence fails closed", () => {
  const capped = planReasoningPolicyV1({
    node: node("SYNTHESIZE"),
    business_impact: "MEDIUM",
    ambiguity: "MEDIUM",
    evidence_state: "CURRENT",
    authorized_model_tiers: ["FRONTIER"],
    maximum_reasoning_requested: true,
    maximum_reasoning_authorized: false
  });
  const authorized = planReasoningPolicyV1({
    node: node("SYNTHESIZE"),
    business_impact: "MEDIUM",
    ambiguity: "MEDIUM",
    evidence_state: "CURRENT",
    authorized_model_tiers: ["FRONTIER"],
    maximum_reasoning_requested: true,
    maximum_reasoning_authorized: true
  });

  assert.equal(capped.reasoning_effort, "xhigh");
  assert.equal(authorized.reasoning_effort, "max");
  assert.throws(() => planReasoningPolicyV1({
    node: node("WORKER"),
    business_impact: "LOW",
    ambiguity: "LOW",
    evidence_state: "CURRENT",
    authorized_model_tiers: ["LOCAL_EFFICIENT"],
    prior_attempt: {
      attempted_tier: "LOCAL_EFFICIENT",
      effort: "medium",
      quality_passed: false,
      failure_code: null
    }
  }), /PRIOR_FAILURE_CODE_REQUIRED/);
});
