import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import * as api from "@/lib/email/ionos-message-evidence-adapter-v1";
import {
  fetchIonosMessageEvidenceV1,
  type IonosMessageEvidenceProviderV1,
  type IonosProviderMessageEvidenceV1
} from "@/lib/email/ionos-message-evidence-adapter-v1";
import type { EmailIngestCandidateV1 } from "@/lib/email/ionos-incremental-sync-v1";
import type { IonosMailboxRuntimeV1 } from "@/lib/email/ionos-mailbox-config-v1";

const mailbox: IonosMailboxRuntimeV1 = {
  id: "personal",
  role: "PERSONAL_HIGH_VALUE_RELATIONSHIP",
  user: "Keegan@Example.test",
  pass: "private-password",
  host: "imap.example.test",
  port: 993,
  folder: "INBOX",
  minVersion: "TLSv1.2",
  smtpEnabled: false
};

const fixedNow = () => 1_000;
const deadlineAtMs = 10_000;

function candidate(
  uid: string,
  overrides: Partial<EmailIngestCandidateV1> = {}
): EmailIngestCandidateV1 {
  const uidValidity = overrides.uidValidity ?? "900719925474099312345";
  return {
    id: `ionos:personal:${uidValidity}:${uid}`,
    mailboxId: "personal",
    role: "PERSONAL_HIGH_VALUE_RELATIONSHIP",
    uidValidity,
    uid,
    messageId: `<message-${uid}@example.test>`,
    internalDate: "2026-09-08T10:00:00.000Z",
    size: 123,
    ...overrides
  };
}

function evidence(
  uid: string,
  overrides: Partial<IonosProviderMessageEvidenceV1> = {}
): IonosProviderMessageEvidenceV1 {
  return {
    uid,
    messageId: `<message-${uid}@example.test>`,
    internalDate: "2026-09-08T10:00:00.000Z",
    sentAt: "2026-09-08T09:59:00.000Z",
    subject: "Private subject",
    from: ["sender@example.test"],
    to: ["keegan@example.test"],
    cc: [],
    bcc: [],
    inReplyTo: "<parent@example.test>",
    references: ["<root@example.test>", "<parent@example.test>"],
    ...overrides
  };
}

function providerFor(
  values: readonly IonosProviderMessageEvidenceV1[],
  onCall?: (uids: readonly string[], context: { deadlineAtMs: number; now: () => number }) => void
): IonosMessageEvidenceProviderV1 {
  return {
    async fetchExact(_mailbox, uids, context) {
      onCall?.(uids, context);
      return values;
    }
  };
}

test("maps exact candidates to canonical inbound, outbound, self and ambiguous envelopes", async () => {
  const uids = [
    "900719925474099312346",
    "900719925474099312347",
    "900719925474099312348",
    "900719925474099312349"
  ];
  const candidates = uids.map((uid) => candidate(uid));
  let requested: readonly string[] = [];
  let receivedDeadline = 0;

  const result = await fetchIonosMessageEvidenceV1({
    mailbox,
    candidates: [...candidates].reverse(),
    batchSize: 4,
    deadlineAtMs,
    now: fixedNow,
    provider: providerFor([
      evidence(uids[3]!, {
        from: ["another@example.test"],
        to: ["third@example.test"]
      }),
      evidence(uids[2]!, {
        from: [{ address: "KEEGAN@example.test" }],
        to: ["keegan@example.test"]
      }),
      evidence(uids[1]!, {
        from: ["keegan@example.test"],
        to: [{ address: "customer@example.test" }],
        cc: ["copy@example.test"]
      }),
      evidence(uids[0]!, {
        from: [{ address: "Sender@Example.test" }],
        to: [{ address: "KEEGAN@example.test" }],
        cc: ["Copy@Example.test"],
        bcc: ["Blind@Example.test"]
      })
    ], (exactUids, context) => {
      requested = exactUids;
      receivedDeadline = context.deadlineAtMs;
    })
  });

  assert.deepEqual(requested, uids);
  assert.equal(receivedDeadline, deadlineAtMs);
  assert.deepEqual(result.envelopes.map((value) => value.direction), [
    "INBOUND",
    "OUTBOUND",
    "SELF",
    "UNKNOWN"
  ]);

  const inbound = result.envelopes[0];
  assert.ok(inbound);
  assert.equal(inbound.uid, uids[0]);
  assert.equal(inbound.uidValidity, "900719925474099312345");
  assert.equal(inbound.mailboxId, "personal");
  assert.equal(inbound.role, "PERSONAL_HIGH_VALUE_RELATIONSHIP");
  assert.equal(inbound.folder, "INBOX");
  assert.deepEqual(inbound.participants, {
    from: ["sender@example.test"],
    to: ["keegan@example.test"],
    cc: ["copy@example.test"],
    bcc: ["blind@example.test"]
  });
  assert.equal(inbound.inReplyTo, "<parent@example.test>");
  assert.deepEqual(inbound.references, ["<root@example.test>", "<parent@example.test>"]);
  assert.equal(inbound.sentAt, "2026-09-08T09:59:00.000Z");
  assert.equal(inbound.receivedAt, "2026-09-08T10:00:00.000Z");
  assert.equal(inbound.sourceTimestamp, "2026-09-08T10:00:00.000Z");
  assert.deepEqual(inbound.body, { policy: "NONE" });
  assert.deepEqual(inbound.attachments, []);

  assert.equal(result.telemetry.requestedCount, 4);
  assert.equal(result.telemetry.envelopeCount, 4);
  assert.equal(result.telemetry.evidenceFingerprints.length, 4);
  for (const value of result.telemetry.evidenceFingerprints) {
    assert.match(value, /^[a-f0-9]{64}$/);
  }
  const telemetry = JSON.stringify(result.telemetry);
  assert.equal(telemetry.includes("Private subject"), false);
  assert.equal(telemetry.includes("sender@example.test"), false);
  assert.equal(telemetry.includes("private-password"), false);
});

