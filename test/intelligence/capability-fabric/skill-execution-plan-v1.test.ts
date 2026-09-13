/**
 * Skill Execution Plan V1 Tests - Freshness-safe procedural skill planner
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { buildSkillExecutionPlanV1, type SkillExecutionPlanV1 } from "@/lib/intelligence/capability-fabric/skill-execution-plan-v1";
import { 
  validateGovernedCapabilityV1,
  validateProceduralSkillV1,
} from "@/lib/intelligence/capability-fabric/contracts-v1";
import {
  PERMISSION_AWARE_REGISTRY_VERSION,
  type PermissionAwareRegistryResultV1,
  type RegistryCallerV1,
} from "@/lib/intelligence/capability-fabric/registry-v1";

function createMockCapability(id: string): any {
  return Object.freeze({
    contract_version: "GOVERNED_CAPABILITY_V1",
    capability_id: id,
    version: "1.0.0",
    owner: "test-owner",
    health: "AVAILABLE",
  });
}

function createMockSkill(): any {
  return Object.freeze({
    contract_version: "PROCEDURAL_SKILL_V1",
    skill_id: "test-skill-1",
    version: "1.0.0",
    owner: "test-owner",
    purpose: "Test procedural skill",
    applicable_intents: ["intent:test"],
    entity_classes: ["entity:test"],
    decision_classes: ["decision:test"],
    required_evidence_types: ["evidence:current"],
    required_source_types: ["source:deterministic"],
    steps: [],
    capability_requirements: [],
    freshness: { max_age_seconds: 3600, unknown_policy: "BLOCK" },
    evaluation_refs: ["eval:test"],
    failure_modes: [],
    guardrail_refs: ["guardrail:test"],
    method_provenance: { originating_analysis_id: "analysis-123", review_id: "review-123", reviewed_at: "2026-09-13T10:00:00.000Z" },
    outcome_utility_refs: ["utility:test"],
    lifecycle: { state: "REVIEWED", superseded_by: null },
  });
}

describe("SkillExecutionPlanV1 - Contract and Invariants", () => {
  it("should produce a valid plan with contract_version matching SKILL_EXECUTION_PLAN_V1_CONTRACT", () => {
    const skill = createMockSkill();
    const registryResult: PermissionAwareRegistryResultV1 = Object.freeze({
      contract_version: PERMISSION_AWARE_REGISTRY_VERSION,
      matches: [{
        record_type: "CAPABILITY" as const,
        record_id: "test-cap-1",
        version: "1.0.0",
        discovery_visible: true,
        execution_eligible: true,
        health_state: "AVAILABLE",
        side_effect_class: "READ_ONLY",
        approval_required: false,
        missing_scopes: [],
        missing_permissions: [],
        missing_policy_refs: [],
        blockers: [],
        reason_codes: [],
        budget_fit: "FIT" as const,
        utility_evidence: "SUPPORTED",
      }],
      truncated: false,
    });
    
    const caller: RegistryCallerV1 = Object.freeze({
      identity_class: "identity:test",
      scopes: ["scope:read"],
      permissions: ["permission:read"],
      policy_refs: ["policy:test-basic"],
      approved_capability_ids: ["test-cap-1"],
    });
    
    const evaluatedAt = new Date("2026-09-13T10:19:00.000Z").toISOString();
    const plan = buildSkillExecutionPlanV1(skill, registryResult, caller, evaluatedAt);
    
    assert.strictEqual(plan.contract_version, "SKILL_EXECUTION_PLAN_V1");
  });
  
  it("should have bounded budgets", () => {
    const skill = createMockSkill();
    const registryResult: PermissionAwareRegistryResultV1 = Object.freeze({
      contract_version: PERMISSION_AWARE_REGISTRY_VERSION,
      matches: [{
        record_type: "CAPABILITY" as const,
        record_id: "test-cap-1",
        version: "1.0.0",
        discovery_visible: true,
        execution_eligible: true,
        health_state: "AVAILABLE",
        side_effect_class: "READ_ONLY",
        approval_required: false,
        missing_scopes: [],
        missing_permissions: [],
        missing_policy_refs: [],
        blockers: [],
        reason_codes: [],
        budget_fit: "FIT" as const,
        utility_evidence: "SUPPORTED",
      }],
      truncated: false,
    });
    
    const caller: RegistryCallerV1 = Object.freeze({
      identity_class: "identity:test",
      scopes: ["scope:read"],
      permissions: ["permission:read"],
      policy_refs: ["policy:test-basic"],
      approved_capability_ids: ["test-cap-1"],
    });
    
    const plan = buildSkillExecutionPlanV1(skill, registryResult, caller, new Date().toISOString());
    
    assert.ok(plan.budgets.runtime_ms <= 3_600_000);
    assert.ok(plan.budgets.cost_microunits <= 10_000_000);
  });
  
  it("excludes prior live results", () => {
    const skill = createMockSkill();
    const registryResult: PermissionAwareRegistryResultV1 = Object.freeze({
      contract_version: PERMISSION_AWARE_REGISTRY_VERSION,
      matches: [{
        record_type: "CAPABILITY" as const,
        record_id: "test-cap-1",
        version: "1.0.0",
        discovery_visible: true,
        execution_eligible: true,
        health_state: "AVAILABLE",
        side_effect_class: "READ_ONLY",
        approval_required: false,
        missing_scopes: [],
        missing_permissions: [],
        missing_policy_refs: [],
        blockers: [],
        reason_codes: [],
        budget_fit: "FIT" as const,
        utility_evidence: "SUPPORTED",
      }],
      truncated: false,
    });
    
    const caller: RegistryCallerV1 = Object.freeze({
      identity_class: "identity:test",
      scopes: ["scope:read"],
      permissions: ["permission:read"],
      policy_refs: ["policy:test-basic"],
      approved_capability_ids: ["test-cap-1"],
    });
    
    const plan = buildSkillExecutionPlanV1(skill, registryResult, caller, new Date().toISOString());
    
    assert.strictEqual(plan.excludes_prior_results, true);
  });
});

describe("SkillExecutionPlanV1 - Output Determinism", () => {
  it("output is deterministic independent of input order", () => {
    const skill = createMockSkill();
    
    // Create capabilities in different orders
    const registryResultOrder1: PermissionAwareRegistryResultV1 = Object.freeze({
      contract_version: PERMISSION_AWARE_REGISTRY_VERSION,
      matches: [
        {
          record_type: "CAPABILITY",
          record_id: "test-cap-2",
          version: "1.0.0",
          discovery_visible: true,
          execution_eligible: true,
          health_state: "AVAILABLE",
          side_effect_class: "READ_ONLY",
          approval_required: false,
          missing_scopes: [],
          missing_permissions: [],
          missing_policy_refs: [],
          blockers: [],
          reason_codes: [],
          budget_fit: "FIT" as const,
          utility_evidence: "SUPPORTED",
        },
        {
          record_type: "CAPABILITY",
          record_id: "test-cap-1",
          version: "1.0.0",
          discovery_visible: true,
          execution_eligible: true,
          health_state: "AVAILABLE",
          side_effect_class: "READ_ONLY",
          approval_required: false,
          missing_scopes: [],
          missing_permissions: [],
          missing_policy_refs: [],
          blockers: [],
          reason_codes: [],
          budget_fit: "FIT" as const,
          utility_evidence: "SUPPORTED",
        },
      ],
      truncated: false,
    });
    
    const registryResultOrder2: PermissionAwareRegistryResultV1 = Object.freeze({
      contract_version: PERMISSION_AWARE_REGISTRY_VERSION,
      matches: [
        {
          record_type: "CAPABILITY",
          record_id: "test-cap-1",
          version: "1.0.0",
          discovery_visible: true,
          execution_eligible: true,
          health_state: "AVAILABLE",
          side_effect_class: "READ_ONLY",
          approval_required: false,
          missing_scopes: [],
          missing_permissions: [],
          missing_policy_refs: [],
          blockers: [],
          reason_codes: [],
          budget_fit: "FIT" as const,
          utility_evidence: "SUPPORTED",
        },
        {
          record_type: "CAPABILITY",
          record_id: "test-cap-2",
          version: "1.0.0",
          discovery_visible: true,
          execution_eligible: true,
          health_state: "AVAILABLE",
          side_effect_class: "READ_ONLY",
          approval_required: false,
          missing_scopes: [],
          missing_permissions: [],
          missing_policy_refs: [],
          blockers: [],
          reason_codes: [],
          budget_fit: "FIT" as const,
          utility_evidence: "SUPPORTED",
        },
      ],
      truncated: false,
    });
    
    const caller1: RegistryCallerV1 = Object.freeze({
      identity_class: "identity:test",
      scopes: ["scope:read"],
      permissions: ["permission:read"],
      policy_refs: ["policy:test-basic"],
      approved_capability_ids: ["test-cap-2", "test-cap-1"],
    });
    
    const caller2: RegistryCallerV1 = Object.freeze({
      identity_class: "identity:test",
      scopes: ["scope:read"],
      permissions: ["permission:read"],
      policy_refs: ["policy:test-basic"],
      approved_capability_ids: ["test-cap-1", "test-cap-2"],
    });
    
    const planOrder1 = buildSkillExecutionPlanV1(skill, registryResultOrder1, caller1, new Date().toISOString());
    const planOrder2 = buildSkillExecutionPlanV1(skill, registryResultOrder2, caller2, new Date().toISOString());
    
    // Both plans should have same structure
    assert.ok(planOrder1.contract_version === planOrder2.contract_version);
    assert.ok(planOrder1.readiness === planOrder2.readiness);
  });
  
  it("contains no forbidden patterns", () => {
    const skill = createMockSkill();
    const registryResult: PermissionAwareRegistryResultV1 = Object.freeze({
      contract_version: PERMISSION_AWARE_REGISTRY_VERSION,
      matches: [{
        record_type: "CAPABILITY" as const,
        record_id: "test-cap-1",
        version: "1.0.0",
        discovery_visible: true,
        execution_eligible: true,
        health_state: "AVAILABLE",
        side_effect_class: "READ_ONLY",
        approval_required: false,
        missing_scopes: [],
        missing_permissions: [],
        missing_policy_refs: [],
        blockers: [],
        reason_codes: [],
        budget_fit: "FIT" as const,
        utility_evidence: "SUPPORTED",
      }],
      truncated: false,
    });
    
    const caller: RegistryCallerV1 = Object.freeze({
      identity_class: "identity:test",
      scopes: ["scope:read"],
      permissions: ["permission:read"],
      policy_refs: ["policy:test-basic"],
      approved_capability_ids: ["test-cap-1"],
    });
    
    const plan = buildSkillExecutionPlanV1(skill, registryResult, caller, new Date().toISOString());
    
    const planJson = JSON.stringify(plan);
    
    assert.ok(!planJson.includes("raw"));
    assert.ok(!planJson.includes("secret"));
  });
});
