import assert from "node:assert/strict";
import { test } from "node:test";

import type { CanonicalSocialAccountSnapshotV1 } from "../../src/lib/social-intelligence/social-canonical-v1";
import type { YouTubeCanonicalIngestionHandoffV1 } from "../../src/lib/social-intelligence/youtube-canonical-ingestion-handoff-v1";
import type { YouTubeCanonicalPersistencePlanV1 } from "../../src/lib/social-intelligence/youtube-canonical-persistence-plan-v1";
import {
  executeYouTubeCanonicalPersistenceV1,
  YOUTUBE_CANONICAL_PERSISTENCE_RPC_V1,
  type SocialCanonicalPersistenceRpcClientV1,
  type YouTubeCanonicalPersistenceRpcArgsV1
} from "../../src/lib/social-intelligence/youtube-canonical-persistence-executor-v1";

const RETRIEVED_AT = "2026-09-19T12:00:00.000Z";
const GENERATED_AT = "2026-09-19T12:01:00.000Z";
const NOW = "2026-09-19T12:02:00.000Z";
const CONNECTOR_ID = "youtube-keegan-readonly";
const RUN_ID = "youtube-run-001";
const SNAPSHOT_ID = "social:YOUTUBE:channel-123:2026-09-19T12:00:00.000Z";
const ACCOUNT_ID = "channel-123";
const CANONICAL_KEY = `YOUTUBE:${ACCOUNT_ID}:${SNAPSHOT_ID}`;
const PROVIDER_REF = "evidence:youtube-response:run-001";
const CANONICAL_REF = "evidence:canonical:youtube-run-001";

function makeSnapshot(): CanonicalSocialAccountSnapshotV1 {
  return {
    contractVersion: "CanonicalSocialAccountSnapshotV1",
    snapshotId: SNAPSHOT_ID,
    platform: "YOUTUBE",
    accountId: ACCOUNT_ID,
    handle: "@keeganhall",
    retrievedAt: RETRIEVED_AT,
    sourceCoverage: {
      requestedState: "CONNECTED_AND_INGESTING",
      effectiveState: "CONNECTED_AND_INGESTING",
      freshness: "FRESH",
      lastSuccessfulSyncAt: RETRIEVED_AT,
      metricCoverage: ["VIEWS"],
      limitations: [],
      reason: null
    },
    periods: [],
    comparisons: [],
    content: [],
    metricDefinitions: {} as CanonicalSocialAccountSnapshotV1["metricDefinitions"],
    evidenceRefs: [CANONICAL_REF],
    externalAccessPerformed: false,
    writesPerformed: false
  };
}

function makeHandoff(snapshot = makeSnapshot()): YouTubeCanonicalIngestionHandoffV1 {
  return {
    contractVersion: "YouTubeCanonicalIngestionHandoffV1",
    generatedAt: GENERATED_AT,
    platform: "YOUTUBE",
    connectorId: CONNECTOR_ID,
    runId: RUN_ID,
    state: "READY_TO_APPEND",
    blockers: [],
    projection: {
      snapshot
    } as YouTubeCanonicalIngestionHandoffV1["projection"],
    syncAcceptance: {} as NonNullable<YouTubeCanonicalIngestionHandoffV1["syncAcceptance"]>,
    appendPlan: {} as NonNullable<YouTubeCanonicalIngestionHandoffV1["appendPlan"]>,
    projectedLedger: {} as NonNullable<YouTubeCanonicalIngestionHandoffV1["projectedLedger"]>,
    candidateSnapshotId: SNAPSHOT_ID,
    providerEvidenceRefs: [PROVIDER_REF],
    evidenceRefs: [CANONICAL_REF, PROVIDER_REF].sort(),
    limitations: [],
    providerAccessObserved: true,
    providerWritesPerformed: false,
    canonicalPersistencePerformed: false,
    canonicalPersistenceAuthorized: false,
    causalClaimsCreated: false,
    attributionClaimsCreated: false,
    externalActionAuthorityGranted: false
  };
}

function makeApplyPlan(snapshot = makeSnapshot()): YouTubeCanonicalPersistencePlanV1 {
  return {
    contractVersion: "YouTubeCanonicalPersistencePlanV1",
    generatedAt: GENERATED_AT,
    platform: "YOUTUBE",
    connectorId: CONNECTOR_ID,
    runId: RUN_ID,
    disposition: "APPLY",
    reasonCodes: ["READY_TO_APPLY"],
    candidateSnapshotId: SNAPSHOT_ID,
    operations: [
      {
        kind: "APPEND_CANONICAL_SNAPSHOT",
        canonicalKey: CANONICAL_KEY,
        snapshot
      },
      {
        kind: "COMPARE_AND_SET_CHECKPOINT",
        platform: "YOUTUBE",
        connectorId: CONNECTOR_ID,
        expected: { cursor: null, completedThroughAt: null },
        next: { cursor: null, completedThroughAt: RETRIEVED_AT }
      }
    ],
    evidenceRefs: [CANONICAL_REF, PROVIDER_REF].sort(),
    localCanonicalPersistencePlanAllowed: true,
    canonicalPersistencePerformed: false,
    providerWritesAllowed: false,
    externalActionAuthorityGranted: false,
    causalClaimsCreated: false,
    attributionClaimsCreated: false
  };
}

