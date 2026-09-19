import assert from "node:assert/strict";
import test from "node:test";

import {
  adaptFunnelKitCheckoutSourceV1,
  type FunnelKitCheckoutSourceAdapterInputV1,
} from "../../src/lib/revenue-intelligence/funnelkit-checkout-source-adapter-v1";

function completeInput(): FunnelKitCheckoutSourceAdapterInputV1 {
  return {
    generatedAt: "2026-09-19T16:30:00.000Z",
    snapshot: {
      sourceTruth: "COMPLETE",
      range: { startDate: "2026-09-12", endDate: "2026-09-18" },
      observedAt: "2026-09-19T16:20:00.000Z",
      completeThrough: "2026-09-18",
      metricDefinitionId: "checkout_completed_v1",
      completionCount: 42,
      evidenceRefs: ["funnelkit:authorized-export:run-17"],
    },
  };
}

test("adapts explicit complete FunnelKit evidence without adding authority", () => {
  const result = adaptFunnelKitCheckoutSourceV1(completeInput());

  assert.equal(result.status, "ADAPTED");
  assert.equal(result.reasonCode, "ADAPTED");
  assert.equal(result.observation?.source, "FUNNELKIT");
  assert.equal(result.observation?.truthState, "COMPLETE");
  assert.equal(result.observation?.completionCount, 42);
  assert.equal(result.observation?.metricDefinitionId, "checkout_completed_v1");
  assert.deepEqual(result.observation?.evidenceRefs, ["funnelkit:authorized-export:run-17"]);
  assert.equal(result.authority.networkCallPerformed, false);
  assert.equal(result.authority.credentialAccessPerformed, false);
  assert.equal(result.authority.persistencePerformed, false);
  assert.equal(result.authority.externalMutationAllowed, false);
  assert.equal(result.authority.approvalBypassAllowed, false);
  assert.match(result.limitations.join(" "), /does not establish attribution, causality/i);
});

test("preserves partial evidence instead of upgrading missing data to complete", () => {
  const input = completeInput();
  const result = adaptFunnelKitCheckoutSourceV1({
    ...input,
    snapshot: {
      ...input.snapshot,
      sourceTruth: "PARTIAL",
      completeThrough: null,
      metricDefinitionId: null,
      completionCount: null,
      evidenceRefs: [],
    },
  });

  assert.equal(result.status, "ADAPTED");
  assert.equal(result.observation?.truthState, "PARTIAL");
  assert.equal(result.observation?.completionCount, null);
  assert.equal(result.observation?.metricDefinitionId, null);
  assert.deepEqual(result.observation?.evidenceRefs, []);
});

test("rejects a COMPLETE claim without complete-through, count, definition, and provenance", () => {
  const input = completeInput();
  const result = adaptFunnelKitCheckoutSourceV1({
    ...input,
    snapshot: {
      ...input.snapshot,
      completeThrough: null,
      metricDefinitionId: null,
      completionCount: null,
      evidenceRefs: [],
    },
  });

  assert.equal(result.status, "REJECTED");
  assert.equal(result.reasonCode, "COMPLETE_EVIDENCE_INCOMPLETE");
  assert.equal(result.observation, null);
});

test("rejects provider evidence dated after the adapter generation time", () => {
  const input = completeInput();
  const result = adaptFunnelKitCheckoutSourceV1({
    ...input,
    snapshot: {
      ...input.snapshot,
      observedAt: "2026-09-19T16:31:00.000Z",
    },
  });

  assert.equal(result.status, "REJECTED");
  assert.equal(result.reasonCode, "FUTURE_EVIDENCE");
});

test("rejects a source range that extends into a future UTC date", () => {
  const input = completeInput();
  const result = adaptFunnelKitCheckoutSourceV1({
    ...input,
    snapshot: {
      ...input.snapshot,
      range: { startDate: "2026-09-12", endDate: "2026-09-20" },
      completeThrough: "2026-09-20",
    },
  });

  assert.equal(result.status, "REJECTED");
  assert.equal(result.reasonCode, "FUTURE_RANGE");
});

test("rejects secret-like material in provenance references", () => {
  const input = completeInput();
  const result = adaptFunnelKitCheckoutSourceV1({
    ...input,
    snapshot: {
      ...input.snapshot,
      evidenceRefs: ["access_token=do-not-store-this"],
    },
  });

  assert.equal(result.status, "REJECTED");
  assert.equal(result.reasonCode, "SECRET_LIKE_EVIDENCE_REF");
  assert.deepEqual(result.observation, null);
});

test("rejects negative or fractional completion counts rather than normalizing them", () => {
  const input = completeInput();

  for (const completionCount of [-1, 1.5]) {
    const result = adaptFunnelKitCheckoutSourceV1({
      ...input,
      snapshot: { ...input.snapshot, completionCount },
    });
    assert.equal(result.status, "REJECTED");
    assert.equal(result.reasonCode, "INVALID_INPUT");
  }
});
