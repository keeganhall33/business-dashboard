import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTONOMOUS_GROWTH_REQUIRED_STAGES_V1,
  evaluateAutonomousGrowthCanaryV1,
  type AutonomousGrowthCanaryInputV1
} from "@/lib/intelligence-quality-evals/autonomous-growth-canary-v1";

const evaluatedAt = "2026-09-19T05:00:00.000Z";
const lineageId = "decision-lineage:arena-club-001";

function passingInput(): AutonomousGrowthCanaryInputV1 {
  return {
    run_id: "autonomous-growth-canary:production-001",
    evaluated_at: evaluatedAt,
    mode: "PRODUCTION",
    canonical_subject_id: "opportunity:arena-club-001",
    lineage_id: lineageId,
    stages: AUTONOMOUS_GROWTH_REQUIRED_STAGES_V1.map((stage) => ({
      stage,
      state: "PROVEN" as const,
      evidence_mode: "PRODUCTION" as const,
      evidence_ref: `evidence:${stage.toLowerCase()}`,
      observed_at: stage === "SCHEDULER_RUNTIME" || stage === "PRODUCTION_TELEMETRY"
        ? "2026-09-19T04:30:00.000Z"
        : "2026-09-10T12:00:00.000Z",
      lineage_id: lineageId
    })),
    attribution_class: "NOT_ESTABLISHED",
    telemetry: {
      owner_burden_minutes: 0,
      safe_work_completed_count: 7,
      missed_window_count: 0,
      duplicate_or_noise_count: 1,
      stale_campaign_count: 0,
      recommendation_to_outcome_closed_count: 1
    },
    execution_boundary: {
      external_action_executed: true,
      approval_evidence_ref: "approval:keegan-001"
    },
    policy_change: {
      promotion_state: "NOT_PROPOSED",
      shadow_evidence_ref: null,
      rollback_evidence_ref: null,
      approval_evidence_ref: null
    }
  };
}

test("certifies only an explicit complete production loop without upgrading attribution", () => {
  const result = evaluateAutonomousGrowthCanaryV1(passingInput());

  assert.equal(result.state, "CERTIFIED_PRODUCTION_LOOP");
  assert.deepEqual(result.reason_codes, ["PRODUCTION_LOOP_CERTIFIED"]);
  assert.equal(result.attribution_class, "NOT_ESTABLISHED");
  assert.equal(result.telemetry.owner_burden_minutes, 0);
  assert.equal(result.authority.external_action_allowed, false);
  assert.equal(result.authority.allocation_mutation_allowed, false);
  assert.equal(result.authority.policy_promotion_allowed, false);
});

test("fixture evidence cannot masquerade as production proof", () => {
  const baseline = passingInput();
  const input: AutonomousGrowthCanaryInputV1 = {
    ...baseline,
    mode: "FIXTURE",
    stages: baseline.stages.map((stage) => ({ ...stage, evidence_mode: "FIXTURE" as const }))
  };

  const result = evaluateAutonomousGrowthCanaryV1(input);

  assert.equal(result.state, "NON_PRODUCTION_EVIDENCE");
  assert.ok(result.reason_codes.includes("NON_PRODUCTION_MODE"));
  assert.ok(result.reason_codes.includes("STAGE_NON_PRODUCTION_EVIDENCE"));
});

test("missing outcome evidence remains incomplete instead of becoming success", () => {
  const baseline = passingInput();
  const input: AutonomousGrowthCanaryInputV1 = {
    ...baseline,
    stages: baseline.stages.filter((stage) => stage.stage !== "OUTCOME_MEASUREMENT")
  };

  const result = evaluateAutonomousGrowthCanaryV1(input);

  assert.equal(result.state, "INCOMPLETE");
  assert.equal(result.stages.find((stage) => stage.stage === "OUTCOME_MEASUREMENT")?.state, "MISSING");
  assert.ok(result.reason_codes.includes("STAGE_MISSING"));
});

test("preserves correlational attribution without turning it into causal learning", () => {
  const input: AutonomousGrowthCanaryInputV1 = {
    ...passingInput(),
    attribution_class: "CORRELATIONAL"
  };

  const result = evaluateAutonomousGrowthCanaryV1(input);

  assert.equal(result.state, "CERTIFIED_PRODUCTION_LOOP");
  assert.equal(result.attribution_class, "CORRELATIONAL");
  assert.ok(result.limitations.some((value) => value.includes("never upgraded")));
});

