import assert from "node:assert/strict";
import test from "node:test";

import {
  compileV1ReleaseCertificationV1,
  type V1ReleaseCertificationInputV1
} from "../../src/lib/release/v1-release-certification-v1";

const releaseSha = "a".repeat(40);
const now = "2026-09-18T13:30:00Z";

function gateEvidence(ref: string) {
  return {
    truthState: "KNOWN" as const,
    outcome: "PASS" as const,
    commitSha: releaseSha,
    observedAt: "2026-09-18T13:25:00Z",
    evidenceRefs: [ref]
  };
}

function baseInput(): V1ReleaseCertificationInputV1 {
  return {
    releaseCommitSha: releaseSha,
    validation: gateEvidence("github:validated-main:run-1"),
    productionSmoke: gateEvidence("github:production-smoke:run-1"),
    executiveHomeTruth: gateEvidence("production:executive-home:truth-check-1"),
    ionosHistoricalProof: {
      ...gateEvidence("issue:1740:privacy-safe-live-proof-1"),
      mailboxes: [
        { mailboxRole: "OWNER", authenticatedReadOnly: true },
        { mailboxRole: "MANAGER", authenticatedReadOnly: true },
        { mailboxRole: "PUBLIC_INBOX", authenticatedReadOnly: true }
      ],
      failedMailboxCount: 0,
      boundedRanges: true,
      boundedBatchSizes: true,
      immutableDeadline: true,
      bodyPolicy: "NONE",
      attachmentBytesRequested: 0,
      mailboxMutationCount: 0,
      cursorMutationCount: 0,
      databaseMutationCount: 0,
      smtpSendCount: 0,
      repositoryCleanBefore: true,
      repositoryCleanAfter: true,
      projectionCounts: {
        canonical: 12,
        crmActivity: 4,
        relationship: 3,
        intelligentInbox: 5,
        verificationRequired: 2,
        rejection: 1
      }
    }
  };
}

test("certifies Useful V1 only when every production-truth gate is proven on the exact release commit", () => {
  const result = compileV1ReleaseCertificationV1(baseInput(), now);

  assert.equal(result.state, "RELEASE_READY");
  assert.deepEqual(result.gates.map((gate) => [gate.gateId, gate.state]), [
    ["VALIDATED_MAIN", "PASSED"],
    ["PRODUCTION_SMOKE", "PASSED"],
    ["EXECUTIVE_HOME_TRUTH", "PASSED"],
    ["IONOS_THREE_MAILBOX_PROOF", "PASSED"]
  ]);
  assert.deepEqual(result.blockedReasons, []);
  assert.equal(result.liveIonosProofRequired, true);
  assert.equal(result.exactCommitEvidenceRequired, true);
  assert.equal(result.productionTruthClaimedOnlyWhenAllGatesPass, true);
  assert.equal(result.externalAccessPerformed, false);
  assert.equal(result.writesPerformed, false);
  assert.equal(result.causalityClaimed, false);
  assert.equal(result.monetaryOutcomeClaimed, false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.gates), true);
});

test("fails closed when the live IONOS proof is missing one mailbox or any read-only safety invariant", () => {
  const input = baseInput();
  input.ionosHistoricalProof.mailboxes = input.ionosHistoricalProof.mailboxes.slice(0, 2);
  input.ionosHistoricalProof.bodyPolicy = null;
  input.ionosHistoricalProof.databaseMutationCount = 1;

  const result = compileV1ReleaseCertificationV1(input, now);
  const ionos = result.gates.find((gate) => gate.gateId === "IONOS_THREE_MAILBOX_PROOF");

  assert.equal(result.state, "BLOCKED");
  assert.equal(ionos?.state, "BLOCKED");
  assert.ok(ionos?.reasons.some((reason) => reason.includes("exactly three mailbox roles")));
  assert.ok(ionos?.reasons.some((reason) => reason.includes("bodyPolicy=NONE")));
  assert.ok(ionos?.reasons.some((reason) => reason.includes("zero database mutation")));
});

