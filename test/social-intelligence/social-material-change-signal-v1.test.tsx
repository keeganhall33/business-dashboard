import assert from "node:assert/strict";
import test from "node:test";

import { compileCanonicalSocialAccountSnapshotV1 } from "../../src/lib/social-intelligence/social-canonical-v1";
import {
  compileSocialMaterialChangeSignalV1,
  type SocialMaterialChangeRuleV1
} from "../../src/lib/social-intelligence/social-material-change-signal-v1";

const now = "2026-09-18T08:30:00Z";

function snapshot(options?: {
  requestedState?: "CONNECTED_AND_INGESTING" | "CONNECTED_PARTIAL";
  lastSuccessfulSyncAt?: string | null;
  currentReach?: number | null;
  priorReach?: number | null;
  currentReachEvidence?: readonly string[];
  priorReachEvidence?: readonly string[];
  metricCoverage?: readonly ("AUDIENCE_TOTAL" | "REACH" | "LINK_CLICKS")[];
}) {
  const currentReach = options?.currentReach === undefined ? 40_000 : options.currentReach;
  const priorReach = options?.priorReach === undefined ? 32_000 : options.priorReach;
  return compileCanonicalSocialAccountSnapshotV1(
    {
      platform: "INSTAGRAM",
      accountId: "keegan-hall",
      handle: "@keeganhall",
      retrievedAt: "2026-09-18T08:00:00Z",
      sourceCoverage: {
        requestedState: options?.requestedState ?? "CONNECTED_AND_INGESTING",
        lastSuccessfulSyncAt: options?.lastSuccessfulSyncAt === undefined
          ? "2026-09-18T08:00:00Z"
          : options.lastSuccessfulSyncAt,
        metricCoverage: options?.metricCoverage ?? ["AUDIENCE_TOTAL", "REACH", "LINK_CLICKS"]
      },
      periods: [
        {
          periodId: "ig-7d-current",
          window: "7D",
          startAt: "2026-09-11T00:00:00Z",
          endAt: "2026-09-18T00:00:00Z",
          metrics: {
            AUDIENCE_TOTAL: { value: 12_500, evidenceRefs: ["provider:ig:audience:current"] },
            REACH: { value: currentReach, evidenceRefs: options?.currentReachEvidence ?? ["provider:ig:reach:current"] },
            LINK_CLICKS: { value: 310, evidenceRefs: ["provider:ig:clicks:current"] }
          }
        },
        {
          periodId: "ig-7d-prior",
          window: "7D",
          startAt: "2026-09-04T00:00:00Z",
          endAt: "2026-09-11T00:00:00Z",
          metrics: {
            AUDIENCE_TOTAL: { value: 12_375, evidenceRefs: ["provider:ig:audience:prior"] },
            REACH: { value: priorReach, evidenceRefs: options?.priorReachEvidence ?? ["provider:ig:reach:prior"] },
            LINK_CLICKS: { value: 0, evidenceRefs: ["provider:ig:clicks:prior"] }
          }
        }
      ]
    },
    now,
    48
  );
}

function evaluate(
  rule: SocialMaterialChangeRuleV1,
  inputSnapshot = snapshot(),
  evaluatedAt = now,
  maxSnapshotAgeHours = 4
) {
  return compileSocialMaterialChangeSignalV1({
    snapshot: inputSnapshot,
    rules: [rule],
    evaluatedAt,
    maxSnapshotAgeHours
  });
}

test("projects an evidence-backed metric movement only as a corroboration-required candidate", () => {
  const result = evaluate({
    ruleId: "ig-reach-up-20pct",
    window: "7D",
    metric: "REACH",
    direction: "UP",
    threshold: { kind: "PERCENTAGE", atLeast: 20 }
  });

  assert.equal(result.status, "READY");
  assert.equal(result.candidates.length, 1);
  const candidate = result.candidates[0];
  assert.equal(candidate.metric, "REACH");
  assert.equal(candidate.currentValue, 40_000);
  assert.equal(candidate.priorValue, 32_000);
  assert.equal(candidate.absoluteDelta, 8_000);
  assert.equal(candidate.percentageDelta, 25);
  assert.equal(candidate.direction, "UP");
  assert.equal(candidate.materialityPolicySource, "CALLER_SUPPLIED_RULE");
  assert.equal(candidate.requiresCorroboration, true);
  assert.equal(candidate.eligibleForNotification, false);
  assert.equal(candidate.causalClaim, false);
  assert.equal(candidate.attributionClaim, false);
  assert.deepEqual(candidate.evidenceRefs, ["provider:ig:reach:current", "provider:ig:reach:prior"]);
  assert.equal(result.notificationAuthority, "NONE");
  assert.equal(result.externalAccessPerformed, false);
  assert.equal(result.writesPerformed, false);
});

