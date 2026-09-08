import assert from "node:assert/strict";
import test from "node:test";

import * as api from "@/lib/email/ionos-email-normalization-v1";
import {
  commitHistoricalEmailBackfillBatchV1,
  normalizeHistoricalEmailMessagesV1,
  type CanonicalEmailRecordV1,
  type HistoricalBackfillCheckpointV1,
  type HistoricalBackfillCommitInputV1,
  type HistoricalBackfillCommitResultV1,
  type HistoricalBackfillStoreV1,
  type HistoricalEmailEnvelopeV1
} from "@/lib/email/ionos-email-normalization-v1";

const HORIZON = {
  startAt: "2026-01-01T00:00:00.000Z",
  endAt: "2026-09-08T23:59:59.999Z"
};

const scope = {
  mailboxId: "personal",
  role: "PERSONAL_HIGH_VALUE_RELATIONSHIP" as const,
  folder: "INBOX",
  uidValidity: "7"
};

function message(overrides: Partial<HistoricalEmailEnvelopeV1> = {}): HistoricalEmailEnvelopeV1 {
  return {
    mailboxId: "personal",
    role: "PERSONAL_HIGH_VALUE_RELATIONSHIP",
    folder: "INBOX",
    uidValidity: "7",
    uid: "10",
    messageId: "<Example-10@Example.Test>",
    direction: "INBOUND",
    participants: {
      from: ["Collector@Example.Test"],
      to: ["Keegan@Example.Test"],
      cc: [],
      bcc: []
    },
    sentAt: "2026-09-01T12:00:00Z",
    receivedAt: "2026-09-01T12:00:05Z",
    subject: "  Original   artwork inquiry  ",
    inReplyTo: null,
    references: [],
    body: { policy: "REFERENCE", reference: "body-ref-10" },
    attachments: [],
    sourceTimestamp: "2026-09-01T12:00:06Z",
    ...overrides
  };
}

class MemoryStore implements HistoricalBackfillStoreV1 {
  checkpoint: HistoricalBackfillCheckpointV1 | null = null;
  readonly records = new Map<string, CanonicalEmailRecordV1>();
  readonly provenance = new Set<string>();
  readonly rejections = new Set<string>();
  readonly commits: HistoricalBackfillCommitInputV1[] = [];
  rejectNext = false;
  throwNext = false;

  async readCheckpoint(): Promise<HistoricalBackfillCheckpointV1 | null> {
    return this.checkpoint == null ? null : structuredClone(this.checkpoint);
  }

  async commitBatch(input: HistoricalBackfillCommitInputV1): Promise<HistoricalBackfillCommitResultV1> {
    this.commits.push(structuredClone(input));
    if (this.throwNext) {
      this.throwNext = false;
      throw new Error("raw store secret should never surface");
    }
    const expected = JSON.stringify(input.expectedCheckpoint);
    const current = JSON.stringify(this.checkpoint);
    if (this.rejectNext || expected !== current) {
      this.rejectNext = false;
      return {
        committed: false,
        insertedRecordCount: 0,
        insertedProvenanceCount: 0,
        recordedRejectionCount: 0
      };
    }

    let insertedRecordCount = 0;
    let insertedProvenanceCount = 0;
    let recordedRejectionCount = 0;
    for (const record of input.records) {
      if (!this.records.has(record.id)) insertedRecordCount += 1;
      this.records.set(record.id, structuredClone(record));
      for (const source of record.provenance) {
        if (!this.provenance.has(source.ingestFingerprint)) insertedProvenanceCount += 1;
        this.provenance.add(source.ingestFingerprint);
      }
    }
    for (const rejection of input.rejections) {
      const key = `${rejection.sourceFingerprint}:${rejection.reason}`;
      if (!this.rejections.has(key)) recordedRejectionCount += 1;
      this.rejections.add(key);
    }
    this.checkpoint = structuredClone(input.nextCheckpoint);
    return {
      committed: true,
      insertedRecordCount,
      insertedProvenanceCount,
      recordedRejectionCount
    };
  }
}

const fixedNow = () => Date.parse("2026-09-08T18:00:00.000Z");

test("normalizes exact horizon boundaries and keeps outside history out of the batch", () => {
  const result = normalizeHistoricalEmailMessagesV1({
    messages: [
      message({ uid: "1", sentAt: HORIZON.startAt, receivedAt: null, messageId: "<one@example.test>" }),
      message({ uid: "2", sentAt: HORIZON.endAt, receivedAt: null, messageId: "<two@example.test>" }),
      message({ uid: "3", sentAt: "2025-12-31T23:59:59.999Z", receivedAt: null, messageId: "<three@example.test>" })
    ],
    horizon: HORIZON,
    batchSize: 2
  });

  assert.equal(result.records.length, 2);
  assert.equal(result.consideredCount, 2);
  assert.equal(result.skippedOutsideHorizonCount, 1);
  assert.deepEqual(result.records.map((record) => record.messageId).sort(), [
    "<one@example.test>",
    "<two@example.test>"
  ]);
});

