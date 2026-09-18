import assert from "node:assert/strict";
import test from "node:test";

import {
  compileSocialMaterialAlertReadinessV1,
  type SocialMaterialAlertCorroborationV1,
  type SocialMaterialAlertPriorEmissionV1
} from "../../src/lib/social-intelligence/social-material-alert-readiness-v1";
import type { SocialMaterialChangeSignalV1 } from "../../src/lib/social-intelligence/social-material-change-signal-v1";

const now = "2026-09-18T17:30:00Z";
const signalId = "social-material-change:INSTAGRAM:keegan-hall:ig-reach-down:ig-current:ig-prior";
const stateKey = "social-material-alert:INSTAGRAM:keegan-hall:REACH:7D:DOWN";

function signal(status: SocialMaterialChangeSignalV1["status"] = "READY"): SocialMaterialChangeSignalV1 {
  return {
    contractVersion: "SocialMaterialChangeSignalV1",
    platform: "INSTAGRAM",
    accountId: "keegan-hall",
    snapshotId: "ig-snapshot-1",
    evaluatedAt: "2026-09-18T17:00:00.000Z",
    status,
    evaluations: [{
      ruleId: "ig-reach-down",
      metric: "REACH",
      window: "7D",
      state: "MATERIAL_CANDIDATE",
      reasons: [],
      currentPeriodId: "ig-current",
      priorPeriodId: "ig-prior"
    }],
    candidates: [{
      signalId,
      ruleId: "ig-reach-down",
      platform: "INSTAGRAM",
      accountId: "keegan-hall",
      metric: "REACH",
      window: "7D",
      currentPeriodId: "ig-current",
      priorPeriodId: "ig-prior",
      currentValue: 24_000,
      priorValue: 32_000,
      absoluteDelta: -8_000,
      percentageDelta: -25,
      direction: "DOWN",
      threshold: { kind: "PERCENTAGE", atLeast: 20 },
      evidenceRefs: ["provider:ig:reach:current", "provider:ig:reach:prior"],
      materialityPolicySource: "CALLER_SUPPLIED_RULE",
      requiresCorroboration: true,
      eligibleForNotification: false,
      causalClaim: false,
      attributionClaim: false
    }],
    verificationReasons: [],
    guardrails: [],
    notificationAuthority: "NONE",
    externalAccessPerformed: false,
    writesPerformed: false
  };
}

function corroboration(
  id: string,
  sourceRef: string,
  relation: SocialMaterialAlertCorroborationV1["relation"] = "SUPPORTS_MATERIALITY",
  overrides: Partial<SocialMaterialAlertCorroborationV1> = {}
): SocialMaterialAlertCorroborationV1 {
  return {
    corroborationId: id,
    signalId,
    sourceRef,
    kind: "BUSINESS_OUTCOME",
    relation,
    truthState: "KNOWN",
    observedAt: "2026-09-18T17:15:00Z",
    evidenceRefs: [`evidence:${id}`],
    ...overrides
  };
}

function compile(options?: {
  inputSignal?: SocialMaterialChangeSignalV1;
  corroborations?: readonly SocialMaterialAlertCorroborationV1[];
  priorEmissions?: readonly SocialMaterialAlertPriorEmissionV1[];
  minSources?: number;
  maxAgeHours?: number;
  cooldownHours?: number;
}) {
  return compileSocialMaterialAlertReadinessV1({
    signal: options?.inputSignal ?? signal(),
    corroborations: options?.corroborations ?? [
      corroboration("ga4-session-drop", "GA4"),
      corroboration("clarity-friction", "CLARITY", "SUPPORTS_MATERIALITY", { kind: "CONTENT_PERFORMANCE" })
    ],
    priorEmissions: options?.priorEmissions ?? [],
    policy: {
      minIndependentSupportingSources: options?.minSources ?? 2,
      maxCorroborationAgeHours: options?.maxAgeHours ?? 6,
      cooldownHours: options?.cooldownHours ?? 24
    },
    evaluatedAt: now
  });
}

