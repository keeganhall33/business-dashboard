import assert from "node:assert/strict";
import test from "node:test";

import {
  compileSocialVideoRetentionDiagnosticsV1,
  type SocialVideoRetentionDiagnosticsInputV1
} from "../../src/lib/social-intelligence/social-video-retention-diagnostics-v1";

function input(overrides: Partial<SocialVideoRetentionDiagnosticsInputV1> = {}): SocialVideoRetentionDiagnosticsInputV1 {
  return {
    platform: "INSTAGRAM",
    contentId: "content:throwback-helmet:wip-2",
    durationSeconds: 30,
    sourceState: "COMPLETE",
    observedAt: "2026-09-18T18:00:00Z",
    capturedAt: "2026-09-18T18:10:00Z",
    evaluatedAt: "2026-09-18T20:00:00Z",
    maxEvidenceAgeHours: 6,
    sourceSnapshotRef: "social-snapshot:instagram:2026-09-18T18:10Z",
    metricDefinitionRef: "provider-metric-definition:instagram:retention:v1",
    evidenceRefs: ["evidence:provider-retention-export:123"],
    checkpoints: [
      { elapsedSeconds: 0, retainedPct: 100, evidenceRefs: ["evidence:checkpoint:0"] },
      { elapsedSeconds: 3, retainedPct: 82, evidenceRefs: ["evidence:checkpoint:3"] },
      { elapsedSeconds: 8, retainedPct: 57, evidenceRefs: ["evidence:checkpoint:8"] },
      { elapsedSeconds: 18, retainedPct: 48, evidenceRefs: ["evidence:checkpoint:18"] },
      { elapsedSeconds: 30, retainedPct: 41, evidenceRefs: ["evidence:checkpoint:30"] }
    ],
    completionRatePct: 39,
    rewatchRatePct: 7,
    openingBoundarySeconds: 3,
    revealAtSeconds: 18,
    ...overrides
  };
}

test("surfaces only directly observed retention diagnostics from fresh complete evidence", () => {
  const result = compileSocialVideoRetentionDiagnosticsV1(input());

  assert.equal(result.status, "READY");
  assert.deepEqual(result.reasons, []);
  assert.equal(result.openingRetentionPct, 82);
  assert.equal(result.revealRetentionPct, 48);
  assert.equal(result.completionRatePct, 39);
  assert.equal(result.rewatchRatePct, 7);
  assert.deepEqual(result.largestObservedDrop, {
    fromElapsedSeconds: 3,
    toElapsedSeconds: 8,
    percentagePointDrop: 25,
    evidenceRefs: ["evidence:checkpoint:3", "evidence:checkpoint:8"]
  });
  assert.equal(result.interpretation, "DIRECT_PROVIDER_RETENTION_OBSERVATION_ONLY");
  assert.equal(result.causalClaim, false);
  assert.equal(result.attributionClaim, false);
  assert.equal(result.competitorPerformanceClaim, false);
  assert.equal(result.crossPlatformComparisonAuthority, "NONE");
  assert.equal(result.recommendationAuthority, "NONE");
  assert.equal(result.providerWriteAuthority, "NONE");
  assert.equal(result.notificationAuthority, "NONE");
  assert.equal(result.externalAccessPerformed, false);
  assert.equal(result.writesPerformed, false);
});

test("does not interpolate opening or reveal retention when the exact checkpoint is absent", () => {
  const result = compileSocialVideoRetentionDiagnosticsV1(
    input({ openingBoundarySeconds: 2, revealAtSeconds: 17 })
  );

  assert.equal(result.status, "READY");
  assert.equal(result.openingRetentionPct, null);
  assert.equal(result.revealRetentionPct, null);
  assert.match(result.guardrails.join(" "), /no interpolation is invented/i);
});

test("fails closed for partial, conflicted, stale, or future evidence", () => {
  for (const sourceState of ["PARTIAL", "CONFLICTED", "MISSING"] as const) {
    const result = compileSocialVideoRetentionDiagnosticsV1(input({ sourceState }));
    assert.equal(result.status, "VERIFY_REQUIRED");
    assert.ok(result.reasons.includes("SOURCE_NOT_COMPLETE"));
    assert.deepEqual(result.checkpoints, []);
    assert.deepEqual(result.evidenceRefs, []);
    assert.equal(result.largestObservedDrop, null);
    assert.equal(result.completionRatePct, null);
  }

  const stale = compileSocialVideoRetentionDiagnosticsV1(
    input({ evaluatedAt: "2026-09-19T04:11:00Z", maxEvidenceAgeHours: 10 })
  );
  assert.equal(stale.status, "VERIFY_REQUIRED");
  assert.ok(stale.reasons.includes("EVIDENCE_TOO_OLD"));

  const future = compileSocialVideoRetentionDiagnosticsV1(
    input({ evaluatedAt: "2026-09-18T17:59:00Z" })
  );
  assert.equal(future.status, "VERIFY_REQUIRED");
  assert.ok(future.reasons.includes("EVIDENCE_FROM_FUTURE"));
});

test("withholds diagnostics when the retention curve is not sufficiently observed", () => {
  const result = compileSocialVideoRetentionDiagnosticsV1(
    input({ checkpoints: [{ elapsedSeconds: 3, retainedPct: 82, evidenceRefs: ["evidence:checkpoint:3"] }] })
  );

  assert.equal(result.status, "VERIFY_REQUIRED");
  assert.ok(result.reasons.includes("INSUFFICIENT_CHECKPOINTS"));
  assert.deepEqual(result.checkpoints, []);
  assert.equal(result.openingRetentionPct, null);
  assert.equal(result.largestObservedDrop, null);
});

test("rejects malformed chronology, checkpoint ordering, percentages, and raw provider text", () => {
  assert.throws(
    () => compileSocialVideoRetentionDiagnosticsV1(input({ capturedAt: "2026-09-18T17:00:00Z" })),
    /capturedAt must not precede observedAt/i
  );

  assert.throws(
    () => compileSocialVideoRetentionDiagnosticsV1(input({
      checkpoints: [
        { elapsedSeconds: 8, retainedPct: 57, evidenceRefs: ["evidence:checkpoint:8"] },
        { elapsedSeconds: 3, retainedPct: 82, evidenceRefs: ["evidence:checkpoint:3"] }
      ]
    })),
    /strictly ordered/i
  );

  assert.throws(
    () => compileSocialVideoRetentionDiagnosticsV1(input({ completionRatePct: 101 })),
    /completionRatePct must be a finite number/i
  );

  const unsafe = {
    ...input(),
    rawPayload: "provider response body must not enter this durable contract"
  } as SocialVideoRetentionDiagnosticsInputV1;
  assert.throws(
    () => compileSocialVideoRetentionDiagnosticsV1(unsafe),
    /rawPayload is prohibited/i
  );
});

test("is deterministic, deeply immutable, and does not mutate caller evidence", () => {
  const source = input();
  const before = JSON.stringify(source);
  const first = compileSocialVideoRetentionDiagnosticsV1(source);
  const second = compileSocialVideoRetentionDiagnosticsV1(source);

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(source), before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.checkpoints), true);
  assert.equal(Object.isFrozen(first.checkpoints[0]), true);
  assert.equal(Object.isFrozen(first.checkpoints[0]?.evidenceRefs), true);
  assert.equal(Object.isFrozen(first.largestObservedDrop), true);
  assert.equal(Object.isFrozen(first.guardrails), true);
  assert.match(first.guardrails.join(" "), /do not establish why viewers behaved that way, business attribution, competitor performance, or future results/i);
});
