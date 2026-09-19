import assert from "node:assert/strict";
import test from "node:test";

import {
  assessStrategicCampaignCheckpointReadinessV1,
  type StrategicCampaignCheckpointReadinessV1,
  type StrategicCampaignCheckpointSupportV1
} from "../../src/lib/strategy-engine/strategic-campaign-checkpoint-readiness-v1";
import type { StrategicCampaignCheckpointEvidenceV1 } from "../../src/lib/strategy-engine/strategic-campaign-steering-v1";
import {
  reviewEvidenceBoundStrategicCampaignSteeringV1,
  type EvidenceBoundStrategicCampaignSteeringInputV1
} from "../../src/lib/strategy-engine/evidence-bound-strategic-campaign-steering-v1";

const OBSERVED_AT = "2026-09-19T12:00:00.000Z";
const READINESS_AT = "2026-09-19T12:05:00.000Z";
const AS_OF = "2026-09-19T12:10:00.000Z";
const ONE_HOUR_MS = 60 * 60 * 1000;

function readyCheckpoint(
  checkpointId: string,
  reviewSignal: StrategicCampaignCheckpointEvidenceV1["reviewSignal"] = "ASSUMPTION_EVIDENCE_CONFLICT",
  measurementStatus: StrategicCampaignCheckpointEvidenceV1["measurementStatus"] = "COMPLETE"
): StrategicCampaignCheckpointReadinessV1 {
  const draft: StrategicCampaignCheckpointEvidenceV1 = {
    checkpointId,
    campaignId: "campaign:collector-launch",
    observedAt: OBSERVED_AT,
    sourceRef: `source:${checkpointId}`,
    provenance: "FIRST_PARTY",
    measurementStatus,
    reviewSignal,
    decisionId: "decision:collector-launch",
    experimentId: reviewSignal === "EXPERIMENT_RESULT_REQUIRES_REVIEW" ? "experiment:collector-launch" : null,
    allocationId: reviewSignal === "ALLOCATION_CONSTRAINT_CHANGED" ? "allocation:collector-launch" : null
  };
  const support: StrategicCampaignCheckpointSupportV1 = {
    truthState: "KNOWN",
    campaignId: draft.campaignId,
    reviewSignal: draft.reviewSignal,
    measurementStatus: draft.measurementStatus,
    provenance: draft.provenance,
    observedAt: draft.observedAt,
    evidenceRefs: [`evidence:${checkpointId}`],
    sourceRefs: [draft.sourceRef],
    experimentId: draft.experimentId,
    allocationId: draft.allocationId
  };
  return assessStrategicCampaignCheckpointReadinessV1({
    draft,
    support,
    evaluatedAt: READINESS_AT,
    maxAgeMs: ONE_HOUR_MS
  });
}

function input(
  checkpointReadiness: readonly StrategicCampaignCheckpointReadinessV1[],
  overrides: Partial<EvidenceBoundStrategicCampaignSteeringInputV1> = {}
): EvidenceBoundStrategicCampaignSteeringInputV1 {
  return {
    campaignId: "campaign:collector-launch",
    objective: "Evaluate the collector launch using only verified checkpoint evidence.",
    state: "ACTIVE",
    asOf: AS_OF,
    maxEvidenceAgeDays: 1,
    maximumReadinessAgeMs: ONE_HOUR_MS,
    checkpointReadiness,
    ...overrides
  };
}

test("routes only verified checkpoint evidence into campaign steering review", () => {
  const result = reviewEvidenceBoundStrategicCampaignSteeringV1(
    input([readyCheckpoint("checkpoint:assumption")])
  );

  assert.equal(result.state, "READY");
  assert.deepEqual(result.reasonCodes, []);
  assert.equal(result.steering?.status, "READY");
  assert.equal(result.steering?.action, "REVIEW_ASSUMPTIONS");
  assert.deepEqual(result.acceptedCheckpointIds, ["checkpoint:assumption"]);
  assert.deepEqual(result.evidenceRefs, ["evidence:checkpoint:assumption"]);
  assert.deepEqual(result.sourceRefs, ["source:checkpoint:assumption"]);
  assert.equal(result.causality, "NOT_ESTABLISHED");
  assert.equal(result.confidence, null);
  assert.equal(result.monetaryValue, null);
  assert.equal(result.inferredOutcome, null);
  assert.equal(result.authority.steeringReviewPreparation, true);
  assert.equal(result.authority.campaignMutation, false);
  assert.equal(result.authority.budgetMutation, false);
  assert.equal(result.authority.externalExecution, false);
  assert.equal(result.authority.approvalBypass, false);
});

