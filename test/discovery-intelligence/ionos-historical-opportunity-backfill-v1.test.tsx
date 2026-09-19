import assert from "node:assert/strict";
import test from "node:test";
import {
  IONOS_HISTORICAL_OPPORTUNITY_BACKFILL_VERSION,
  IONOS_HISTORICAL_OPPORTUNITY_EVIDENCE_CONTRACT,
  compileIonosHistoricalOpportunityBackfillV1,
  type IonosHistoricalOpportunityBackfillInputV1,
  type IonosHistoricalOpportunityRecordV1
} from "../../src/lib/discovery-intelligence/ionos-historical-opportunity-backfill-v1";

function record(
  sourceRecordRef: string,
  messageObservedAt: string,
  overrides: Partial<IonosHistoricalOpportunityRecordV1> = {}
): IonosHistoricalOpportunityRecordV1 {
  return {
    sourceRecordRef,
    sourceMessageRef: `message:${sourceRecordRef}`,
    messageObservedAt,
    evidenceContract: IONOS_HISTORICAL_OPPORTUNITY_EVIDENCE_CONTRACT,
    candidate: {
      sourceCandidateKey: `candidate:${sourceRecordRef}`,
      title: {
        state: "KNOWN",
        value: `Opportunity ${sourceRecordRef}`,
        evidenceRefs: [`evidence:${sourceRecordRef}:title`]
      },
      truthState: "KNOWN",
      evidenceRefs: [`evidence:${sourceRecordRef}:signal`],
      organizationRefs: [`org:${sourceRecordRef}`]
    },
    ...overrides
  };
}

function baseInput(overrides: Partial<IonosHistoricalOpportunityBackfillInputV1> = {}): IonosHistoricalOpportunityBackfillInputV1 {
  return {
    mailboxRef: "mailbox:keegan-primary",
    asOf: "2026-09-19T09:00:00.000Z",
    snapshotObservedAt: "2026-09-19T08:55:00.000Z",
    snapshotExpiresAt: "2026-09-19T10:00:00.000Z",
    sourceState: "CURRENT",
    windowStart: "2026-01-01T00:00:00.000Z",
    windowEnd: "2026-09-18T23:59:59.000Z",
    records: [record("r1", "2026-03-01T12:00:00.000Z")],
    ...overrides
  };
}

test("historical IONOS evidence becomes review-only candidates with a resumable checkpoint", () => {
  const result = compileIonosHistoricalOpportunityBackfillV1(
    baseInput({
      records: [
        record("r2", "2026-04-01T12:00:00.000Z"),
        record("r1", "2026-03-01T12:00:00.000Z")
      ]
    })
  );

  assert.equal(result.version, IONOS_HISTORICAL_OPPORTUNITY_BACKFILL_VERSION);
  assert.equal(result.status, "READY_FOR_REVIEW");
  assert.deepEqual(
    result.reviewCandidates.map((candidate) => candidate.sourceRecordRef),
    ["r1", "r2"]
  );
  assert.equal(result.reviewCandidates[0]?.handoff.source, "IONOS");
  assert.equal(result.reviewCandidates[0]?.handoff.payload.qualification, "CANDIDATE");
  assert.equal(result.reviewCandidates[0]?.handoff.disposition, "NEEDS_VERIFICATION");
  assert.equal(result.reviewCandidates[0]?.qualificationAuthority, "REVIEW_ONLY");
  assert.equal(result.nextCheckpoint?.throughSourceRecordRef, "r2");
  assert.equal(result.nextCheckpoint?.throughObservedAt, "2026-04-01T12:00:00.000Z");
  assert.equal(result.crmMutationPerformed, false);
  assert.equal(result.mailboxMutationPerformed, false);
  assert.equal(result.externalActionPerformed, false);
  assert.equal(result.writeAuthorityGranted, false);
});

test("stale, partial, or conflicted source snapshots fail closed without advancing a checkpoint", () => {
  for (const sourceState of ["STALE", "PARTIAL", "CONFLICTED"] as const) {
    const result = compileIonosHistoricalOpportunityBackfillV1(baseInput({ sourceState }));
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.reviewCandidates.length, 0);
    assert.equal(result.nextCheckpoint, null);
    assert.ok(result.reasonCodes.includes(`SOURCE_${sourceState}_BLOCKS_BACKFILL`));
  }
});

