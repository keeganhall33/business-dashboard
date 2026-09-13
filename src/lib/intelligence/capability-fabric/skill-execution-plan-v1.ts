/**
 * Skill Execution Plan V1 - Freshness-safe procedural skill planner
 * Contract version: BUSINESS_VALUE_V2
 * 
 * This module turns a validated ProceduralSkillV1 into a bounded, inspectable execution plan.
 * It excludes prior live results, requires current evidence/policy/capability authorization,
 * preserves UNKNOWN/conflict/degradation states, and bounds all budgets/retries.
 */

import {
  type GovernedCapabilityV1,
  type ProceduralSkillV1,
  type ProceduralSkillStepV1,
  type CapabilityHealth,
  type CapabilitySideEffectClass,
  type CapabilityApprovalClass,
  type VersionRangeV1,
} from "../capability-fabric/contracts-v1";

import {
  PERMISSION_AWARE_REGISTRY_VERSION,
  type PermissionAwareRegistryResultV1,
  type RegistryMatchV1,
  type RegistryCallerV1,
  type RegistryBudgetCeilingV1,
} from "../capability-fabric/registry-v1";

/** Skill Execution Plan V1 Contract */
export const SKILL_EXECUTION_PLAN_V1_CONTRACT = "SKILL_EXECUTION_PLAN_V1" as const;

/** Readiness states for the execution plan */
export type SkillPlanReadiness =
  | "READY"
  | "NEEDS_FRESH_EVIDENCE"
  | "NEEDS_APPROVAL"
  | "DEGRADED"
  | "BLOCKED"
  | "UNKNOWN";

/** Step readiness state */
export type StepStatus =
  | "READY"
  | "WAITING_FOR_EVIDENCE"
  | "WAITING_FOR_APPROVAL"
  | "BLOCKED"
  | "DEGRADED"
  | "SKIPPED";

/** Evidence freshness metadata */
export interface EvidenceFreshness {
  required: boolean;
  freshness_seconds: number | null;
  source_authority: string | null;
  is_current: boolean;
}

/** Skill step execution context with evidence and approval gates */
export interface StepExecutionContext {
  step_id: string;
  status: StepStatus;
  readiness_reasons: readonly string[];
  required_evidence?: Readonly<Record<string, EvidenceFreshness>>;
  pending_approvals?: Readonly<Record<string, unknown>>;
  evidence_acquired_at?: string;
  acquired_evidence?: Readonly<Record<string, unknown>>;
}

/** Capability authorization result */
export interface CapabilityAuthorization {
  capability_id: string;
  version: string;
  authorized: boolean;
  reason_codes: readonly string[];
  policy_refs: readonly string[];
}

/** Skill Execution Plan V1 - bounded execution plan with freshness gates */
export type SkillExecutionPlanV1 = Readonly<{
  /** Contract version - must match SKILL_EXECUTION_PLAN_V1_CONTRACT */
  contract_version: typeof SKILL_EXECUTION_PLAN_V1_CONTRACT;
  
  /** Reference to the procedural skill this plan implements */
  skill_ref: Readonly<{
    skill_id: string;
    version: string;
    owner: string;
    purpose: string;
  }>;
  
  /** Selected capability versions from the canonical registry */
  selected_capabilities: Readonly<Record<string, GovernedCapabilityV1>>;
  
  /** Ordered or dependency-aware execution steps */
  steps: readonly StepExecutionContext[];
  
  /** Required fresh evidence acquisitions before readiness */
  required_evidence: Readonly<Record<string, EvidenceFreshness>>;
  
  /** Approval gates that must pass before consequential steps */
  approval_gates: Readonly<{
    gate_id: string;
    scope: string;
    policy_ref: string;
    blocked_step_ids?: readonly string[];
  }[]>;
  
  /** Runtime and resource ceilings */
  budgets: Readonly<{
    runtime_ms: number;
    cost_microunits: number;
    context_tokens: number;
    result_bytes: number;
  }>;
  
  /** Readiness state - overall plan readiness */
  readiness: SkillPlanReadiness;
  
  /** Reason codes explaining the readiness state */
  reason_codes: readonly string[];
  
  /** Lineage anchors for traceability */
  lineage: Readonly<{
    plan_id: string;
    created_at: string;
    skill_lineage_id: string;
  }>;
  
  /** Declaration that prior run outputs are excluded */
  excludes_prior_results: boolean;
  
  /** Method provenance anchor */
  method_provenance_anchor: string;
}>;

