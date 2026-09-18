import assert from "node:assert/strict";
import test from "node:test";

import {
  reviewStrategicCampaignSteeringV1,
  type StrategicCampaignCheckpointEvidenceV1,
  type StrategicCampaignSteeringInputV1
} from "@/lib/strategy-engine/strategic-campaign-steering-v1";

const AS_OF = "2026-09-18T20:00:00.000Z";
const OBSERVED_AT = "2026-09-18T18:00:00.000Z";

function checkpoint(
  overrides: Partial<StrategicCampaignCheckpointEvidenceV1> = {}
): StrategicCampaignCheckpointEvidenceV1 {
  return {
    checkpointId: "checkpoint:campaign:1",
    campaignId: "campaign:collector-launch",
    observedAt: OBSERVED_AT,
    sourceRef: "evidence:campaign:checkpoint:1",
    provenance: "FIRST_PARTY",
    measurementStatus: "COMPLETE",
    reviewSignal: "NO_CHANGE_INDICATED",
    decisionId: "decision:collector-launch",
    experimentId: null,
    allocationId: null,
    ...overrides
  };
}

function input(
  overrides: Partial<StrategicCampaignSteeringInputV1> = {}
): StrategicCampaignSteeringInputV1 {
  return {
    campaignId: "campaign:collector-launch",
    objective: "Evaluate the campaign against its recorded objective and constraints.",
    state: "ACTIVE",
    asOf: AS_OF,
    maxEvidenceAgeDays: 7,
    checkpoints: [checkpoint()],
    ...overrides
  };
}

function assertNoConsequentialAuthority(result: ReturnType<typeof reviewStrategicCampaignSteeringV1>) {
  assert.equal(result.causality, "NOT_ESTABLISHED");
  assert.equal(result.confidence, null);
  assert.equal(result.monetaryValue, null);
  assert.equal(result.outcome, null);
  assert.equal(result.authority.campaignMutation, false);
  assert.equal(result.authority.budgetMutation, false);
  assert.equal(result.authority.allocationMutation, false);
  assert.equal(result.authority.experimentMutation, false);
  assert.equal(result.authority.persistence, false);
  assert.equal(result.authority.providerWrite, false);
  assert.equal(result.authority.externalExecution, false);
  assert.equal(result.authority.approvalBypass, false);
}

test("waits when no checkpoint evidence exists", () => {
  const result = reviewStrategicCampaignSteeringV1(input({ checkpoints: [] }));

  assert.equal(result.status, "WAITING");
  assert.equal(result.action, "WAIT_FOR_EVIDENCE");
  assert.deepEqual(result.reasonCodes, ["NO_CHECKPOINT_EVIDENCE"]);
  assert.equal(result.authority.reviewPreparation, false);
  assertNoConsequentialAuthority(result);
});

test("fresh complete no-change evidence does not become a scale instruction", () => {
  const result = reviewStrategicCampaignSteeringV1(input());

  assert.equal(result.status, "READY");
  assert.equal(result.action, "CONTINUE_OBSERVING");
  assert.deepEqual(result.reasonCodes, ["NO_CHANGE_EVIDENCE"]);
  assert.deepEqual(result.evidenceRefs, ["evidence:campaign:checkpoint:1"]);
  assert.equal(result.authority.reviewPreparation, false);
  assertNoConsequentialAuthority(result);
});

test("assumption conflict opens internal review preparation only", () => {
  const result = reviewStrategicCampaignSteeringV1(
    input({ checkpoints: [checkpoint({ reviewSignal: "ASSUMPTION_EVIDENCE_CONFLICT" })] })
  );

  assert.equal(result.status, "READY");
  assert.equal(result.action, "REVIEW_ASSUMPTIONS");
  assert.deepEqual(result.reasonCodes, ["ASSUMPTION_REVIEW_REQUIRED"]);
  assert.equal(result.authority.reviewPreparation, true);
  assertNoConsequentialAuthority(result);
});

