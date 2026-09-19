import assert from "node:assert/strict";
import test from "node:test";

import {
  assessStrategicCampaignCheckpointReadinessV1,
  type StrategicCampaignCheckpointSupportV1
} from "@/lib/strategy-engine/strategic-campaign-checkpoint-readiness-v1";
import type { StrategicCampaignCheckpointEvidenceV1 } from "@/lib/strategy-engine/strategic-campaign-steering-v1";

const EVALUATED_AT = "2026-09-19T09:00:00.000Z";
const OBSERVED_AT = "2026-09-19T08:30:00.000Z";

function draft(
  overrides: Partial<StrategicCampaignCheckpointEvidenceV1> = {}
): StrategicCampaignCheckpointEvidenceV1 {
  return {
    checkpointId: "checkpoint:campaign:1",
    campaignId: "campaign:fall-release",
    observedAt: OBSERVED_AT,
    sourceRef: "warehouse:campaign-checkpoint:1",
    provenance: "FIRST_PARTY",
    measurementStatus: "COMPLETE",
    reviewSignal: "ALLOCATION_CONSTRAINT_CHANGED",
    decisionId: "decision:campaign:1",
    experimentId: null,
    allocationId: "allocation:fall-release:1",
    ...overrides
  };
}

function support(
  overrides: Partial<StrategicCampaignCheckpointSupportV1> = {}
): StrategicCampaignCheckpointSupportV1 {
  return {
    truthState: "KNOWN",
    campaignId: "campaign:fall-release",
    reviewSignal: "ALLOCATION_CONSTRAINT_CHANGED",
    measurementStatus: "COMPLETE",
    provenance: "FIRST_PARTY",
    observedAt: OBSERVED_AT,
    evidenceRefs: ["evidence:campaign-checkpoint:1"],
    sourceRefs: ["warehouse:campaign-checkpoint:1"],
    experimentId: null,
    allocationId: "allocation:fall-release:1",
    ...overrides
  };
}

function assess(
  draftOverrides: Partial<StrategicCampaignCheckpointEvidenceV1> = {},
  supportOverrides: Partial<StrategicCampaignCheckpointSupportV1> = {},
  overrides: Partial<{
    evaluatedAt: string;
    maxAgeMs: number;
  }> = {}
) {
  return assessStrategicCampaignCheckpointReadinessV1({
    draft: draft(draftOverrides),
    support: support(supportOverrides),
    evaluatedAt: overrides.evaluatedAt ?? EVALUATED_AT,
    maxAgeMs: overrides.maxAgeMs ?? 60 * 60 * 1000
  });
}

test("passes an exact fresh KNOWN checkpoint into steering review preparation only", () => {
  const result = assess();

  assert.equal(result.state, "READY_FOR_STEERING");
  assert.deepEqual(result.reasonCodes, []);
  assert.equal(result.checkpoint?.campaignId, "campaign:fall-release");
  assert.equal(result.checkpoint?.reviewSignal, "ALLOCATION_CONSTRAINT_CHANGED");
  assert.deepEqual(result.evidenceRefs, ["evidence:campaign-checkpoint:1"]);
  assert.deepEqual(result.sourceRefs, ["warehouse:campaign-checkpoint:1"]);
  assert.equal(result.authority.steeringReviewPreparation, true);
  assert.equal(result.authority.campaignMutation, false);
  assert.equal(result.authority.allocationMutation, false);
  assert.equal(result.authority.budgetMutation, false);
  assert.equal(result.authority.externalExecution, false);
  assert.equal(result.authority.approvalBypass, false);
  assert.equal(result.causality, "NOT_ESTABLISHED");
  assert.equal(result.confidence, null);
  assert.equal(result.monetaryValue, null);
  assert.equal(result.outcome, null);
});

