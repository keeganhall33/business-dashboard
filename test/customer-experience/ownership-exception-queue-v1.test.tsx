import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOwnershipExperienceExceptionQueueV1,
  type OwnershipExperienceExceptionV1
} from "@/lib/customer-experience/ownership-exception-queue-v1";

const NOW = new Date("2026-09-08T18:00:00.000Z");

function exception(
  overrides: Partial<OwnershipExperienceExceptionV1> = {}
): OwnershipExperienceExceptionV1 {
  return {
    id: "exception-1",
    orderRef: "order-1",
    customerRef: "customer-1",
    projectRef: "project-1",
    issueClass: "DELAYED_FULFILLMENT",
    severity: "HIGH",
    openedAt: "2026-09-01T18:00:00.000Z",
    expectedBy: "2026-09-05T18:00:00.000Z",
    evidenceTruthState: "KNOWN",
    evidenceRefs: ["evidence-1"],
    resolutionState: "OPEN",
    resolutionTruthState: "UNKNOWN",
    resolutionEvidenceRefs: [],
    valueContext: "STANDARD",
    nextSafeAction: "VERIFY_FULFILLMENT_EVIDENCE",
    approvalClass: "PREPARE_FOR_APPROVAL",
    learningMetric: "FULFILLMENT_DELAY_DAYS",
    ...overrides
  };
}

test("surfaces delayed fulfillment with transparent age and expectation-gap factors", () => {
  const result = buildOwnershipExperienceExceptionQueueV1([exception()], { now: NOW });

  assert.equal(result.activeCount, 1);
  assert.equal(result.suppressedResolvedCount, 0);
  assert.equal(result.items[0].issueClass, "DELAYED_FULFILLMENT");
  assert.equal(result.items[0].ageDays, 7);
  assert.equal(result.items[0].expectationGapDays, 3);
  assert.equal(result.items[0].priorityFactors.severity, 300);
  assert.equal(result.items[0].priorityFactors.expectationGap, 6);
  assert.equal(result.items[0].effectiveStatus, "OPEN");
  assert.match(result.items[0].whatChanged, /fulfillment/i);
  assert.match(result.items[0].whyItMatters, /trust|retention/i);
});

test("raises VIP service attention without bypassing the supplied approval class", () => {
  const result = buildOwnershipExperienceExceptionQueueV1([
    exception({
      id: "vip",
      issueClass: "VIP_SERVICE_EXCEPTION",
      valueContext: "VIP",
      severity: "HIGH",
      nextSafeAction: "PREPARE_VIP_SERVICE_REVIEW",
      approvalClass: "KEEGAN_APPROVAL_REQUIRED",
      learningMetric: "SERVICE_RECOVERY_TIME_DAYS"
    }),
    exception({ id: "standard", valueContext: "STANDARD" })
  ], { now: NOW });

  assert.equal(result.items[0].id, "vip");
  assert.equal(result.items[0].priorityFactors.valueContext, 50);
  assert.equal(result.items[0].approvalClass, "KEEGAN_APPROVAL_REQUIRED");
  assert.equal(result.items[0].nextBestAction, "PREPARE_VIP_SERVICE_REVIEW");
});

test("keeps refund or replacement friction visible as a material ownership exception", () => {
  const result = buildOwnershipExperienceExceptionQueueV1([
    exception({
      id: "refund",
      issueClass: "REFUND_REPLACEMENT_FRICTION",
      severity: "CRITICAL",
      nextSafeAction: "PREPARE_REFUND_REPLACEMENT_REVIEW",
      learningMetric: "REFUND_REPLACEMENT_FRICTION_DAYS"
    })
  ], { now: NOW });

  assert.equal(result.items[0].id, "refund");
  assert.equal(result.items[0].priorityFactors.severity, 400);
  assert.match(result.items[0].whyItMatters, /churn|reputation/i);
});

test("suppresses only a resolved exception backed by current KNOWN resolution evidence", () => {
  const result = buildOwnershipExperienceExceptionQueueV1([
    exception({
      id: "resolved",
      resolutionState: "RESOLVED",
      resolutionTruthState: "KNOWN",
      resolutionEvidenceRefs: ["resolution-proof-1"]
    })
  ], { now: NOW });

  assert.equal(result.activeCount, 0);
  assert.equal(result.suppressedResolvedCount, 1);
  assert.deepEqual(result.items, []);
});

test("UNKNOWN STALE and CONFLICTED resolution evidence cannot become false resolution", () => {
  for (const truthState of ["UNKNOWN", "STALE", "CONFLICTED"] as const) {
    const result = buildOwnershipExperienceExceptionQueueV1([
      exception({
        id: `resolution-${truthState.toLowerCase()}`,
        resolutionState: "RESOLVED",
        resolutionTruthState: truthState,
        resolutionEvidenceRefs: ["resolution-proof-1"]
      })
    ], { now: NOW });

    assert.equal(result.activeCount, 1);
    assert.equal(result.suppressedResolvedCount, 0);
    assert.equal(result.items[0].effectiveStatus, "NEEDS_VERIFICATION");
    assert.equal(result.items[0].truthState, truthState);
    assert.equal(result.items[0].nextBestAction, "VERIFY_RESOLUTION_EVIDENCE");
  }
});