test("collapses Sent/Archive and cross-mailbox copies by normalized Message-ID while preserving provenance", () => {
  const copies = [
    message({
      mailboxId: "personal",
      folder: "Sent",
      uid: "20",
      messageId: "  <Shared-ID@Example.Test>  ",
      direction: "OUTBOUND"
    }),
    message({
      mailboxId: "personal",
      folder: "Archive",
      uid: "21",
      messageId: "<shared-id@example.test>",
      direction: "OUTBOUND"
    }),
    message({
      mailboxId: "assistant",
      role: "ASSISTANT_CUSTOMER_SERVICE_OUTREACH",
      folder: "Archive",
      uidValidity: "9",
      uid: "7",
      messageId: "<SHARED-ID@EXAMPLE.TEST>",
      direction: "OUTBOUND"
    })
  ];

  const result = normalizeHistoricalEmailMessagesV1({ messages: copies, horizon: HORIZON, batchSize: 3 });
  assert.equal(result.records.length, 1);
  const record = result.records[0];
  assert.equal(record?.identityBasis, "MESSAGE_ID");
  assert.equal(record?.messageId, "<shared-id@example.test>");
  assert.equal(record?.provenance.length, 3);
  assert.deepEqual(
    record?.provenance.map((source) => `${source.mailboxId}:${source.folder}`).sort(),
    ["assistant:Archive", "personal:Archive", "personal:Sent"]
  );
});

test("uses deterministic fallback fingerprints for missing or malformed Message-ID without fabricating one", () => {
  const first = normalizeHistoricalEmailMessagesV1({
    messages: [message({ uid: "30", messageId: null })],
    horizon: HORIZON,
    batchSize: 1
  }).records[0];
  const second = normalizeHistoricalEmailMessagesV1({
    messages: [message({ uid: "31", messageId: "not a message id" })],
    horizon: HORIZON,
    batchSize: 1
  }).records[0];

  assert.equal(first?.identityBasis, "FINGERPRINT");
  assert.equal(first?.messageId, null);
  assert.equal(first?.qualityReasons.includes("MISSING_MESSAGE_ID"), true);
  assert.equal(second?.identityBasis, "FINGERPRINT");
  assert.equal(second?.messageId, null);
  assert.equal(second?.qualityReasons.includes("MALFORMED_MESSAGE_ID"), true);
  assert.equal(first?.dedupeKey, second?.dedupeKey);
  assert.equal(first?.id, second?.id);
});

test("records malformed participant evidence as a privacy-safe rejection while accepting a neighboring message", () => {
  const result = normalizeHistoricalEmailMessagesV1({
    messages: [
      message({ uid: "40", participants: { from: ["not-an-address"], to: ["keegan@example.test"] } }),
      message({ uid: "41", messageId: "<good@example.test>" })
    ],
    horizon: HORIZON,
    batchSize: 2
  });

  assert.equal(result.records.length, 1);
  assert.equal(result.rejections.length, 1);
  assert.equal(result.rejections[0]?.reason, "MALFORMED_PARTICIPANTS");
  assert.match(result.rejections[0]?.sourceFingerprint ?? "", /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(result.rejections).includes("not-an-address"), false);
});

test("records malformed timestamps and unsupported direction as deterministic rejection evidence", () => {
  const result = normalizeHistoricalEmailMessagesV1({
    messages: [
      message({ uid: "42", sentAt: "not-a-date", receivedAt: null }),
      message({ uid: "43", direction: "SIDEWAYS" as HistoricalEmailEnvelopeV1["direction"] })
    ],
    horizon: HORIZON,
    batchSize: 2
  });

  assert.equal(result.records.length, 0);
  assert.deepEqual(
    result.rejections.map((rejection) => rejection.reason).sort(),
    ["MALFORMED_TIMESTAMP", "UNSUPPORTED_ENVELOPE"]
  );
});

