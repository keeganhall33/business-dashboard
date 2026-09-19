import assert from "node:assert/strict";
import test from "node:test";

import type { ClaritySegmentFrictionInputV1 } from "../../../src/lib/clarity-behavior/segment-friction-v1";
import {
  buildClaritySegmentConversionTargetV1,
  type ClaritySegmentConversionTargetInputV1,
} from "../../../src/lib/intelligence/production-revenue-loop/clarity-segment-conversion-target-v1";
import type { BehavioralFreshnessCorroborationV1 } from "../../../src/lib/intelligence/production-revenue-loop/behavioral-freshness-corroboration-v1";
import type { ConversionFrictionReadinessV1 } from "../../../src/lib/intelligence/production-revenue-loop/conversion-friction-readiness-v1";

const priorRange = { startDate: "2026-09-01", endDate: "2026-09-07" } as const;
const currentRange = { startDate: "2026-09-08", endDate: "2026-09-14" } as const;
const evaluatedAt = "2026-09-15T08:00:00.000Z";
const extractedAt = "2026-09-15T07:30:00.000Z";

function freshBehavioral(): BehavioralFreshnessCorroborationV1 {
  return {
    version: "BEHAVIORAL_FRESHNESS_CORROBORATION_V1",
    status: "READY",
    reasonCode: "FRESH_BEHAVIORAL_EVIDENCE_EVALUATED",
    evaluatedAt,
    clarityFreshness: {
      status: "READY",
      acceptedClarity: {
        extractedAt,
        completeThrough: currentRange.endDate,
        currentRange: { ...currentRange },
        priorRange: { ...priorRange },
      },
    },
    checkoutFreshness: {
      status: "READY",
      acceptedCheckout: {},
    },
    corroborationState: "SUPPORTED_FOR_INVESTIGATION",
    corroborationReasonCode: "CONVERSION_SIGNAL_HAS_BEHAVIORAL_SUPPORT",
    acceptedCorroboration: {
      state: "SUPPORTED_FOR_INVESTIGATION",
      decision: {
        recommendationId: "revenue-action:segment-target",
        revenueStatus: "READY_FOR_DECISION",
        revenueDriver: "CONVERSION",
        currentRange: { ...currentRange },
        comparisonRange: { ...priorRange },
      },
    },
    limitations: [],
    causalClaim: false,
    revenueAttributionClaim: false,
    expectedLift: null,
    confidence: null,
    monetaryValue: null,
    externalMutationAllowed: false,
    metaWriteAllowed: false,
    approvalBypassAllowed: false,
  } as unknown as BehavioralFreshnessCorroborationV1;
}

function readiness(): ConversionFrictionReadinessV1 {
  return {
    version: "CONVERSION_FRICTION_READINESS_V1",
    status: "READY_TO_PREPARE_TEST",
    reasonCode: "BEHAVIORAL_SUPPORT_AND_MEASUREMENT_AGREE",
    recommendationId: "revenue-action:segment-target",
    revenueDriver: "CONVERSION",
    evidenceBasis: {
      clarityUsed: true,
      checkoutUsed: true,
      supportingFacts: [
        "Clarity: dead-click friction is materially elevated.",
        "Checkout: reconciled completion evidence supports investigation.",
      ],
    },
    checkoutMeasurement: {
      required: true,
      status: "READY",
      reasonCode: "CROSS_SOURCE_COUNTS_ALIGNED",
      evidenceRefs: ["checkout:reconciled"],
      comparisonCount: 3,
    },
    limitations: [],
    nextStep: {
      kind: "PREPARE_BOUNDED_CONVERSION_TEST",
      approvalClass: "KEEGAN_APPROVAL_REQUIRED",
      description: "Prepare a bounded conversion test proposal.",
      externalMutationAllowed: false,
      metaWriteAllowed: false,
    },
    causalClaim: false,
    revenueAttributionClaim: false,
    expectedLift: null,
    monetaryValue: null,
  };
}

