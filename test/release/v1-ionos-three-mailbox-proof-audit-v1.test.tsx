import assert from "node:assert/strict";
import test from "node:test";

import type { IonosHistoricalPreviewTelemetryV1 } from "@/lib/email/ionos-historical-intelligence-runner-v1";
import {
  compileV1IonosThreeMailboxProofAuditV1,
  type V1IonosThreeMailboxProofAuditInputV1,
  type V1IonosThreeMailboxProofObservationV1
} from "@/lib/release/v1-ionos-three-mailbox-proof-audit-v1";
import {
  V1_RELEASE_REQUIRED_GATES_V1,
  compileV1ReleaseCertificateV1,
  type V1ReleaseGateEvidenceV1
} from "@/lib/release/v1-release-certificate-v1";

const RELEASE_SHA = "22603cdc1fb7f4c9764dbd349e3b50af18cb8288";
const OBSERVED_AT = "2026-09-18T22:10:00.000Z";
const GENERATED_AT = "2026-09-18T22:15:00.000Z";

function completeTelemetry(): IonosHistoricalPreviewTelemetryV1 {
  return {
    status: "COMPLETE",
    mailboxCount: 3,
    successfulMailboxCount: 3,
    failedMailboxCount: 0,
    candidateCount: 6,
    envelopeCount: 6,
    canonicalRecordCount: 5,
    crmActivityCount: 4,
    relationshipProjectionCount: 3,
    inboxAttentionCount: 2,
    verificationRequiredCount: 1,
    rejectionCount: 1,
    mailboxes: [
      {
        role: "PERSONAL_HIGH_VALUE_RELATIONSHIP",
        status: "SCANNED",
        reason: null,
        fetchedCount: 3,
        candidateCount: 3,
        envelopeCount: 3,
        requestedRangeFingerprint: "range-personal",
        effectiveRangeFingerprint: "effective-personal"
      },
      {
        role: "ASSISTANT_CUSTOMER_SERVICE_OUTREACH",
        status: "SCANNED",
        reason: null,
        fetchedCount: 2,
        candidateCount: 2,
        envelopeCount: 2,
        requestedRangeFingerprint: "range-assistant",
        effectiveRangeFingerprint: "effective-assistant"
      },
      {
        role: "MARKETING_FUNNELKIT",
        status: "SCANNED",
        reason: null,
        fetchedCount: 1,
        candidateCount: 1,
        envelopeCount: 1,
        requestedRangeFingerprint: "range-marketing",
        effectiveRangeFingerprint: "effective-marketing"
      }
    ]
  };
}

function validObservation(): V1IonosThreeMailboxProofObservationV1 {
  return {
    releaseSha: RELEASE_SHA,
    observedAt: OBSERVED_AT,
    source: "LIVE_AUTHORIZED_LOCAL_RUNTIME",
    actionRequirement: "NONE",
    telemetry: completeTelemetry(),
    executionBounds: {
      rangesBounded: true,
      batchSizesBounded: true,
      deadlineImmutable: true
    },
    safety: {
      bodyPolicy: "NONE",
      attachmentBytesRequested: 0,
      mailboxMutationPerformed: false,
      incrementalCursorMutationPerformed: false,
      historicalCheckpointMutationPerformed: false,
      databaseMutationPerformed: false,
      repositoryMutationPerformed: false,
      smtpOrSendPerformed: false,
      cleanRepositoryBefore: true,
      cleanRepositoryAfter: true,
      privacySafeOutputConfirmed: true
    },
    evidenceRefs: ["github://issues/1740", "runtime-proof://ionos/three-mailbox-preview"]
  };
}

function validInput(): V1IonosThreeMailboxProofAuditInputV1 {
  return {
    releaseSha: RELEASE_SHA,
    generatedAt: GENERATED_AT,
    maximumProofAgeMs: 30 * 60 * 1000,
    observations: [validObservation()]
  };
}

test("one exact-SHA live three-mailbox preview compiles to canonical release evidence", () => {
  const result = compileV1IonosThreeMailboxProofAuditV1(validInput());

  assert.equal(result.status, "PASS");
  assert.equal(result.blockers.length, 0);
  assert.equal(result.gateEvidence.gateId, "IONOS_THREE_MAILBOX_PROOF");
  assert.equal(result.gateEvidence.state, "PASS");
  assert.equal(result.gateEvidence.freshness, "CURRENT");
  assert.equal(result.gateEvidence.releaseSha, RELEASE_SHA);
  assert.equal(result.gateEvidence.actionRequirement, "NONE");
  assert.deepEqual(result.observedRoles, [
    "PERSONAL_HIGH_VALUE_RELATIONSHIP",
    "ASSISTANT_CUSTOMER_SERVICE_OUTREACH",
    "MARKETING_FUNNELKIT"
  ]);
  assert.deepEqual(result.aggregateCounts, {
    candidateCount: 6,
    envelopeCount: 6,
    canonicalRecordCount: 5,
    crmActivityCount: 4,
    relationshipProjectionCount: 3,
    inboxAttentionCount: 2,
    verificationRequiredCount: 1,
    rejectionCount: 1
  });
  assert.equal(result.authority.canAccessMailbox, false);
  assert.equal(result.authority.canMutateMailbox, false);
  assert.equal(result.authority.canMutateCursor, false);
  assert.equal(result.authority.canMutateDatabase, false);
  assert.equal(result.authority.canSendEmail, false);
  assert.equal(result.authority.canDeploy, false);
  assert.equal(result.authority.canBypassApproval, false);
});