test("normalizes thread evidence, body policy and attachment digests without retaining attachment names", () => {
  const result = normalizeHistoricalEmailMessagesV1({
    messages: [
      message({
        uid: "50",
        inReplyTo: " <Parent@Example.Test> ",
        references: ["<ROOT@EXAMPLE.TEST>", "bad thread id", "<root@example.test>"],
        body: { policy: "TEXT", text: "Policy-permitted body text", reference: "body-50" },
        attachments: [
          {
            contentHash: "a".repeat(64),
            mimeType: "IMAGE/JPEG",
            size: 123,
            filename: "collector-private-name.jpg"
          }
        ]
      })
    ],
    horizon: HORIZON,
    batchSize: 1
  });

  const record = result.records[0];
  assert.equal(record?.thread.inReplyTo, "<parent@example.test>");
  assert.deepEqual(record?.thread.references, ["<root@example.test>"]);
  assert.equal(record?.qualityReasons.includes("MALFORMED_THREAD_ID"), true);
  assert.deepEqual(record?.body, {
    policy: "TEXT",
    reference: "body-50",
    text: "Policy-permitted body text"
  });
  assert.deepEqual(record?.attachments, [
    { contentHash: "a".repeat(64), mimeType: "image/jpeg", size: 123 }
  ]);
  assert.equal(JSON.stringify(record).includes("collector-private-name.jpg"), false);
});

test("is deterministic across source-order permutations", () => {
  const values = [
    message({ uid: "61", folder: "Archive", messageId: "<stable@example.test>" }),
    message({ uid: "60", folder: "INBOX", messageId: "<stable@example.test>" })
  ];
  const first = normalizeHistoricalEmailMessagesV1({ messages: values, horizon: HORIZON, batchSize: 2 });
  const second = normalizeHistoricalEmailMessagesV1({ messages: [...values].reverse(), horizon: HORIZON, batchSize: 2 });
  assert.deepEqual(first, second);
});

test("commits only a bounded UID batch and resumes from the committed checkpoint", async () => {
  const store = new MemoryStore();
  const messages = [
    message({ uid: "70", messageId: "<70@example.test>" }),
    message({ uid: "71", messageId: "<71@example.test>" }),
    message({ uid: "72", messageId: "<72@example.test>" })
  ];

  const first = await commitHistoricalEmailBackfillBatchV1({
    scope,
    messages,
    horizon: HORIZON,
    batchSize: 2,
    store,
    now: fixedNow
  });
  assert.equal(first.status, "COMMITTED");
  assert.equal(store.checkpoint?.lastCompletedUid, "71");
  assert.equal(store.records.size, 2);

  const second = await commitHistoricalEmailBackfillBatchV1({
    scope,
    messages,
    horizon: HORIZON,
    batchSize: 2,
    store,
    now: fixedNow
  });
  assert.equal(second.status, "COMMITTED");
  assert.equal(store.checkpoint?.lastCompletedUid, "72");
  assert.equal(store.records.size, 3);

  const third = await commitHistoricalEmailBackfillBatchV1({
    scope,
    messages,
    horizon: HORIZON,
    batchSize: 2,
    store,
    now: fixedNow
  });
  assert.equal(third.status, "NO_WORK");
  assert.equal(store.records.size, 3);
  assert.equal(store.commits.length, 2);
});

test("completed duplicate reruns create neither duplicate canonical records nor provenance edges", async () => {
  const store = new MemoryStore();
  const value = message({ uid: "80", messageId: "<repeat@example.test>" });
  const first = await commitHistoricalEmailBackfillBatchV1({
    scope,
    messages: [value],
    horizon: HORIZON,
    batchSize: 1,
    store,
    now: fixedNow
  });
  const second = await commitHistoricalEmailBackfillBatchV1({
    scope,
    messages: [value],
    horizon: HORIZON,
    batchSize: 1,
    store,
    now: fixedNow
  });

  assert.equal(first.acceptedRecordCount, 1);
  assert.equal(first.provenanceCount, 1);
  assert.equal(second.status, "NO_WORK");
  assert.equal(store.records.size, 1);
  assert.equal(store.provenance.size, 1);
});

test("stale concurrent checkpoint rejection does not advance state or report persisted records", async () => {
  const store = new MemoryStore();
  store.rejectNext = true;
  const result = await commitHistoricalEmailBackfillBatchV1({
    scope,
    messages: [message({ uid: "90" })],
    horizon: HORIZON,
    batchSize: 1,
    store,
    now: fixedNow
  });

  assert.equal(result.status, "STALE_CHECKPOINT");
  assert.equal(result.reason, "CONCURRENT_CHECKPOINT_UPDATE");
  assert.equal(result.acceptedRecordCount, 0);
  assert.equal(store.checkpoint, null);
  assert.equal(store.records.size, 0);
});