function segmentInput(
  overrides: Partial<ClaritySegmentFrictionInputV1> = {},
): ClaritySegmentFrictionInputV1 {
  return {
    source: "MICROSOFT_CLARITY_DATA_EXPORT_API",
    sourceTruth: "COMPLETE",
    currentRange: { ...currentRange },
    priorRange: { ...priorRange },
    observedCurrentRange: { ...currentRange },
    observedPriorRange: { ...priorRange },
    extractedAt,
    completeThrough: currentRange.endDate,
    evaluatedAt,
    maxAgeHours: 24,
    coverageComplete: true,
    rows: [
      {
        dimension: "PAGE",
        segmentRef: "page:shop",
        label: "/shop",
        current: { sessions: 100, deadClickSessions: 20, quickBackSessions: 15 },
        prior: { sessions: 100, deadClickSessions: 5, quickBackSessions: 5 },
        evidenceRefs: ["clarity:segment:shop"],
      },
      {
        dimension: "DEVICE",
        segmentRef: "device:mobile",
        label: "Mobile",
        current: { sessions: 80, deadClickSessions: 8, quickBackSessions: 13 },
        prior: { sessions: 80, deadClickSessions: 6, quickBackSessions: 5 },
        evidenceRefs: ["clarity:segment:mobile"],
      },
      {
        dimension: "BROWSER",
        segmentRef: "browser:safari",
        label: "Safari",
        current: { sessions: 10, deadClickSessions: 4, quickBackSessions: 3 },
        prior: { sessions: 10, deadClickSessions: 1, quickBackSessions: 1 },
        evidenceRefs: ["clarity:segment:safari"],
      },
    ],
    ...overrides,
  };
}

function input(
  overrides: Partial<ClaritySegmentConversionTargetInputV1> = {},
): ClaritySegmentConversionTargetInputV1 {
  return {
    freshBehavioral: freshBehavioral(),
    readiness: readiness(),
    segmentInput: segmentInput(),
    ...overrides,
  };
}

test("selects only sufficiently sampled material Clarity segments from the exact accepted snapshot", () => {
  const result = buildClaritySegmentConversionTargetV1(input());

  assert.equal(result.status, "READY_FOR_TARGET_REVIEW");
  assert.equal(result.reasonCode, "FRESH_SEGMENT_TARGETS_READY");
  assert.equal(result.segmentEvidenceState, "READY");
  assert.equal(result.recommendationId, "revenue-action:segment-target");
  assert.deepEqual(result.currentRange, currentRange);
  assert.deepEqual(result.comparisonRange, priorRange);

  assert.equal(result.primaryTarget?.dimension, "PAGE");
  assert.equal(result.primaryTarget?.segmentRef, "page:shop");
  assert.equal(result.primaryTarget?.severity, "CRITICAL");
  assert.equal(result.primaryTarget?.interpretation, "OBSERVED_FRICTION_ONLY");
  assert.equal(result.primaryTarget?.observedDeadClickRate, 0.2);
  assert.equal(result.alternateTargets.length, 1);
  assert.equal(result.alternateTargets[0]?.segmentRef, "device:mobile");
  assert.equal(result.alternateTargets[0]?.severity, "HIGH");
  assert.ok(!result.alternateTargets.some((candidate) => candidate.segmentRef === "browser:safari"));

  assert.deepEqual(result.measurementRequirements, {
    sameSegmentIdentityRequiredPostPeriod: true,
    freshClarityPostPeriodRequired: true,
    exactWindowBindingRequired: true,
    wooCommercialOutcomeStillRequired: true,
  });
  assert.deepEqual(result.authority, {
    siteMutationAllowed: false,
    checkoutMutationAllowed: false,
    pricingMutationAllowed: false,
    paidMediaMutationAllowed: false,
    metaWriteAllowed: false,
    actionExecutionAllowed: false,
    approvalBypassAllowed: false,
    causalClaimAllowed: false,
    revenueAttributionAllowed: false,
  });
});

test("does not invent a segment target when no sufficiently sampled segment crosses material thresholds", () => {
  const segments = segmentInput({
    rows: [
      {
        dimension: "PAGE",
        segmentRef: "page:shop",
        label: "/shop",
        current: { sessions: 100, deadClickSessions: 5, quickBackSessions: 6 },
        prior: { sessions: 100, deadClickSessions: 5, quickBackSessions: 6 },
        evidenceRefs: ["clarity:segment:shop"],
      },
    ],
  });

  const result = buildClaritySegmentConversionTargetV1(input({ segmentInput: segments }));
  assert.equal(result.status, "NO_MATERIAL_SEGMENT");
  assert.equal(result.reasonCode, "NO_MATERIAL_SEGMENT_FRICTION");
  assert.equal(result.primaryTarget, null);
  assert.deepEqual(result.alternateTargets, []);
});