test("passes an immutable deadline and fails when elapsed time exhausts it", async () => {
  let current = 1_000;
  const value = candidate("10");
  const provider: IonosMessageEvidenceProviderV1 = {
    async fetchExact(_mailbox, uids, context) {
      assert.deepEqual(uids, ["10"]);
      assert.equal(context.deadlineAtMs, 1_001);
      current = 1_001;
      return [evidence("10")];
    }
  };

  await assert.rejects(
    fetchIonosMessageEvidenceV1({
      mailbox,
      candidates: [value],
      batchSize: 1,
      deadlineAtMs: 1_001,
      now: () => current,
      provider
    }),
    /IONOS_EVIDENCE_DEADLINE_EXHAUSTED/
  );

  await assert.rejects(
    fetchIonosMessageEvidenceV1({
      mailbox,
      candidates: [value],
      batchSize: 1,
      deadlineAtMs: 1_000,
      now: fixedNow,
      provider
    }),
    /IONOS_EVIDENCE_DEADLINE_EXHAUSTED/
  );
});

test("enforces exact batch bounds before invoking the provider", async () => {
  let calls = 0;
  const provider = providerFor([], () => {
    calls += 1;
  });
  await assert.rejects(
    fetchIonosMessageEvidenceV1({
      mailbox,
      candidates: [candidate("1"), candidate("2")],
      batchSize: 1,
      deadlineAtMs,
      now: fixedNow,
      provider
    }),
    /IONOS_EVIDENCE_BATCH_LIMIT_EXCEEDED/
  );
  assert.equal(calls, 0);

  const empty = await fetchIonosMessageEvidenceV1({
    mailbox,
    candidates: [],
    batchSize: 1,
    deadlineAtMs,
    now: fixedNow,
    provider
  });
  assert.deepEqual(empty.envelopes, []);
  assert.equal(calls, 0);
});

test("rejects duplicate, malformed and cross-mailbox candidates fail closed", async () => {
  const provider = providerFor([]);
  await assert.rejects(
    fetchIonosMessageEvidenceV1({
      mailbox,
      candidates: [candidate("3"), candidate("3")],
      batchSize: 2,
      deadlineAtMs,
      now: fixedNow,
      provider
    }),
    /IONOS_EVIDENCE_DUPLICATE_CANDIDATE/
  );
  await assert.rejects(
    fetchIonosMessageEvidenceV1({
      mailbox,
      candidates: [candidate("03")],
      batchSize: 1,
      deadlineAtMs,
      now: fixedNow,
      provider
    }),
    /IONOS_EVIDENCE_UID_INVALID/
  );
  await assert.rejects(
    fetchIonosMessageEvidenceV1({
      mailbox,
      candidates: [candidate("4", { mailboxId: "assistant" })],
      batchSize: 1,
      deadlineAtMs,
      now: fixedNow,
      provider
    }),
    /IONOS_EVIDENCE_CANDIDATE_SCOPE_MISMATCH/
  );
  await assert.rejects(
    fetchIonosMessageEvidenceV1({
      mailbox,
      candidates: [{ ...candidate("5"), surprise: "no" } as EmailIngestCandidateV1],
      batchSize: 1,
      deadlineAtMs,
      now: fixedNow,
      provider
    }),
    /IONOS_EVIDENCE_CANDIDATE_INVALID/
  );
});