test("experiment review requires exact experiment identity and never mutates it", () => {
  const missingIdentity = reviewStrategicCampaignSteeringV1(
    input({
      checkpoints: [
        checkpoint({
          reviewSignal: "EXPERIMENT_RESULT_REQUIRES_REVIEW",
          experimentId: null
        })
      ]
    })
  );
  assert.equal(missingIdentity.status, "BLOCKED");
  assert.ok(missingIdentity.reasonCodes.includes("MISSING_EXPERIMENT_ID"));

  const ready = reviewStrategicCampaignSteeringV1(
    input({
      checkpoints: [
        checkpoint({
          reviewSignal: "EXPERIMENT_RESULT_REQUIRES_REVIEW",
          experimentId: "experiment:creative:1"
        })
      ]
    })
  );
  assert.equal(ready.status, "READY");
  assert.equal(ready.action, "REVIEW_EXPERIMENT");
  assert.equal(ready.authority.reviewPreparation, true);
  assert.equal(ready.authority.experimentMutation, false);
  assertNoConsequentialAuthority(ready);
});

test("allocation review requires exact allocation identity and remains review-only", () => {
  const missingIdentity = reviewStrategicCampaignSteeringV1(
    input({
      checkpoints: [
        checkpoint({
          reviewSignal: "ALLOCATION_CONSTRAINT_CHANGED",
          allocationId: null
        })
      ]
    })
  );
  assert.equal(missingIdentity.status, "BLOCKED");
  assert.ok(missingIdentity.reasonCodes.includes("MISSING_ALLOCATION_ID"));

  const ready = reviewStrategicCampaignSteeringV1(
    input({
      checkpoints: [
        checkpoint({
          reviewSignal: "ALLOCATION_CONSTRAINT_CHANGED",
          allocationId: "allocation:campaign-capacity"
        })
      ]
    })
  );
  assert.equal(ready.status, "READY");
  assert.equal(ready.action, "REVIEW_REALLOCATION");
  assert.equal(ready.authority.allocationMutation, false);
  assertNoConsequentialAuthority(ready);
});

test("partial or inconclusive evidence waits rather than steering", () => {
  const partial = reviewStrategicCampaignSteeringV1(
    input({
      checkpoints: [
        checkpoint({
          measurementStatus: "PARTIAL",
          reviewSignal: "ASSUMPTION_EVIDENCE_CONFLICT"
        })
      ]
    })
  );
  assert.equal(partial.status, "WAITING");
  assert.equal(partial.action, "WAIT_FOR_EVIDENCE");
  assert.deepEqual(partial.reasonCodes, ["PARTIAL_MEASUREMENT"]);

  const inconclusive = reviewStrategicCampaignSteeringV1(
    input({ checkpoints: [checkpoint({ reviewSignal: "INCONCLUSIVE" })] })
  );
  assert.equal(inconclusive.status, "WAITING");
  assert.deepEqual(inconclusive.reasonCodes, ["INCONCLUSIVE_EVIDENCE"]);
});

test("stale and future evidence fail closed", () => {
  const stale = reviewStrategicCampaignSteeringV1(
    input({
      maxEvidenceAgeDays: 1,
      checkpoints: [checkpoint({ observedAt: "2026-09-15T18:00:00.000Z" })]
    })
  );
  assert.equal(stale.status, "BLOCKED");
  assert.ok(stale.reasonCodes.includes("STALE_EVIDENCE"));

  const future = reviewStrategicCampaignSteeringV1(
    input({ checkpoints: [checkpoint({ observedAt: "2026-09-19T18:00:00.000Z" })] })
  );
  assert.equal(future.status, "BLOCKED");
  assert.ok(future.reasonCodes.includes("FUTURE_EVIDENCE"));
});