function makeCheckpointOnlyPlan(): YouTubeCanonicalPersistencePlanV1 {
  return {
    ...makeApplyPlan(),
    reasonCodes: ["SNAPSHOT_ALREADY_PERSISTED_ADVANCE_CHECKPOINT"],
    operations: [
      {
        kind: "COMPARE_AND_SET_CHECKPOINT",
        platform: "YOUTUBE",
        connectorId: CONNECTOR_ID,
        expected: { cursor: null, completedThroughAt: null },
        next: { cursor: null, completedThroughAt: RETRIEVED_AT }
      }
    ]
  };
}

function makeNoopPlan(): YouTubeCanonicalPersistencePlanV1 {
  return {
    ...makeApplyPlan(),
    disposition: "NOOP",
    reasonCodes: ["ALREADY_PERSISTED"],
    operations: [],
    localCanonicalPersistencePlanAllowed: false
  };
}

function clientReturning(
  data: unknown,
  error: { code?: unknown } | null = null,
  onRpc?: (name: string, args: YouTubeCanonicalPersistenceRpcArgsV1) => void
): SocialCanonicalPersistenceRpcClientV1 {
  return {
    async rpc(name, args) {
      onRpc?.(name, args);
      return { data, error };
    }
  };
}

test("executes an accepted append-plus-checkpoint plan through only the bounded canonical RPC", async () => {
  const snapshot = makeSnapshot();
  const handoff = makeHandoff(snapshot);
  const plan = makeApplyPlan(snapshot);
  let capturedName: string | null = null;
  let capturedArgs: YouTubeCanonicalPersistenceRpcArgsV1 | null = null;
  const rpcClient = clientReturning(
    [{ status: "APPLIED", snapshot_id: SNAPSHOT_ID, checkpoint_completed_through_at: RETRIEVED_AT }],
    null,
    (name, args) => {
      capturedName = name;
      capturedArgs = args;
    }
  );

  const result = await executeYouTubeCanonicalPersistenceV1({ plan, handoff, rpcClient, now: NOW });

  assert.equal(result.state, "PERSISTED");
  assert.deepEqual(result.reasonCodes, ["RPC_APPLIED"]);
  assert.equal(result.rpcInvoked, true);
  assert.equal(result.rpcStatus, "APPLIED");
  assert.equal(result.canonicalPersistencePerformed, true);
  assert.equal(result.providerWritesPerformed, false);
  assert.equal(result.externalActionAuthorityGranted, false);
  assert.equal(result.causalClaimsCreated, false);
  assert.equal(result.attributionClaimsCreated, false);
  assert.equal(capturedName, YOUTUBE_CANONICAL_PERSISTENCE_RPC_V1);
  assert.ok(capturedArgs);
  assert.equal(capturedArgs.in_canonical_key, CANONICAL_KEY);
  assert.equal(capturedArgs.in_platform, "YOUTUBE");
  assert.equal(capturedArgs.in_connector_id, CONNECTOR_ID);
  assert.equal(capturedArgs.in_run_id, RUN_ID);
  assert.equal(capturedArgs.in_snapshot_id, SNAPSHOT_ID);
  assert.equal(capturedArgs.in_account_id, ACCOUNT_ID);
  assert.equal(capturedArgs.in_retrieved_at, RETRIEVED_AT);
  assert.equal(capturedArgs.in_source_state, "CONNECTED_AND_INGESTING");
  assert.deepEqual(capturedArgs.in_provider_evidence_refs, [PROVIDER_REF]);
  assert.deepEqual(capturedArgs.in_evidence_refs, [CANONICAL_REF]);
  assert.equal(capturedArgs.in_snapshot_json, snapshot);
  assert.equal(capturedArgs.in_expected_cursor, null);
  assert.equal(capturedArgs.in_expected_completed_through_at, null);
  assert.equal(capturedArgs.in_next_cursor, null);
  assert.equal(capturedArgs.in_next_completed_through_at, RETRIEVED_AT);
});

test("uses the handoff candidate to safely recover a snapshot-already-persisted checkpoint", async () => {
  let calls = 0;
  const result = await executeYouTubeCanonicalPersistenceV1({
    plan: makeCheckpointOnlyPlan(),
    handoff: makeHandoff(),
    rpcClient: clientReturning(
      [{ status: "CHECKPOINT_ADVANCED", snapshot_id: SNAPSHOT_ID, checkpoint_completed_through_at: RETRIEVED_AT }],
      null,
      () => {
        calls += 1;
      }
    ),
    now: NOW
  });

  assert.equal(calls, 1);
  assert.equal(result.state, "PERSISTED");
  assert.deepEqual(result.reasonCodes, ["RPC_CHECKPOINT_ADVANCED"]);
  assert.equal(result.canonicalPersistencePerformed, true);
});