test("waits when no verified checkpoints are available instead of inventing a steering signal", () => {
  const result = reviewEvidenceBoundStrategicCampaignSteeringV1(input([]));

  assert.equal(result.state, "WAITING");
  assert.deepEqual(result.reasonCodes, ["NO_VERIFIED_CHECKPOINTS"]);
  assert.equal(result.steering, null);
  assert.equal(result.authority.steeringReviewPreparation, false);
});

test("fails closed when a readiness result widens authority", () => {
  const readiness = readyCheckpoint("checkpoint:authority");
  const widened = {
    ...readiness,
    authority: {
      ...readiness.authority,
      campaignMutation: true
    }
  } as unknown as StrategicCampaignCheckpointReadinessV1;
  const result = reviewEvidenceBoundStrategicCampaignSteeringV1(input([widened]));

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(result.reasonCodes.includes("READINESS_AUTHORITY_WIDENED"));
  assert.equal(result.steering, null);
  assert.equal(result.authority.steeringReviewPreparation, false);
});

test("fails closed when a verified checkpoint is stale at steering time", () => {
  const result = reviewEvidenceBoundStrategicCampaignSteeringV1(
    input([readyCheckpoint("checkpoint:stale")], {
      asOf: "2026-09-19T14:30:00.000Z",
      maximumReadinessAgeMs: ONE_HOUR_MS
    })
  );

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(result.reasonCodes.includes("READINESS_STALE"));
  assert.equal(result.steering, null);
});

test("fails closed when campaign identity no longer matches the verified checkpoint", () => {
  const result = reviewEvidenceBoundStrategicCampaignSteeringV1(
    input([readyCheckpoint("checkpoint:identity")], { campaignId: "campaign:different" })
  );

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(result.reasonCodes.includes("CAMPAIGN_IDENTITY_MISMATCH"));
  assert.equal(result.steering, null);
});

test("preserves conflicting verified steering signals as blocked review rather than choosing one", () => {
  const result = reviewEvidenceBoundStrategicCampaignSteeringV1(
    input([
      readyCheckpoint("checkpoint:assumption", "ASSUMPTION_EVIDENCE_CONFLICT"),
      readyCheckpoint("checkpoint:objective", "OBJECTIVE_EVIDENCE_CONFLICT")
    ])
  );

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.deepEqual(result.reasonCodes, ["STEERING_BLOCKED"]);
  assert.equal(result.steering?.status, "BLOCKED");
  assert.ok(result.steering?.reasonCodes.includes("CONFLICTING_STEERING_SIGNALS"));
  assert.equal(result.authority.steeringReviewPreparation, false);
});

test("preserves partial verified evidence as waiting rather than upgrading it to a campaign action", () => {
  const result = reviewEvidenceBoundStrategicCampaignSteeringV1(
    input([readyCheckpoint("checkpoint:partial", "ASSUMPTION_EVIDENCE_CONFLICT", "PARTIAL")])
  );

  assert.equal(result.state, "WAITING");
  assert.deepEqual(result.reasonCodes, ["STEERING_WAITING"]);
  assert.equal(result.steering?.status, "WAITING");
  assert.equal(result.steering?.action, "WAIT_FOR_EVIDENCE");
  assert.equal(result.authority.steeringReviewPreparation, false);
});

test("is deterministic and deeply immutable", () => {
  const source = input([readyCheckpoint("checkpoint:immutable")]);
  const before = structuredClone(source);
  const first = reviewEvidenceBoundStrategicCampaignSteeringV1(source);
  const second = reviewEvidenceBoundStrategicCampaignSteeringV1(source);

  assert.deepEqual(first, second);
  assert.deepEqual(source, before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.authority), true);
  assert.equal(Object.isFrozen(first.steering), true);
  assert.equal(Object.isFrozen(first.evidenceRefs), true);
});