test("fails closed when canonical campaign, signal, measurement or provenance identity disagrees", () => {
  const result = assess(
    {},
    {
      campaignId: "campaign:other",
      reviewSignal: "OBJECTIVE_EVIDENCE_CONFLICT",
      measurementStatus: "PARTIAL",
      provenance: "AUTHORIZED_CONNECTOR"
    }
  );

  assert.equal(result.state, "VERIFY_REQUIRED");
  assert.equal(result.checkpoint, null);
  assert.deepEqual(result.reasonCodes, [
    "CAMPAIGN_IDENTITY_MISMATCH",
    "MEASUREMENT_STATUS_MISMATCH",
    "PROVENANCE_MISMATCH",
    "SIGNAL_IDENTITY_MISMATCH"
  ]);
  assert.equal(result.authority.steeringReviewPreparation, false);
});

test("fails closed on stale, future-dated or non-KNOWN support", () => {
  const stale = assess(
    { observedAt: "2026-09-19T05:00:00.000Z" },
    { observedAt: "2026-09-19T05:00:00.000Z" },
    { maxAgeMs: 60 * 60 * 1000 }
  );
  assert.equal(stale.state, "VERIFY_REQUIRED");
  assert.ok(stale.reasonCodes.includes("STALE_EVIDENCE"));

  const future = assess(
    { observedAt: "2026-09-19T10:00:00.000Z" },
    { observedAt: "2026-09-19T10:00:00.000Z" }
  );
  assert.equal(future.state, "VERIFY_REQUIRED");
  assert.ok(future.reasonCodes.includes("FUTURE_EVIDENCE"));

  const unknown = assess({}, { truthState: "UNKNOWN" });
  assert.equal(unknown.state, "VERIFY_REQUIRED");
  assert.ok(unknown.reasonCodes.includes("SUPPORT_NOT_KNOWN"));
});

test("requires explicit provenance references and rejects secret-like references", () => {
  const missing = assess({}, { evidenceRefs: [], sourceRefs: [] });
  assert.equal(missing.state, "VERIFY_REQUIRED");
  assert.ok(missing.reasonCodes.includes("MISSING_EVIDENCE_REFS"));
  assert.ok(missing.reasonCodes.includes("MISSING_SOURCE_REFS"));

  const unsupported = assess({}, { sourceRefs: ["warehouse:other"] });
  assert.equal(unsupported.state, "VERIFY_REQUIRED");
  assert.ok(unsupported.reasonCodes.includes("SOURCE_REF_NOT_SUPPORTED"));

  const unsafe = assess(
    { sourceRef: "warehouse:item?token=secret" },
    { sourceRefs: ["warehouse:item?token=secret"] }
  );
  assert.equal(unsafe.state, "VERIFY_REQUIRED");
  assert.ok(unsafe.reasonCodes.includes("UNSAFE_REFERENCE"));
});

test("requires exact experiment and allocation identities when those steering signals are used", () => {
  const experiment = assess(
    {
      reviewSignal: "EXPERIMENT_RESULT_REQUIRES_REVIEW",
      experimentId: "experiment:1",
      allocationId: null
    },
    {
      reviewSignal: "EXPERIMENT_RESULT_REQUIRES_REVIEW",
      experimentId: "experiment:2",
      allocationId: null
    }
  );
  assert.equal(experiment.state, "VERIFY_REQUIRED");
  assert.ok(experiment.reasonCodes.includes("EXPERIMENT_IDENTITY_MISMATCH"));

  const allocation = assess({}, { allocationId: null });
  assert.equal(allocation.state, "VERIFY_REQUIRED");
  assert.ok(allocation.reasonCodes.includes("MISSING_ALLOCATION_ID"));
});

test("allows a truthful partial checkpoint through the evidence gate without authorizing an action", () => {
  const result = assess(
    { measurementStatus: "PARTIAL" },
    { measurementStatus: "PARTIAL" }
  );

  assert.equal(result.state, "READY_FOR_STEERING");
  assert.equal(result.checkpoint?.measurementStatus, "PARTIAL");
  assert.equal(result.authority.campaignMutation, false);
  assert.equal(result.authority.allocationMutation, false);
  assert.equal(result.authority.experimentMutation, false);
  assert.equal(result.authority.providerWrite, false);
});