test("fails closed when the segment evidence is not evaluated at the exact revenue decision instant", () => {
  const result = buildClaritySegmentConversionTargetV1(input({
    segmentInput: segmentInput({ evaluatedAt: "2026-09-15T09:00:00.000Z" }),
  }));
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reasonCode, "SEGMENT_DECISION_TIME_MISMATCH");
  assert.equal(result.segmentEvidenceState, "NOT_EVALUATED");
  assert.equal(result.primaryTarget, null);
});

test("fails closed when segment evidence comes from a different Clarity extraction snapshot", () => {
  const result = buildClaritySegmentConversionTargetV1(input({
    segmentInput: segmentInput({ extractedAt: "2026-09-15T07:45:00.000Z" }),
  }));
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reasonCode, "SEGMENT_SOURCE_SNAPSHOT_MISMATCH");
});

test("fails closed when segment windows drift from the accepted revenue and Clarity windows", () => {
  const shiftedCurrent = { startDate: "2026-09-09", endDate: "2026-09-15" };
  const result = buildClaritySegmentConversionTargetV1(input({
    segmentInput: segmentInput({
      currentRange: shiftedCurrent,
      observedCurrentRange: shiftedCurrent,
      completeThrough: shiftedCurrent.endDate,
    }),
  }));
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reasonCode, "SEGMENT_SOURCE_SNAPSHOT_MISMATCH");
});

test("requires fresh supported conversion corroboration and canonical test readiness", () => {
  const staleFresh = freshBehavioral();
  (staleFresh as unknown as { status: string }).status = "NOT_READY";
  const blockedFresh = buildClaritySegmentConversionTargetV1(input({ freshBehavioral: staleFresh }));
  assert.equal(blockedFresh.reasonCode, "FRESH_BEHAVIORAL_CORROBORATION_REQUIRED");

  const notReady = readiness();
  (notReady as unknown as { status: string }).status = "CONTINUE_DIAGNOSIS";
  const blockedReadiness = buildClaritySegmentConversionTargetV1(input({ readiness: notReady }));
  assert.equal(blockedReadiness.reasonCode, "CONVERSION_TEST_READINESS_REQUIRED");
});

test("refuses Clarity segment targeting when Clarity was not part of the governed hypothesis", () => {
  const noClarity = readiness();
  (noClarity.evidenceBasis as { clarityUsed: boolean }).clarityUsed = false;
  const result = buildClaritySegmentConversionTargetV1(input({ readiness: noClarity }));
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reasonCode, "CLARITY_NOT_USED_BY_HYPOTHESIS");
});

test("fails closed on widened upstream authority", () => {
  const fresh = freshBehavioral();
  (fresh as unknown as { externalMutationAllowed: boolean }).externalMutationAllowed = true;
  const result = buildClaritySegmentConversionTargetV1(input({ freshBehavioral: fresh }));
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reasonCode, "AUTHORITY_INTEGRITY_FAILURE");
  assert.equal(result.authority.siteMutationAllowed, false);
  assert.equal(result.authority.metaWriteAllowed, false);
});

test("passes withheld segment evidence through as blocked rather than targeting around it", () => {
  const result = buildClaritySegmentConversionTargetV1(input({
    segmentInput: segmentInput({ sourceTruth: "PARTIAL" }),
  }));
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reasonCode, "SEGMENT_EVIDENCE_NOT_READY");
  assert.equal(result.segmentEvidenceState, "WITHHELD");
  assert.equal(result.primaryTarget, null);
});

test("is deterministic, deeply immutable, and does not mutate caller input", () => {
  const value = input();
  const before = JSON.stringify(value);
  const first = buildClaritySegmentConversionTargetV1(value);
  const second = buildClaritySegmentConversionTargetV1(value);

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(value), before);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.authority));
  assert.ok(Object.isFrozen(first.measurementRequirements));
  assert.ok(Object.isFrozen(first.primaryTarget));
  assert.ok(Object.isFrozen(first.primaryTarget?.facts));
  assert.ok(Object.isFrozen(first.alternateTargets));
});
