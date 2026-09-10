import assert from "node:assert/strict";
import test from "node:test";

import type { IonosMailboxRuntimeV1 } from "@/lib/email/ionos-mailbox-config-v1";
import { scanIonosHistoricalCandidatesV1 } from "@/lib/email/ionos-historical-candidate-scan-v1";
import {
  normalizeEmailIngestCandidatesV1,
  type EmailMetadataV1,
  type EmailProviderAdapterV1,
  type EmailReadStatusV1
} from "@/lib/email/ionos-incremental-sync-v1";

const mailbox: IonosMailboxRuntimeV1 = {
  id: "historical-test",
  role: "PERSONAL_HIGH_VALUE_RELATIONSHIP",
  user: "fixture@example.test",
  pass: "fixture-only",
  host: "imap.ionos.com",
  port: 993,
  folder: "INBOX",
  minVersion: "TLSv1.2",
  smtpEnabled: false
};

type Scenario = {
  status?: EmailReadStatusV1;
  messages?: EmailMetadataV1[];
  complete?: boolean;
  openError?: Error;
  statusError?: Error;
  fetchError?: Error;
  closeError?: Error;
};

function providerFor(scenario: Scenario) {
  const opens: Array<{ mailboxId: string; deadlineAtMs: number }> = [];
  const fetches: Array<{ fromUid: string; toUid: string; limit: number }> = [];
  let closes = 0;

  const adapter: EmailProviderAdapterV1 = {
    async openReadOnly(value, context) {
      opens.push({ mailboxId: value.id, deadlineAtMs: context.deadlineAtMs });
      if (scenario.openError) throw scenario.openError;
      return {
        async status() {
          if (scenario.statusError) throw scenario.statusError;
          return structuredClone(scenario.status ?? { uidValidity: "7", uidNext: "100" });
        },
        async fetchMetadata(input) {
          fetches.push({ ...input });
          if (scenario.fetchError) throw scenario.fetchError;
          return {
            complete: scenario.complete ?? true,
            messages: structuredClone(scenario.messages ?? [])
          };
        },
        async close() {
          closes += 1;
          if (scenario.closeError) throw scenario.closeError;
        }
      };
    }
  };

  return { adapter, opens, fetches, get closes() { return closes; } };
}

function clock(...values: number[]) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)]!;
}

const futureDeadline = 2_000_000_000_000;

test("scans only the explicit capped historical UID range and shares incremental candidate identity", async () => {
  const uidValidity = "90071992547409930";
  const fromUid = "90071992547409931";
  const provider = providerFor({
    status: { uidValidity, uidNext: "90071992547409940" },
    messages: [
      { uid: "90071992547409933", messageId: "<three@example.test>", internalDate: null, size: null },
      { uid: "90071992547409931", messageId: null, internalDate: null, size: 31 },
      { uid: 90071992547409932n, messageId: "<two@example.test>", internalDate: "2026-09-08T13:02:00Z", size: 32 }
    ]
  });

  const result = await scanIonosHistoricalCandidatesV1({
    mailbox,
    adapter: provider.adapter,
    fromUid,
    toUid: "90071992547409938",
    batchSize: 3,
    deadlineAtMs: futureDeadline,
    expectedUidValidity: uidValidity,
    now: () => 1_000
  });

  assert.deepEqual(provider.fetches, [{
    fromUid,
    toUid: "90071992547409933",
    limit: 3
  }]);
  assert.deepEqual(result.candidates.map((candidate) => candidate.uid), [
    "90071992547409931",
    "90071992547409932",
    "90071992547409933"
  ]);

  const expected = normalizeEmailIngestCandidatesV1(
    [
      { uid: "90071992547409933", messageId: "<three@example.test>", internalDate: null, size: null },
      { uid: "90071992547409931", messageId: null, internalDate: null, size: 31 },
      { uid: 90071992547409932n, messageId: "<two@example.test>", internalDate: "2026-09-08T13:02:00Z", size: 32 }
    ],
    mailbox,
    uidValidity,
    BigInt(fromUid),
    BigInt("90071992547409933")
  );
  assert.deepEqual(result.candidates, expected);
  assert.equal(result.candidates[0]?.messageId, null);
  assert.equal(result.candidates[0]?.internalDate, null);
  assert.equal(result.telemetry.status, "SCANNED");
  assert.equal(result.telemetry.candidateCount, 3);
  assert.equal(provider.closes, 1);
});