test("does not treat UNKNOWN, CONFLICTED, missing evidence, or a different commit as release proof", () => {
  const input = baseInput();
  input.validation.truthState = "UNKNOWN";
  input.validation.outcome = null;
  input.validation.evidenceRefs = [];
  input.productionSmoke.truthState = "CONFLICTED";
  input.productionSmoke.commitSha = "b".repeat(40);
  input.executiveHomeTruth.observedAt = null;

  const result = compileV1ReleaseCertificationV1(input, now);

  assert.equal(result.state, "BLOCKED");
  assert.ok(result.blockedReasons.some((reason) => reason.includes("VALIDATED_MAIN evidence truth is UNKNOWN")));
  assert.ok(result.blockedReasons.some((reason) => reason.includes("VALIDATED_MAIN is missing evidence references")));
  assert.ok(result.blockedReasons.some((reason) => reason.includes("PRODUCTION_SMOKE evidence truth is CONFLICTED")));
  assert.ok(result.blockedReasons.some((reason) => reason.includes("PRODUCTION_SMOKE was not proven on the exact release commit")));
  assert.ok(result.blockedReasons.some((reason) => reason.includes("EXECUTIVE_HOME_TRUTH is missing observation time")));
});

test("requires unique opaque mailbox roles and known projection counts", () => {
  const input = baseInput();
  input.ionosHistoricalProof.mailboxes = [
    { mailboxRole: "OWNER", authenticatedReadOnly: true },
    { mailboxRole: "OWNER", authenticatedReadOnly: true },
    { mailboxRole: "someone@example.com", authenticatedReadOnly: true }
  ];
  input.ionosHistoricalProof.projectionCounts.canonical = null;

  const result = compileV1ReleaseCertificationV1(input, now);
  const reasons = result.gates.find((gate) => gate.gateId === "IONOS_THREE_MAILBOX_PROOF")?.reasons ?? [];

  assert.equal(result.state, "BLOCKED");
  assert.ok(reasons.some((reason) => reason.includes("mailbox roles must be unique")));
  assert.ok(reasons.some((reason) => reason.includes("must not expose an address")));
  assert.ok(reasons.some((reason) => reason.includes("projectionCounts.canonical")));
});

test("rejects secret-bearing, message-bearing, and future-dated evidence instead of certifying it", () => {
  const withSecret = baseInput() as V1ReleaseCertificationInputV1 & { password?: string };
  withSecret.password = "do-not-store-this";
  assert.throws(() => compileV1ReleaseCertificationV1(withSecret, now), /forbidden in release certification evidence/);

  const withOpRef = baseInput();
  withOpRef.validation.evidenceRefs = ["op://Private/Vault/item/field"];
  assert.throws(() => compileV1ReleaseCertificationV1(withOpRef, now), /must not contain op:\/\/ references/);

  const future = baseInput();
  future.productionSmoke.observedAt = "2026-09-18T13:31:00Z";
  assert.throws(() => compileV1ReleaseCertificationV1(future, now), /cannot be in the future/);
});

test("blocks unknown or invalid safety counters rather than interpreting them as zero", () => {
  const input = baseInput();
  input.ionosHistoricalProof.failedMailboxCount = null;
  input.ionosHistoricalProof.attachmentBytesRequested = null;
  input.ionosHistoricalProof.mailboxMutationCount = null;
  input.ionosHistoricalProof.cursorMutationCount = null;
  input.ionosHistoricalProof.smtpSendCount = null;
  input.ionosHistoricalProof.projectionCounts.relationship = -1;

  const result = compileV1ReleaseCertificationV1(input, now);
  const reasons = result.gates.find((gate) => gate.gateId === "IONOS_THREE_MAILBOX_PROOF")?.reasons ?? [];

  assert.equal(result.state, "BLOCKED");
  assert.ok(reasons.some((reason) => reason.includes("failedMailboxCount=0")));
  assert.ok(reasons.some((reason) => reason.includes("zero attachment bytes")));
  assert.ok(reasons.some((reason) => reason.includes("zero mailbox mutation")));
  assert.ok(reasons.some((reason) => reason.includes("zero cursor/checkpoint mutation")));
  assert.ok(reasons.some((reason) => reason.includes("zero SMTP/send activity")));
  assert.ok(reasons.some((reason) => reason.includes("projectionCounts.relationship")));
});