test("does not call the database for an already-noop plan", async () => {
  let calls = 0;
  const result = await executeYouTubeCanonicalPersistenceV1({
    plan: makeNoopPlan(),
    handoff: makeHandoff(),
    rpcClient: clientReturning([], null, () => {
      calls += 1;
    }),
    now: NOW
  });

  assert.equal(calls, 0);
  assert.equal(result.state, "NOOP");
  assert.deepEqual(result.reasonCodes, ["PLAN_ALREADY_NOOP"]);
  assert.equal(result.canonicalPersistencePerformed, false);
});

test("withholds a verification-required plan without attempting persistence", async () => {
  let calls = 0;
  const plan: YouTubeCanonicalPersistencePlanV1 = {
    ...makeNoopPlan(),
    disposition: "VERIFICATION_REQUIRED",
    reasonCodes: ["SNAPSHOT_CONFLICT"]
  };
  const result = await executeYouTubeCanonicalPersistenceV1({
    plan,
    handoff: makeHandoff(),
    rpcClient: clientReturning([], null, () => {
      calls += 1;
    }),
    now: NOW
  });

  assert.equal(calls, 0);
  assert.equal(result.state, "VERIFICATION_REQUIRED");
  assert.deepEqual(result.reasonCodes, ["PLAN_NOT_APPLICABLE"]);
});

test("fails closed before RPC when provenance drifts or contains credential-like material", async () => {
  let calls = 0;
  const driftedHandoff: YouTubeCanonicalIngestionHandoffV1 = {
    ...makeHandoff(),
    evidenceRefs: [CANONICAL_REF, "evidence:different"].sort()
  };
  const drifted = await executeYouTubeCanonicalPersistenceV1({
    plan: makeApplyPlan(),
    handoff: driftedHandoff,
    rpcClient: clientReturning([], null, () => {
      calls += 1;
    }),
    now: NOW
  });
  assert.equal(drifted.state, "VERIFICATION_REQUIRED");
  assert.deepEqual(drifted.reasonCodes, ["EVIDENCE_BINDING_MISMATCH"]);
  assert.equal(calls, 0);

  const secretRef = "https://evidence.example/item?access_token=do-not-store";
  const secretHandoff: YouTubeCanonicalIngestionHandoffV1 = {
    ...makeHandoff(),
    providerEvidenceRefs: [secretRef],
    evidenceRefs: [CANONICAL_REF, secretRef].sort()
  };
  const secretPlan: YouTubeCanonicalPersistencePlanV1 = {
    ...makeApplyPlan(),
    evidenceRefs: [CANONICAL_REF, secretRef].sort()
  };
  const secret = await executeYouTubeCanonicalPersistenceV1({
    plan: secretPlan,
    handoff: secretHandoff,
    rpcClient: clientReturning([], null, () => {
      calls += 1;
    }),
    now: NOW
  });
  assert.equal(secret.state, "VERIFICATION_REQUIRED");
  assert.deepEqual(secret.reasonCodes, ["EVIDENCE_BINDING_MISMATCH"]);
  assert.equal(calls, 0);
});

test("treats database rejection or malformed acknowledgement as verification-required", async () => {
  const rejected = await executeYouTubeCanonicalPersistenceV1({
    plan: makeApplyPlan(),
    handoff: makeHandoff(),
    rpcClient: clientReturning(null, { code: "40001" }),
    now: NOW
  });
  assert.equal(rejected.state, "VERIFICATION_REQUIRED");
  assert.deepEqual(rejected.reasonCodes, ["RPC_REJECTED"]);
  assert.equal(rejected.rpcInvoked, true);
  assert.equal(rejected.rpcErrorCode, "40001");
  assert.equal(rejected.canonicalPersistencePerformed, false);

  const malformed = await executeYouTubeCanonicalPersistenceV1({
    plan: makeApplyPlan(),
    handoff: makeHandoff(),
    rpcClient: clientReturning([
      { status: "APPLIED", snapshot_id: "wrong-snapshot", checkpoint_completed_through_at: RETRIEVED_AT }
    ]),
    now: NOW
  });
  assert.equal(malformed.state, "VERIFICATION_REQUIRED");
  assert.deepEqual(malformed.reasonCodes, ["RPC_RESULT_INVALID"]);
  assert.equal(malformed.canonicalPersistencePerformed, false);
});

test("accepts an exact idempotent RPC acknowledgement without claiming a new mutation", async () => {
  const result = await executeYouTubeCanonicalPersistenceV1({
    plan: makeApplyPlan(),
    handoff: makeHandoff(),
    rpcClient: clientReturning([
      { status: "IDEMPOTENT", snapshot_id: SNAPSHOT_ID, checkpoint_completed_through_at: RETRIEVED_AT }
    ]),
    now: NOW
  });

  assert.equal(result.state, "PERSISTED");
  assert.deepEqual(result.reasonCodes, ["RPC_IDEMPOTENT"]);
  assert.equal(result.rpcStatus, "IDEMPOTENT");
  assert.equal(result.canonicalPersistencePerformed, false);
});