test("canonical IONOS proof can be consumed directly by the existing V1 release certificate", () => {
  const ionos = compileV1IonosThreeMailboxProofAuditV1(validInput());
  const gates: V1ReleaseGateEvidenceV1[] = V1_RELEASE_REQUIRED_GATES_V1.map((gateId) =>
    gateId === "IONOS_THREE_MAILBOX_PROOF"
      ? ionos.gateEvidence
      : {
          gateId,
          state: "PASS",
          freshness: "CURRENT",
          observedAt: OBSERVED_AT,
          evidenceRefs: [`github://release-evidence/${gateId.toLowerCase()}`],
          releaseSha: RELEASE_SHA,
          actionRequirement: "NONE"
        }
  );

  const certificate = compileV1ReleaseCertificateV1({
    releaseSha: RELEASE_SHA,
    generatedAt: GENERATED_AT,
    gates,
    finalAcceptance: { state: "PENDING" }
  });

  assert.equal(certificate.mechanicalState, "READY");
  assert.equal(certificate.certifiedClaims.ionosThreeMailboxProof, true);
  assert.equal(certificate.releaseState, "READY_FOR_KEEGAN_ACCEPTANCE");
});

test("missing or duplicate live observations fail closed", () => {
  const missing = compileV1IonosThreeMailboxProofAuditV1({ ...validInput(), observations: [] });
  assert.equal(missing.status, "BLOCKED");
  assert.ok(missing.blockers.some((entry) => entry.code === "MISSING_LIVE_OBSERVATION"));

  const duplicate = compileV1IonosThreeMailboxProofAuditV1({
    ...validInput(),
    observations: [validObservation(), validObservation()]
  });
  assert.equal(duplicate.status, "BLOCKED");
  assert.ok(duplicate.blockers.some((entry) => entry.code === "DUPLICATE_LIVE_OBSERVATION"));
});

test("fixture or non-authorized runtime evidence cannot satisfy the live gate", () => {
  const observation = { ...validObservation(), source: "NON_LIVE" as const };
  const result = compileV1IonosThreeMailboxProofAuditV1({ ...validInput(), observations: [observation] });

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blockers.some((entry) => entry.code === "NON_LIVE_SOURCE"));
  assert.equal(result.gateEvidence.state, "BLOCKED");
});

test("exact release SHA and caller-owned freshness are mandatory", () => {
  const mismatched = {
    ...validObservation(),
    releaseSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  };
  const mismatchResult = compileV1IonosThreeMailboxProofAuditV1({
    ...validInput(),
    observations: [mismatched]
  });
  assert.ok(mismatchResult.blockers.some((entry) => entry.code === "OBSERVATION_SHA_MISMATCH"));

  const stale = { ...validInput(), maximumProofAgeMs: 60_000 };
  const staleResult = compileV1IonosThreeMailboxProofAuditV1(stale);
  assert.ok(staleResult.blockers.some((entry) => entry.code === "OBSERVATION_STALE"));

  const invalidPolicy = { ...validInput(), maximumProofAgeMs: 0 };
  const invalidPolicyResult = compileV1IonosThreeMailboxProofAuditV1(invalidPolicy);
  assert.ok(invalidPolicyResult.blockers.some((entry) => entry.code === "INVALID_MAXIMUM_PROOF_AGE"));
});

test("partial preview, failed mailboxes, or an incomplete canonical role set cannot pass", () => {
  const partialTelemetry = completeTelemetry();
  partialTelemetry.status = "PARTIAL";
  partialTelemetry.successfulMailboxCount = 2;
  partialTelemetry.failedMailboxCount = 1;
  partialTelemetry.mailboxes = partialTelemetry.mailboxes.map((mailbox, index) =>
    index === 0 ? { ...mailbox, status: "FAILED" as const, reason: "PROVIDER_FAILED" as const } : mailbox
  );
  const partial = compileV1IonosThreeMailboxProofAuditV1({
    ...validInput(),
    observations: [{ ...validObservation(), telemetry: partialTelemetry }]
  });
  assert.equal(partial.status, "BLOCKED");
  assert.ok(partial.blockers.some((entry) => entry.code === "PREVIEW_NOT_COMPLETE"));
  assert.ok(partial.blockers.some((entry) => entry.code === "MAILBOX_COUNT_INVALID"));
  assert.ok(partial.blockers.some((entry) => entry.code === "MAILBOX_FAILED"));

  const duplicateRoleTelemetry = completeTelemetry();
  duplicateRoleTelemetry.mailboxes = duplicateRoleTelemetry.mailboxes.map((mailbox, index) =>
    index === 2 ? { ...mailbox, role: "PERSONAL_HIGH_VALUE_RELATIONSHIP" as const } : mailbox
  );
  const duplicateRole = compileV1IonosThreeMailboxProofAuditV1({
    ...validInput(),
    observations: [{ ...validObservation(), telemetry: duplicateRoleTelemetry }]
  });
  assert.ok(duplicateRole.blockers.some((entry) => entry.code === "MAILBOX_ROLE_SET_INVALID"));
  assert.deepEqual(duplicateRole.observedRoles, []);
});