test("requires independent fresh corroboration before a social metric movement can reach alert review", () => {
  const result = compile();

  assert.equal(result.status, "READY_FOR_REVIEW");
  assert.equal(result.items.length, 1);
  const item = result.items[0];
  assert.equal(item.state, "READY_FOR_ALERT_REVIEW");
  assert.equal(item.independentSupportingSourceCount, 2);
  assert.deepEqual(item.supportingCorroborationIds, ["clarity-friction", "ga4-session-drop"]);
  assert.deepEqual(item.contradictingCorroborationIds, []);
  assert.equal(item.eligibleForNotification, false);
  assert.equal(item.causalClaim, false);
  assert.equal(item.attributionClaim, false);
  assert.equal(item.competitorPerformanceClaim, false);
  assert.equal(item.relationshipClaim, false);
  assert.equal(item.endorsementClaim, false);
  assert.equal(result.notificationAuthority, "NONE");
  assert.equal(result.externalAccessPerformed, false);
  assert.equal(result.writesPerformed, false);
});

test("does not count two corroborations from the same source as independent support", () => {
  const result = compile({
    corroborations: [
      corroboration("ga4-one", "GA4"),
      corroboration("ga4-two", "GA4", "SUPPORTS_MATERIALITY", { kind: "SECONDARY_SOCIAL_METRIC" })
    ]
  });

  assert.equal(result.status, "INVESTIGATE");
  assert.equal(result.items[0].state, "INVESTIGATE");
  assert.equal(result.items[0].independentSupportingSourceCount, 1);
  assert.equal(result.items[0].reasons.includes("INSUFFICIENT_INDEPENDENT_SUPPORT"), true);
});

test("preserves explicit contradiction instead of averaging it into confidence", () => {
  const result = compile({
    minSources: 1,
    corroborations: [
      corroboration("ga4-support", "GA4"),
      corroboration("woo-contradiction", "WOOCOMMERCE", "CONTRADICTS_MATERIALITY")
    ]
  });

  assert.equal(result.status, "INVESTIGATE");
  assert.equal(result.items[0].state, "INVESTIGATE");
  assert.deepEqual(result.items[0].contradictingCorroborationIds, ["woo-contradiction"]);
  assert.equal(result.items[0].reasons.includes("CONTRADICTING_EVIDENCE_PRESENT"), true);
});

test("fails closed when corroboration is stale, inferred, future-dated, or lacks evidence", () => {
  const stale = compile({
    minSources: 1,
    maxAgeHours: 1,
    corroborations: [corroboration("stale", "GA4", "SUPPORTS_MATERIALITY", { observedAt: "2026-09-18T12:00:00Z" })]
  });
  assert.equal(stale.status, "VERIFY_REQUIRED");
  assert.equal(stale.items[0].reasons.includes("CORROBORATION_TOO_OLD"), true);

  const inferred = compile({
    minSources: 1,
    corroborations: [corroboration("inferred", "GA4", "SUPPORTS_MATERIALITY", { truthState: "INFERRED" })]
  });
  assert.equal(inferred.status, "VERIFY_REQUIRED");
  assert.equal(inferred.items[0].reasons.includes("CORROBORATION_NOT_KNOWN"), true);

  const future = compile({
    minSources: 1,
    corroborations: [corroboration("future", "GA4", "SUPPORTS_MATERIALITY", { observedAt: "2026-09-18T18:00:00Z" })]
  });
  assert.equal(future.status, "VERIFY_REQUIRED");
  assert.equal(future.items[0].reasons.includes("CORROBORATION_FROM_FUTURE"), true);

  const noEvidence = compile({
    minSources: 1,
    corroborations: [corroboration("no-evidence", "GA4", "SUPPORTS_MATERIALITY", { evidenceRefs: [] })]
  });
  assert.equal(noEvidence.status, "VERIFY_REQUIRED");
  assert.equal(noEvidence.items[0].reasons.includes("CORROBORATION_EVIDENCE_MISSING"), true);
});