test("clamps the upper bound to current mailbox status without crossing the requested range", async () => {
  const provider = providerFor({
    status: { uidValidity: "7", uidNext: "5" },
    messages: [{ uid: "4" }, { uid: "3" }]
  });

  const result = await scanIonosHistoricalCandidatesV1({
    mailbox,
    adapter: provider.adapter,
    fromUid: "3",
    toUid: "9",
    batchSize: 10,
    deadlineAtMs: futureDeadline,
    expectedUidValidity: "7",
    now: () => 1_000
  });

  assert.deepEqual(provider.fetches, [{ fromUid: "3", toUid: "4", limit: 10 }]);
  assert.deepEqual(result.candidates.map((candidate) => candidate.uid), ["3", "4"]);
});

test("returns an honest empty result when the historical range starts beyond observed mail", async () => {
  const provider = providerFor({ status: { uidValidity: "7", uidNext: "5" } });
  const result = await scanIonosHistoricalCandidatesV1({
    mailbox,
    adapter: provider.adapter,
    fromUid: "9",
    toUid: "12",
    batchSize: 2,
    deadlineAtMs: futureDeadline,
    expectedUidValidity: "7",
    now: () => 1_000
  });

  assert.deepEqual(result.candidates, []);
  assert.equal(result.telemetry.status, "NO_MESSAGES");
  assert.equal(result.telemetry.effectiveRangeFingerprint, null);
  assert.deepEqual(provider.fetches, []);
  assert.equal(provider.closes, 1);
});

test("fails closed on UIDVALIDITY mismatch and closes the read-only session", async () => {
  const provider = providerFor({ status: { uidValidity: "8", uidNext: "20" } });
  await assert.rejects(
    () => scanIonosHistoricalCandidatesV1({
      mailbox,
      adapter: provider.adapter,
      fromUid: "1",
      toUid: "5",
      batchSize: 5,
      deadlineAtMs: futureDeadline,
      expectedUidValidity: "7",
      now: () => 1_000
    }),
    /IONOS_HISTORICAL_SCAN_UIDVALIDITY_MISMATCH/
  );
  assert.deepEqual(provider.fetches, []);
  assert.equal(provider.closes, 1);
});

test("enforces the immutable deadline before open and again before fetch", async () => {
  const unopened = providerFor({});
  await assert.rejects(
    () => scanIonosHistoricalCandidatesV1({
      mailbox,
      adapter: unopened.adapter,
      fromUid: "1",
      toUid: "5",
      batchSize: 2,
      deadlineAtMs: 100,
      expectedUidValidity: "7",
      now: () => 100
    }),
    /IONOS_HISTORICAL_SCAN_DEADLINE_EXHAUSTED/
  );
  assert.equal(unopened.opens.length, 0);

  const expires = providerFor({ status: { uidValidity: "7", uidNext: "20" } });
  await assert.rejects(
    () => scanIonosHistoricalCandidatesV1({
      mailbox,
      adapter: expires.adapter,
      fromUid: "1",
      toUid: "5",
      batchSize: 2,
      deadlineAtMs: 150,
      expectedUidValidity: "7",
      now: clock(100, 100, 150)
    }),
    /IONOS_HISTORICAL_SCAN_DEADLINE_EXHAUSTED/
  );
  assert.deepEqual(expires.fetches, []);
  assert.equal(expires.closes, 1);
});