/** Capability availability check result */
function checkCapabilityAvailability(
  capabilityId: string,
  registryResult: PermissionAwareRegistryResultV1,
  version: string
): { available: boolean; reason_codes: readonly string[] } {
  const match = registryResult.matches.find(
    (m) => m.record_id === capabilityId && m.version === version
  );
  
  if (!match) {
    return {
      available: false,
      reason_codes: [`CAPABILITY_NOT_FOUND_${capabilityId}`],
    };
  }
  
  if (match.health_state === "BLOCKED") {
    return {
      available: false,
      reason_codes: [`CAPABILITY_BLOCKED:${capabilityId}`],
    };
  }
  
  if (match.health_state === "UNKNOWN") {
    return {
      available: false,
      reason_codes: [`CAPABILITY_UNKNOWN:${capabilityId}`],
    };
  }
  
  if (!match.execution_eligible) {
    return {
      available: false,
      reason_codes: match.blockers,
    };
  }
  
  if (match.missing_scopes.length > 0 || match.missing_permissions.length > 0) {
    return {
      available: false,
      reason_codes: [
        ...match.missing_scopes,
        ...match.missing_permissions,
      ],
    };
  }
  
  if (match.approval_required) {
    return {
      available: false,
      reason_codes: [`APPROVAL_REQUIRED:${capabilityId}`],
    };
  }
  
  return {
    available: true,
    reason_codes: [],
  };
}

/** Check if caller has required authorization */
function checkCallerAuthorization(
  caller: RegistryCallerV1,
  capability: GovernedCapabilityV1
): { authorized: boolean; missing_requirements: readonly string[] } {
  const identityMissing = !caller.approved_capability_ids.includes(capability.capability_id);
  
  if (identityMissing) {
    return {
      authorized: false,
      missing_requirements: [`IDENTITY_NOT_APPROVED_FOR:${capability.capability_id}`],
    };
  }
  
  const scopesMissing = capability.required_identity_classes.some((required) => 
    !caller.scopes.includes(required)
  );
  
  if (scopesMissing) {
    return {
      authorized: false,
      missing_requirements: [`MISSING_SCOPES:${capability.required_identity_classes.filter(
        (s) => !caller.scopes.includes(s)
      ).join(",")}`],
    };
  }
  
  const permissionsMissing = capability.required_permissions.some((required) => 
    !caller.permissions.includes(required)
  );
  
  if (permissionsMissing) {
    return {
      authorized: false,
      missing_requirements: [`MISSING_PERMISSIONS:${capability.required_permissions.filter(
        (p) => !caller.permissions.includes(p)
      ).join(",")}`],
    };
  }
  
  const policyRefsMissing = capability.policy_refs.some((required) => 
    !caller.policy_refs.includes(required)
  );
  
  if (policyRefsMissing) {
    return {
      authorized: false,
      missing_requirements: [`MISSING_POLICY_REFS:${capability.policy_refs.filter(
        (r) => !caller.policy_refs.includes(r)
      ).join(",")}`],
    };
  }
  
  return {
    authorized: true,
    missing_requirements: [],
  };
}

/** Check evidence freshness against skill's freshness policy */
function checkEvidenceFreshness(
  evidenceTypes: readonly string[],
  freshnessPolicy: ProceduralSkillV1["freshness"],
  currentTimestamp: number
): Readonly<Record<string, EvidenceFreshness>> {
  const result: Record<string, EvidenceFreshness> = {};
  
  for (const type of evidenceTypes) {
    // In a real implementation, this would check actual source freshness
    // For now, we simulate with deterministic behavior based on configuration
    // Always assume evidence is NOT current to enforce freshness requirement
    result[type] = {
      required: true,
      freshness_seconds: null,
      source_authority: null,
      is_current: false,
    };
  }
  
  return Object.freeze(result);
}