test("context-only evidence remains context and cannot promote alert readiness", () => {
  const result = compile({
    minSources: 1,
    corroborations: [corroboration("public-peer-post", "PUBLIC_PEER_RESEARCH", "CONTEXT_ONLY", { kind: "EXTERNAL_CONTEXT" })]
  });

  assert.equal(result.status, "INVESTIGATE");
  assert.equal(result.items[0].independentSupportingSourceCount, 0);
  assert.deepEqual(result.items[0].contextOnlyCorroborationIds, ["public-peer-post"]);
  assert.equal(result.items[0].reasons.includes("INSUFFICIENT_INDEPENDENT_SUPPORT"), true);
});

test("suppresses an exact previously emitted signal deterministically", () => {
  const result = compile({
    priorEmissions: [{
      emissionId: "alert-1",
      signalId,
      stateKey,
      emittedAt: "2026-09-18T16:00:00Z",
      evidenceRefs: ["alert-ledger:1"]
    }]
  });

  assert.equal(result.status, "NO_ALERT_READY");
  assert.equal(result.items[0].state, "SUPPRESSED_DUPLICATE");
  assert.equal(result.items[0].reasons.includes("DUPLICATE_PRIOR_EMISSION"), true);
  assert.equal(result.items[0].evidenceRefs.includes("alert-ledger:1"), true);
});

test("applies cooldown only to the same metric/window/direction state, without altering canonical truth", () => {
  const differentSignal = signal();
  const nextSignalId = `${signalId}:next`;
  const nextSignal: SocialMaterialChangeSignalV1 = {
    ...differentSignal,
    candidates: [{ ...differentSignal.candidates[0], signalId: nextSignalId }]
  };

  const result = compile({
    inputSignal: nextSignal,
    priorEmissions: [{
      emissionId: "alert-prior",
      signalId: "older-signal",
      stateKey,
      emittedAt: "2026-09-18T12:00:00Z",
      evidenceRefs: ["alert-ledger:prior"]
    }]
  });

  assert.equal(result.status, "NO_ALERT_READY");
  assert.equal(result.items[0].state, "SUPPRESSED_COOLDOWN");
  assert.equal(result.items[0].reasons.includes("COOLDOWN_ACTIVE"), true);
  assert.equal(result.items[0].signalId, nextSignalId);
});

test("does not let corroboration for another signal silently support the candidate", () => {
  const result = compile({
    minSources: 1,
    corroborations: [corroboration("other-signal", "GA4", "SUPPORTS_MATERIALITY", { signalId: "another-signal" })]
  });

  assert.equal(result.status, "INVESTIGATE");
  assert.equal(result.items[0].state, "INVESTIGATE");
  assert.equal(result.items[0].reasons.includes("CORROBORATION_SIGNAL_MISMATCH"), true);
  assert.equal(result.items[0].independentSupportingSourceCount, 0);
});

test("rejects duplicate corroboration identities and impossible prior-emission chronology", () => {
  const duplicate = corroboration("same", "GA4");
  assert.throws(
    () => compile({ corroborations: [duplicate, duplicate] }),
    /duplicate corroborationId/
  );

  assert.throws(
    () => compile({
      priorEmissions: [{
        emissionId: "future-alert",
        signalId,
        stateKey,
        emittedAt: "2026-09-18T18:00:00Z",
        evidenceRefs: ["alert-ledger:future"]
      }]
    }),
    /cannot be in the future/
  );
});

test("keeps upstream non-ready state fail closed and output immutable", () => {
  const input = signal("VERIFY_REQUIRED");
  const result = compile({ inputSignal: input });

  assert.equal(result.status, "VERIFY_REQUIRED");
  assert.equal(result.items[0].state, "VERIFY_REQUIRED");
  assert.equal(result.items[0].reasons.includes("UPSTREAM_SIGNAL_NOT_READY"), true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.items[0]), true);
  assert.match(result.guardrails.join(" "), /never sends, schedules, or authorizes/i);
  assert.match(result.guardrails.join(" "), /does not establish causality/i);
});