test("does not manufacture a material event when the caller-defined threshold is not met", () => {
  const result = evaluate({
    ruleId: "ig-reach-up-30pct",
    window: "7D",
    metric: "REACH",
    direction: "UP",
    threshold: { kind: "PERCENTAGE", atLeast: 30 }
  });

  assert.equal(result.status, "NO_MATERIAL_CHANGE");
  assert.deepEqual(result.candidates, []);
  assert.equal(result.evaluations[0].state, "NOT_MATERIAL");
});

test("fails closed for partial or stale source truth instead of promoting a raw metric movement", () => {
  const partial = snapshot({ requestedState: "CONNECTED_PARTIAL" });
  const result = evaluate({
    ruleId: "reach-absolute",
    window: "7D",
    metric: "REACH",
    direction: "EITHER",
    threshold: { kind: "ABSOLUTE", atLeast: 1_000 }
  }, partial);

  assert.equal(result.status, "VERIFY_REQUIRED");
  assert.deepEqual(result.candidates, []);
  assert.equal(result.verificationReasons.includes("SOURCE_NOT_FULLY_CONNECTED"), true);

  const stale = snapshot({ lastSuccessfulSyncAt: "2026-09-10T00:00:00Z" });
  const staleResult = evaluate({
    ruleId: "reach-stale",
    window: "7D",
    metric: "REACH",
    direction: "UP",
    threshold: { kind: "ABSOLUTE", atLeast: 1_000 }
  }, stale);
  assert.equal(staleResult.status, "VERIFY_REQUIRED");
  assert.equal(staleResult.verificationReasons.includes("SOURCE_NOT_FRESH"), true);
  assert.deepEqual(staleResult.candidates, []);
});

test("requires evidence for both compared periods even when numeric values are known", () => {
  const unevidenced = snapshot({ priorReachEvidence: [] });
  const result = evaluate({
    ruleId: "reach-needs-evidence",
    window: "7D",
    metric: "REACH",
    direction: "UP",
    threshold: { kind: "ABSOLUTE", atLeast: 1_000 }
  }, unevidenced);

  assert.equal(result.status, "VERIFY_REQUIRED");
  assert.equal(result.verificationReasons.includes("PERIOD_EVIDENCE_MISSING"), true);
  assert.deepEqual(result.candidates, []);
});

test("keeps percentage materiality unknown when the prior denominator is zero", () => {
  const result = evaluate({
    ruleId: "clicks-percentage",
    window: "7D",
    metric: "LINK_CLICKS",
    direction: "UP",
    threshold: { kind: "PERCENTAGE", atLeast: 20 }
  });

  assert.equal(result.status, "VERIFY_REQUIRED");
  assert.equal(result.verificationReasons.includes("PERCENTAGE_CHANGE_UNAVAILABLE"), true);
  assert.deepEqual(result.candidates, []);
});

test("does not treat known provider values as alert-grade when the metric is outside declared source coverage", () => {
  const coverageGap = snapshot({ metricCoverage: ["AUDIENCE_TOTAL", "LINK_CLICKS"] });
  const result = evaluate({
    ruleId: "reach-uncovered",
    window: "7D",
    metric: "REACH",
    direction: "UP",
    threshold: { kind: "ABSOLUTE", atLeast: 1_000 }
  }, coverageGap);

  assert.equal(result.status, "VERIFY_REQUIRED");
  assert.equal(result.verificationReasons.includes("METRIC_NOT_IN_SOURCE_COVERAGE"), true);
  assert.deepEqual(result.candidates, []);
});