test("future, expired, and incomplete snapshot ranges cannot be treated as current evidence", () => {
  const expired = compileIonosHistoricalOpportunityBackfillV1(
    baseInput({ snapshotExpiresAt: "2026-09-19T08:59:59.000Z" })
  );
  assert.equal(expired.status, "BLOCKED");
  assert.ok(expired.reasonCodes.includes("SNAPSHOT_EXPIRED_BLOCKS_BACKFILL"));

  const futureSnapshot = compileIonosHistoricalOpportunityBackfillV1(
    baseInput({ snapshotObservedAt: "2026-09-19T09:05:00.000Z" })
  );
  assert.equal(futureSnapshot.status, "BLOCKED");
  assert.ok(futureSnapshot.reasonCodes.includes("FUTURE_SNAPSHOT_OBSERVATION_BLOCKS_BACKFILL"));

  const uncoveredWindow = compileIonosHistoricalOpportunityBackfillV1(
    baseInput({ windowEnd: "2026-09-19T08:57:00.000Z" })
  );
  assert.equal(uncoveredWindow.status, "BLOCKED");
  assert.ok(uncoveredWindow.reasonCodes.includes("WINDOW_EXTENDS_BEYOND_OBSERVED_SNAPSHOT"));
});

test("a checkpoint is bound to one canonical mailbox and exact historical window", () => {
  const result = compileIonosHistoricalOpportunityBackfillV1(
    baseInput({
      checkpoint: {
        version: IONOS_HISTORICAL_OPPORTUNITY_BACKFILL_VERSION,
        mailboxRef: "mailbox:other",
        windowStart: "2026-01-01T00:00:00.000Z",
        windowEnd: "2026-09-18T23:59:59.000Z",
        throughObservedAt: "2026-02-01T00:00:00.000Z",
        throughSourceRecordRef: "old-record"
      }
    })
  );

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.reasonCodes.includes("CHECKPOINT_SCOPE_MISMATCH"));
  assert.equal(result.reviewCandidates.length, 0);
});

test("retrying with a checkpoint skips already processed evidence instead of duplicating candidates", () => {
  const checkpoint = {
    version: IONOS_HISTORICAL_OPPORTUNITY_BACKFILL_VERSION,
    mailboxRef: "mailbox:keegan-primary",
    windowStart: "2026-01-01T00:00:00.000Z",
    windowEnd: "2026-09-18T23:59:59.000Z",
    throughObservedAt: "2026-03-01T12:00:00.000Z",
    throughSourceRecordRef: "r1"
  } as const;

  const result = compileIonosHistoricalOpportunityBackfillV1(
    baseInput({
      checkpoint,
      records: [
        record("r1", "2026-03-01T12:00:00.000Z"),
        record("r2", "2026-04-01T12:00:00.000Z")
      ]
    })
  );

  assert.equal(result.status, "READY_FOR_REVIEW");
  assert.deepEqual(result.skippedAlreadyProcessed, ["r1"]);
  assert.deepEqual(result.reviewCandidates.map((candidate) => candidate.sourceRecordRef), ["r2"]);
  assert.equal(result.nextCheckpoint?.throughSourceRecordRef, "r2");
});

test("a bad record stops advancement at the last contiguous good record so corrected evidence can resume safely", () => {
  const result = compileIonosHistoricalOpportunityBackfillV1(
    baseInput({
      records: [
        record("r1", "2026-03-01T12:00:00.000Z"),
        record("r2", "2026-04-01T12:00:00.000Z", {
          candidate: {
            ...record("r2", "2026-04-01T12:00:00.000Z").candidate,
            truthState: "PARTIAL"
          }
        }),
        record("r3", "2026-05-01T12:00:00.000Z")
      ]
    })
  );

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.blockedSourceRecordRef, "r2");
  assert.deepEqual(result.reviewCandidates.map((candidate) => candidate.sourceRecordRef), ["r1"]);
  assert.equal(result.nextCheckpoint?.throughSourceRecordRef, "r1");
  assert.ok(result.reasonCodes.includes("TRUTH_PARTIAL_BLOCKS_HISTORICAL_CAPTURE"));
});