/** Build execution steps with appropriate status */
function buildStepsWithStatus(
  skill: ProceduralSkillV1,
  capabilities: Readonly<Record<string, GovernedCapabilityV1>>,
  authorizationChecks: readonly CapabilityAuthorization[],
  evidenceStatus: Readonly<Record<string, EvidenceFreshness>>
): readonly StepExecutionContext[] {
  const steps: StepExecutionContext[] = [];
  
  for (const step of skill.steps) {
    let status: StepStatus = "READY";
    const readinessReasons: string[] = [];
    
    // Check evidence requirements for this step
    if (step.required_evidence_types.length > 0) {
      const hasStaleEvidence = Object.values(evidenceStatus).some((e) => 
        e.required && !e.is_current
      );
      
      if (hasStaleEvidence) {
        status = "WAITING_FOR_EVIDENCE";
        readinessReasons.push("STALE_REQUIRED_EVIDENCE");
      } else if (Object.values(evidenceStatus).some((e) => !e.required)) {
        status = "DEGRADED";
        readinessReasons.push("PARTIAL_EVIDENCE_AVAILABLE");
      }
    }
    
    // Check approval requirements for consequential steps
    const capabilityStep = step.capability_id ? capabilities[step.capability_id] : null;
    if (capabilityStep && capabilityStep.side_effect_class === "EXTERNAL_CONSEQUENTIAL") {
      const authResult = authorizationChecks.find((a) => a.capability_id === step.capability_id);
      if (authResult && !authResult.authorized) {
        status = "WAITING_FOR_APPROVAL";
        readinessReasons.push(`APPROVAL_REQUIRED_FOR:${step.step_id}`);
      }
    }
    
    // Check capability availability for invoke steps
    if (step.kind === "INVOKE_CAPABILITY" && step.capability_id) {
      const capability = capabilities[step.capability_id];
      if (!capability) {
        status = "BLOCKED";
        readinessReasons.push(`CAPABILITY_NOT_SELECTED:${step.step_id}`);
      } else if (capability.health === "DEGRADED") {
        status = "DEGRADED";
        readinessReasons.push(`CAPABILITY_DEGRADED:${step.capability_id}`);
      }
    }
    
    steps.push({
      step_id: step.step_id,
      status,
      readiness_reasons: Object.freeze(readinessReasons),
      required_evidence: step.required_evidence_types.reduce<Record<string, EvidenceFreshness>>((acc, type) => {
        acc[type] = evidenceStatus[type];
        return acc;
      }, {} as Record<string, EvidenceFreshness>),
      pending_approvals: capabilityStep 
        ? { [step.step_id]: capabilityStep.approval_class }
        : undefined,
    });
  }
  
  return Object.freeze(steps);
}

/** Build approval gates from skill steps */
function buildApprovalGates(
  skill: ProceduralSkillV1,
  capabilities: Readonly<Record<string, GovernedCapabilityV1>>
): readonly StepExecutionContext[] {
  const gates: typeof stepExecutionContexts = [];
  
  for (const step of skill.steps) {
    if (step.kind !== "INVOKE_CAPABILITY") continue;
    
    const capability = capabilities[step.capability_id];
    if (!capability || capability.approval_class === "NONE") continue;
    
    gates.push({
      gate_id: `${step.step_id}_approval_gate`,
      scope: `capability:${step.capability_id}`,
      policy_ref: capability.policy_refs[0] || "",
      blocked_step_ids: [step.step_id],
    });
  }
  
  return Object.freeze(gates);
}