test("store failure cannot advance the checkpoint and raw errors never enter telemetry", async () => {
  const store = new MemoryStore();
  store.throwNext = true;
  const result = await commitHistoricalEmailBackfillBatchV1({
    scope,
    messages: [message({ uid: "100", subject: "Private subject", body: { policy: "TEXT", text: "Private body" } })],
    horizon: HORIZON,
    batchSize: 1,
    store,
    now: fixedNow
  });

  assert.equal(result.status, "FAILED");
  assert.equal(result.reason, "STORE_FAILURE");
  assert.equal(store.checkpoint, null);
  assert.equal(store.records.size, 0);
  const telemetry = JSON.stringify(result.telemetry);
  assert.equal(telemetry.includes("Private subject"), false);
  assert.equal(telemetry.includes("Private body"), false);
  assert.equal(telemetry.includes("collector@example.test"), false);
  assert.equal(telemetry.includes("raw store secret"), false);
});

test("one mailbox store failure cannot corrupt another mailbox scope", async () => {
  const personalStore = new MemoryStore();
  const assistantStore = new MemoryStore();
  assistantStore.throwNext = true;

  const [personalResult, assistantResult] = await Promise.all([
    commitHistoricalEmailBackfillBatchV1({
      scope,
      messages: [message({ uid: "105" })],
      horizon: HORIZON,
      batchSize: 1,
      store: personalStore,
      now: fixedNow
    }),
    commitHistoricalEmailBackfillBatchV1({
      scope: {
        mailboxId: "assistant",
        role: "ASSISTANT_CUSTOMER_SERVICE_OUTREACH",
        folder: "INBOX",
        uidValidity: "8"
      },
      messages: [message({
        mailboxId: "assistant",
        role: "ASSISTANT_CUSTOMER_SERVICE_OUTREACH",
        uidValidity: "8",
        uid: "9"
      })],
      horizon: HORIZON,
      batchSize: 1,
      store: assistantStore,
      now: fixedNow
    })
  ]);

  assert.equal(personalResult.status, "COMMITTED");
  assert.equal(personalStore.checkpoint?.lastCompletedUid, "105");
  assert.equal(personalStore.records.size, 1);
  assert.equal(assistantResult.status, "FAILED");
  assert.equal(assistantStore.checkpoint, null);
  assert.equal(assistantStore.records.size, 0);
});

test("checkpoint fencing rejects mailbox, folder, UIDVALIDITY and horizon mismatches", async () => {
  const store = new MemoryStore();
  store.checkpoint = {
    mailboxId: "personal",
    folder: "INBOX",
    uidValidity: "999",
    horizonStartAt: HORIZON.startAt,
    horizonEndAt: HORIZON.endAt,
    lastCompletedUid: "5",
    updatedAt: "2026-09-08T12:00:00.000Z"
  };

  await assert.rejects(
    commitHistoricalEmailBackfillBatchV1({
      scope,
      messages: [message({ uid: "6" })],
      horizon: HORIZON,
      batchSize: 1,
      store,
      now: fixedNow
    }),
    /checkpoint does not match scope, UIDVALIDITY, or historical horizon/
  );
  assert.equal(store.commits.length, 0);
});

test("rejects malformed caps, UIDs, unknown keys and malformed store responses fail closed", async () => {
  assert.throws(
    () => normalizeHistoricalEmailMessagesV1({ messages: [message()], horizon: HORIZON, batchSize: Number.NaN }),
    /batchSize/
  );
  assert.throws(
    () => normalizeHistoricalEmailMessagesV1({ messages: [message({ uid: "01" })], horizon: HORIZON, batchSize: 1 }),
    /UID/
  );
  assert.throws(
    () => normalizeHistoricalEmailMessagesV1({
      messages: [{ ...message(), unexpected: true } as HistoricalEmailEnvelopeV1],
      horizon: HORIZON,
      batchSize: 1
    }),
    /unsupported keys/
  );

  const badStore: HistoricalBackfillStoreV1 = {
    async readCheckpoint() {
      return null;
    },
    async commitBatch() {
      return {
        committed: true,
        insertedRecordCount: 999,
        insertedProvenanceCount: 999,
        recordedRejectionCount: 999
      };
    }
  };
  const result = await commitHistoricalEmailBackfillBatchV1({
    scope,
    messages: [message({ uid: "110" })],
    horizon: HORIZON,
    batchSize: 1,
    store: badStore,
    now: fixedNow
  });
  assert.equal(result.status, "FAILED");
  assert.equal(result.reason, "STORE_FAILURE");
});

test("runtime API exposes normalization/backfill only and no live provider, send or mailbox mutation capability", () => {
  assert.deepEqual(Object.keys(api).sort(), [
    "commitHistoricalEmailBackfillBatchV1",
    "normalizeHistoricalEmailMessagesV1"
  ]);
});