test("campaign mismatch, duplicates, and unsafe provenance fail closed", () => {
  const mismatch = reviewStrategicCampaignSteeringV1(
    input({ checkpoints: [checkpoint({ campaignId: "campaign:other" })] })
  );
  assert.equal(mismatch.status, "BLOCKED");
  assert.ok(mismatch.reasonCodes.includes("CAMPAIGN_MISMATCH"));

  const duplicate = reviewStrategicCampaignSteeringV1(
    input({
      checkpoints: [
        checkpoint(),
        checkpoint({ sourceRef: "evidence:campaign:checkpoint:2" })
      ]
    })
  );
  assert.equal(duplicate.status, "BLOCKED");
  assert.ok(duplicate.reasonCodes.includes("DUPLICATE_CHECKPOINT"));

  const unsafe = reviewStrategicCampaignSteeringV1(
    input({ checkpoints: [checkpoint({ sourceRef: "https://example.test/?token=secret" })] })
  );
  assert.equal(unsafe.status, "BLOCKED");
  assert.ok(unsafe.reasonCodes.includes("UNSAFE_PROVENANCE"));
  assert.deepEqual(unsafe.evidenceRefs, []);
});

test("conflicting complete steering signals fail closed instead of being ranked", () => {
  const result = reviewStrategicCampaignSteeringV1(
    input({
      checkpoints: [
        checkpoint({
          checkpointId: "checkpoint:campaign:assumption",
          sourceRef: "evidence:campaign:assumption",
          reviewSignal: "ASSUMPTION_EVIDENCE_CONFLICT"
        }),
        checkpoint({
          checkpointId: "checkpoint:campaign:allocation",
          sourceRef: "evidence:campaign:allocation",
          reviewSignal: "ALLOCATION_CONSTRAINT_CHANGED",
          allocationId: "allocation:campaign-capacity"
        })
      ]
    })
  );

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.action, "WAIT_FOR_EVIDENCE");
  assert.deepEqual(result.reasonCodes, ["CONFLICTING_STEERING_SIGNALS"]);
  assertNoConsequentialAuthority(result);
});

test("no-change mixed with an actionable signal fails closed", () => {
  const result = reviewStrategicCampaignSteeringV1(
    input({
      checkpoints: [
        checkpoint({ checkpointId: "checkpoint:no-change" }),
        checkpoint({
          checkpointId: "checkpoint:objective",
          sourceRef: "evidence:campaign:objective",
          reviewSignal: "OBJECTIVE_EVIDENCE_CONFLICT"
        })
      ]
    })
  );

  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(result.reasonCodes, ["CONFLICTING_STEERING_SIGNALS"]);
});

test("invalid policy and malformed campaign inputs fail closed", () => {
  const badAge = reviewStrategicCampaignSteeringV1(input({ maxEvidenceAgeDays: 0 }));
  assert.equal(badAge.status, "BLOCKED");
  assert.deepEqual(badAge.reasonCodes, ["INVALID_INPUT"]);

  const badTime = reviewStrategicCampaignSteeringV1(input({ asOf: "not-a-time" }));
  assert.equal(badTime.status, "BLOCKED");

  const badObjective = reviewStrategicCampaignSteeringV1(input({ objective: "   " }));
  assert.equal(badObjective.status, "BLOCKED");

  const badState = reviewStrategicCampaignSteeringV1(
    input({ state: "RUNNING" as StrategicCampaignSteeringInputV1["state"] })
  );
  assert.equal(badState.status, "BLOCKED");
});

test("input evidence remains immutable and evidence refs are deterministic", () => {
  const checkpoints = [
    checkpoint({
      checkpointId: "checkpoint:z",
      sourceRef: "evidence:z",
      reviewSignal: "ASSUMPTION_EVIDENCE_CONFLICT"
    }),
    checkpoint({
      checkpointId: "checkpoint:a",
      sourceRef: "evidence:a",
      reviewSignal: "ASSUMPTION_EVIDENCE_CONFLICT"
    })
  ];
  const original = structuredClone(checkpoints);
  const result = reviewStrategicCampaignSteeringV1(input({ checkpoints }));

  assert.equal(result.status, "READY");
  assert.equal(result.action, "REVIEW_ASSUMPTIONS");
  assert.deepEqual(result.evidenceRefs, ["evidence:a", "evidence:z"]);
  assert.deepEqual(checkpoints, original);
  assertNoConsequentialAuthority(result);
});