/** Build execution plan from skill and registry */
export function buildSkillExecutionPlanV1(
  skill: ProceduralSkillV1,
  registryResult: PermissionAwareRegistryResultV1,
  caller: RegistryCallerV1,
  evaluatedAt: string
): SkillExecutionPlanV1 {
  // Extract selected capabilities from registry
  const selectedCapabilities: Record<string, GovernedCapabilityV1> = {};
  
  for (const match of registryResult.matches) {
    if (match.record_type === "CAPABILITY" && match.execution_eligible) {
      // Find the matching capability in registry to get full details
      const capabilityMatch = registryResult.matches.find(
        (m: RegistryMatchV1) => 
          m.record_id === match.record_id &&
          m.health_state !== "BLOCKED" &&
          m.health_state !== "UNKNOWN"
      );
      
      if (capabilityMatch) {
        selectedCapabilities[match.record_id] = capabilityMatch as GovernedCapabilityV1;
      }
    }
  }
  
  // Check capability authorization for each step
  const capabilityIds = Object.keys(selectedCapabilities);
  const authorizationChecks: CapabilityAuthorization[] = [];
  
  for (const capabilityId of capabilityIds) {
    const capability = selectedCapabilities[capabilityId];
    const authResult = checkCallerAuthorization(caller, capability);
    
    authorizationChecks.push({
      capability_id: capabilityId,
      version: capability.version,
      authorized: authResult.authorized,
      reason_codes: authResult.missing_requirements,
      policy_refs: capability.policy_refs,
    });
  }
  
  // Check evidence freshness (always needs fresh evidence)
  const requiredEvidenceTypes = skill.required_evidence_types;
  const evidenceStatus = checkEvidenceFreshness(
    requiredEvidenceTypes,
    skill.freshness,
    Date.now()
  );
  
  // Build steps with status
  const steps = buildStepsWithStatus(skill, selectedCapabilities, authorizationChecks, evidenceStatus);
  
  // Determine readiness state
  let readiness: SkillPlanReadiness = "UNKNOWN";
  const reasonCodes: string[] = [];
  
  // Check for blocked states first
  if (Object.values(steps).some((s) => s.status === "BLOCKED")) {
    readiness = "BLOCKED";
    reasonCodes.push("STEP_BLOCKED");
  } else if (steps.some((s) => s.status === "WAITING_FOR_EVIDENCE")) {
    readiness = "NEEDS_FRESH_EVIDENCE";
    reasonCodes.push("STALE_REQUIRED_EVIDENCE");
  } else if (Object.values(steps).some((s) => s.status === "WAITING_FOR_APPROVAL")) {
    readiness = "NEEDS_APPROVAL";
    reasonCodes.push("APPROVAL_GATE_BLOCKED");
  } else if (Object.values(steps).some((s) => s.status === "DEGRADED")) {
    readiness = "DEGRADED";
    reasonCodes.push("CAPABILITY_DEGRADED");
  } else if (steps.some((s) => s.readiness_reasons.length > 0)) {
    readiness = "DEGRADED";
    reasonCodes.push(...steps.flatMap((s) => s.readiness_reasons));
  } else {
    readiness = "READY";
  }
  
  // Build lineage
  const planId = `${skill.skill_id}_plan_${evaluatedAt.slice(0, 8)}`;
  
  return Object.freeze({
    contract_version: SKILL_EXECUTION_PLAN_V1_CONTRACT,
    skill_ref: {
      skill_id: skill.skill_id,
      version: skill.version,
      owner: skill.owner,
      purpose: skill.purpose,
    },
    selected_capabilities: selectedCapabilities,
    steps: steps,
    required_evidence: evidenceStatus,
    approval_gates: buildApprovalGates(skill, selectedCapabilities),
    budgets: {
      runtime_ms: skill.budgets?.runtime_ms || 3600000,
      cost_microunits: skill.budgets?.cost_microunits || 10000000,
      context_tokens: skill.budgets?.context_tokens || 1000000,
      result_bytes: skill.budgets?.result_bytes || 10000000,
    },
    readiness,
    reason_codes: Object.freeze(reasonCodes),
    lineage: {
      plan_id: planId,
      created_at: evaluatedAt,
      skill_lineage_id: skill.id,
    },
    excludes_prior_results: true,
    method_provenance_anchor: skill.method_provenance.originating_analysis_id,
  });
}

/** Verify output determinism - no secrets, raw data, or live results */
export function verifyPlanDeterminism(plan: SkillExecutionPlanV1): asserts plan is SkillExecutionPlanV1 {
  // Verify no forbidden keys in plan output
  const forbiddenPatterns = [
    /raw|body|payload|secret|credential|password|token/i,
    /prompt|transcript|chain_of_thought/i,
    /current_business_fact|prior_live_result/i,
  ];
  
  for (const pattern of forbiddenPatterns) {
    const planString = JSON.stringify(plan);
    if (pattern.test(planString)) {
      throw new Error(`PLAN_DETERMINISM_VIOLATION: ${planString} contains forbidden content`);
    }
  }
}