test("re-evaluates freshness at decision time rather than trusting an old snapshot's frozen FRESH label", () => {
  const result = evaluate({
    ruleId: "reach-aged-out",
    window: "7D",
    metric: "REACH",
    direction: "UP",
    threshold: { kind: "ABSOLUTE", atLeast: 1_000 }
  }, snapshot(), "2026-09-18T20:00:00Z", 4);

  assert.equal(result.status, "VERIFY_REQUIRED");
  assert.equal(result.verificationReasons.includes("SNAPSHOT_TOO_OLD"), true);
  assert.deepEqual(result.candidates, []);
});

test("suppresses unknown metrics and missing prior windows rather than coercing unknown to zero", () => {
  const unknown = snapshot({ currentReach: null });
  const unknownResult = evaluate({
    ruleId: "reach-unknown",
    window: "7D",
    metric: "REACH",
    direction: "DOWN",
    threshold: { kind: "ABSOLUTE", atLeast: 1_000 }
  }, unknown);
  assert.equal(unknownResult.status, "VERIFY_REQUIRED");
  assert.equal(unknownResult.verificationReasons.includes("METRIC_VALUE_UNKNOWN"), true);
  assert.deepEqual(unknownResult.candidates, []);

  const noPrior = compileCanonicalSocialAccountSnapshotV1(
    {
      platform: "YOUTUBE",
      accountId: "keegan-youtube",
      retrievedAt: "2026-09-18T08:00:00Z",
      sourceCoverage: {
        requestedState: "CONNECTED_AND_INGESTING",
        lastSuccessfulSyncAt: "2026-09-18T08:00:00Z",
        metricCoverage: ["VIEWS"]
      },
      periods: [{
        periodId: "youtube-7d-current",
        window: "7D",
        startAt: "2026-09-11T00:00:00Z",
        endAt: "2026-09-18T00:00:00Z",
        metrics: { VIEWS: { value: 10_000, evidenceRefs: ["provider:youtube:views:current"] } }
      }]
    },
    now
  );
  const noPriorResult = evaluate({
    ruleId: "youtube-views",
    window: "7D",
    metric: "VIEWS",
    direction: "EITHER",
    threshold: { kind: "ABSOLUTE", atLeast: 1_000 }
  }, noPrior);
  assert.equal(noPriorResult.status, "VERIFY_REQUIRED");
  assert.equal(noPriorResult.verificationReasons.includes("PRIOR_PERIOD_MISSING"), true);
  assert.deepEqual(noPriorResult.candidates, []);
});

test("rejects ambiguous or trivial materiality policy instead of inventing thresholds", () => {
  const base = snapshot();
  assert.throws(
    () => compileSocialMaterialChangeSignalV1({
      snapshot: base,
      rules: [
        { ruleId: "duplicate", window: "7D", metric: "REACH", direction: "UP", threshold: { kind: "ABSOLUTE", atLeast: 1 } },
        { ruleId: "duplicate", window: "7D", metric: "AUDIENCE_TOTAL", direction: "UP", threshold: { kind: "ABSOLUTE", atLeast: 1 } }
      ],
      evaluatedAt: now,
      maxSnapshotAgeHours: 4
    }),
    /duplicate material-change ruleId/
  );

  assert.throws(
    () => evaluate({
      ruleId: "zero-threshold",
      window: "7D",
      metric: "REACH",
      direction: "EITHER",
      threshold: { kind: "ABSOLUTE", atLeast: 0 }
    }),
    /finite positive number/
  );
});

test("produces deterministic immutable signal identities for dedup consumers without becoming a parallel alert system", () => {
  const rule: SocialMaterialChangeRuleV1 = {
    ruleId: "ig-reach-up-20pct",
    window: "7D",
    metric: "REACH",
    direction: "UP",
    threshold: { kind: "PERCENTAGE", atLeast: 20 }
  };
  const first = evaluate(rule);
  const second = evaluate(rule);

  assert.equal(first.candidates[0].signalId, second.candidates[0].signalId);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.candidates[0]), true);
  assert.match(first.guardrails.join(" "), /never sends or authorizes an alert/i);
  assert.match(first.guardrails.join(" "), /do not establish causality/i);
});