test("aggregate counts must reconcile to mailbox telemetry", () => {
  const telemetry = completeTelemetry();
  telemetry.candidateCount = 99;
  const result = compileV1IonosThreeMailboxProofAuditV1({
    ...validInput(),
    observations: [{ ...validObservation(), telemetry }]
  });

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blockers.some((entry) => entry.code === "AGGREGATE_TELEMETRY_INVALID"));
});

test("bounded execution must be explicitly proven", () => {
  const observation = validObservation();
  const result = compileV1IonosThreeMailboxProofAuditV1({
    ...validInput(),
    observations: [{
      ...observation,
      executionBounds: { ...observation.executionBounds, deadlineImmutable: false }
    }]
  });

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blockers.some((entry) => entry.code === "EXECUTION_BOUNDS_NOT_PROVEN"));
});

test("body, attachment, mailbox, cursor, checkpoint, database, repository, and send safety all fail closed", () => {
  const base = validObservation();
  const cases: Array<{
    code: string;
    safety: V1IonosThreeMailboxProofObservationV1["safety"];
  }> = [
    { code: "BODY_POLICY_NOT_NONE", safety: { ...base.safety, bodyPolicy: "OTHER" } },
    { code: "ATTACHMENT_ACCESS_DETECTED", safety: { ...base.safety, attachmentBytesRequested: 1 } },
    { code: "MAILBOX_MUTATION_DETECTED", safety: { ...base.safety, mailboxMutationPerformed: true } },
    { code: "CURSOR_MUTATION_DETECTED", safety: { ...base.safety, incrementalCursorMutationPerformed: true } },
    { code: "CHECKPOINT_MUTATION_DETECTED", safety: { ...base.safety, historicalCheckpointMutationPerformed: true } },
    { code: "DATABASE_MUTATION_DETECTED", safety: { ...base.safety, databaseMutationPerformed: true } },
    { code: "REPOSITORY_MUTATION_DETECTED", safety: { ...base.safety, repositoryMutationPerformed: true } },
    { code: "SMTP_OR_SEND_DETECTED", safety: { ...base.safety, smtpOrSendPerformed: true } },
    { code: "REPOSITORY_CLEANLINESS_NOT_PROVEN", safety: { ...base.safety, cleanRepositoryAfter: false } },
    { code: "PRIVACY_SAFE_OUTPUT_NOT_PROVEN", safety: { ...base.safety, privacySafeOutputConfirmed: false } }
  ];

  for (const scenario of cases) {
    const result = compileV1IonosThreeMailboxProofAuditV1({
      ...validInput(),
      observations: [{ ...base, safety: scenario.safety }]
    });
    assert.equal(result.status, "BLOCKED", scenario.code);
    assert.ok(result.blockers.some((entry) => entry.code === scenario.code), scenario.code);
  }
});

test("unsafe provenance is stripped instead of leaking private or secret-like material", () => {
  const result = compileV1IonosThreeMailboxProofAuditV1({
    ...validInput(),
    observations: [{
      ...validObservation(),
      evidenceRefs: ["github://issues/1740", "op://vault/item/password", "runtime://mail/private@example.com"]
    }]
  });

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blockers.some((entry) => entry.code === "OBSERVATION_UNSAFE_PROVENANCE"));
  assert.deepEqual(result.gateEvidence.evidenceRefs, []);
  assert.equal(JSON.stringify(result).includes("private@example.com"), false);
  assert.equal(JSON.stringify(result).includes("op://"), false);
});

test("an unresolved Keegan action cannot be silently converted into release PASS", () => {
  const result = compileV1IonosThreeMailboxProofAuditV1({
    ...validInput(),
    observations: [{ ...validObservation(), actionRequirement: "KEEGAN" }]
  });

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blockers.some((entry) => entry.code === "OBSERVATION_ACTION_REQUIRED"));
  assert.equal(result.gateEvidence.actionRequirement, "KEEGAN");
});

test("compilation is deterministic and does not mutate caller-owned evidence", () => {
  const input = validInput();
  const before = structuredClone(input);
  const first = compileV1IonosThreeMailboxProofAuditV1(input);
  const second = compileV1IonosThreeMailboxProofAuditV1(input);

  assert.deepEqual(first, second);
  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.gateEvidence), true);
  assert.equal(Object.isFrozen(first.blockers), true);
});