test("provider failures and invalid evidence stay privacy-safe", async () => {
  const marker = "private-provider-material";
  const openFailure = providerFor({ openError: new Error(`${marker} ${mailbox.user} ${mailbox.pass} op://fixture`) });
  await assert.rejects(
    () => scanIonosHistoricalCandidatesV1({
      mailbox,
      adapter: openFailure.adapter,
      fromUid: "1",
      toUid: "2",
      batchSize: 2,
      deadlineAtMs: futureDeadline,
      expectedUidValidity: "7",
      now: () => 1_000
    }),
    (error: unknown) => {
      assert.equal(error instanceof Error, true);
      const message = (error as Error).message;
      assert.equal(message, "IONOS_HISTORICAL_SCAN_PROVIDER_FAILED");
      assert.doesNotMatch(message, /fixture@example\.test|fixture-only|op:\/\/|private-provider-material/);
      return true;
    }
  );

  const malformed = providerFor({
    status: { uidValidity: "7", uidNext: "10" },
    messages: [{ uid: "2", messageId: "" }]
  });
  await assert.rejects(
    () => scanIonosHistoricalCandidatesV1({
      mailbox,
      adapter: malformed.adapter,
      fromUid: "2",
      toUid: "2",
      batchSize: 1,
      deadlineAtMs: futureDeadline,
      expectedUidValidity: "7",
      now: () => 1_000
    }),
    /IONOS_HISTORICAL_SCAN_PROVIDER_INVALID/
  );
});

test("rejects send-enabled mailboxes and malformed ranges or caps before provider access", async () => {
  const provider = providerFor({});
  await assert.rejects(
    () => scanIonosHistoricalCandidatesV1({
      mailbox: { ...mailbox, smtpEnabled: true } as unknown as IonosMailboxRuntimeV1,
      adapter: provider.adapter,
      fromUid: "1",
      toUid: "2",
      batchSize: 2,
      deadlineAtMs: futureDeadline,
      expectedUidValidity: "7",
      now: () => 1_000
    }),
    /IONOS_HISTORICAL_SCAN_MAILBOX_INVALID/
  );

  for (const values of [
    { fromUid: "0", toUid: "2", batchSize: 2 },
    { fromUid: "3", toUid: "2", batchSize: 2 },
    { fromUid: "1", toUid: "2", batchSize: 0 },
    { fromUid: "1.5", toUid: "2", batchSize: 2 }
  ]) {
    await assert.rejects(
      () => scanIonosHistoricalCandidatesV1({
        mailbox,
        adapter: provider.adapter,
        ...values,
        deadlineAtMs: futureDeadline,
        expectedUidValidity: "7",
        now: () => 1_000
      })
    );
  }
  assert.equal(provider.opens.length, 0);
});

test("telemetry contains only bounded status/count/fingerprint fields and adapter exposes no send surface", async () => {
  const provider = providerFor({
    status: { uidValidity: "7", uidNext: "4" },
    messages: [{ uid: "1", messageId: null, internalDate: null, size: null }],
    closeError: new Error("ignored close failure")
  });
  const result = await scanIonosHistoricalCandidatesV1({
    mailbox,
    adapter: provider.adapter,
    fromUid: "1",
    toUid: "1",
    batchSize: 1,
    deadlineAtMs: futureDeadline,
    expectedUidValidity: "7",
    now: () => 1_000
  });

  assert.deepEqual(Object.keys(result.telemetry).sort(), [
    "candidateCount",
    "effectiveRangeFingerprint",
    "fetchedCount",
    "requestedRangeFingerprint",
    "status"
  ]);
  const telemetry = JSON.stringify(result.telemetry);
  assert.doesNotMatch(telemetry, /fixture@example\.test|fixture-only|<|op:\/\/|"1"/);
  assert.deepEqual(Object.keys(provider.adapter), ["openReadOnly"]);
  assert.equal("send" in provider.adapter, false);
  assert.equal("store" in provider.adapter, false);
  assert.equal("fetchBody" in provider.adapter, false);
  assert.equal(provider.closes, 1);
});