test("blocks an external action when approval proof is absent", () => {
  const input: AutonomousGrowthCanaryInputV1 = {
    ...passingInput(),
    execution_boundary: {
      external_action_executed: true,
      approval_evidence_ref: null
    }
  };

  const result = evaluateAutonomousGrowthCanaryV1(input);

  assert.equal(result.state, "BLOCKED");
  assert.ok(result.reason_codes.includes("EXTERNAL_ACTION_APPROVAL_MISSING"));
});

test("requires shadow, rollback, and explicit approval evidence before a policy promotion can certify", () => {
  const baseline = passingInput();
  const blocked = evaluateAutonomousGrowthCanaryV1({
    ...baseline,
    policy_change: {
      promotion_state: "APPROVED_PROMOTION",
      shadow_evidence_ref: "shadow:policy-001",
      rollback_evidence_ref: null,
      approval_evidence_ref: null
    }
  });

  assert.equal(blocked.state, "BLOCKED");
  assert.ok(blocked.reason_codes.includes("POLICY_ROLLBACK_PROOF_MISSING"));
  assert.ok(blocked.reason_codes.includes("POLICY_PROMOTION_APPROVAL_MISSING"));

  const proven = evaluateAutonomousGrowthCanaryV1({
    ...baseline,
    policy_change: {
      promotion_state: "APPROVED_PROMOTION",
      shadow_evidence_ref: "shadow:policy-001",
      rollback_evidence_ref: "rollback:policy-001",
      approval_evidence_ref: "approval:policy-001"
    }
  });
  assert.equal(proven.state, "CERTIFIED_PRODUCTION_LOOP");
});

test("stale runtime or telemetry proof fails closed even when historical business stages are older", () => {
  const baseline = passingInput();
  const input: AutonomousGrowthCanaryInputV1 = {
    ...baseline,
    stages: baseline.stages.map((stage) => stage.stage === "PRODUCTION_TELEMETRY"
      ? { ...stage, observed_at: "2026-09-17T00:00:00.000Z" }
      : stage)
  };

  const result = evaluateAutonomousGrowthCanaryV1(input);

  assert.equal(result.state, "STALE");
  assert.ok(result.reason_codes.includes("OPERATIONAL_EVIDENCE_STALE"));
});

test("blocks future evidence and exact-lineage mismatches", () => {
  const baseline = passingInput();
  const input: AutonomousGrowthCanaryInputV1 = {
    ...baseline,
    stages: baseline.stages.map((stage) => {
      if (stage.stage === "LEARNING_UPDATE") return { ...stage, lineage_id: "decision-lineage:other" };
      if (stage.stage === "REALLOCATION_REVIEW") return { ...stage, observed_at: "2026-09-20T00:00:00.000Z" };
      return stage;
    })
  };

  const result = evaluateAutonomousGrowthCanaryV1(input);

  assert.equal(result.state, "BLOCKED");
  assert.ok(result.reason_codes.includes("LINEAGE_MISMATCH"));
  assert.ok(result.reason_codes.includes("STAGE_OBSERVED_IN_FUTURE"));
});

test("telemetry is explicit and incomplete fields do not silently become zero", () => {
  const baseline = passingInput();
  const result = evaluateAutonomousGrowthCanaryV1({
    ...baseline,
    telemetry: {
      ...baseline.telemetry,
      owner_burden_minutes: null
    }
  });

  assert.equal(result.state, "INCOMPLETE");
  assert.equal(result.telemetry.owner_burden_minutes, null);
  assert.ok(result.reason_codes.includes("TELEMETRY_INCOMPLETE"));
});

test("malformed duplicate stages and invalid negative telemetry fail closed", () => {
  const baseline = passingInput();
  assert.throws(() => evaluateAutonomousGrowthCanaryV1({
    ...baseline,
    stages: [...baseline.stages, baseline.stages[0]]
  }), /STAGE_DUPLICATE/);

  assert.throws(() => evaluateAutonomousGrowthCanaryV1({
    ...baseline,
    telemetry: { ...baseline.telemetry, missed_window_count: -1 }
  }), /MISSED_WINDOW_COUNT_INVALID/);
});