test("material severity outranks routine noise and ties break deterministically", () => {
  const input = [
    exception({
      id: "routine",
      issueClass: "ROUTINE_SERVICE",
      severity: "LOW",
      expectedBy: null,
      nextSafeAction: "REVIEW_ROUTINE_SERVICE",
      learningMetric: "OWNERSHIP_EXCEPTION_AGE_DAYS"
    }),
    exception({ id: "material-b", severity: "CRITICAL" }),
    exception({ id: "material-a", severity: "CRITICAL" })
  ];

  const first = buildOwnershipExperienceExceptionQueueV1(input, { now: NOW });
  const second = buildOwnershipExperienceExceptionQueueV1([...input].reverse(), { now: NOW });

  assert.deepEqual(first.items.map((item) => item.id), ["material-a", "material-b", "routine"]);
  assert.deepEqual(second.items.map((item) => item.id), first.items.map((item) => item.id));
});

test("delivery uncertainty preserves UNKNOWN evidence instead of declaring success", () => {
  const result = buildOwnershipExperienceExceptionQueueV1([
    exception({
      id: "delivery-unknown",
      issueClass: "DELIVERY_UNCERTAINTY",
      evidenceTruthState: "UNKNOWN",
      expectedBy: null,
      nextSafeAction: "VERIFY_DELIVERY_STATE",
      learningMetric: "DELIVERY_VERIFICATION_LAG_DAYS"
    })
  ], { now: NOW });

  assert.equal(result.items[0].truthState, "UNKNOWN");
  assert.equal(result.items[0].priorityFactors.evidenceRisk, 45);
  assert.equal(result.items[0].effectiveStatus, "OPEN");
});

test("rejects malformed timestamps future evidence duplicate ids unsupported enums and unknown keys", () => {
  assert.throws(
    () => buildOwnershipExperienceExceptionQueueV1([exception({ openedAt: "not-a-date" })], { now: NOW }),
    /timestamp/i
  );
  assert.throws(
    () => buildOwnershipExperienceExceptionQueueV1([
      exception({ openedAt: "2026-09-09T18:00:00.000Z" })
    ], { now: NOW }),
    /future/i
  );
  assert.throws(
    () => buildOwnershipExperienceExceptionQueueV1([exception(), exception()], { now: NOW }),
    /duplicate exception id/i
  );
  assert.throws(
    () => buildOwnershipExperienceExceptionQueueV1([
      { ...exception(), severity: "URGENT" } as unknown as OwnershipExperienceExceptionV1
    ], { now: NOW }),
    /unsupported/i
  );
  assert.throws(
    () => buildOwnershipExperienceExceptionQueueV1([
      { ...exception(), secretExtraField: "must fail" } as unknown as OwnershipExperienceExceptionV1
    ], { now: NOW }),
    /unsupported keys/i
  );
});

test("rejects empty evidence contradictory resolved-without-proof and malformed option input", () => {
  assert.throws(
    () => buildOwnershipExperienceExceptionQueueV1([exception({ evidenceRefs: [] })], { now: NOW }),
    /must not be empty/i
  );
  assert.throws(
    () => buildOwnershipExperienceExceptionQueueV1([
      exception({
        resolutionState: "RESOLVED",
        resolutionTruthState: "KNOWN",
        resolutionEvidenceRefs: []
      })
    ], { now: NOW }),
    /resolution evidence/i
  );
  assert.throws(
    () => buildOwnershipExperienceExceptionQueueV1(
      [exception()],
      { now: new Date("invalid") }
    ),
    /valid Date/i
  );
});

test("produces a stable compact dashboard projection for identical evidence", () => {
  const input = [
    exception({ id: "b", customerRef: "collector-b" }),
    exception({ id: "a", customerRef: "collector-a", evidenceTruthState: "STALE" })
  ];

  const first = buildOwnershipExperienceExceptionQueueV1(input, { now: NOW });
  const second = buildOwnershipExperienceExceptionQueueV1(input, { now: NOW });

  assert.deepEqual(second, first);
  assert.equal(first.generatedAt, NOW.toISOString());
  for (const item of first.items) {
    assert.ok(item.whatChanged.length > 0);
    assert.ok(item.whyItMatters.length > 0);
    assert.ok(item.nextBestAction.length > 0);
    assert.ok(item.priorityScore > 0);
    assert.ok(item.evidenceRefs.length > 0);
  }
});