test("duplicate extraction record identities fail closed before processing", () => {
  const result = compileIonosHistoricalOpportunityBackfillV1(
    baseInput({
      records: [
        record("r1", "2026-03-01T12:00:00.000Z"),
        record("r1", "2026-04-01T12:00:00.000Z")
      ]
    })
  );

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reviewCandidates.length, 0);
  assert.equal(result.blockedSourceRecordRef, "r1");
  assert.ok(result.reasonCodes.includes("DUPLICATE_SOURCE_RECORD_REF_BLOCKS_BACKFILL"));
});

test("record timestamps must stay inside the exact historical window and cannot be future evidence", () => {
  const outside = compileIonosHistoricalOpportunityBackfillV1(
    baseInput({ records: [record("r1", "2025-12-31T23:59:59.000Z")] })
  );
  assert.equal(outside.status, "BLOCKED");
  assert.ok(outside.reasonCodes.includes("RECORD_OUTSIDE_BACKFILL_WINDOW"));

  const future = compileIonosHistoricalOpportunityBackfillV1(
    baseInput({
      windowEnd: "2026-09-19T08:55:00.000Z",
      records: [record("r1", "2026-09-19T08:56:00.000Z")]
    })
  );
  assert.equal(future.status, "BLOCKED");
  assert.ok(future.reasonCodes.includes("RECORD_OUTSIDE_BACKFILL_WINDOW"));
  assert.ok(future.reasonCodes.includes("FUTURE_RECORD_OBSERVATION_BLOCKS_BACKFILL"));
});

test("uncertain planning evidence is preserved as uncertain and never converted into inferred timing", () => {
  const baseRecord = record("r1", "2026-03-01T12:00:00.000Z");
  const result = compileIonosHistoricalOpportunityBackfillV1(
    baseInput({
      records: [
        {
          ...baseRecord,
          candidate: {
            ...baseRecord.candidate,
            planningWindow: {
              state: "INFERRED",
              value: "Q1 2027",
              evidenceRefs: ["evidence:r1:planning-inference"]
            }
          }
        }
      ]
    })
  );

  assert.equal(result.status, "READY_FOR_REVIEW");
  assert.equal(result.reviewCandidates[0]?.handoff.payload.planningWindow?.state, "INFERRED");
  assert.equal(result.reviewCandidates[0]?.handoff.payload.planningWindow?.value, "Q1 2027");
  assert.equal(result.reviewCandidates[0]?.timingInferencePerformed, false);
  assert.equal(result.reviewCandidates[0]?.handoff.disposition, "NEEDS_VERIFICATION");
});

test("unsupported raw-message or invented business fields are rejected at the backfill boundary", () => {
  assert.throws(
    () =>
      compileIonosHistoricalOpportunityBackfillV1(
        baseInput({
          records: [
            {
              ...record("r1", "2026-03-01T12:00:00.000Z"),
              // @ts-expect-error deliberate contract violation: raw bodies are not accepted here
              rawBody: "Maybe they want a sponsorship."
            }
          ]
        })
      ),
    /records\[0\] contains unsupported key rawBody/
  );

  assert.throws(
    () =>
      compileIonosHistoricalOpportunityBackfillV1(
        baseInput({
          records: [
            {
              ...record("r1", "2026-03-01T12:00:00.000Z"),
              candidate: {
                ...record("r1", "2026-03-01T12:00:00.000Z").candidate,
                // @ts-expect-error deliberate contract violation
                inferredDecisionMakerEmail: "someone@example.com"
              }
            }
          ]
        })
      ),
    /candidate contains unsupported key inferredDecisionMakerEmail/
  );
});

test("output is deterministic and deeply immutable", () => {
  const input = baseInput();
  const first = compileIonosHistoricalOpportunityBackfillV1(input);
  const second = compileIonosHistoricalOpportunityBackfillV1(input);

  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.reviewCandidates), true);
  assert.equal(Object.isFrozen(first.reviewCandidates[0]), true);
  assert.equal(Object.isFrozen(first.reviewCandidates[0]?.handoff), true);
});