test("requires one complete, matching provider result for every exact UID", async () => {
  const value = candidate("20");
  const run = (values: readonly IonosProviderMessageEvidenceV1[]) =>
    fetchIonosMessageEvidenceV1({
      mailbox,
      candidates: [value],
      batchSize: 1,
      deadlineAtMs,
      now: fixedNow,
      provider: providerFor(values)
    });

  await assert.rejects(run([]), /IONOS_EVIDENCE_PROVIDER_CARDINALITY_MISMATCH/);
  await assert.rejects(run([evidence("21")]), /IONOS_EVIDENCE_PROVIDER_UID_MISSING|IONOS_EVIDENCE_PROVIDER_UID_MISMATCH/);
  await assert.rejects(
    run([evidence("20", { messageId: "<different@example.test>" })]),
    /IONOS_EVIDENCE_MESSAGE_ID_MISMATCH/
  );
  await assert.rejects(
    run([evidence("20", { messageId: null })]),
    /IONOS_EVIDENCE_MESSAGE_ID_MISSING/
  );
  await assert.rejects(
    run([evidence("20", { internalDate: null })]),
    /IONOS_EVIDENCE_INTERNAL_DATE_MISSING/
  );
  await assert.rejects(
    run([evidence("20", { from: ["not-an-address"] })]),
    /IONOS_EVIDENCE_PARTICIPANT_INVALID/
  );
  await assert.rejects(
    run([{ ...evidence("20"), rawDiagnostic: "private" } as IonosProviderMessageEvidenceV1]),
    /IONOS_EVIDENCE_PROVIDER_RESPONSE_INVALID/
  );
});

test("redacts arbitrary provider failures and never includes message evidence", async () => {
  const provider: IonosMessageEvidenceProviderV1 = {
    async fetchExact() {
      throw new Error(
        "login private-password op://Private/Vault/password sender@example.test Private subject"
      );
    }
  };

  await assert.rejects(
    fetchIonosMessageEvidenceV1({
      mailbox,
      candidates: [candidate("30")],
      batchSize: 1,
      deadlineAtMs,
      now: fixedNow,
      provider
    }),
    (error: Error) => {
      assert.equal(error.message, "IONOS_EVIDENCE_PROVIDER_FAILURE");
      assert.doesNotMatch(error.message, /password|op:\/\/|sender|subject/i);
      return true;
    }
  );
});

test("supports nullable subject and thread evidence without reading body or attachment bytes", async () => {
  const result = await fetchIonosMessageEvidenceV1({
    mailbox,
    candidates: [candidate("40")],
    batchSize: 1,
    deadlineAtMs,
    now: fixedNow,
    provider: providerFor([
      evidence("40", {
        subject: null,
        inReplyTo: null,
        references: [],
        from: [],
        to: []
      })
    ])
  });

  assert.equal(result.envelopes[0]?.direction, "UNKNOWN");
  assert.equal(result.envelopes[0]?.subject, null);
  assert.equal(result.envelopes[0]?.inReplyTo, null);
  assert.deepEqual(result.envelopes[0]?.references, []);
  assert.deepEqual(result.envelopes[0]?.body, { policy: "NONE" });
  assert.deepEqual(result.envelopes[0]?.attachments, []);
});

test("runtime API exposes only the evidence fetcher and contains no mutation or send capability", () => {
  assert.deepEqual(Object.keys(api), ["fetchIonosMessageEvidenceV1"]);
  const source = readFileSync(
    new URL("../../src/lib/email/ionos-message-evidence-adapter-v1.ts", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(source, /messageDelete|messageMove|messageFlagsAdd|messageFlagsRemove|append\(|smtp|sendMail/i);
  assert.match(source, /mailboxOpen\(mailbox\.folder, \{ readOnly: true \}\)/);
  assert.match(source, /body: \{ policy: "NONE" \}/);
});
